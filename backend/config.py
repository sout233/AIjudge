import os

# ================= 基础路径 =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

STORAGE_DIR = os.path.join(BASE_DIR, "storage")

UPLOAD_DIR = os.path.join(STORAGE_DIR, "uploads")
RESULT_DIR = os.path.join(STORAGE_DIR, "results")
RULE_DIR = os.path.join(STORAGE_DIR, "rules")
CONTEST_DIR = os.path.join(STORAGE_DIR, "contests")
CONTEST_FILE = os.path.join(CONTEST_DIR, "contests.json")
ANNOUNCE_DIR = os.path.join(STORAGE_DIR, "announcements")
REPORT_TEMPLATE_DIR = os.path.join(STORAGE_DIR, "download_templates")

for d in [UPLOAD_DIR, RESULT_DIR, RULE_DIR, CONTEST_DIR]:
    os.makedirs(d, exist_ok=True)

# ================= DIFY 配置 =================
DIFY_BASE_URL = "http://47.103.34.195:8088/v1"
DIFY_Main_Workflow_APIKEY = "app-zoMij2BlaNalNKdRi5JICKye"
DIFY_Extract_Workflow_APIKEY = "app-KVT2hzCNFZY0S5FtuCC7aSS2"