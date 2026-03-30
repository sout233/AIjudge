import json
import os
import threading
from datetime import datetime

from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML

from app.core.config import RESULT_DIR, REPORT_TEMPLATE_DIR

env = Environment(loader=FileSystemLoader(searchpath=REPORT_TEMPLATE_DIR))
PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")
os.makedirs(PDF_CACHE_DIR, exist_ok=True)
PDF_LOCKS = {}


def generate_pdf_sync(workflow_run_id: str) -> str:
    pdf_file_path = os.path.join(PDF_CACHE_DIR, f"{workflow_run_id}.pdf")

    if os.path.exists(pdf_file_path):
        return pdf_file_path

    lock = PDF_LOCKS.setdefault(workflow_run_id, threading.Lock())
    with lock:
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

            workflow_data = data.get("workflow_data", {})
            report_id = workflow_data.get("workflow_run_id", "N/A")
            finished_at_timestamp = workflow_data.get("data", {}).get("finished_at")
            generate_time = (
                datetime.fromtimestamp(finished_at_timestamp).strftime("%Y-%m-%d %H:%M:%S")
                if finished_at_timestamp
                else "N/A"
            )

            template = env.get_template("report_template.html")
            html_content = template.render(
                result=score_result,
                report_id=report_id,
                generate_time=generate_time,
            )

            HTML(string=html_content).write_pdf(pdf_file_path)
        except Exception as e:
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            if isinstance(e, HTTPException):
                raise
            raise HTTPException(500, detail=f"PDF生成失败: {e}")

    return pdf_file_path
