import base64
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException, UploadFile

from app.core.config import RULE_DIR, ANNOUNCE_DIR
from app.models.schemas import Contest, Track
from app.utils.storage import load_contests, save_contests

# 允许的图片格式和最大大小 (2MB)
ALLOWED_LOGO_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_LOGO_SIZE = 2 * 1024 * 1024  # 2MB


def _parse_contest_datetime(value: str) -> datetime:
    """Parse contest datetimes and normalize legacy naive values to UTC."""
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def list_contests():
    """获取竞赛列表，自动根据时间更新状态"""
    contests = load_contests()
    now = datetime.now(timezone.utc)
    
    for contest in contests:
        # 根据时间自动计算状态
        start_time = contest.get('start_time')
        end_time = contest.get('end_time')
        
        if start_time and end_time:
            try:
                start = _parse_contest_datetime(start_time)
                end = _parse_contest_datetime(end_time)
                
                if now < start:
                    contest['status'] = 'upcoming'
                elif start <= now <= end:
                    contest['status'] = 'active'
                else:
                    contest['status'] = 'ended'
            except (ValueError, AttributeError):
                # 时间格式错误时保持原状态
                pass
    
    return contests


def create_or_update_contest(contest: Contest):
    contests = load_contests()

    if not contest.id:
        contest.id = uuid.uuid4().hex[:8]

    contest_dict = contest.model_dump()
    existing = next((c for c in contests if c["id"] == contest.id), None)

    if existing:
        # 更新时保留原有的logo（如果新数据没有提供logo）
        if contest_dict.get("logo") is None and existing.get("logo"):
            contest_dict["logo"] = existing["logo"]
        for i, c in enumerate(contests):
            if c["id"] == contest.id:
                contests[i] = contest_dict
                break
        action = "updated"
    else:
        contests.append(contest_dict)

        # 创建公告文件
        os.makedirs(ANNOUNCE_DIR, exist_ok=True)
        announce_path = os.path.join(ANNOUNCE_DIR, f"{contest.id}.json")
        if not os.path.exists(announce_path):
            with open(announce_path, "w", encoding="utf-8") as f:
                json.dump({"content": ""}, f, ensure_ascii=False, indent=2)

        action = "created"

    save_contests(contests)
    return {
        "success": True,
        "action": action,
        "contest_id": contest.id,
    }


def delete_contest(contest_id: str):
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    contests = [c for c in contests if c["id"] != contest_id]
    save_contests(contests)

    # 删除该竞赛下所有赛道的规则文件
    tracks = contest.get("tracks", [])
    for track in tracks:
        rule_path = os.path.join(RULE_DIR, f"{track.get('id')}.json")
        if os.path.exists(rule_path):
            os.remove(rule_path)

    # 删除默认规则文件（兼容旧数据）
    rule_path = os.path.join(RULE_DIR, f"{contest_id}.json")
    if os.path.exists(rule_path):
        os.remove(rule_path)

    announce_path = os.path.join(ANNOUNCE_DIR, f"{contest_id}.json")
    if os.path.exists(announce_path):
        os.remove(announce_path)

    return {"success": True, "contest_id": contest_id, "action": "deleted"}


def update_contest_logo(contest_id: str, file: UploadFile):
    """更新竞赛logo，将图片转为Base64存储"""
    # 验证文件类型
    if file.content_type not in ALLOWED_LOGO_TYPES:
        raise HTTPException(400, detail=f"不支持的图片格式，请上传: JPEG, PNG, GIF, WebP")

    # 读取文件内容
    content = file.file.read()
    
    # 验证文件大小
    if len(content) > MAX_LOGO_SIZE:
        raise HTTPException(400, detail=f"图片大小超过限制，最大允许 2MB")

    # 转换为Base64
    base64_data = base64.b64encode(content).decode("utf-8")
    data_url = f"data:{file.content_type};base64,{base64_data}"

    # 更新竞赛数据
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    contest["logo"] = data_url
    save_contests(contests)

    return {
        "success": True,
        "action": "logo_updated",
        "contest_id": contest_id,
        "logo": data_url,
    }


