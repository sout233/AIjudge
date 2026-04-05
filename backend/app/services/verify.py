import base64
import os
import random
import socket
import tempfile
import time
from typing import Dict

import cv2
import numpy as np
from DrissionPage import ChromiumPage, ChromiumOptions
from loguru import logger

from app.captcha import (
    calculate_display_ratio,
    download_image,
    generate_tcaptcha_track,
    get_target_coords,
    identify_gap_tcaptcha,
)
from app.config.config import BASE_DIR
from app.models.schemas import VerifyInitReq

SYSTEM_USERNAME = "13913517504"
SYSTEM_PASSWORD = "200506040@Wzj"
YIDUN_LOGIN_URL = "https://register.ccopyright.com.cn/login.html"


def _resolve_captcha_model_path() -> str:
    configured = os.getenv("CAPTCHA_MODEL_PATH")
    if configured:
        return configured

    fp32_onnx_path = os.path.join(BASE_DIR, "captcha_multi_task.onnx")
    if os.path.exists(fp32_onnx_path):
        return fp32_onnx_path

    int8_onnx_path = os.path.join(BASE_DIR, "captcha_multi_task.int8.onnx")
    if os.path.exists(int8_onnx_path):
        return int8_onnx_path

    return os.path.join(BASE_DIR, "captcha_multi_task.pth")


def _resolve_slider_confidence_threshold() -> float:
    raw_value = os.getenv("TCAPTCHA_MIN_CONFIDENCE", "0.28").strip()
    try:
        value = float(raw_value)
    except ValueError:
        logger.warning(f"Illegal TCAPTCHA_MIN_CONFIDENCE={raw_value}, fallback to 0.28")
        return 0.28
    return max(0.0, min(1.0, value))


def _resolve_browser_path() -> str:
    configured = os.getenv("CHROME_PATH") or os.getenv("BROWSER_PATH")
    if configured and os.path.exists(configured):
        return configured

    candidates = []
    if os.name == "nt":
        candidates.extend([
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
            r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        ])
    else:
        candidates.extend([
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
            "/usr/bin/chromium-browser",
            "/usr/bin/chromium",
            "/snap/bin/chromium",
            "/usr/bin/microsoft-edge",
            "/usr/bin/microsoft-edge-stable",
        ])

    for candidate in candidates:
        if os.path.exists(candidate):
            return candidate

    return configured or ""


CAPTCHA_MODEL_PATH = _resolve_captcha_model_path()
TCAPTCHA_MIN_CONFIDENCE = _resolve_slider_confidence_threshold()
BROWSER_PATH = _resolve_browser_path()

logger.info(f"Captcha model path: {CAPTCHA_MODEL_PATH}")
logger.info(f"Browser path: {BROWSER_PATH or 'NOT_FOUND'}")


