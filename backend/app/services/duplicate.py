import difflib
import json
import os

from pypdf import PdfReader

from app.config.config import UPLOAD_DIR, RESULT_DIR


def extract_text_from_pdf(file_path: str) -> str:
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
    if not text1 or not text2:
        return 0.0
    return difflib.SequenceMatcher(None, text1, text2).ratio()


def check_duplication(contest_id: str, current_filename: str, threshold: float = 0.8):
    if not contest_id:
        print("[CheckDup] No contest_id provided")
        return False, "", 0.0

    current_path = os.path.join(UPLOAD_DIR, current_filename)
    current_text = extract_text_from_pdf(current_path)

    if not current_text or len(current_text) < 50:
        print("[CheckDup] Text too short, skipping check")
        return False, "", 0.0

    if not os.path.exists(RESULT_DIR):
        return False, "", 0.0

    for result_file in os.listdir(RESULT_DIR):
        if not result_file.endswith(".json"):
            continue

        result_path = os.path.join(RESULT_DIR, result_file)
        try:
            with open(result_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            meta = data.get("metadata", {})
            if meta.get("contest_id") == contest_id and meta.get("filename") != current_filename:
                hist_filename = meta.get("filename")
                hist_path = os.path.join(UPLOAD_DIR, hist_filename)
                hist_text = extract_text_from_pdf(hist_path)

                if hist_text:
                    ratio = calculate_similarity(current_text, hist_text)
                    if ratio >= threshold:
                        return True, hist_filename, ratio
        except Exception as e:
            print(f"[CheckDup] Error processing {result_file}: {e}")
            continue

    return False, "", 0.0
