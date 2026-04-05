import difflib
import json
import os
import zipfile
from xml.etree import ElementTree

from pypdf import PdfReader

from app.config.config import RESULT_DIR, UPLOAD_DIR

SUPPORTED_DUP_EXTENSIONS = {".pdf", ".docx", ".txt"}


def _read_file_header(file_path: str, size: int = 8) -> bytes:
    try:
        with open(file_path, "rb") as f:
            return f.read(size)
    except OSError:
        return b""


def _is_pdf_file(file_path: str) -> bool:
    return _read_file_header(file_path, 5) == b"%PDF-"


def _is_zip_container(file_path: str) -> bool:
    return _read_file_header(file_path, 4) == b"PK\x03\x04"


def extract_text_from_pdf(file_path: str) -> str:
    if not os.path.exists(file_path) or not _is_pdf_file(file_path):
        return ""

    try:
        reader = PdfReader(file_path)
        chunks: list[str] = []
        for page in reader.pages:
            text = ""
            page_error = None
            for extraction_mode in ("plain", "layout"):
                try:
                    text = page.extract_text(extraction_mode=extraction_mode) or ""
                    if text:
                        break
                except Exception as page_exc:
                    page_error = page_exc
                    continue

            if not text and page_error is not None:
                print(f"Error extracting page text from {file_path}: {page_error}")
                continue
            if text:
                chunks.append(text)
        return "\n".join(chunks).strip()
    except Exception as exc:
        print(f"Error extracting text from {file_path}: {exc}")
        return ""


def extract_text_from_docx(file_path: str) -> str:
    if not os.path.exists(file_path) or not _is_zip_container(file_path):
        return ""

    try:
        with zipfile.ZipFile(file_path) as docx_zip:
            with docx_zip.open("word/document.xml") as document_xml:
                root = ElementTree.fromstring(document_xml.read())
    except Exception as exc:
        print(f"Error extracting text from {file_path}: {exc}")
        return ""

    namespaces = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    paragraphs: list[str] = []
    for paragraph in root.findall(".//w:p", namespaces):
        texts = [node.text for node in paragraph.findall(".//w:t", namespaces) if node.text]
        if texts:
            paragraphs.append("".join(texts))
    return "\n".join(paragraphs).strip()


def extract_text_from_txt(file_path: str) -> str:
    if not os.path.exists(file_path):
        return ""
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            return f.read().strip()
    except Exception as exc:
        print(f"Error extracting text from {file_path}: {exc}")
        return ""


def extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".pdf":
        return extract_text_from_pdf(file_path)
    if ext == ".docx":
        return extract_text_from_docx(file_path)
    if ext == ".txt":
        return extract_text_from_txt(file_path)
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
    current_ext = os.path.splitext(current_filename)[1].lower()
    if current_ext not in SUPPORTED_DUP_EXTENSIONS:
        print(f"[CheckDup] Unsupported file type for duplication check: {current_ext}")
        return False, "", 0.0

    current_text = extract_text(current_path)
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
            hist_filename = meta.get("filename")
            if meta.get("contest_id") != contest_id or hist_filename == current_filename:
                continue
            if not hist_filename:
                continue

            hist_ext = os.path.splitext(hist_filename)[1].lower()
            if hist_ext != current_ext:
                continue

            hist_path = os.path.join(UPLOAD_DIR, hist_filename)
            hist_text = extract_text(hist_path)
            if not hist_text:
                continue

            ratio = calculate_similarity(current_text, hist_text)
            if ratio >= threshold:
                return True, hist_filename, ratio
        except Exception as exc:
            print(f"[CheckDup] Error processing {result_file}: {exc}")
            continue

    return False, "", 0.0
