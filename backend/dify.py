import requests
from mimetypes import guess_type
from config import DIFY_BASE_URL, DIFY_Main_Workflow_APIKEY,DIFY_Extract_Workflow_APIKEY


def upload_file_to_dify(file_path: str, filename: str, user: str):
    """
    上传文件到 Dify，返回 file_id
    """
    if user == "":
        user = "unknown"
    url = f"{DIFY_BASE_URL}/files/upload"
    mime_type, _ = guess_type(file_path)
    if not mime_type:
        mime_type = 'application/octet-stream'

    files = {
        "file": (filename, open(file_path, "rb"), mime_type)
    }
    payload = {
        "user": user
    }
    headers = {
        "Authorization": f"Bearer {DIFY_Main_Workflow_APIKEY}"
    }

    response = requests.post(url, data=payload, files=files, headers=headers)
    try:
        data = response.json()
        return data["id"]  # 返回 Dify 分配的 file_id
    except Exception as e:
        print("[dify.py] 上传文件失败，响应内容：", response.text)
        raise e

def run_workflow_with_file(file_id: str, score_rule_json: str, user: str):
    """
    调用 Dify 工作流执行评分
    返回整个工作流调用的原始响应（含 workflow_run_id）
    """
    if user == "":
        user = "unknown"
    url = f"{DIFY_BASE_URL}/workflows/run"
    headers = {
        "Authorization": f"Bearer {DIFY_Main_Workflow_APIKEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "inputs": {
            "Student_File": {
                "type": "document",
                "transfer_method": "local_file",
                "upload_file_id": file_id,
            },
            "Score_Standard": score_rule_json
        },
        "response_mode": "blocking",
        "user": user
    }

    response = requests.post(url, headers=headers, json=payload, timeout=300)
    response.raise_for_status()  # 如失败则抛异常
    return response.json()  # 包括 workflow_run_id 和其他字段

def run_extract_rule(file_id: str,user: str):
    if user == "":
        user = "unknown"
    url = f"{DIFY_BASE_URL}/workflows/run"
    headers = {
        "Authorization": f"Bearer {DIFY_Extract_Workflow_APIKEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "inputs": {
            "Target_File": {
                "type": "document",
                "transfer_method": "local_file",
                "upload_file_id": file_id,
            },
        },
        "response_mode": "blocking",
        "user": user
    }

    response = requests.post(url, headers=headers, json=payload, timeout=300)
    response.raise_for_status()  # 如失败则抛异常
    return response.json()  # 包括 workflow_run_id 和其他字段