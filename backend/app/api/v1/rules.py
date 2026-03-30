from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends

from app.api.deps import verify_token
from app.services.rule import get_rule, save_rule_file, parse_and_save_rule

router = APIRouter()


@router.get("/rule/{track_id}")
async def get(track_id: str):
    """获取赛道的评分规则"""
    return get_rule(track_id)


@router.post("/rule/{track_id}")
async def post(
    track_id: str,
    file: UploadFile | None = File(None),
    content: str | None = Form(None),
):
    """保存赛道的评分规则"""
    return save_rule_file(track_id, file, content)


@router.put("/rule/{track_id}")
async def put(
    track_id: str,
    file: UploadFile = File(...),
    user_info: dict = Depends(verify_token),
):
    """解析评分标准文档并保存为规则"""
    user_id = user_info.get("name") or "unknown_user"
    return parse_and_save_rule(track_id, file, user_id)
