import asyncio
import time
import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException
from app.models.schemas import VerifyInitReq, VerifySubmitReq
from app.services.verify import automation_task

router = APIRouter()

active_sessions: Dict[str, dict] = {}


@router.post("/verify/init-query")
async def init_query(req: VerifyInitReq):
    session_id = str(uuid.uuid4())
    active_sessions[session_id] = {
        "status": "INITIALIZING",
        "coords": None,
        "start_time": time.time(),
    }

    import threading
    threading.Thread(
        target=automation_task, args=(session_id, req, active_sessions), daemon=True
    ).start()

    timeout = 300
    start_wait = time.time()

    while time.time() - start_wait < timeout:
        session = active_sessions.get(session_id)
        if not session:
            raise HTTPException(500, "会话执行失败或被意外清理")

        if session["status"] == "SUCCESS":
            data = session.get("data", [])
            active_sessions.pop(session_id, None)
            return {"code": 200, "msg": "查询成功", "data": data}

        if session["status"] == "FAILED":
            error = session.get("error", "未知错误")
            active_sessions.pop(session_id, None)
            raise HTTPException(400, f"查询失败: {error}")

        await asyncio.sleep(1)

    active_sessions.pop(session_id, None)
    raise HTTPException(504, "流程超时，可能长时间无人处理验证码")


@router.get("/verify/pending")
async def get_pending_captchas():
    pending_list = []
    for sid, session in active_sessions.items():
        if session.get("status") == "CAPTCHA_REQUIRED":
            pending_list.append({
                "session_id": sid,
                "bg_image": session["captcha_data"]["bg_image"],
                "width": session["captcha_data"]["width"],
                "height": session["captcha_data"]["height"],
                "wait_time": int(time.time() - session["start_time"]),
            })
    return {"code": 200, "data": pending_list}


@router.post("/verify/submit-query")
async def submit_query(req: VerifySubmitReq):
    session = active_sessions.get(req.session_id)
    if not session:
        raise HTTPException(404, "任务不存在或已过期")

    if session["status"] != "CAPTCHA_REQUIRED":
        raise HTTPException(400, "当前任务状态不可提交坐标")

    session["coords"] = req.points
    session["status"] = "PROCESSING"
    return {"code": 200, "msg": "指令已下发浏览器"}
