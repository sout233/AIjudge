import asyncio
import base64
import json
import os
import random
import shutil
import socket
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Dict, Optional, Tuple

import cv2
import numpy as np
from DrissionPage import ChromiumOptions, ChromiumPage
from fastapi import APIRouter, HTTPException
from loguru import logger
from pydantic import BaseModel

from services.auto_solver import get_target_coords
from services.utils import (
    calculate_display_ratio,
    download_image,
    generate_tcaptcha_track,
    identify_gap_tcaptcha,
)

active_sessions: Dict[str, dict] = {}

SYSTEM_USERNAME = "13913517504"
SYSTEM_PASSWORD = "200506040@Wzj"
YIDUN_LOGIN_URL = "https://register.ccopyright.com.cn/login.html"
BASE_DIR = Path(__file__).resolve().parent.parent
CAPTCHA_MODEL_PATH = BASE_DIR / "captcha_multi_task.pth"
COOKIE_FILE = BASE_DIR / "yidun_cookies.json"
RUNTIME_DIR = BASE_DIR / ".runtime" / "verify_certificate"
MAX_GLOBAL_RETRIES = 3
# 兼容性能较差的 Linux 服务器，默认放宽整条链路的等待时间。
INIT_QUERY_TIMEOUT_SECONDS = int(os.getenv("VERIFY_INIT_QUERY_TIMEOUT_SECONDS", "1200"))
LISTEN_PACKET_TIMEOUT_SECONDS = int(os.getenv("VERIFY_LISTEN_PACKET_TIMEOUT_SECONDS", "20"))
CAPTCHA_MODAL_TIMEOUT_SECONDS = int(os.getenv("VERIFY_CAPTCHA_MODAL_TIMEOUT_SECONDS", "30"))
RESULT_WAIT_TIMEOUT_SECONDS = int(os.getenv("VERIFY_RESULT_WAIT_TIMEOUT_SECONDS", "90"))
LOGIN_FORM_TIMEOUT_SECONDS = int(os.getenv("VERIFY_LOGIN_FORM_TIMEOUT_SECONDS", "20"))
LOGIN_POPUP_TIMEOUT_SECONDS = int(os.getenv("VERIFY_LOGIN_POPUP_TIMEOUT_SECONDS", "10"))
BROWSER_ENV_KEYS = (
    "VERIFY_BROWSER_PATH",
    "BROWSER_PATH",
    "CHROME_PATH",
    "EDGE_PATH",
)
BROWSER_CANDIDATES = (
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/snap/bin/chromium",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Google", "Chrome", "Application", "chrome.exe"),
    os.path.join(os.environ.get("LOCALAPPDATA", ""), "Microsoft", "Edge", "Application", "msedge.exe"),
)

router = APIRouter()


class InitReq(BaseModel):
    register_no: str
    keyword: str


def _stringify_result_item(item) -> str:
    if item is None:
        return ""

    if isinstance(item, str):
        return item.strip()

    if isinstance(item, dict):
        if isinstance(item.get("text"), str):
            return item["text"].strip()
        return json.dumps(item, ensure_ascii=False, indent=2)

    if isinstance(item, (list, tuple)):
        return json.dumps(item, ensure_ascii=False, indent=2)

    return str(item).strip()


def _normalize_result_data(raw_data) -> list[dict]:
    if raw_data is None:
        return []

    if isinstance(raw_data, dict):
        for key in ("data", "list", "rows", "result", "records"):
            value = raw_data.get(key)
            if isinstance(value, list):
                return _normalize_result_data(value)

        text = _stringify_result_item(raw_data)
        return [{"title": "官方返回数据", "text": text}] if text else []

    if isinstance(raw_data, list):
        normalized = []
        for index, item in enumerate(raw_data, start=1):
            text = _stringify_result_item(item)
            if text:
                normalized.append({"title": f"查询结果 {index}", "text": text})
        return normalized

    text = _stringify_result_item(raw_data)
    return [{"title": "官方返回数据", "text": text}] if text else []


