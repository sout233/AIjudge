from typing import List
from fastapi import APIRouter, BackgroundTasks, File, HTTPException, UploadFile, Depends

from app.api.deps import get_current_user_name
from app.models.schemas import JudgeRequest, JudgeResponse, WorkflowStatus, BatchJudgeRequest, ZipBatchJudgeRequest
from app.services.judge import upload_file, start_judge, get_status, batch_start_judge, zip_batch_start_judge, get_zip_batch_status, get_history

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


@router.post("/batch_judge")
async def api_batch_judge(
    data: BatchJudgeRequest,
    background_tasks: BackgroundTasks,
    current_user_name: str = Depends(get_current_user_name),
):
    """批量评分多个文件（并发控制最多3个）"""
    results = await batch_start_judge(data, background_tasks, current_user_name)
    return results


@router.post("/zip_batch_judge")
async def api_zip_batch_judge(
    data: ZipBatchJudgeRequest,
    background_tasks: BackgroundTasks,
    current_user_name: str = Depends(get_current_user_name),
):
    """ZIP 批量评分：上传 zip 文件，解压后逐个评分（并发控制最多3个）"""
    results = await zip_batch_start_judge(data, background_tasks, current_user_name)
    return results


@router.get("/zip_batch/{manifest_id}/status")
async def api_zip_batch_status(manifest_id: str):
    """获取 ZIP 批量任务的总体状态和进度"""
    return await get_zip_batch_status(manifest_id)


@router.get("/judge/{workflow_run_id}/status", response_model=WorkflowStatus)
async def api_status(workflow_run_id: str):
    return await get_status(workflow_run_id)


@router.get("/history")
async def api_history(current_user_name: str = Depends(get_current_user_name)):
    """获取当前用户的历史评审记录"""
    return await get_history(current_user_name)
