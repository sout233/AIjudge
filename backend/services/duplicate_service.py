import os
import json
import difflib
from pypdf import PdfReader
from models.schemas import JudgeRequest
from config import UPLOAD_DIR
from services.contest_service import load_contests

def extract_text_from_pdf(file_path: str) -> str:
    """提取PDF文件中的纯文本"""
    if not os.path.exists(file_path):
        return ""
    
    try:
        reader = PdfReader(file_path)
        text = ""
        for page in reader.pages:
            t = page.extract_text()
            if t:
                text += t + "\n"
        return text.strip()
    except Exception as e:
        print(f"Error extracting text from {file_path}: {e}")
        return ""

def calculate_similarity(text1: str, text2: str) -> float:
    """计算文本相似度 (0.0 - 1.0)"""
    if not text1 or not text2:
        return 0.0
    return difflib.SequenceMatcher(None, text1, text2).ratio()

def check_duplication(contest_id: str, current_filename: str, threshold: float = 0.8) -> tuple[bool, str, float]:
    """
    检查指定文件是否与同竞赛下的其他文件重复
    返回: (是否重复, 重复的文件名, 相似度)
    """
    if not contest_id:
        print("[CheckDup] No contest_id provided")
        return False, "", 0.0

    print(f"[CheckDup] Starting check for {contest_id}, file={current_filename}")
    current_path = os.path.join(UPLOAD_DIR, current_filename)
    print(f"[CheckDup] Extracting text from {current_path}")
    current_text = extract_text_from_pdf(current_path)
    print(f"[CheckDup] Extracted text length: {len(current_text)}")

    if not current_text or len(current_text) < 50: # 短的不查重
        print("[CheckDup] Text too short, skipping check")
        return False, "", 0.0

    from config import RESULT_DIR
    
    print(f"[CheckDup] RESULT_DIR: {RESULT_DIR}, Exists: {os.path.exists(RESULT_DIR)}")

    similar_files = []
    
    if os.path.exists(RESULT_DIR):
        files = os.listdir(RESULT_DIR)
        print(f"[CheckDup] Found {len(files)} files in RESULT_DIR")
        for result_file in files:
            if not result_file.endswith(".json"):
                continue
                
            result_path = os.path.join(RESULT_DIR, result_file)
            try:
                with open(result_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                
                meta = data.get("metadata", {})
                
                print(f"[CheckDup] Checking {result_file}: Contest={meta.get('contest_id')} vs {contest_id}")
                
                if meta.get("contest_id") == contest_id and meta.get("filename") != current_filename:
                    hist_filename = meta.get("filename")
                    hist_path = os.path.join(UPLOAD_DIR, hist_filename)
                    
                    hist_text = extract_text_from_pdf(hist_path)
                    
                    print(f"[CheckDup] Comparing with {hist_filename}, len(hist_text)={len(hist_text)}, len(curr)={len(current_text)}")
                    
                    if hist_text:
                        ratio = calculate_similarity(current_text, hist_text)
                        
                        print(f"[CheckDup] Similarity: {ratio:.4f}")
                        
                        if ratio >= threshold:
                            print(f"[CheckDup] FOUND DUPLICATE: {hist_filename}")
                            return True, hist_filename, ratio

            except Exception as e:
                print(f"[CheckDup] Error processing {result_file}: {e}")
                continue

    return False, "", 0.0
