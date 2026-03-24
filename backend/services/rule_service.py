import os
import json
import re
import shutil

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends # 注入 Depends
from config import RULE_DIR, UPLOAD_DIR
from dify import upload_file_to_dify, run_extract_rule
from services.auth_service import verify_token
import traceback

router = APIRouter()

# 确保规则目录存在
os.makedirs(RULE_DIR, exist_ok=True)

def clean_json_string(text: str) -> str:
    # 移除 ```json 和 ``` 标记
    text = re.sub(r"^```json\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^```\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    return text.strip()

@router.get("/rule/{contest_id}")
async def get_rule(contest_id: str):
    """
    获取竞赛规则 JSON
    """
    filename = f"{contest_id}.json"
    path = os.path.join(RULE_DIR, filename)
    if not os.path.exists(path):
        raise HTTPException(404, detail="规则文件不存在")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post("/rule/{contest_id}")
async def save_rule(
    contest_id: str,
    file: UploadFile | None = File(None),
    content: str | None = Form(None)
):
    """
    保存竞赛规则 (方式 A & B)
    """
    filename = f"{contest_id}.json"
    path = os.path.join(RULE_DIR, filename)

    if file:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext != ".json":
            raise HTTPException(400, detail="只能上传 JSON 文件")
        with open(path, "wb") as f:
            f.write(await file.read())
        return {"success": True, "filename": filename}

    if content:
        try:
            json_data = json.loads(content)
        except json.JSONDecodeError as e:
            raise HTTPException(400, detail=f"JSON格式错误: {e}")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(json_data, f, ensure_ascii=False, indent=2)
        return {"success": True, "filename": filename}

    raise HTTPException(400, detail="未提供文件或内容")


@router.put("/rule/{contest_id}")
async def parse_and_save_rule(
        contest_id: str,
        file: UploadFile = File(...),
        user_info: dict = Depends(verify_token) # ✅ 从 JWT 解析用户信息
):
    """
    方式 C: 上传文档 -> Dify 解析 -> 保存为规则文件 -> 返回 JSON 给前端
    """
    # 从 JWT payload 中提取用户标识（通常是 'sub', 'username' 或 'id'）
    user_id = user_info.get("name") or "unknown_user"

    # 1. 验证文件类型
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".pdf", ".doc", ".docx", ".txt"]:
        raise HTTPException(400, detail="仅支持 PDF, Word 或 TXT 文档")

    # 2. 保存临时文件
    temp_filename = f"temp_rule_{contest_id}_{file.filename}"
    temp_path = os.path.join(UPLOAD_DIR, temp_filename)

    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)

        # 3. 上传文件到 Dify (传递 user_id)
        dify_file_id = upload_file_to_dify(temp_path, file.filename, user_id)

        # 4. 调用 Dify 解析工作流 (传递 user_id)
        workflow_result = run_extract_rule(dify_file_id, user_id)

        # 获取解析结果
        # 注意：这里根据你 Dify 工作流的实际输出变量名获取，常见为 'answer' 或自定义变量
        raw_content = workflow_result.get("data", {}).get("outputs", {}).get("text")

        # 5. 清洗并校验 JSON
        cleaned_json_str = clean_json_string(raw_content)
        try:
            rule_data = json.loads(cleaned_json_str)
        except json.JSONDecodeError:
            print(f"JSON解析失败，原始文本: {cleaned_json_str}")
            raise HTTPException(500, detail="AI 解析结果不是有效的 JSON 格式，请检查文档内容")

        # 6. 保存到本地规则文件
        rule_filename = f"{contest_id}.json"
        rule_path = os.path.join(RULE_DIR, rule_filename)

        with open(rule_path, "w", encoding="utf-8") as f:
            json.dump(rule_data, f, ensure_ascii=False, indent=2)

        # 7. 返回结果给前端
        return rule_data


    except Exception as e:

        # <--- 2. 关键修改：打印完整堆栈

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