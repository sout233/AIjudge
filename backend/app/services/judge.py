import hashlib
import json
import os
import uuid
import zipfile
import asyncio
from concurrent.futures import ThreadPoolExecutor

from fastapi import BackgroundTasks, HTTPException, UploadFile

from app.config.config import UPLOAD_DIR, RESULT_DIR, RULE_DIR
from app.clients.dify import run_workflow_with_file, upload_file_to_dify
from app.models.schemas import JudgeRequest, JudgeResponse, WorkflowStatus, BatchJudgeRequest, ZipBatchJudgeRequest
from app.services.duplicate import check_duplication
from app.utils.storage import load_contests

# 全局并发控制信号量，限制并发数为 3
JUDGE_SEMAPHORE = asyncio.Semaphore(3)
ZIP_ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx", ".txt"}


def _get_track_rule_id(contest_id: str, track_id: str | None) -> str:
    """获取赛道或竞赛的规则ID"""
    if track_id:
        return track_id
    # 兼容旧数据，如果没有track_id则使用contest_id
    return contest_id


async def upload_file(file: UploadFile):
    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_hash}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    if os.path.exists(path):
        return {
            "success": True,
            "filename": filename,
            "original_name": file.filename,
            "size": os.path.getsize(path),
            "is_cached": True,
        }

    with open(path, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "filename": filename,
        "original_name": file.filename,
        "size": len(content),
    }


async def start_judge(data: JudgeRequest, background_tasks: BackgroundTasks, current_user_name: str):
    file_path = os.path.join(UPLOAD_DIR, data.filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")

    contests = load_contests()
    contest = next((c for c in contests if c["id"] == data.contest_id), None)
    if not contest:
        raise HTTPException(404, "竞赛不存在")

    # 获取赛道规则ID
    rule_id = _get_track_rule_id(data.contest_id, data.track_id)

    # 如果指定了赛道，验证赛道是否存在
    if data.track_id:
        tracks = contest.get("tracks", [])
        track = next((t for t in tracks if t.get("id") == data.track_id), None)
        if not track:
            raise HTTPException(404, "赛道不存在")

    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "该竞赛/赛道尚未配置评分规则")

    is_dup, dup_file, similarity = check_duplication(data.contest_id, data.filename)
    if is_dup:
        raise HTTPException(
            400,
            detail=f"检测到内容重复，与文件 '{dup_file}' 的相似度为 {similarity:.2%}，拒绝评分",
        )

    with open(rule_path, "r", encoding="utf-8") as f:
        raw_json = json.load(f)
    score_rule_json = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))

    workflow_run_id = uuid.uuid4().hex
    result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")

    _init_result(result_path, data, current_user_name)

    def run_task():
        try:
            file_id = upload_file_to_dify(file_path, data.filename, current_user_name)
            result = run_workflow_with_file(file_id, score_rule_json, current_user_name)
            _save_result(result_path, data, result, current_user_name)
        except Exception as e:
            _save_error(result_path, data, str(e), current_user_name)

    background_tasks.add_task(run_task)

    return JudgeResponse(
        workflow_run_id=workflow_run_id,
        filename=data.filename,
        result_path=f"{workflow_run_id}.json",
    )