def _env_flag(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_browser_path(candidate: Optional[str]) -> Optional[str]:
    if not candidate:
        return None

    expanded = os.path.expandvars(os.path.expanduser(candidate.strip()))
    if not expanded:
        return None

    if os.path.isabs(expanded) and os.path.exists(expanded):
        return expanded

    executable = shutil.which(expanded)
    if executable:
        return executable

    if os.path.exists(expanded):
        return os.path.abspath(expanded)

    return None


def _find_browser_path(default_candidate: Optional[str]) -> Optional[str]:
    candidates = [os.getenv(key) for key in BROWSER_ENV_KEYS]
    candidates.append(default_candidate)
    candidates.extend(BROWSER_CANDIDATES)

    for candidate in candidates:
        resolved = _resolve_browser_path(candidate)
        if resolved:
            return resolved

    return None


def _find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _create_runtime_profile_dir(session_id: str, attempt: int) -> Path:
    profiles_root = RUNTIME_DIR / "profiles"
    profiles_root.mkdir(parents=True, exist_ok=True)
    temp_dir = tempfile.mkdtemp(
        prefix=f"{session_id[:8]}_attempt_{attempt}_",
        dir=str(profiles_root),
    )
    return Path(temp_dir)


def _cleanup_runtime_dir(target: Optional[Path]):
    if not target:
        return

    try:
        resolved_target = target.resolve(strict=False)
        runtime_root = RUNTIME_DIR.resolve(strict=False)
    except OSError as exc:
        logger.warning(f"解析运行时目录失败，跳过清理: {exc}")
        return

    if resolved_target == runtime_root or runtime_root not in resolved_target.parents:
        logger.warning(f"检测到非预期清理路径，已跳过: {resolved_target}")
        return

    shutil.rmtree(resolved_target, ignore_errors=True)


def get_browser_options(session_id: str, attempt: int, headless: bool) -> Tuple[ChromiumOptions, Path]:
    co = ChromiumOptions()
    browser_path = _find_browser_path(co.browser_path)
    if not browser_path:
        raise RuntimeError("未找到可用 Chromium 浏览器，请通过 VERIFY_BROWSER_PATH/BROWSER_PATH/CHROME_PATH 显式指定。")

    profile_dir = _create_runtime_profile_dir(session_id, attempt)
    debug_port = _find_free_port()

    co.set_browser_path(browser_path)
    co.headless(headless)
    co.set_argument("--no-sandbox")
    co.set_argument("--disable-setuid-sandbox")
    co.set_argument("--disable-gpu")
    co.set_argument("--disable-dev-shm-usage")
    co.set_argument("--disable-software-rasterizer")
    co.set_argument("--disable-extensions")
    co.set_argument("--disable-background-networking")
    co.set_argument("--disable-background-timer-throttling")
    co.set_argument("--disable-backgrounding-occluded-windows")
    co.set_argument("--disable-renderer-backgrounding")
    co.set_argument("--disable-features=TranslateUI,site-per-process")
    co.set_argument("--disable-blink-features=AutomationControlled")
    co.set_argument("--window-size=1920,1080")
    co.set_argument("--start-maximized")
    co.set_user_data_path(str(profile_dir))
    co.set_local_port(debug_port)
    co.set_user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )

    logger.info(
        f"[{session_id}] 浏览器配置完成: browser={browser_path}, headless={headless}, "
        f"port={debug_port}, profile={profile_dir}"
    )
    return co, profile_dir


def load_cookies(page: ChromiumPage) -> bool:
    if not COOKIE_FILE.exists():
        return False

    try:
        with open(COOKIE_FILE, "r", encoding="utf-8") as file:
            cookies = json.load(file)
        page.get("https://register.ccopyright.com.cn/")
        page.set.cookies(cookies)
        return True
    except Exception as exc:
        logger.warning(f"加载本地 Cookie 失败: {exc}")
        return False


def save_cookies(page: ChromiumPage):
    try:
        cookies = page.cookies()
        with open(COOKIE_FILE, "w", encoding="utf-8") as file:
            json.dump(cookies, file, ensure_ascii=False, indent=2)
        logger.info("已成功保存最新的登录状态 (Cookies)")
    except Exception as exc:
        logger.warning(f"保存 Cookie 失败: {exc}")


def click_refresh_and_wait(page: ChromiumPage):
    refresh_btn = page.ele("css:.yidun_refresh")
    if refresh_btn:
        refresh_btn.click()
        logger.info("已点击刷新按钮，等待新图片加载...")
    time.sleep(1.5)


