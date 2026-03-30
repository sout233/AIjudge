import json
import os
from fastapi import HTTPException

from app.core.config import ANNOUNCE_DIR


def get_announcement(contest_id: str):
    path = os.path.join(ANNOUNCE_DIR, f"{contest_id}.json")
    if not os.path.exists(path):
        return {"content": ""}
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        return {"content": data.get("content", "")}


def save_announcement(contest_id: str, content: str):
    path = os.path.join(ANNOUNCE_DIR, f"{contest_id}.json")
    data = {"content": content}
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(500, detail=f"保存失败: {e}")
    return {"success": True, "data": data}
