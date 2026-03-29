import base64
import os
import json
import threading
import re
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from jinja2 import Environment, FileSystemLoader
from weasyprint import HTML
from datetime import datetime

from config import RESULT_DIR, REPORT_TEMPLATE_DIR

router = APIRouter()

# jinja2 模板环境
env = Environment(loader=FileSystemLoader(searchpath=REPORT_TEMPLATE_DIR))

PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")
os.makedirs(PDF_CACHE_DIR, exist_ok=True)

# PDF生成锁，防止重复生成
PDF_LOCKS = {}

def generate_pdf_sync(workflow_run_id: str) -> str:
    """
    生成 PDF 并返回文件路径
    """
    pdf_file_path = os.path.join(PDF_CACHE_DIR, f"{workflow_run_id}.pdf")

    # HACK：暂时禁用缓存，确保每次都重新生成以验证模板
    # if os.path.exists(pdf_file_path):
    #     return pdf_file_path

    # 防止并发生成同一个文件
    lock = PDF_LOCKS.setdefault(workflow_run_id, threading.Lock())
    with lock:
        try:
            result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
            if not os.path.exists(result_path):
                raise HTTPException(404, detail="报告源文件不存在")

            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            raw_text = data.get("workflow_data", {}).get("data", {}).get("outputs", {}).get("text")
            if not raw_text:
                raise HTTPException(400, detail="评分结果数据缺失")

            score_result = {}
            if isinstance(raw_text, str):
                try:
                    clean_json = raw_text.strip()
                    if clean_json.startswith("```"):
                        clean_json = re.sub(r'^```json\s*|^```\s*|```$', '', clean_json, flags=re.MULTILINE).strip()
                    score_result = json.loads(clean_json)
                except Exception as e:
                    print(f"[PDF] JSON Parse Error: {e}")
                    match = re.search(r'\{.*\}', raw_text, re.DOTALL)
                    if match:
                        score_result = json.loads(match.group())
                    else:
                        raise HTTPException(500, detail="无法解析评分 JSON 数据")
            else:
                score_result = raw_text

            evaluations = score_result.get("evaluations", [])
            avg_score = 0
            if evaluations:
                avg_score = round(sum(e.get("total_score", 0) for e in evaluations) / len(evaluations))

            workflow_data = data.get("workflow_data", {})
            report_id = workflow_run_id
            finished_at_timestamp = workflow_data.get("data", {}).get("finished_at")

            generate_time = datetime.fromtimestamp(finished_at_timestamp).strftime('%Y-%m-%d %H:%M:%S') if finished_at_timestamp else datetime.now().strftime('%Y-%m-%d %H:%M:%S')

            template = env.get_template("report_template.html")
            html_content = template.render(
                result=score_result,
                avg_score=avg_score,
                report_id=report_id,
                generate_time=generate_time
            )

            HTML(string=html_content).write_pdf(pdf_file_path)
            print(f"[PDF] Successfully generated: {pdf_file_path}")

        except Exception as e:
            print(f"[PDF] Critical Error: {str(e)}")
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            raise HTTPException(500, detail=f"PDF生成失败: {str(e)}")

    return pdf_file_path

@router.get("/judge/{workflow_run_id}/download_pdf")
async def download_pdf(workflow_run_id: str):
    """
    点击下载接口
    """
    pdf_file_path = generate_pdf_sync(workflow_run_id)
    return FileResponse(
        pdf_file_path,
        filename=f"Report_{workflow_run_id[:8]}.pdf",
        media_type="application/pdf"
    )
