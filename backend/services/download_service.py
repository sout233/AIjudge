import base64
import os
import json
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from config import RESULT_DIR, REPORT_TEMPLATE_DIR

router = APIRouter()

# jinja2 模板环境
env = Environment(loader=FileSystemLoader(searchpath=REPORT_TEMPLATE_DIR))

PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")
os.makedirs(PDF_CACHE_DIR, exist_ok=True)

# PDF生成锁，防止重复生成
PDF_LOCKS = {}

def generate_pdf_sync(workflow_run_id: str, score_result: dict) -> str:
    """
    生成 PDF 并返回文件路径
    """
    pdf_file_path = os.path.join(PDF_CACHE_DIR, f"{workflow_run_id}.pdf")

    # 已存在直接返回
    if os.path.exists(pdf_file_path):
        return pdf_file_path

    # 防止并发生成同一个文件
    lock = PDF_LOCKS.setdefault(workflow_run_id, threading.Lock())
    with lock:
        # 再次检查文件是否已生成（可能在等待锁期间被生成）
        if os.path.exists(pdf_file_path):
            return pdf_file_path

        try:
            result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
            if not os.path.exists(result_path):
                raise HTTPException(404, detail="报告文件不存在")

            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            score_result = data.get("workflow_data", {}).get("data", {}).get("outputs", {}).get("text")
            if not score_result:
                raise HTTPException(400, detail="评分结果尚未生成")

            # 获取元数据
            workflow_data = data.get("workflow_data", {})
            report_id = workflow_data.get("workflow_run_id", "N/A")
            finished_at_timestamp = workflow_data.get("data", {}).get("finished_at")

            # 转换时间戳为可读格式
            from datetime import datetime
            generate_time = datetime.fromtimestamp(finished_at_timestamp).strftime('%Y-%m-%d %H:%M:%S') if finished_at_timestamp else "N/A"

            # 渲染时传入
            template = env.get_template("report_template.html")
            html_content = template.render(
                result=score_result,
                report_id=report_id,
                generate_time=generate_time
            )

            HTML(string=html_content).write_pdf(pdf_file_path)
        except Exception as e:
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            raise HTTPException(500, detail=f"PDF生成失败: {e}")

    return pdf_file_path

@router.get("/judge/{workflow_run_id}/download_pdf")
async def download_pdf(workflow_run_id: str):
    """
    点击下载时，如果 PDF 已生成直接返回，否则同步生成 PDF
    """
    pdf_file_path = generate_pdf_sync(workflow_run_id, score_result=None)
    return FileResponse(pdf_file_path, filename=f"{workflow_run_id}_report.pdf", media_type="application/pdf")
