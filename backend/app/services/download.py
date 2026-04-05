import json
import os
import threading
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader
from loguru import logger

from app.config.config import REPORT_TEMPLATE_DIR, RESULT_DIR

PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")
os.makedirs(PDF_CACHE_DIR, exist_ok=True)
os.makedirs(REPORT_TEMPLATE_DIR, exist_ok=True)

_jinja_env: Optional[Environment] = None
PDF_LOCKS: dict[str, threading.Lock] = {}
_weasyprint_available = False


def _get_jinja_env() -> Environment:
    """Lazily initialize the Jinja environment."""
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(loader=FileSystemLoader(searchpath=REPORT_TEMPLATE_DIR))
    return _jinja_env


def _check_weasyprint() -> bool:
    """Check whether WeasyPrint is available."""
    global _weasyprint_available
    if not _weasyprint_available:
        try:
            from weasyprint import HTML  # noqa: F401

            _weasyprint_available = True
        except ImportError:
            logger.error("weasyprint 未安装或系统依赖缺失")
    return _weasyprint_available


def _load_score_result(raw_result: Any) -> dict[str, Any]:
    """Parse Dify output and unwrap the outer `result` field when present."""
    if isinstance(raw_result, str):
        try:
            raw_result = json.loads(raw_result)
        except json.JSONDecodeError as exc:
            raise HTTPException(400, detail="评分结果不是合法 JSON") from exc

    if not isinstance(raw_result, dict):
        raise HTTPException(400, detail="评分结果格式不正确")

    normalized = raw_result.get("result", raw_result)
    if not isinstance(normalized, dict):
        raise HTTPException(400, detail="评分结果内容格式不正确")

    return normalized


def _build_report_context(score_result: dict[str, Any]) -> dict[str, Any]:
    """Prepare template context for single-judge and multi-judge reports."""
    evaluations = score_result.get("evaluations")
    is_multi_judge = isinstance(evaluations, list) and len(evaluations) > 0

    if is_multi_judge:
        valid_evaluations = [evaluation for evaluation in evaluations if isinstance(evaluation, dict)]
        scores = [int(evaluation.get("total_score", 0)) for evaluation in valid_evaluations]
        average_score = round(sum(scores) / len(scores)) if scores else 0
        final_review = score_result.get("final_review")
        final_review = final_review if isinstance(final_review, dict) else {}
        fallback_max_score = int(valid_evaluations[0].get("max_score", 100)) if valid_evaluations else 100

        return {
            "result": score_result,
            "is_multi_judge": True,
            "summary_score": int(final_review.get("final_total_score", average_score)),
            "summary_max_score": int(final_review.get("final_max_score", fallback_max_score)),
            "average_score": average_score,
            "final_comment": final_review.get("final_comment", ""),
            "score_reason": final_review.get("score_reason", ""),
            "highest_score": max(scores) if scores else 0,
            "lowest_score": min(scores) if scores else 0,
            "judge_count": len(valid_evaluations),
        }

    total_score = int(score_result.get("total_score", 0))
    max_score = int(score_result.get("max_score", 100))
    return {
        "result": score_result,
        "is_multi_judge": False,
        "summary_score": total_score,
        "summary_max_score": max_score,
        "average_score": total_score,
        "final_comment": "",
        "score_reason": "",
        "highest_score": total_score,
        "lowest_score": total_score,
        "judge_count": 1,
    }


def generate_pdf_sync(workflow_run_id: str) -> str:
    """Generate a PDF report for a workflow run."""
    pdf_file_path = os.path.join(PDF_CACHE_DIR, f"{workflow_run_id}.pdf")

    if os.path.exists(pdf_file_path):
        return pdf_file_path

    if not _check_weasyprint():
        raise HTTPException(500, detail="PDF 生成功能暂不可用，请联系管理员")

    lock = PDF_LOCKS.setdefault(workflow_run_id, threading.Lock())
    with lock:
        if os.path.exists(pdf_file_path):
            return pdf_file_path

        try:
            result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
            if not os.path.exists(result_path):
                raise HTTPException(404, detail="报告文件不存在")

            with open(result_path, "r", encoding="utf-8") as file:
                data = json.load(file)

            outputs = data.get("workflow_data", {}).get("data", {}).get("outputs", {})
            raw_score_result = outputs.get("result")
            if raw_score_result is None:
                raw_score_result = outputs.get("text")
            if not raw_score_result:
                raise HTTPException(400, detail="评分结果尚未生成")

            score_result = _load_score_result(raw_score_result)
            report_context = _build_report_context(score_result)

            workflow_data = data.get("workflow_data", {})
            report_id = workflow_data.get("workflow_run_id", workflow_run_id)
            finished_at_timestamp = workflow_data.get("data", {}).get("finished_at")
            generate_time = (
                datetime.fromtimestamp(finished_at_timestamp).strftime("%Y-%m-%d %H:%M:%S")
                if finished_at_timestamp
                else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )

            template_file = os.path.join(REPORT_TEMPLATE_DIR, "report_template.html")
            if not os.path.exists(template_file):
                raise HTTPException(500, detail="PDF 模板文件缺失")

            jinja_env = _get_jinja_env()
            template = jinja_env.get_template("report_template.html")
            html_content = template.render(
                **report_context,
                report_id=report_id,
                generate_time=generate_time,
            )

            from weasyprint import HTML

            HTML(string=html_content).write_pdf(pdf_file_path)
        except HTTPException:
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            raise
        except Exception as exc:
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            logger.exception(f"PDF 生成失败 [{workflow_run_id}]: {exc}")
            raise HTTPException(500, detail=f"PDF 生成失败: {type(exc).__name__}: {exc}") from exc

    return pdf_file_path
