from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from app.services.download import generate_pdf_sync

router = APIRouter()


@router.get("/judge/{workflow_run_id}/download_pdf")
async def download_pdf(workflow_run_id: str):
    """下载评审报告 PDF"""
    pdf_file_path = generate_pdf_sync(workflow_run_id)
    return FileResponse(
        pdf_file_path,
        filename=f"{workflow_run_id}_report.pdf",
        media_type="application/pdf",
    )
