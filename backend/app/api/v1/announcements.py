from fastapi import APIRouter, Form

from app.services.announcement import get_announcement, save_announcement

router = APIRouter()


@router.get("/announcement/{contest_id}")
async def get(contest_id: str):
    return get_announcement(contest_id)


@router.post("/announcement/{contest_id}")
async def post(contest_id: str, content: str = Form(...)):
    return save_announcement(contest_id, content)