def _env_flag(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _element_has_size(ele) -> bool:
    if not ele:
        return False
    try:
        width, height = ele.rect.size
        return width > 0 and height > 0
    except Exception:
        return False


def _wait_for_element_size(ele, retries: int = 30, delay: float = 0.1) -> bool:
    for _ in range(retries):
        if _element_has_size(ele):
            return True
        time.sleep(delay)
    return False


def _is_login_url(url: str) -> bool:
    return "login.html" in (url or "")


def get_browser_options(headless: bool = True):
    if not BROWSER_PATH:
        raise FileNotFoundError(
            "Cannot find browser executable. Set CHROME_PATH or BROWSER_PATH first."
        )

    co = ChromiumOptions()
    co.set_browser_path(BROWSER_PATH)

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
    co.set_user_data_path(tempfile.mkdtemp())

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    co.set_local_port(port)

    co.set_user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    return co


def click_refresh_and_wait(page: ChromiumPage):
    refresh_btn = page.ele("css:.yidun_refresh")
    if not refresh_btn:
        logger.warning("Captcha refresh button not found, wait for next round")
        time.sleep(1.5)
        return

    if not _wait_for_element_size(refresh_btn, retries=10, delay=0.1):
        logger.warning("Captcha refresh button is not interactive, skip click")
        time.sleep(1.5)
        return

    try:
        page.actions.move_to(refresh_btn)
        refresh_btn.click()
        logger.info("Clicked captcha refresh button and waited for reload")
    except Exception as exc:
        logger.warning(f"Failed to click captcha refresh button: {exc}")
    time.sleep(1.5)


def auto_login_yidun(page: ChromiumPage, max_retries: int = 3) -> bool:
    try:
        page.get(YIDUN_LOGIN_URL)
        if not page.wait.ele_displayed("css:.login_pwd", timeout=10):
            logger.error("Login form did not load within 10 seconds")
            return False

        user_input = page.ele("@placeholder=请输入用户名/手机号/邮箱")
        pwd_input = page.ele("@placeholder=请输入密码")
        if not user_input or not pwd_input:
            logger.error("Login inputs not found")
            return False

        user_input.clear()
        user_input.input(SYSTEM_USERNAME)
        time.sleep(random.uniform(0.2, 0.5))

        pwd_input.clear()
        pwd_input.input(SYSTEM_PASSWORD)

        login_wrapper = page.ele(".login_btn")
        login_btn = login_wrapper.ele("tag:button") if login_wrapper else None
        if not login_btn:
            logger.error("Login button not found")
            return False

        login_btn.click()
        logger.info("Submitted login, waiting for captcha popup...")

        popup_container = page.wait.ele_displayed("css:.yidun_popup", timeout=5)
        if not popup_container:
            return not _is_login_url(getattr(page, "url", ""))

        for attempt in range(1, max_retries + 1):
            try:
                bg_img_ele = page.ele("css:.yidun_bg-img")
                slider_img_ele = page.ele("css:.yidun_jigsaw")
                slider_btn = page.ele("css:.yidun_slider")

                if not bg_img_ele or not slider_img_ele or not slider_btn:
                    logger.warning(f"Slider attempt {attempt}: incomplete captcha elements")
                    click_refresh_and_wait(page)
                    continue

                if not _wait_for_element_size(slider_btn):
                    logger.warning(f"Slider attempt {attempt}: slider button not interactive")
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
                    logger.warning(f"Slider attempt {attempt}: background width unavailable")
                    click_refresh_and_wait(page)
                    continue

                bg_url = bg_img_ele.attr("src")
                slider_url = slider_img_ele.attr("src")
                if not bg_url or not slider_url:
                    logger.warning(f"Slider attempt {attempt}: captcha image url missing")
                    click_refresh_and_wait(page)
                    continue

                bg_bytes = download_image(bg_url)
                slider_bytes = download_image(slider_url)

                gap_x_original, confidence = identify_gap_tcaptcha(bg_bytes, slider_bytes)
                if confidence < TCAPTCHA_MIN_CONFIDENCE:
                    logger.warning(
                        f"Slider attempt {attempt}: low confidence {confidence:.6f} "
                        f"(threshold {TCAPTCHA_MIN_CONFIDENCE:.2f})"
                    )
                    click_refresh_and_wait(page)
                    continue

                bg_img_cv = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), 1)
                if bg_img_cv is None:
                    logger.warning(f"Slider attempt {attempt}: background decode failed")
                    click_refresh_and_wait(page)
                    continue

                original_width = bg_img_cv.shape[1]
                ratio = calculate_display_ratio(display_width, original_width)
                gap_x_display = int(gap_x_original / ratio) + 4

                tracks = generate_tcaptcha_track(gap_x_display)
                page.actions.move_to(slider_btn)
                page.actions.hold(slider_btn)
                for step in tracks:
                    y_jitter = random.choice([-1, 0, 1]) if random.random() > 0.8 else 0
                    page.actions.move(offset_x=step, offset_y=y_jitter, duration=0.01)

                time.sleep(random.uniform(0.2, 0.5))
                page.actions.release()

                time.sleep(2)
                if not _is_login_url(getattr(page, "url", "")):
                    logger.info(f"Slider attempt {attempt}: login captcha accepted")
                    return True

                success_ele = page.ele("css:.yidun.yidun--success", timeout=1)
                if success_ele:
                    time.sleep(1)
                    if not _is_login_url(getattr(page, "url", "")):
                        logger.info(f"Slider attempt {attempt}: login captcha accepted after success state")
                        return True

                logger.warning(
                    f"Slider attempt {attempt}: captcha not confirmed, current url={getattr(page, 'url', 'UNKNOWN')}"
                )
                click_refresh_and_wait(page)
            except Exception as exc:
                logger.warning(f"Slider attempt {attempt} failed: {exc}")
                click_refresh_and_wait(page)

        return False
    except Exception as exc:
        logger.error(f"Auto login failed: {exc}")
        return False


