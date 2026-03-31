import uuid
import json
import os
import shutil
import hashlib
import zipfile
import asyncio
import tempfile
from datetime import datetime
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, Depends

from config import CONTEST_FILE, RESULT_DIR, RULE_DIR, UPLOAD_DIR
from dify import run_workflow_with_file, upload_file_to_dify
from services.auth_service import get_current_user_name
from services.duplicate_service import check_duplication
from models.schemas import (
    JudgeRequest, JudgeResponse, WorkflowStatus,
    BatchJudgeRequest, ZipBatchJudgeRequest, FileItem
)

router = APIRouter()

JUDGE_SEMAPHORE = asyncio.Semaphore(3)

# ================= 工具函数 =================

def atomic_write_json(path: str, data: dict):
    dir_name = os.path.dirname(path)
    if not os.path.exists(dir_name):
        os.makedirs(dir_name, exist_ok=True)

    fd, temp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp", text=True)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        os.replace(temp_path, path)
    except Exception as e:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        raise e

def load_contests():
    if not os.path.exists(CONTEST_FILE):
        return []
    with open(CONTEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _get_track_rule_id(contest_id: str, track_id: str | None) -> str:
    return track_id if track_id else contest_id

# ================= 业务接口 =================

@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()
    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_hash}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    if os.path.exists(path):
        return {"success": True, "filename": filename, "original_name": file.filename, "is_cached": True}

    with open(path, "wb") as f:
        f.write(content)
    return {"success": True, "filename": filename, "original_name": file.filename}

