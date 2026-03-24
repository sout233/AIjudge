# contest_service.py
import json
import os
import uuid
from fastapi import APIRouter, HTTPException
from models.schemas import Contest
from config import CONTEST_FILE, RULE_DIR, STORAGE_DIR

router = APIRouter()

def load_contests():
    if not os.path.exists(CONTEST_FILE):
        return []
    with open(CONTEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_contests(data):
    with open(CONTEST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("/contests")
async def list_contests():
    return load_contests()

@router.post("/contests")
async def save_contest(contest: Contest):
    contests = load_contests()

    # 新建竞赛：生成 ID
    if not contest.id:
        contest.id = uuid.uuid4().hex[:8]

    contest_dict = contest.dict()

    existing = next((c for c in contests if c["id"] == contest.id), None)

    if existing:
        # 更新
        for i, c in enumerate(contests):
            if c["id"] == contest.id:
                contests[i] = contest_dict
                break
        action = "updated"
    else:
        # 新增
        contests.append(contest_dict)

        # 初始化规则文件
        rule_path = os.path.join(RULE_DIR, f"{contest.id}.json")
        if not os.path.exists(rule_path):
            with open(rule_path, "w", encoding="utf-8") as f:
                json.dump({}, f, ensure_ascii=False, indent=2)

        # 初始化公告文件
        announce_dir = os.path.join(STORAGE_DIR, "announcements")
        os.makedirs(announce_dir, exist_ok=True)
        announce_path = os.path.join(announce_dir, f"{contest.id}.json")
        if not os.path.exists(announce_path):
            with open(announce_path, "w", encoding="utf-8") as f:
                json.dump({"content": ""}, f, ensure_ascii=False, indent=2)

        action = "created"

    save_contests(contests)
    return {
        "success": True,
        "action": action,
        "contest_id": contest.id
    }
@router.delete("/contests/{contest_id}")
async def delete_contest(contest_id: str):
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    # 从列表中删除
    contests = [c for c in contests if c["id"] != contest_id]
    save_contests(contests)

    # 删除规则文件
    rule_path = os.path.join(RULE_DIR, f"{contest_id}.json")
    if os.path.exists(rule_path):
        os.remove(rule_path)

    # 删除公告文件
    announce_path = os.path.join(STORAGE_DIR, "announcements", f"{contest_id}.json")
    if os.path.exists(announce_path):
        os.remove(announce_path)


    return {"success": True, "contest_id": contest_id, "action": "deleted"}