def _init_result(result_path: str, data: JudgeRequest, current_user_name: str = ""):
    from datetime import datetime
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "running",
                "elapsed_time": 0,
                "messages": [{"text": "任务已创建"}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": data.contest_id,
                    "track_id": data.track_id,
                    "filename": data.filename,
                    "user_name": current_user_name,
                    "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_result(result_path: str, data: JudgeRequest, result: dict, current_user_name: str = ""):
    from datetime import datetime
    # 先读取现有metadata（如果存在）
    existing_metadata = {}
    if os.path.exists(result_path):
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                existing_metadata = existing_data.get("metadata", {})
        except:
            pass
    
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": result.get("status", "success"),
                "elapsed_time": result.get("elapsed_time", 0),
                "messages": result.get("messages", []),
                "workflow_data": result,
                "metadata": {
                    "contest_id": data.contest_id,
                    "track_id": data.track_id,
                    "filename": data.filename,
                    "user_name": existing_metadata.get("user_name") or current_user_name,
                    "created_at": existing_metadata.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_error(result_path: str, data: JudgeRequest, error_msg: str, current_user_name: str = ""):
    from datetime import datetime
    # 先读取现有metadata（如果存在）
    existing_metadata = {}
    if os.path.exists(result_path):
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                existing_metadata = existing_data.get("metadata", {})
        except:
            pass
    
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "error",
                "elapsed_time": 0,
                "messages": [{"text": error_msg}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": data.contest_id,
                    "track_id": data.track_id,
                    "filename": data.filename,
                    "user_name": existing_metadata.get("user_name") or current_user_name,
                    "created_at": existing_metadata.get("created_at") or datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


async def batch_start_judge(data: BatchJudgeRequest, background_tasks: BackgroundTasks, current_user_name: str):
    """批量评分多个文件（带并发控制，最多3个并发）"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == data.contest_id), None)
    if not contest:
        raise HTTPException(404, "竞赛不存在")

    # 获取赛道规则ID
    rule_id = _get_track_rule_id(data.contest_id, data.track_id)

    # 如果指定了赛道，验证赛道是否存在
    if data.track_id:
        tracks = contest.get("tracks", [])
        track = next((t for t in tracks if t.get("id") == data.track_id), None)
        if not track:
            raise HTTPException(404, "赛道不存在")

    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "该竞赛/赛道尚未配置评分规则")

    with open(rule_path, "r", encoding="utf-8") as f:
        raw_json = json.load(f)
    score_rule_json = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))

    # 创建任务清单
    tasks_manifest = []
    
    for filename in data.filenames:
        file_path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(file_path):
            tasks_manifest.append({
                "filename": filename,
                "status": "error",
                "error": "文件不存在",
                "workflow_run_id": None
            })
            continue

        # 检查重复
        is_dup, dup_file, similarity = check_duplication(data.contest_id, filename)
        if is_dup:
            tasks_manifest.append({
                "filename": filename,
                "status": "error",
                "error": f"检测到内容重复，与文件 '{dup_file}' 的相似度为 {similarity:.2%}",
                "workflow_run_id": None
            })
            continue

        workflow_run_id = uuid.uuid4().hex
        result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
        
        # 初始化结果文件
        _init_batch_result(result_path, data.contest_id, data.track_id, filename)
        
        tasks_manifest.append({
            "filename": filename,
            "status": "queued",
            "error": None,
            "workflow_run_id": workflow_run_id,
            "result_path": result_path,
            "file_path": file_path
        })

    # 保存任务清单
    manifest_id = uuid.uuid4().hex
    manifest_path = os.path.join(RESULT_DIR, f"manifest_{manifest_id}.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({
            "manifest_id": manifest_id,
            "contest_id": data.contest_id,
            "track_id": data.track_id,
            "total": len(tasks_manifest),
            "tasks": tasks_manifest
        }, f, ensure_ascii=False, indent=2)

    # 启动后台任务，使用信号量控制并发
    def run_batch_with_concurrency():
        # 获取当前运行的事件循环（FastAPI 的循环）
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # 如果没有运行的事件循环，创建一个新的
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_execute_batch_tasks(
                tasks_manifest, score_rule_json, current_user_name, data.contest_id
            ))
        else:
            # 如果已经有事件循环，直接创建任务
            loop.create_task(_execute_batch_tasks(
                tasks_manifest, score_rule_json, current_user_name, data.contest_id
            ))

    background_tasks.add_task(run_batch_with_concurrency)

    return {
        "manifest_id": manifest_id,
        "total": len(tasks_manifest),
        "tasks": [{"workflow_run_id": t["workflow_run_id"], "filename": t["filename"]} 
                  for t in tasks_manifest if t["workflow_run_id"]]
    }


async def _execute_batch_tasks(tasks_manifest: list, score_rule_json: str, current_user_name: str, contest_id: str):
    """执行批量任务，使用信号量控制并发数（最多3个）"""
    
    async def process_single_task(task: dict):
        if task["status"] != "queued" or not task.get("workflow_run_id"):
            return
        
        async with JUDGE_SEMAPHORE:  # 使用信号量限制并发
            try:
                # 更新状态为运行中
                _update_task_status(task["result_path"], "running", "任务开始执行")
                
                # 执行评分
                file_id = upload_file_to_dify(task["file_path"], task["filename"], current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)
                
                # 保存成功结果
                _save_batch_result(
                    task["result_path"], 
                    contest_id, 
                    None, 
                    task["filename"], 
                    result
                )
            except Exception as e:
                # 保存错误结果
                _save_batch_error(
                    task["result_path"], 
                    contest_id, 
                    None, 
                    task["filename"], 
                    str(e)
                )
    
    # 创建所有任务
    tasks = [process_single_task(task) for task in tasks_manifest]
    
    # 并发执行，但受信号量限制
    await asyncio.gather(*tasks)


def _update_task_status(result_path: str, status: str, message: str):
    """更新任务状态"""
    try:
        if os.path.exists(result_path):
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {}
        
        data["status"] = status
        if "messages" not in data:
            data["messages"] = []
        data["messages"].append({"text": message})
        
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[judge] 更新任务状态失败: {e}")


def _init_batch_result(result_path: str, contest_id: str, track_id: str | None, filename: str):
    """初始化批量评分结果文件"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "pending",
                "elapsed_time": 0,
                "messages": [{"text": "任务已排队，等待执行"}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_batch_result(result_path: str, contest_id: str, track_id: str | None, filename: str, result: dict):
    """保存批量评分结果"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": result.get("status", "success"),
                "elapsed_time": result.get("elapsed_time", 0),
                "messages": result.get("messages", []),
                "workflow_data": result,
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_batch_error(result_path: str, contest_id: str, track_id: str | None, filename: str, error_msg: str):
    """保存批量评分错误结果"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "error",
                "elapsed_time": 0,
                "messages": [{"text": error_msg}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


async def zip_batch_start_judge(data: ZipBatchJudgeRequest, background_tasks: BackgroundTasks, current_user_name: str):
    """ZIP 批量评分：解压 zip 文件，提取清单，逐个评分（并发控制最多3个）"""
    zip_path = os.path.join(UPLOAD_DIR, data.zip_filename)
    if not os.path.exists(zip_path):
        raise HTTPException(404, "ZIP 文件不存在")

    # 验证是 zip 文件
    if not zipfile.is_zipfile(zip_path):
        raise HTTPException(400, "上传的文件不是有效的 ZIP 格式")

    contests = load_contests()
    contest = next((c for c in contests if c["id"] == data.contest_id), None)
    if not contest:
        raise HTTPException(404, "竞赛不存在")

    # 获取赛道规则ID
    rule_id = _get_track_rule_id(data.contest_id, data.track_id)

    # 如果指定了赛道，验证赛道是否存在
    if data.track_id:
        tracks = contest.get("tracks", [])
        track = next((t for t in tracks if t.get("id") == data.track_id), None)
        if not track:
            raise HTTPException(404, "赛道不存在")

    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "该竞赛/赛道尚未配置评分规则")

    with open(rule_path, "r", encoding="utf-8") as f:
        raw_json = json.load(f)
    score_rule_json = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))

    # 解压 zip 文件
    extract_dir = os.path.join(UPLOAD_DIR, f"extracted_{uuid.uuid4().hex}")
    os.makedirs(extract_dir, exist_ok=True)
    
    extracted_files = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            extract_dir_abs = os.path.abspath(extract_dir)
            # 安全检查：防止路径遍历攻击
            for member in zip_ref.infolist():
                member_path = os.path.abspath(
                    os.path.join(extract_dir_abs, os.path.normpath(member.filename))
                )
                if not member_path.startswith(extract_dir_abs + os.sep) and member_path != extract_dir_abs:
                    raise HTTPException(400, "ZIP 文件包含不安全的路径")
            
            zip_ref.extractall(extract_dir)
            
            # 收集所有解压后的文件
            for root, dirs, files in os.walk(extract_dir):
                for file in files:
                    file_path = os.path.join(root, file)
                    ext = os.path.splitext(file)[1].lower()
                    if ext not in ZIP_ALLOWED_EXTENSIONS:
                        continue
                    # 计算文件 hash 作为新文件名
                    with open(file_path, 'rb') as f:
                        file_hash = hashlib.md5(f.read()).hexdigest()
                    
                    new_filename = f"{file_hash}{ext}"
                    new_path = os.path.join(UPLOAD_DIR, new_filename)
                    
                    # 如果文件已存在（相同内容），直接使用缓存
                    if not os.path.exists(new_path):
                        import shutil
                        shutil.move(file_path, new_path)
                    
                    extracted_files.append({
                        "original_name": file,
                        "filename": new_filename,
                        "path": new_path
                    })
    except zipfile.BadZipFile:
        raise HTTPException(400, "ZIP 文件损坏或格式不正确")
    finally:
        # 清理解压目录
        import shutil
        if os.path.exists(extract_dir):
            shutil.rmtree(extract_dir)

    if not extracted_files:
        raise HTTPException(400, "ZIP 文件中没有找到可评分的文件")

    # 创建任务清单
    tasks_manifest = []
    
    for file_info in extracted_files:
        filename = file_info["filename"]
        original_name = file_info["original_name"]
        file_path = file_info["path"]

        # 检查重复
        is_dup, dup_file, similarity = check_duplication(data.contest_id, filename)
        if is_dup:
            tasks_manifest.append({
                "filename": filename,
                "original_name": original_name,
                "status": "error",
                "error": f"检测到内容重复，与文件 '{dup_file}' 的相似度为 {similarity:.2%}",
                "workflow_run_id": None
            })
            continue

        workflow_run_id = uuid.uuid4().hex
        result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
        
        # 初始化结果文件
        _init_zip_batch_result(result_path, data.contest_id, data.track_id, filename, original_name)
        
        tasks_manifest.append({
            "filename": filename,
            "original_name": original_name,
            "status": "queued",
            "error": None,
            "workflow_run_id": workflow_run_id,
            "result_path": result_path,
            "file_path": file_path
        })

    # 保存任务清单
    manifest_id = uuid.uuid4().hex
    manifest_path = os.path.join(RESULT_DIR, f"zip_manifest_{manifest_id}.json")
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({
            "manifest_id": manifest_id,
            "type": "zip_batch",
            "contest_id": data.contest_id,
            "track_id": data.track_id,
            "zip_filename": data.zip_filename,
            "total": len(tasks_manifest),
            "tasks": tasks_manifest
        }, f, ensure_ascii=False, indent=2)

    # 启动后台任务，使用信号量控制并发
    def run_zip_batch_with_concurrency():
        # 获取当前运行的事件循环（FastAPI 的循环）
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # 如果没有运行的事件循环，创建一个新的
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(_execute_zip_batch_tasks(
                tasks_manifest, score_rule_json, current_user_name, data.contest_id
            ))
        else:
            # 如果已经有事件循环，直接创建任务
            loop.create_task(_execute_zip_batch_tasks(
                tasks_manifest, score_rule_json, current_user_name, data.contest_id
            ))

    background_tasks.add_task(run_zip_batch_with_concurrency)

    return {
        "manifest_id": manifest_id,
        "type": "zip_batch",
        "total": len(tasks_manifest),
        "queued": len([t for t in tasks_manifest if t["status"] == "queued"]),
        "skipped": len([t for t in tasks_manifest if t["status"] == "error"]),
        "tasks": [{"workflow_run_id": t["workflow_run_id"], "filename": t["original_name"]} 
                  for t in tasks_manifest if t["workflow_run_id"]]
    }


async def _execute_zip_batch_tasks(tasks_manifest: list, score_rule_json: str, current_user_name: str, contest_id: str):
    """执行 ZIP 批量任务，使用信号量控制并发数（最多3个）"""
    
    async def process_single_task(task: dict):
        if task["status"] != "queued" or not task.get("workflow_run_id"):
            return
        
        async with JUDGE_SEMAPHORE:  # 使用信号量限制并发为 3
            try:
                # 更新状态为运行中
                _update_zip_task_status(task["result_path"], "running", "任务开始执行")
                
                # 执行评分
                file_id = upload_file_to_dify(task["file_path"], task["filename"], current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)
                
                # 保存成功结果
                _save_zip_batch_result(
                    task["result_path"], 
                    contest_id, 
                    None, 
                    task["filename"],
                    task["original_name"],
                    result
                )
            except Exception as e:
                # 保存错误结果
                _save_zip_batch_error(
                    task["result_path"], 
                    contest_id, 
                    None, 
                    task["filename"],
                    task["original_name"],
                    str(e)
                )
    
    # 创建所有任务
    tasks = [process_single_task(task) for task in tasks_manifest]
    
    # 并发执行，但受信号量限制
    await asyncio.gather(*tasks)


def _init_zip_batch_result(result_path: str, contest_id: str, track_id: str | None, filename: str, original_name: str):
    """初始化 ZIP 批量评分结果文件"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "pending",
                "elapsed_time": 0,
                "messages": [{"text": "任务已排队，等待执行"}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                    "original_name": original_name,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _update_zip_task_status(result_path: str, status: str, message: str):
    """更新 ZIP 批量任务状态"""
    try:
        if os.path.exists(result_path):
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            data = {}
        
        data["status"] = status
        if "messages" not in data:
            data["messages"] = []
        data["messages"].append({"text": message})
        
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"[judge] 更新任务状态失败: {e}")


def _save_zip_batch_result(result_path: str, contest_id: str, track_id: str | None, filename: str, original_name: str, result: dict):
    """保存 ZIP 批量评分结果"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": result.get("status", "success"),
                "elapsed_time": result.get("elapsed_time", 0),
                "messages": result.get("messages", []),
                "workflow_data": result,
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                    "original_name": original_name,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_zip_batch_error(result_path: str, contest_id: str, track_id: str | None, filename: str, original_name: str, error_msg: str):
    """保存 ZIP 批量评分错误结果"""
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "error",
                "elapsed_time": 0,
                "messages": [{"text": error_msg}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": contest_id,
                    "track_id": track_id,
                    "filename": filename,
                    "original_name": original_name,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _extract_score_from_workflow_data(result_data: dict) -> tuple[float | None, float | None]:
    """从 workflow 结果数据中提取分数
    
    返回: (score, max_score) 或 (None, None) 如果无法提取
    """
    try:
        workflow_data = result_data.get("workflow_data", {})
        data = workflow_data.get("workflow_data", {}).get("data", {})
        outputs = data.get("outputs", {})
        
        # 尝试获取 result 或 text 字段
        raw_result = outputs.get("result") or outputs.get("text")
        if not raw_result:
            return None, None
        
        # 如果是字符串，尝试解析 JSON
        if isinstance(raw_result, str):
            try:
                parsed = json.loads(raw_result)
            except json.JSONDecodeError:
                return None, None
        else:
            parsed = raw_result
        
        # 处理 WrappedJudgeResult (包装格式)
        if isinstance(parsed, dict) and "result" in parsed:
            parsed = parsed["result"]
        
        # 多评审格式 (MultiJudgeResult)
        if isinstance(parsed, dict) and "evaluations" in parsed and isinstance(parsed["evaluations"], list):
            evaluations = parsed["evaluations"]
            if not evaluations:
                return None, None
            
            # 如果有最终评审结果，使用最终评审
            final_review = parsed.get("final_review")
            if final_review and isinstance(final_review, dict):
                return (
                    float(final_review.get("final_total_score", 0)),
                    float(final_review.get("final_max_score", 100))
                )
            
            # 否则计算平均分
            total_score = sum(e.get("total_score", 0) for e in evaluations)
            avg_score = round(total_score / len(evaluations))
            max_score = evaluations[0].get("max_score", 100) if evaluations else 100
            return float(avg_score), float(max_score)
        
        # 单评审格式 (JudgeResult)
        if isinstance(parsed, dict) and "total_score" in parsed:
            return (
                float(parsed.get("total_score", 0)),
                float(parsed.get("max_score", 100))
            )
        
        return None, None
    except Exception as e:
        print(f"[_extract_score_from_workflow_data] 提取分数失败: {e}")
        return None, None


async def get_zip_batch_status(manifest_id: str):
    """获取 ZIP 批量任务的总体状态和进度"""
    manifest_path = os.path.join(RESULT_DIR, f"zip_manifest_{manifest_id}.json")
    if not os.path.exists(manifest_path):
        raise HTTPException(404, "任务清单不存在")
    
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)
    
    # 统计各状态的任务数量
    total = manifest["total"]
    tasks = manifest.get("tasks", [])
    resolved_tasks = []
    
    completed = 0
    failed = 0
    running = 0
    pending = 0
    
    for task in tasks:
        resolved_task = dict(task)
        # 默认从 manifest 中读取状态，如果没有则使用 pending
        resolved_status = task.get("status") or "pending"
        
        # 初始化分数字段
        resolved_task["score"] = None
        resolved_task["max_score"] = None

        if task.get("result_path") and os.path.exists(task["result_path"]):
            try:
                with open(task["result_path"], "r", encoding="utf-8") as rf:
                    result_data = json.load(rf)
                # 优先使用结果文件中的状态
                result_status = result_data.get("status")
                if result_status:
                    resolved_status = result_status
                    resolved_task["status"] = resolved_status
                
                # 提取分数
                if resolved_status in ["success", "succeeded"]:
                    score, max_score = _extract_score_from_workflow_data(result_data)
                    if score is not None:
                        resolved_task["score"] = score
                        resolved_task["max_score"] = max_score

                messages = result_data.get("messages", [])
                if resolved_status in ["error", "failed"] and not resolved_task.get("error") and messages:
                    last_message = messages[-1]
                    if isinstance(last_message, dict):
                        resolved_task["error"] = last_message.get("text")
                    else:
                        resolved_task["error"] = str(last_message)
            except Exception as e:
                print(f"[get_zip_batch_status] 读取结果文件失败 {task.get('result_path')}: {e}")
                pass
        
        # 确保 resolved_task 有最新的状态
        resolved_task["status"] = resolved_status

        if resolved_status in ["success", "succeeded"]:
            completed += 1
        elif resolved_status in ["error", "failed"]:
            failed += 1
        elif resolved_status == "running":
            running += 1
        else:
            pending += 1

        resolved_tasks.append(resolved_task)

    return {
        "manifest_id": manifest_id,
        "type": "zip_batch",
        "total": total,
        "completed": completed,
        "failed": failed,
        "running": running,
        "pending": pending,
        "progress": f"{completed + failed}/{total}",
        "tasks": resolved_tasks
    }


async def get_status(workflow_run_id: str):
    path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
    if not os.path.exists(path):
        return WorkflowStatus(
            status="running",
            elapsed_time=0,
            messages=[],
            workflow_data={},
            progress="任务处理中...",
        )

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    return WorkflowStatus(
        status=data.get("status"),
        elapsed_time=data.get("elapsed_time", 0),
        messages=data.get("messages", []),
        workflow_data=data,
        progress="\n".join([str(m) for m in data.get("messages", [])]),
    )


async def get_history(current_user_name: str):
    """获取当前用户的历史评审记录"""
    history = []
    if not os.path.exists(RESULT_DIR):
        return []
    
    for filename in os.listdir(RESULT_DIR):
        if not filename.endswith(".json") or filename.startswith("manifest") or filename.startswith("zip_manifest"):
            continue
        
        path = os.path.join(RESULT_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                meta = data.get("metadata", {})
                # 检查是否属于当前用户（如果记录了user_name）
                if meta.get("user_name") == current_user_name or not meta.get("user_name"):
                    history.append({
                        "workflow_run_id": filename.replace(".json", ""),
                        "filename": meta.get("original_name") or meta.get("filename", "未知文件"),
                        "contest_id": meta.get("contest_id", ""),
                        "track_id": meta.get("track_id"),
                        "status": data.get("status", "unknown"),
                        "created_at": meta.get("created_at", ""),
                        "elapsed_time": data.get("elapsed_time", 0),
                    })
        except Exception:
            continue
    
    # 按创建时间倒序排序
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return history
