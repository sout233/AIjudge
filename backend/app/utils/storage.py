import json
import os
from typing import Any

from app.core.config import CONTEST_FILE


def load_contests() -> list:
    """加载竞赛列表"""
    if not os.path.exists(CONTEST_FILE):
        return []
    with open(CONTEST_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_contests(data: list) -> None:
    """保存竞赛列表"""
    with open(CONTEST_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def read_json(path: str, default: Any = None) -> Any:
    """安全读取 JSON 文件"""
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str, data: Any) -> None:
    """安全写入 JSON 文件（自动创建目录）"""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
