import asyncio
import time
import uuid
from typing import Dict

from fastapi import APIRouter, HTTPException
from app.models.schemas import VerifyInitReq
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
    raise HTTPException(504, "查询流程超时，请稍后重试")



