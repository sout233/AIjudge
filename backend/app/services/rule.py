import json
import os
import re
import shutil
import traceback

from fastapi import HTTPException, UploadFile

from app.core.config import RULE_DIR, UPLOAD_DIR
from app.clients.dify import upload_file_to_dify, run_extract_rule


def _rule_path(track_id: str) -> str:
    """获取赛道规则文件路径"""
    return os.path.join(RULE_DIR, f"{track_id}.json")


def get_rule(track_id: str):
    """获取赛道的评分规则"""
    path = _rule_path(track_id)
    if not os.path.exists(path):
        raise HTTPException(404, detail="规则文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_rule_file(track_id: str, file: UploadFile | None, content: str | None):
    """保存赛道的评分规则"""
    path = _rule_path(track_id)

    if file:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext != ".json":
            raise HTTPException(400, detail="只能上传 JSON 文件")
        with open(path, "wb") as f:
            f.write(file.file.read())
        return {"success": True, "filename": f"{track_id}.json"}

    if content:
        try:
            json_data = json.loads(content)
        except json.JSONDecodeError as e:
            raise HTTPException(400, detail=f"JSON格式错误: {e}")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        return {"success": True, "filename": f"{track_id}.json"}

    raise HTTPException(400, detail="未提供文件或内容")


def _clean_json_string(text: str) -> str:
    text = re.sub(r"^```json\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^```\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    return text.strip()


def parse_and_save_rule(track_id: str, file: UploadFile, user_id: str):
    """解析评分标准文档并保存为规则"""
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".doc", ".docx", ".txt"]:
        raise HTTPException(400, detail="仅支持 PDF, Word 或 TXT 文档")

    temp_filename = f"temp_rule_{track_id}_{file.filename}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)

    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        dify_file_id = upload_file_to_dify(temp_path, file.filename, user_id)
        workflow_result = run_extract_rule(dify_file_id, user_id)

        raw_content = workflow_result.get("data", {}).get("outputs", {}).get("text")
        cleaned_json_str = _clean_json_string(raw_content)

        try:
            rule_data = json.loads(cleaned_json_str)
        except json.JSONDecodeError:
            print(f"JSON解析失败，原始文本: {cleaned_json_str}")
            raise HTTPException(500, detail="AI 解析结果不是有效的 JSON 格式，请检查文档内容")

        rule_path = _rule_path(track_id)
        with open(rule_path, "w", encoding="utf-8") as f:
            json.dump(rule_data, f, ensure_ascii=False, indent=2)

        return rule_data

    except Exception as e:
        print("\n" + "=" * 50)
        print("!!! 发生严重错误 (Rule Parsing Failed) !!!")
        print(traceback.format_exc())
        print("=" * 50 + "\n")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(500, detail=f"规则解析失败: {str(e)}")

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
                print(f"临时文件已清理: {temp_path}")
            except Exception as clean_err:
                print(f"清理临时文件失败: {clean_err}")
