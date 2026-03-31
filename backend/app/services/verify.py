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
    get_target_coords,
    download_image,
    identify_gap_tcaptcha,
    calculate_display_ratio,
    generate_tcaptcha_track,
)
from app.config.config import BASE_DIR
from app.models.schemas import VerifyInitReq

SYSTEM_USERNAME = "13913517504"
SYSTEM_PASSWORD = "200506040@Wzj"
YIDUN_LOGIN_URL = "https://register.ccopyright.com.cn/login.html"
CAPTCHA_MODEL_PATH = os.path.join(BASE_DIR, "captcha_multi_task.pth")


def _env_flag(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def get_browser_options(headless: bool = True):
    co = ChromiumOptions()
    # 浏览器路径：支持环境变量配置，默认尝试常见路径
    # Google Chrome: /usr/bin/google-chrome-stable
    # Linux Snap: /snap/bin/chromium
    # Linux apt: /usr/bin/chromium-browser
    browser_path = os.getenv("CHROME_PATH", "/usr/bin/google-chrome-stable")
    co.set_browser_path(browser_path)
    
    # 无头模式（Linux服务器必需）
    co.headless(headless)
    
    # Linux无桌面环境必需的参数
    co.set_argument("--no-sandbox")  # 禁用沙箱（root用户或Docker必需）
    co.set_argument("--disable-setuid-sandbox")  # 配合no-sandbox使用
    co.set_argument("--disable-gpu")  # 无GPU环境禁用硬件加速
    co.set_argument("--disable-dev-shm-usage")  # 避免/dev/shm空间不足
    co.set_argument("--disable-software-rasterizer")  # 禁用软件光栅化
    co.set_argument("--disable-extensions")  # 禁用扩展，减少内存占用
    co.set_argument("--disable-background-networking")  # 禁用后台网络
    co.set_argument("--disable-background-timer-throttling")  # 禁用后台定时器节流
    co.set_argument("--disable-backgrounding-occluded-windows")  
    co.set_argument("--disable-renderer-backgrounding")
    co.set_argument("--disable-features=TranslateUI,site-per-process")  # 禁用翻译和站点隔离
    co.set_argument("--disable-blink-features=AutomationControlled")  # 隐藏自动化特征
    
    # 窗口和显示设置
    co.set_argument("--window-size=1920,1080")
    co.set_argument("--start-maximized")
    
    # 用户数据目录 - 使用临时目录避免冲突
    co.set_user_data_path(tempfile.mkdtemp())
    
    # 设置随机调试端口，避免冲突
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    co.set_local_port(port)
    
    # User-Agent（模拟Windows Chrome，减少被检测概率）
    co.set_user_agent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    )
    return co


def click_refresh_and_wait(page: ChromiumPage):
    refresh_btn = page.ele("css:.yidun_refresh")
    if refresh_btn:
        refresh_btn.click()
        logger.info("已点击刷新按钮，等待新图片加载...")
    time.sleep(1.5)


def auto_login_yidun(page: ChromiumPage, max_retries: int = 3) -> bool:
    try:
        page.get(YIDUN_LOGIN_URL)
        if not page.wait.ele_displayed("css:.login_pwd", timeout=10):
            logger.error("登录框未能在10秒内加载")
            return False

        user_input = page.ele("@placeholder=请输入用户名/手机号/邮箱")
        pwd_input = page.ele("@placeholder=请输入密码")

        user_input.clear()
        user_input.input(SYSTEM_USERNAME)
        time.sleep(random.uniform(0.2, 0.5))

        pwd_input.clear()
        pwd_input.input(SYSTEM_PASSWORD)

        login_btn = page.ele(".login_btn").ele("tag:button")
        login_btn.click()
        logger.info("已提交登录，等待验证码弹窗...")

        popup_container = page.wait.ele_displayed("css:.yidun_popup", timeout=5)
        if not popup_container:
            return "login.html" not in page.url

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

                bg_bytes = download_image(bg_url)
                slider_bytes = download_image(slider_url)

                gap_x_original, confidence = identify_gap_tcaptcha(bg_bytes, slider_bytes)
                if confidence < 0.3:
                    click_refresh_and_wait(page)
                    continue

                bg_img_cv = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), 1)
                original_width = bg_img_cv.shape[1]
                ratio = calculate_display_ratio(display_width, original_width)
                gap_x_display = int(gap_x_original / ratio) + 4

                tracks = generate_tcaptcha_track(gap_x_display)
                page.actions.hold(slider_btn)
                for step in tracks:
                    y_jitter = random.choice([-1, 0, 1]) if random.random() > 0.8 else 0
                    # duration 参数控制滑动速度，0.01秒 = 10ms，快速滑动
                    page.actions.move(offset_x=step, offset_y=y_jitter, duration=0.01)

                time.sleep(random.uniform(0.05, 0.1))
                page.actions.release()

                time.sleep(2)
                if "login.html" not in page.url:
                    return True

                is_success = page.ele("css:.yidun.yidun--success", timeout=2)
                if is_success:
                    time.sleep(1)
                    if "login.html" not in page.url:
                        return True
                    click_refresh_and_wait(page)
                    continue

                click_refresh_and_wait(page)
            except Exception:
                click_refresh_and_wait(page)
                continue

        return False
    except Exception as e:
        logger.error(f"自动登录异常: {e}")
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
        inst_text = modal.ele(".:yidun-fallback__tip").text
        img_base64 = modal.get_screenshot(as_base64="webp")
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

        offset_x = sim_result[0]
        offset_y = sim_result[1]
        page.actions.move_to(ele_or_loc=modal, offset_x=offset_x, offset_y=offset_y)
        time.sleep(random.uniform(0.6, 1.0))
        modal.ele(".yidun_bg-img").click.at(offset_x=offset_x, offset_y=offset_y)

        logger.info(f"[{session_id}] 点击完成，等待页面数据渲染...")

        list_container = page.wait.ele_displayed(".public_inquiry_list", timeout=15)

        if list_container:
            items = page.eles(".list_item")
            if items:
                extracted_data = [{"text": i.text} for i in items]
                session["data"] = extracted_data
                session["status"] = "SUCCESS"
                logger.info(f"[{session_id}] 成功从页面抓取到 {len(items)} 条数据")
            else:
                session["data"] = []
                session["status"] = "SUCCESS"
                logger.info(f"[{session_id}] 官方数据库中未查到该证书")
        else:
            error_tip = page.ele(".el-message__content")
            if error_tip:
                logger.error(f"[{session_id}] 页面出现报错提示: {error_tip.text}")
                session["error"] = error_tip.text
            else:
                session["error"] = "验证通过后，超时未加载出查询结果"
            session["status"] = "FAILED"

    except Exception as e:
        logger.error(f"自动化流异常: {e}")
        session["status"] = "FAILED"
        session["error"] = str(e)
    finally:
        page.listen.stop()
        page.quit()
