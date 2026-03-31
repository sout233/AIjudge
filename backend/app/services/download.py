import json
import os
import threading
from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from jinja2 import Environment, FileSystemLoader
from loguru import logger

from app.config.config import RESULT_DIR, REPORT_TEMPLATE_DIR

# 初始化配置
PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")
os.makedirs(PDF_CACHE_DIR, exist_ok=True)
os.makedirs(REPORT_TEMPLATE_DIR, exist_ok=True)

# 延迟初始化
_jinja_env: Optional[Environment] = None
PDF_LOCKS: dict = {}
_weasyprint_available = False


def _get_jinja_env() -> Environment:
    """延迟初始化 Jinja2 环境"""
    global _jinja_env
    if _jinja_env is None:
        _jinja_env = Environment(loader=FileSystemLoader(searchpath=REPORT_TEMPLATE_DIR))
    return _jinja_env


def _check_weasyprint() -> bool:
    """检查 weasyprint 是否可用"""
    global _weasyprint_available
    if not _weasyprint_available:
        try:
            from weasyprint import HTML
            _weasyprint_available = True
        except ImportError:
            logger.error("weasyprint 未安装或系统依赖缺失")
    return _weasyprint_available


def generate_pdf_sync(workflow_run_id: str) -> str:
    """生成 PDF 报告"""
    pdf_file_path = os.path.join(PDF_CACHE_DIR, f"{workflow_run_id}.pdf")
    
    # 检查缓存
    if os.path.exists(pdf_file_path):
        return pdf_file_path
    
    # 检查 weasyprint 是否可用
    if not _check_weasyprint():
        raise HTTPException(500, detail="PDF生成功能暂不可用，请联系管理员")
    
    lock = PDF_LOCKS.setdefault(workflow_run_id, threading.Lock())
    with lock:
        # 双重检查
        if os.path.exists(pdf_file_path):
            return pdf_file_path
        
        try:
            # 检查结果文件
            result_path = os.path.join(RESULT_DIR, f"{workflow_run_id}.json")
            if not os.path.exists(result_path):
                raise HTTPException(404, detail="报告文件不存在")
            
            # 读取结果数据
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            # 提取评分结果
            score_result = data.get("workflow_data", {}).get("data", {}).get("outputs", {}).get("text")
            if not score_result:
                raise HTTPException(400, detail="评分结果尚未生成")
            
            # 准备报告元数据
            workflow_data = data.get("workflow_data", {})
            report_id = workflow_data.get("workflow_run_id", workflow_run_id)
            finished_at_timestamp = workflow_data.get("data", {}).get("finished_at")
            generate_time = (
                datetime.fromtimestamp(finished_at_timestamp).strftime("%Y-%m-%d %H:%M:%S")
                if finished_at_timestamp
                else datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            )
            
            # 检查模板文件
            template_file = os.path.join(REPORT_TEMPLATE_DIR, "report_template.html")
            if not os.path.exists(template_file):
                raise HTTPException(500, detail="PDF模板文件缺失")
            
            # 渲染HTML
            jinja_env = _get_jinja_env()
            template = jinja_env.get_template("report_template.html")
            html_content = template.render(
                result=score_result,
                report_id=report_id,
                generate_time=generate_time,
            )
            
            # 生成PDF
            from weasyprint import HTML
            HTML(string=html_content).write_pdf(pdf_file_path)
            
        except HTTPException:
            # 清理失败的文件
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            raise
        except Exception as e:
            # 清理失败的文件
            if os.path.exists(pdf_file_path):
                os.remove(pdf_file_path)
            logger.exception(f"PDF生成失败 [{workflow_run_id}]: {e}")
            raise HTTPException(500, detail=f"PDF生成失败: {type(e).__name__}: {e}")
    
    return pdf_file_path
