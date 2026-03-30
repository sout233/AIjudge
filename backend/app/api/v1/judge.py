from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, Depends

from app.api.deps import get_current_user_name
from app.models.schemas import JudgeRequest, JudgeResponse, WorkflowStatus
from app.services.judge import upload_file, start_judge, get_status

router = APIRouter()


@router.post("/upload")
async def api_upload(file: UploadFile = File(...)):
    return await upload_file(file)


@router.post("/judge", response_model=JudgeResponse)
async def api_judge(
    data: JudgeRequest,
    background_tasks: BackgroundTasks,
    current_user_name: str = Depends(get_current_user_name),
):
    return await start_judge(data, background_tasks, current_user_name)


@router.get("/judge/{workflow_run_id}/status", response_model=WorkflowStatus)
async def api_status(workflow_run_id: str):
    return await get_status(workflow_run_id)
