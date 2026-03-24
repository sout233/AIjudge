import os
import json
from fastapi import APIRouter, Form, HTTPException
from config import STORAGE_DIR

router = APIRouter()

ANNOUNCE_DIR = os.path.join(STORAGE_DIR, "announcements")
os.makedirs(ANNOUNCE_DIR, exist_ok=True)


@router.get("/announcement/{contest_id}")
async def get_announcement(contest_id: str):
    """
    获取竞赛公告（纯文本）
    """
    path = os.path.join(ANNOUNCE_DIR, f"{contest_id}.json")
    if not os.path.exists(path):
        return {"content": ""}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        return {"content": data.get("content", "")}


@router.post("/announcement/{contest_id}")
async def save_announcement(contest_id: str, content: str = Form(...)):
    """
    保存竞赛公告（纯文本）
    """
    path = os.path.join(ANNOUNCE_DIR, f"{contest_id}.json")
    data = {"content": content}
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(500, detail=f"保存失败: {e}")

    return {"success": True, "data": data}