# 判分 (单文件)
@router.post("/judge", response_model=JudgeResponse)
async def judge_file(
        data: JudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):

    file_path = os.path.join(UPLOAD_DIR, data.filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")

    rule_id = _get_track_rule_id(data.contest_id, data.track_id)
    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, f"规则配置不存在")

    is_dup, dup_file, similarity = check_duplication(data.contest_id, data.filename)
    if is_dup:
        raise HTTPException(400, detail=f"检测到内容重复，与 '{dup_file}' 相似度 {similarity:.2%}")

    with open(rule_path, "r", encoding="utf-8") as f:
        rule_data = json.load(f)
        score_rule_json = json.dumps(rule_data, ensure_ascii=False, separators=(",", ":"))

    workflow_run_id = uuid.uuid4().hex
    result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
    display_name = data.original_filename or data.filename

    init_state = {
        "status": "running",
        "elapsed_time": 0,
        "messages": [{"text": "任务已启动"}],
        "workflow_data": {},
        "metadata": {
            "contest_id": data.contest_id,
            "track_id": data.track_id,
            "filename": data.filename,
            "original_filename": display_name,
            "user_name": current_user_name,
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    }
    atomic_write_json(result_path, init_state)

    async def run_task_with_semaphore():
        async with JUDGE_SEMAPHORE:
            try:
                file_id = upload_file_to_dify(file_path, data.filename, current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)

                final_data = {
                    "status": result.get("status", "success"),
                    "elapsed_time": result.get("elapsed_time", 0),
                    "messages": result.get("messages", []),
                    "workflow_data": result,
                    "metadata": init_state["metadata"]
                }
                atomic_write_json(result_path, final_data)
            except Exception as e:
                atomic_write_json(result_path, {
                    "status": "error",
                    "messages": [{"text": str(e)}],
                    "metadata": init_state["metadata"]
                })

    background_tasks.add_task(lambda: asyncio.run(run_task_with_semaphore()))
    return JudgeResponse(workflow_run_id=workflow_run_id, filename=data.filename, result_path=f"{workflow_run_id}.json")

# 批量判分
@router.post("/batch_judge")
async def batch_judge_files(
        data: BatchJudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):

    rule_id = _get_track_rule_id(data.contest_id, data.track_id)
    rule_path = os.path.join(RULE_DIR, f"{rule_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "规则不存在")

    with open(rule_path, "r", encoding="utf-8") as f:
        score_rule_json = json.dumps(json.load(f), ensure_ascii=False, separators=(",", ":"))

    tasks_manifest = []
    for item in data.files:
        run_id = uuid.uuid4().hex
        res_path = os.path.join(RESULT_DIR, f"{run_id}.json")
        meta = {
            "contest_id": data.contest_id, "track_id": data.track_id,
            "filename": item.filename, "original_filename": item.original_filename,
            "user_name": current_user_name, "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }

        # 初始写入
        atomic_write_json(res_path, {"status": "pending", "metadata": meta})

        tasks_manifest.append({
            "workflow_run_id": run_id,
            "filename": item.filename,
            "result_path": res_path,
            "metadata": meta
        })

    background_tasks.add_task(lambda: asyncio.run(execute_batch(tasks_manifest, score_rule_json, current_user_name)))
    return {"tasks": tasks_manifest}

async def execute_batch(manifest, score_rule_json, current_user_name):
    async def process_item(task):
        async with JUDGE_SEMAPHORE:
            try:
                if os.path.exists(task["result_path"]):
                    with open(task["result_path"], "r", encoding="utf-8") as f:
                        curr_data = json.load(f)
                    curr_data["status"] = "running"
                    atomic_write_json(task["result_path"], curr_data)

                file_path = os.path.join(UPLOAD_DIR, task["filename"])
                file_id = upload_file_to_dify(file_path, task["filename"], current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)

                atomic_write_json(task["result_path"], {
                    "status": result.get("status", "success"),
                    "workflow_data": result,
                    "metadata": task["metadata"]
                })
            except Exception as e:
                atomic_write_json(task["result_path"], {
                    "status": "error",
                    "messages": [{"text": str(e)}],
                    "metadata": task["metadata"]
                })

    await asyncio.gather(*(process_item(t) for t in manifest))

@router.post("/zip_batch_judge")
async def zip_batch_judge(
        data: ZipBatchJudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):
    zip_path = os.path.join(UPLOAD_DIR, data.zip_filename)
    if not os.path.exists(zip_path):
        raise HTTPException(404, "ZIP不存在")

    extract_dir = os.path.join(UPLOAD_DIR, f"extracted_{uuid.uuid4().hex}")
    os.makedirs(extract_dir, exist_ok=True)

    file_items = []
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_dir)
            for root, _, files in os.walk(extract_dir):
                for f in files:
                    if f.startswith('.') or f.startswith('__'): continue
                    f_path = os.path.join(root, f)
                    with open(f_path, 'rb') as rb:
                        f_hash = hashlib.md5(rb.read()).hexdigest()
                    new_name = f"{f_hash}{os.path.splitext(f)[1]}"
                    target_path = os.path.join(UPLOAD_DIR, new_name)
                    if not os.path.exists(target_path):
                        shutil.move(f_path, target_path)
                    file_items.append(FileItem(filename=new_name, original_filename=f))
    finally:
        if os.path.exists(extract_dir): shutil.rmtree(extract_dir)

    return await batch_judge_files(BatchJudgeRequest(files=file_items, contest_id=data.contest_id, track_id=data.track_id), background_tasks, current_user_name)

# 历史记录
@router.get("/history")
async def get_history(current_user_name: str = Depends(get_current_user_name)):
    history = []
    if not os.path.exists(RESULT_DIR): return []
    for filename in os.listdir(RESULT_DIR):
        if not filename.endswith(".json") or filename.startswith("manifest"): continue
        path = os.path.join(RESULT_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                meta = data.get("metadata", {})
                if meta.get("user_name") == current_user_name:
                    history.append({
                        "workflow_run_id": filename.replace(".json", ""),
                        "filename": meta.get("original_filename") or meta.get("filename"),
                        "contest_id": meta.get("contest_id"),
                        "track_id": meta.get("track_id"),
                        "status": data.get("status"),
                        "created_at": meta.get("created_at")
                    })
        except: continue
    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return history

@router.get("/judge/{workflow_run_id}/status", response_model=WorkflowStatus)
async def get_status(workflow_run_id: str):
    path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
    if not os.path.exists(path):
        return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="排队中...")

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="同步中...")
            data = json.loads(content)

        return WorkflowStatus(
            status=data.get("status", "running"),
            elapsed_time=data.get("elapsed_time", 0),
            messages=data.get("messages", []),
            workflow_data=data,
            progress="\n".join([str(m.get('text', '')) for m in data.get("messages", [])]),
        )
    except (json.JSONDecodeError, UnicodeDecodeError):
        return WorkflowStatus(status="running", elapsed_time=0, messages=[], workflow_data={}, progress="解析中...")
