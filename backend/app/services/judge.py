import hashlib
import json
import os
import uuid

from fastapi import BackgroundTasks, HTTPException, UploadFile

from app.core.config import UPLOAD_DIR, RESULT_DIR, RULE_DIR
from app.clients.dify import run_workflow_with_file, upload_file_to_dify
from app.models.schemas import JudgeRequest, JudgeResponse, WorkflowStatus
from app.services.duplicate import check_duplication
from app.utils.storage import load_contests


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

    _init_result(result_path, data)

    def run_task():
        try:
            file_id = upload_file_to_dify(file_path, data.filename, current_user_name)
            result = run_workflow_with_file(file_id, score_rule_json, current_user_name)
            _save_result(result_path, data, result)
        except Exception as e:
            _save_error(result_path, data, str(e))

    background_tasks.add_task(run_task)

    return JudgeResponse(
        workflow_run_id=workflow_run_id,
        filename=data.filename,
        result_path=f"{workflow_run_id}.json",
    )


def _init_result(result_path: str, data: JudgeRequest):
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
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_result(result_path: str, data: JudgeRequest, result: dict):
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
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


def _save_error(result_path: str, data: JudgeRequest, error_msg: str):
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
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )


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