def delete_contest_logo(contest_id: str):
    """删除竞赛logo"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    if "logo" in contest:
        del contest["logo"]
        save_contests(contests)

    return {
        "success": True,
        "action": "logo_deleted",
        "contest_id": contest_id,
    }


def add_track(contest_id: str, track: Track):
    """为竞赛添加赛道"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    # 生成赛道ID
    if not track.id:
        track.id = f"{contest_id}_track_{uuid.uuid4().hex[:6]}"

    # 检查赛道ID是否已存在
    existing_tracks = contest.get("tracks", [])
    if any(t.get("id") == track.id for t in existing_tracks):
        raise HTTPException(status_code=400, detail="赛道ID已存在")

    # 检查规则文件是否存在，如果存在则设置 rule_id
    rule_path = os.path.join(RULE_DIR, f"{track.id}.json")
    if os.path.exists(rule_path):
        track.rule_id = track.id

    # 添加赛道
    if "tracks" not in contest:
        contest["tracks"] = []
    contest["tracks"].append(track.model_dump())

    save_contests(contests)

    # 创建该赛道的规则文件（如果不存在）
    if not os.path.exists(rule_path):
        with open(rule_path, "w", encoding="utf-8") as f:
            json.dump({}, f, ensure_ascii=False, indent=2)

    return {
        "success": True,
        "action": "track_added",
        "contest_id": contest_id,
        "track": track.model_dump(),
    }


def update_track(contest_id: str, track_id: str, track: Track):
    """更新赛道信息"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    tracks = contest.get("tracks", [])
    track_index = next((i for i, t in enumerate(tracks) if t.get("id") == track_id), None)
    if track_index is None:
        raise HTTPException(status_code=404, detail="赛道不存在")

    # 保留原有的rule_id
    old_track = tracks[track_index]
    track.id = track_id
    if not track.rule_id:
        track.rule_id = old_track.get("rule_id")
    
    # 检查规则文件是否存在，如果存在且rule_id为空，则设置 rule_id
    rule_path = os.path.join(RULE_DIR, f"{track_id}.json")
    if os.path.exists(rule_path) and not track.rule_id:
        track.rule_id = track_id

    tracks[track_index] = track.model_dump()
    save_contests(contests)

    return {
        "success": True,
        "action": "track_updated",
        "contest_id": contest_id,
        "track": track.model_dump(),
    }


def delete_track(contest_id: str, track_id: str):
    """删除赛道"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    tracks = contest.get("tracks", [])
    track = next((t for t in tracks if t.get("id") == track_id), None)
    if not track:
        raise HTTPException(status_code=404, detail="赛道不存在")

    # 删除赛道
    contest["tracks"] = [t for t in tracks if t.get("id") != track_id]
    save_contests(contests)

    # 删除该赛道的规则文件
    rule_path = os.path.join(RULE_DIR, f"{track_id}.json")
    if os.path.exists(rule_path):
        os.remove(rule_path)

    return {
        "success": True,
        "action": "track_deleted",
        "contest_id": contest_id,
        "track_id": track_id,
    }


def get_contest_tracks(contest_id: str):
    """获取竞赛的所有赛道"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    return contest.get("tracks", [])


def update_contest_publish_status(contest_id: str, is_published: bool):
    """更新竞赛的上线/下线状态"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    contest["is_published"] = is_published
    save_contests(contests)

    return {
        "success": True,
        "action": "published" if is_published else "unpublished",
        "contest_id": contest_id,
        "is_published": is_published,
    }


def update_contest_time(contest_id: str, start_time: Optional[str], end_time: Optional[str]):
    """更新竞赛的起止时间"""
    contests = load_contests()
    contest = next((c for c in contests if c["id"] == contest_id), None)
    if not contest:
        raise HTTPException(status_code=404, detail="竞赛不存在")

    # 验证时间格式
    if start_time:
        try:
            _parse_contest_datetime(start_time)
        except ValueError:
            raise HTTPException(status_code=400, detail="开始时间格式错误，请使用 ISO 8601 格式")
    
    if end_time:
        try:
            _parse_contest_datetime(end_time)
        except ValueError:
            raise HTTPException(status_code=400, detail="结束时间格式错误，请使用 ISO 8601 格式")

    # 验证时间逻辑
    if start_time and end_time:
        start = _parse_contest_datetime(start_time)
        end = _parse_contest_datetime(end_time)
        if start >= end:
            raise HTTPException(status_code=400, detail="结束时间必须晚于开始时间")

    if start_time:
        contest["start_time"] = start_time
    if end_time:
        contest["end_time"] = end_time

    # 根据新时间更新状态
    now = datetime.now(timezone.utc)
    if start_time and end_time:
        start = _parse_contest_datetime(start_time)
        end = _parse_contest_datetime(end_time)
        
        if now < start:
            contest['status'] = 'upcoming'
        elif start <= now <= end:
            contest['status'] = 'active'
        else:
            contest['status'] = 'ended'

    save_contests(contests)

    return {
        "success": True,
        "action": "time_updated",
        "contest_id": contest_id,
        "start_time": contest.get("start_time"),
        "end_time": contest.get("end_time"),
        "status": contest.get("status"),
    }