def automation_task(session_id: str, req: VerifyInitReq, active_sessions: Dict[str, dict]):
    session = active_sessions[session_id]
    co = get_browser_options(headless=_env_flag("VERIFY_HEADLESS", True))
    page = ChromiumPage(addr_or_opts=co)

    try:
        if not auto_login_yidun(page):
            session["status"] = "FAILED"
            session["error"] = "自动登录失败"
            return

        page.listen.start("externalAPI/getSoftPublicity")

        query_url = (
            f"https://register.ccopyright.com.cn/publicInquiry.html?"
            f"type=softList&registerNumber={req.register_no}&"
            f"keyWord={req.keyword}&publicityType=ALL&registerDateType=ALL"
        )
        page.get(query_url)
        logger.info(f"[{session_id}] 已导航至查询页，等待验证码弹窗...")
        time.sleep(1)

        modal = page.wait.ele_displayed(".yidun_modal", timeout=10)
        if not modal:
            packet = page.listen.wait(timeout=2)
            if packet:
                session["data"] = packet.response.body
                session["status"] = "SUCCESS"
                return
            session["status"] = "FAILED"
            session["error"] = "未发现验证码弹窗"
            return

        time.sleep(2)
        tip_ele = modal.ele(".:yidun-fallback__tip")
        inst_text = tip_ele.text if tip_ele else ""
        bg_img_ele = modal.ele(".yidun_bg-img")
        if not bg_img_ele:
            session["status"] = "FAILED"
            session["error"] = "验证码背景图元素不存在"
            return

        bg_url = bg_img_ele.attr("src")
        if not bg_url:
            session["status"] = "FAILED"
            session["error"] = "验证码背景图地址为空"
            return

        if bg_url.startswith("data:image"):
            try:
                bg_bytes = base64.b64decode(bg_url.split(",", 1)[1])
            except Exception:
                session["status"] = "FAILED"
                session["error"] = "验证码背景图 base64 解码失败"
                return
        else:
            bg_bytes = download_image(bg_url, referer=page.url)

        bg_img_cv = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
        if bg_img_cv is None:
            session["status"] = "FAILED"
            session["error"] = "验证码背景图解码失败"
            return

        sim_result = get_target_coords(
            model_path=CAPTCHA_MODEL_PATH,
            img_path=bg_img_cv,
            instruction_text=inst_text,
        )
        if not sim_result:
            session["status"] = "FAILED"
            session["error"] = "验证码目标识别失败"
            return

        offset_x, offset_y = sim_result
        page.actions.move_to(ele_or_loc=modal, offset_x=offset_x, offset_y=offset_y)
        time.sleep(random.uniform(0.6, 1.0))
        modal.ele(".yidun_bg-img").click.at(offset_x=offset_x, offset_y=offset_y)

        logger.info(f"[{session_id}] 点击完成，等待页面结果加载...")

        list_container = page.wait.ele_displayed(".public_inquiry_list", timeout=15)
        if list_container:
            items = page.eles(".list_item")
            if items:
                extracted_data = [{"text": item.text} for item in items]
                session["data"] = extracted_data
                session["status"] = "SUCCESS"
                logger.info(f"[{session_id}] 成功从页面抓取到 {len(items)} 条数据")
            else:
                session["data"] = []
                session["status"] = "SUCCESS"
                logger.info(f"[{session_id}] 官方数据库中未查询到该证书")
        else:
            error_tip = page.ele(".el-message__content")
            if error_tip:
                logger.error(f"[{session_id}] 页面出现错误提示: {error_tip.text}")
                session["error"] = error_tip.text
            else:
                session["error"] = "验证码通过后，超时未加载出查询结果"
            session["status"] = "FAILED"

    except Exception as exc:
        logger.error(f"自动化流程异常: {exc}")
        session["status"] = "FAILED"
        session["error"] = str(exc)
    finally:
        try:
            listener_driver = getattr(page.listen, "_driver", None)
            if listener_driver is not None:
                page.listen.stop()
        except Exception as exc:
            logger.warning(f"关闭网络监听失败: {exc}")
        try:
            page.quit()
        except Exception as exc:
            logger.warning(f"关闭浏览器失败: {exc}")