def auto_login_yidun(page: ChromiumPage, max_retries: int = 3) -> bool:
    try:
        if load_cookies(page):
            logger.info("已注入本地 Cookie，正在验证有效性...")
            page.get("https://register.ccopyright.com.cn/index.html")
            time.sleep(1.5)
            if "login.html" not in page.url and page.ele(".index_container", timeout=2):
                logger.info("Cookie 有效，跳过登录流程。")
                return True
            logger.info("Cookie 已过期或无效，将执行常规密码登录流程...")

        page.get(YIDUN_LOGIN_URL)
        if not page.wait.ele_displayed("css:.login_pwd", timeout=LOGIN_FORM_TIMEOUT_SECONDS):
            logger.error(f"登录框未能在 {LOGIN_FORM_TIMEOUT_SECONDS} 秒内加载")
            return False

        user_input = page.ele("@placeholder=请输入用户名/手机号/邮箱")
        pwd_input = page.ele("@placeholder=请输入密码")
        if not user_input or not pwd_input:
            logger.error("登录输入框缺失")
            return False

        user_input.clear()
        user_input.input(SYSTEM_USERNAME)
        time.sleep(random.uniform(0.2, 0.5))

        pwd_input.clear()
        pwd_input.input(SYSTEM_PASSWORD)

        login_btn = page.ele(".login_btn").ele("tag:button")
        login_btn.click()
        logger.info("已提交登录，等待验证码弹窗...")

        popup_container = page.wait.ele_displayed("css:.yidun_popup", timeout=LOGIN_POPUP_TIMEOUT_SECONDS)
        if not popup_container:
            if "login.html" not in page.url:
                save_cookies(page)
                return True
            return False

        for _ in range(1, max_retries + 1):
            try:
                bg_img_ele = page.ele("css:.yidun_bg-img")
                slider_img_ele = page.ele("css:.yidun_jigsaw")
                slider_btn = page.ele("css:.yidun_slider")

                if not bg_img_ele or not slider_img_ele or not slider_btn:
                    click_refresh_and_wait(page)
                    continue

                display_width = 0
                for _ in range(30):
                    try:
                        if bg_img_ele.attr("src") and bg_img_ele.rect.size[0] > 0:
                            display_width = bg_img_ele.rect.size[0]
                            break
                    except Exception:
                        pass
                    time.sleep(0.1)

                if display_width == 0:
                    click_refresh_and_wait(page)
                    continue

                bg_url = bg_img_ele.attr("src")
                slider_url = slider_img_ele.attr("src")
                if not bg_url or not slider_url:
                    click_refresh_and_wait(page)
                    continue

                bg_bytes = download_image(bg_url, referer=page.url)
                slider_bytes = download_image(slider_url, referer=page.url)

                gap_x_original, confidence = identify_gap_tcaptcha(bg_bytes, slider_bytes)
                if confidence < 0.3:
                    click_refresh_and_wait(page)
                    continue

                bg_img_cv = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
                if bg_img_cv is None:
                    click_refresh_and_wait(page)
                    continue

                original_width = bg_img_cv.shape[1]
                ratio = calculate_display_ratio(display_width, original_width)
                gap_x_display = int(gap_x_original / ratio) + 4

                tracks = generate_tcaptcha_track(gap_x_display)
                page.actions.hold(slider_btn)
                for step in tracks:
                    y_jitter = random.choice([-1, 0, 1]) if random.random() > 0.8 else 0
                    page.actions.move(offset_x=step, offset_y=y_jitter, duration=0.01)

                time.sleep(random.uniform(0.05, 0.1))
                page.actions.release()

                time.sleep(2)
                if "login.html" not in page.url:
                    save_cookies(page)
                    return True

                is_success = page.ele("css:.yidun.yidun--success", timeout=2)
                if is_success:
                    time.sleep(1)
                    if "login.html" not in page.url:
                        save_cookies(page)
                        return True

                click_refresh_and_wait(page)
            except Exception:
                click_refresh_and_wait(page)

        return False
    except Exception as exc:
        logger.error(f"自动登录异常: {exc}")
        return False


def _decode_captcha_background(bg_url: str, referer: str) -> np.ndarray:
    if bg_url.startswith("data:image"):
        bg_bytes = base64.b64decode(bg_url.split(",", 1)[1])
    else:
        bg_bytes = download_image(bg_url, referer=referer)

    bg_img_cv = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
    if bg_img_cv is None:
        raise ValueError("验证码背景图解码失败")

    return bg_img_cv


