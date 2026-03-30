from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query

from app.models.schemas import Contest, Track
from app.services.contest import (
    list_contests,
    create_or_update_contest,
    delete_contest,
    add_track,
    update_track,
    delete_track,
    get_contest_tracks,
    update_contest_logo,
    delete_contest_logo,
    update_contest_publish_status,
    update_contest_time,
)

router = APIRouter()


@router.get("/contests")
async def get_contests():
    return list_contests()


@router.post("/contests")
async def post_contest(contest: Contest):
    return create_or_update_contest(contest)


@router.delete("/contests/{contest_id}")
async def remove_contest(contest_id: str):
    return delete_contest(contest_id)


# ========== Logo 管理接口 ==========

@router.post("/contests/{contest_id}/logo")
async def upload_logo(contest_id: str, file: UploadFile = File(...)):
    """上传竞赛logo"""
    return update_contest_logo(contest_id, file)


@router.delete("/contests/{contest_id}/logo")
async def remove_logo(contest_id: str):
    """删除竞赛logo"""
    return delete_contest_logo(contest_id)


# ========== 赛道管理接口 ==========

@router.get("/contests/{contest_id}/tracks")
async def get_tracks(contest_id: str):
    """获取竞赛的所有赛道"""
    return get_contest_tracks(contest_id)


@router.post("/contests/{contest_id}/tracks")
async def post_track(contest_id: str, track: Track):
    """为竞赛添加赛道"""
    return add_track(contest_id, track)


@router.put("/contests/{contest_id}/tracks/{track_id}")
async def put_track(contest_id: str, track_id: str, track: Track):
    """更新赛道信息"""
    return update_track(contest_id, track_id, track)


@router.delete("/contests/{contest_id}/tracks/{track_id}")
async def remove_track(contest_id: str, track_id: str):
    """删除赛道"""
    return delete_track(contest_id, track_id)


# ========== 竞赛发布状态管理接口 ==========

@router.post("/contests/{contest_id}/publish")
async def publish_contest(contest_id: str, is_published: bool = Query(..., description="是否上线")):
    """设置竞赛的上线/下线状态"""
    return update_contest_publish_status(contest_id, is_published)


@router.post("/contests/{contest_id}/time")
async def update_contest_time_endpoint(
    contest_id: str,
    start_time: Optional[str] = Query(None, description="开始时间 (ISO 8601 格式)"),
    end_time: Optional[str] = Query(None, description="结束时间 (ISO 8601 格式)")
):
    """更新竞赛的起止时间"""
    return update_contest_time(contest_id, start_time, end_time)
