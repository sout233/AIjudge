import uuid
import json
import os
import shutil
import hashlib
from datetime import datetime
from typing import List, Optional, Dict, Any

from pydantic import BaseModel
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, Depends

from config import CONTEST_FILE, RESULT_DIR, RULE_DIR, UPLOAD_DIR
from dify import run_workflow_with_file, upload_file_to_dify
from services.auth_service import get_current_user_name
from services.duplicate_service import check_duplication
from models.schemas import JudgeRequest, JudgeResponse, WorkflowStatus

router = APIRouter()


def load_contests():
    if not os.path.exists(CONTEST_FILE):
        return []
    with open(CONTEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


# ================= 文件上传 =================
@router.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # 读取文件内容计算哈希
    content = await file.read()
    file_hash = hashlib.md5(content).hexdigest()

    ext = os.path.splitext(file.filename)[1]
    filename = f"{file_hash}{ext}"
    path = os.path.join(UPLOAD_DIR, filename)

    # 检查文件是否已存在
    if os.path.exists(path):
        return {
            "success": True,
            "filename": filename,
            "original_name": file.filename,
            "size": os.path.getsize(path),
            "is_cached": True
        }

    # 不存在则写入
    with open(path, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "filename": filename,
        "original_name": file.filename,
        "size": len(content),
    }


# ================= 判分 =================
@router.post("/judge", response_model=JudgeResponse)
async def judge_file(
        data: JudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):
    file_path = os.path.join(UPLOAD_DIR, data.filename)
    if not os.path.exists(file_path):
        raise HTTPException(404, "文件不存在")

    contests = load_contests()
    contest = next((c for c in contests if c["id"] == data.contest_id), None)
    if not contest:
        raise HTTPException(404, "竞赛不存在")

    # ✅ 评分规则 = 固定路径：{contest_id}.json
    rule_path = os.path.join(RULE_DIR, f"{data.contest_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, "该竞赛尚未配置评分规则")

    # 查重
    print(f"[JudgeService] calling check_duplication for {data.filename}")
    is_dup, dup_file, similarity = check_duplication(data.contest_id, data.filename)
    if is_dup:
        raise HTTPException(
            400,
            detail=f"检测到内容重复，与文件 '{dup_file}' 的相似度为 {similarity:.2%}，拒绝评分"
        )

    with open(rule_path, "r", encoding="utf-8") as f:
        raw_json = json.load(f)  # dict

    score_rule_json = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))

    workflow_run_id = uuid.uuid4().hex
    result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")

    display_name = data.original_filename if data.original_filename else data.filename

    # 初始化任务状态
    with open(result_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "status": "running",
                "elapsed_time": 0,
                "messages": [{"text": "任务已创建"}],
                "workflow_data": {},
                "metadata": {
                    "contest_id": data.contest_id,
                    "filename": data.filename,
                    "original_filename": display_name,
                    "user_name": current_user_name,
                    "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                }
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    def run_task():
        try:
            file_id = upload_file_to_dify(file_path, data.filename,current_user_name)
            result = run_workflow_with_file(file_id, score_rule_json,current_user_name)

            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "status": result.get("status", "success"),
                        "elapsed_time": result.get("elapsed_time", 0),
                        "messages": result.get("messages", []),
                        "workflow_data": result,
                        "metadata": {
                            "contest_id": data.contest_id,
                            "filename": data.filename,
                            "original_filename": display_name,
                            "user_name": current_user_name,
                            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )

        except Exception as e:
            with open(result_path, "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "status": "error",
                        "elapsed_time": 0,
                        "messages": [{"text": str(e)}],
                        "workflow_data": {},
                        "metadata": {
                            "contest_id": data.contest_id,
                            "filename": data.filename,
                            "original_filename": display_name,
                            "user_name": current_user_name,
                            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                        }
                    },
                    f,
                    ensure_ascii=False,
                    indent=2,
                )

    background_tasks.add_task(run_task)

    return JudgeResponse(
        workflow_run_id=workflow_run_id,
        filename=data.filename,
        result_path=f"{workflow_run_id}.json",
    )


# ================= 批量判分 =================
class FileItem(BaseModel):
    filename: str  # 存储名 (MD5)
    original_filename: str  # 原始可读名

class BatchJudgeRequest(BaseModel):
    files: List[FileItem]
    contest_id: str

@router.post("/batch_judge")
async def batch_judge_files(
        data: BatchJudgeRequest, background_tasks: BackgroundTasks,
        current_user_name: str = Depends(get_current_user_name)):

    results = []

    contests = load_contests()
    contest = next((c for c in contests if c["id"] == data.contest_id), None)
    if not contest:
        raise HTTPException(404, "竞赛不存在")

    rule_path = os.path.join(RULE_DIR, f"{data.contest_id}.json")
    if not os.path.exists(rule_path):
        raise HTTPException(404, f"该竞赛({data.contest_id})尚未配置评分规则")

    with open(rule_path, "r", encoding="utf-8") as f:
        raw_json = json.load(f)
    score_rule_json = json.dumps(raw_json, ensure_ascii=False, separators=(",", ":"))

    for item in data.files:
        filename = item.filename
        original_name = item.original_filename
        file_path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(file_path):
            continue

        workflow_run_id = uuid.uuid4().hex
        result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")

        # 初始化任务状态
        with open(result_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "status": "running",
                    "elapsed_time": 0,
                    "messages": [{"text": "批量任务已创建"}],
                    "workflow_data": {},
                    "metadata": {
                        "contest_id": data.contest_id,
                        "filename": filename,
                        "original_filename": original_name,
                        "user_name": current_user_name,
                        "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    }
                },
                f,
                ensure_ascii=False,
                indent=2,
            )

        def run_single_task(fid=workflow_run_id, fname=filename, oname=original_name, rpath=result_path):
            try:
                file_id = upload_file_to_dify(os.path.join(UPLOAD_DIR, fname), fname, current_user_name)
                result = run_workflow_with_file(file_id, score_rule_json, current_user_name)

                with open(rpath, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "status": result.get("status", "success"),
                            "elapsed_time": result.get("elapsed_time", 0),
                            "messages": result.get("messages", []),
                            "workflow_data": result,
                            "metadata": {
                                "contest_id": data.contest_id,
                                "filename": fname,
                                "original_filename": oname,
                                "user_name": current_user_name,
                                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            }
                        },
                        f,
                        ensure_ascii=False,
                        indent=2,
                    )
            except Exception as e:
                with open(rpath, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "status": "error",
                            "elapsed_time": 0,
                            "messages": [{"text": str(e)}],
                            "workflow_data": {},
                            "metadata": {
                                "contest_id": data.contest_id,
                                "filename": fname,
                                "original_filename": oname,
                                "user_name": current_user_name,
                                "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                            }
                        },
                        f,
                        ensure_ascii=False,
                        indent=2,
                    )

        background_tasks.add_task(run_single_task)
        results.append({
            "workflow_run_id": workflow_run_id,
            "filename": filename
        })

    return results


# ================= 历史记录 =================
@router.get("/history")
async def get_history(current_user_name: str = Depends(get_current_user_name)):
    """
    获取当前用户的测评历史列表
    """
    history = []
    if not os.path.exists(RESULT_DIR):
        return []

    for filename in os.listdir(RESULT_DIR):
        if not filename.endswith(".json"):
            continue

        path = os.path.join(RESULT_DIR, filename)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                metadata = data.get("metadata", {})

                if metadata.get("user_name") == current_user_name:
                    display_filename = metadata.get("original_filename") or metadata.get("filename")

                    history.append({
                        "workflow_run_id": filename.replace(".json", ""),
                        "filename": display_filename,
                        "contest_id": metadata.get("contest_id"),
                        "status": data.get("status"),
                        "created_at": metadata.get("created_at"),
                        "elapsed_time": data.get("elapsed_time")
                    })
        except Exception as e:
            print(f"Error reading {filename}: {e}")
            continue

    history.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return history


# ================= 状态轮询 =================
@router.get("/judge/{workflow_run_id}/status", response_model=WorkflowStatus)
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