def automation_task(session_id: str, req: InitReq):
    session = active_sessions[session_id]

    for attempt in range(1, MAX_GLOBAL_RETRIES + 1):
        logger.info(f"[{session_id}] 启动自动化工作流，当前尝试: {attempt}/{MAX_GLOBAL_RETRIES}")
        page = None
        profile_dir = None

        try:
            options, profile_dir = get_browser_options(
                session_id=session_id,
                attempt=attempt,
                headless=_env_flag("VERIFY_HEADLESS", True),
            )
            page = ChromiumPage(addr_or_opts=options)

            if not auto_login_yidun(page):
                raise RuntimeError("自动登录及滑块验证失败")

            page.listen.start("externalAPI/getSoftPublicity")

            query_url = (
                f"https://register.ccopyright.com.cn/publicInquiry.html?"
                f"type=softList&registerNumber={req.register_no}&"
                f"keyWord={req.keyword}&publicityType=ALL&registerDateType=ALL"
            )
            page.get(query_url)
            logger.info(f"[{session_id}] 已导航至查询页，等待验证码弹窗...")
            time.sleep(1)

            modal = page.wait.ele_displayed(".yidun_modal", timeout=CAPTCHA_MODAL_TIMEOUT_SECONDS)
            if not modal:
                packet = page.listen.wait(timeout=LISTEN_PACKET_TIMEOUT_SECONDS)
                if packet:
                    session["data"] = _normalize_result_data(packet.response.body)
                    session["status"] = "SUCCESS"
                    return
                raise RuntimeError("未发现验证码弹窗，且未抓取到官方查询结果")

            time.sleep(2)
            instruction_ele = modal.ele(".:yidun-fallback__tip")
            if not instruction_ele or not instruction_ele.text:
                raise RuntimeError("未读取到验证码提示词")

            bg_img_ele = modal.ele(".yidun_bg-img")
            if not bg_img_ele:
                raise RuntimeError("验证码背景图元素不存在")

            bg_url = bg_img_ele.attr("src")
            if not bg_url:
                raise RuntimeError("验证码背景图地址为空")

            bg_img_cv = _decode_captcha_background(bg_url, referer=page.url)
            sim_result = get_target_coords(
                model_path=str(CAPTCHA_MODEL_PATH),
                img_path=bg_img_cv,
                instruction_text=instruction_ele.text,
            )
            if not sim_result or len(sim_result) < 2:
                raise RuntimeError("验证码目标识别失败")

            offset_x, offset_y = sim_result[0], sim_result[1]
            logger.info(f"[{session_id}] 模型识别坐标: ({offset_x}, {offset_y})，准备点击...")
            page.actions.move_to(ele_or_loc=modal, offset_x=offset_x, offset_y=offset_y)
            time.sleep(random.uniform(0.6, 1.0))
            bg_img_ele.click.at(offset_x=offset_x, offset_y=offset_y)

            logger.info(f"[{session_id}] 点击完成，等待页面数据渲染...")
            list_container = page.wait.ele_displayed(".public_inquiry_list", timeout=RESULT_WAIT_TIMEOUT_SECONDS)
            if list_container:
                items = page.eles(".list_item")
                session["data"] = _normalize_result_data(
                    [{"text": item.text} for item in items] if items else []
                )
                session["status"] = "SUCCESS"
                logger.info(f"[{session_id}] 查询完成，结果条数: {len(session['data'])}")
                return

            error_tip = page.ele(".el-message__content")
            if error_tip:
                raise RuntimeError(f"页面出现报错提示: {error_tip.text}")
            raise RuntimeError("验证通过后，超时未加载出查询结果")

        except Exception as exc:
            logger.error(f"[{session_id}] 自动化流第 {attempt} 次尝试异常: {exc}")
            if attempt == MAX_GLOBAL_RETRIES:
                session["status"] = "FAILED"
                session["error"] = str(exc)
            else:
                logger.info(f"[{session_id}] 准备进行第 {attempt + 1} 次重试...")
                time.sleep(2)
        finally:
            if page:
                try:
                    page.listen.stop()
                except Exception as exc:
                    logger.debug(f"尝试停止监听失败 (可忽略): {exc}")

                try:
                    page.quit()
                except Exception as exc:
                    logger.debug(f"尝试关闭页面失败: {exc}")

            _cleanup_runtime_dir(profile_dir)


@router.post("/verify/init-query")
async def init_query(req: InitReq):
    session_id = str(uuid.uuid4())
    active_sessions[session_id] = {
        "status": "INITIALIZING",
        "start_time": time.time(),
    }

    threading.Thread(target=automation_task, args=(session_id, req), daemon=True).start()

    start_wait = time.time()
    while time.time() - start_wait < INIT_QUERY_TIMEOUT_SECONDS:
        session = active_sessions.get(session_id)
        if not session:
            raise HTTPException(500, "会话执行失败或被意外清理")

        if session["status"] == "SUCCESS":
            data = session.get("data", [])
            active_sessions.pop(session_id, None)
            return {"code": 200, "msg": "查询成功", "data": data}

        if session["status"] == "FAILED":
            error = session.get("error", "未知错误")
            active_sessions.pop(session_id, None)
            raise HTTPException(400, f"查询失败: {error}")

        await asyncio.sleep(1)

    active_sessions.pop(session_id, None)
    raise HTTPException(504, "流程超时，任务未能在规定时间内完成")
