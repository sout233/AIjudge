import os

# ================= 基础路径 =================
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

STORAGE_DIR = os.path.join(BASE_DIR, "storage")
UPLOAD_DIR = os.path.join(STORAGE_DIR, "uploads")
RESULT_DIR = os.path.join(STORAGE_DIR, "results")
RULE_DIR = os.path.join(STORAGE_DIR, "rules")
CONTEST_DIR = os.path.join(STORAGE_DIR, "contests")
CONTEST_FILE = os.path.join(CONTEST_DIR, "contests.json")
ANNOUNCE_DIR = os.path.join(STORAGE_DIR, "announcements")
REPORT_TEMPLATE_DIR = os.path.join(STORAGE_DIR, "download_templates")
PDF_CACHE_DIR = os.path.join(RESULT_DIR, "pdf_cache")

# ================= DIFY 配置 =================
DIFY_BASE_URL = "http://47.103.34.195:8088/v1"
DIFY_MAIN_WORKFLOW_APIKEY = "app-zoMij2BlaNalNKdRi5JICKye"
DIFY_EXTRACT_WORKFLOW_APIKEY = "app-KVT2hzCNFZY0S5FtuCC7aSS2"

# ================= JWT 配置 =================
SECRET_KEY = "your-secret-key-666"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7
