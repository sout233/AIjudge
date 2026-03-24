import uuid
import json
import os
import shutil
import hashlib

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
                    "filename": data.filename
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
                            "filename": data.filename
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
                            "filename": data.filename
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
