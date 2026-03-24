import base64
import random
import time
import uuid
import threading
from typing import Dict, List

import cv2
import numpy as np
from DrissionPage import ChromiumPage, ChromiumOptions
from fastapi import HTTPException, APIRouter
from loguru import logger
from pydantic import BaseModel
import asyncio

from services.utils import download_image, identify_gap_tcaptcha, calculate_display_ratio, generate_tcaptcha_track

active_sessions: Dict[str, dict] = {}

# === 配置 ===
SYSTEM_USERNAME = "13913517504"
SYSTEM_PASSWORD = "200506040@Wzj"
YIDUN_LOGIN_URL = "https://register.ccopyright.com.cn/login.html"

router = APIRouter()


# === 请求模型 ===
class InitReq(BaseModel):
    register_no: str
    keyword: str


class Coordinate(BaseModel):
    x: float
    y: float


class SubmitReq(BaseModel):
    session_id: str
    points: List[Coordinate] = []


# === 浏览器配置 ===
def get_options(headless: bool = False):
    co = ChromiumOptions()
    co.set_argument('--no-sandbox')
    co.set_argument('--disable-gpu')
    co.set_argument('--disable-dev-shm-usage')
    co.set_argument('--disable-blink-features=AutomationControlled')
    co.set_argument('--window-size=1920,1080')
    co.headless(headless)
    co.set_user_agent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    return co


# === 辅助函数：同步等待 ===
def click_refresh_and_wait(page: ChromiumPage):
    refresh_btn = page.ele('css:.yidun_refresh')
    if refresh_btn:
        refresh_btn.click()
        logger.info("已点击刷新按钮，等待新图片加载...")
    time.sleep(1.5)


# === 核心逻辑：自动登录 (已转换为纯同步) ===
def auto_login_yidun(page: ChromiumPage, max_retries: int = 3) -> bool:
    try:
        page.get(YIDUN_LOGIN_URL)
        if not page.wait.ele_displayed('css:.login_pwd', timeout=10):
            logger.error("登录框未能在10秒内加载")
            return False

        user_input = page.ele('@placeholder=请输入用户名/手机号/邮箱')
        pwd_input = page.ele('@placeholder=请输入密码')

        user_input.clear()
        user_input.input(SYSTEM_USERNAME)
        time.sleep(random.uniform(0.2, 0.5))

        pwd_input.clear()
        pwd_input.input(SYSTEM_PASSWORD)

        login_btn = page.ele('.login_btn').ele('tag:button')
        login_btn.click()
        logger.info("已提交登录，等待验证码弹窗...")

        popup_container = page.wait.ele_displayed('css:.yidun_popup', timeout=5)
        if not popup_container:
            if 'login.html' not in page.url:
                return True
            return False

        for attempt in range(1, max_retries + 1):
            try:
                bg_img_ele = page.ele('css:.yidun_bg-img')
                slider_img_ele = page.ele('css:.yidun_jigsaw')
                slider_btn = page.ele('css:.yidun_slider')

                if not bg_img_ele or not slider_img_ele or not slider_btn:
                    click_refresh_and_wait(page)
                    continue

                display_width = 0
                for _ in range(30):
                    try:
                        if bg_img_ele.attr('src') and bg_img_ele.rect.size[0] > 0:
                            display_width = bg_img_ele.rect.size[0]
                            break
                    except Exception:
                        pass
                    time.sleep(0.1)

                if display_width == 0:
                    click_refresh_and_wait(page)
                    continue

                bg_url = bg_img_ele.attr('src')
                slider_url = slider_img_ele.attr('src')

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
                    page.actions.move(offset_x=step, offset_y=y_jitter)

                time.sleep(random.uniform(0.2, 0.5))
                page.actions.release()

                time.sleep(2)
                if 'login.html' not in page.url:
                    return True

                is_success = page.ele('css:.yidun.yidun--success', timeout=2)
                if is_success:
                    time.sleep(1)
                    if 'login.html' not in page.url:
                        return True
                    else:
                        click_refresh_and_wait(page)
                        continue

                click_refresh_and_wait(page)
            except Exception as e:
                click_refresh_and_wait(page)
                continue

        return False
    except Exception as e:
        logger.error(f"自动登录异常: {e}")
        return False


# === 独立线程：自动化主控任务 (引入 main.py 逻辑) ===
def automation_task(session_id: str, req: InitReq):
    session = active_sessions[session_id]
    page = ChromiumPage(addr_or_opts=get_options(headless=False))

    try:
        # 1. 执行自动登录 (复用之前的逻辑)
        if not auto_login_yidun(page):
            session["status"] = "FAILED"
            session["error"] = "自动登录失败"
            return

        # 2. 开启数据包监听：目标是获取 getSoftPublicity 的响应
        # 必须在触发请求的动作（导航或点击验证码）之前开启
        page.listen.start('externalAPI/getSoftPublicity')

        # 3. 导航至带参数的查询页
        query_url = (
            f"https://register.ccopyright.com.cn/publicInquiry.html?"
            f"type=softList&registerNumber={req.register_no}&"
            f"keyWord={req.keyword}&publicityType=ALL&registerDateType=ALL"
        )
        page.get(query_url)
        logger.info(f"[{session_id}] 已导航至查询页，等待验证码弹窗...")
        time.sleep(1)
        # 4. 捕获验证码截图 (复刻 main.py)
        modal = page.wait.ele_displayed(".yidun_modal", timeout=10)
        if not modal:
            # 如果没出弹窗，可能是直接显示结果了，尝试获取一次监听
            packet = page.listen.wait(timeout=2)
            if packet:
                session["data"] = packet.response.body
                session["status"] = "SUCCESS"
                return
            session["status"] = "FAILED"
            session["error"] = "未发现验证码弹窗"
            return

        img_base64 = modal.get_screenshot(as_base64="webp")
        session["captcha_data"] = {
            "bg_image": f"data:image/webp;base64,{img_base64}",
            "width": modal.rect.size[0],
            "height": modal.rect.size[1]
        }
        session["status"] = "CAPTCHA_REQUIRED"

        # 5. 阻塞等待前端传回坐标
        while session.get("coords") is None:
            if time.time() - session["start_time"] > 300:  # 5分钟超时
                session["status"] = "FAILED"
                return
            time.sleep(0.5)

        # 6. 执行模拟点击
        logger.info(f"[{session_id}] 接收到坐标，开始模拟人工操作...")
        coords = session["coords"]
        for p in coords:
            page.actions.move_to(ele_or_loc=modal, offset_x=p.x, offset_y=p.y)
            time.sleep(random.uniform(0.6, 1.0))
            modal.click.at(offset_x=p.x, offset_y=p.y)

        # 7. 等待接口响应
        # 验证码点击后，网页 JS 会立即请求 getSoftPublicity
        logger.info(f"[{session_id}] 点击完成，等待 API 数据返回...")
        res_packet = page.listen.wait(timeout=15)

        if res_packet and res_packet.response.body:
            # 捕获到了接口原始 JSON
            session["data"] = res_packet.response.body
            session["status"] = "SUCCESS"
            logger.info(f"[{session_id}] 成功拦截到 API 响应数据")
        else:
            # 如果监听失败，退而求其次使用 DOM 爬取
            time.sleep(2)
            items = page.eles(".list_item")
            if items:
                session["data"] = [{"text": i.text} for i in items]
                session["status"] = "SUCCESS"
            else:
                session["status"] = "FAILED"
                session["error"] = "未能捕获到接口响应或页面渲染结果"

    except Exception as e:
        logger.error(f"自动化流异常: {e}")
        session["status"] = "FAILED"
        session["error"] = str(e)
    finally:
        page.listen.stop()
        page.quit()

# === 接口 1: 初始化查询 ===
# === 接口 1: 工作流发起查询 (阻塞等待最终结果) ===
@router.post("/verify/init-query")
async def init_query(req: InitReq):
    session_id = str(uuid.uuid4())
    active_sessions[session_id] = {
        "status": "INITIALIZING",
        "coords": None,
        "start_time": time.time()
    }

    # 启动后台线程执行自动化
    threading.Thread(target=automation_task, args=(session_id, req), daemon=True).start()

    # 工作流在这里长挂起，等待整个流程（包括人工验证）走完
    timeout = 300  # 给人工处理留出 5 分钟的超时窗口
    start_wait = time.time()

    while time.time() - start_wait < timeout:
        session = active_sessions.get(session_id)
        if not session:
            raise HTTPException(500, "会话执行失败或被意外清理")

        if session["status"] == "SUCCESS":
            data = session.get("data", [])
            active_sessions.pop(session_id, None)
            return {
                "code": 200,
                "msg": "查询成功",
                "data": data
            }

        elif session["status"] == "FAILED":
            error = session.get("error", "未知错误")
            active_sessions.pop(session_id, None)
            raise HTTPException(400, f"查询失败: {error}")

        # 注意：对工作流来说，即使状态是 CAPTCHA_REQUIRED，它也只管继续等，不关心验证码
        await asyncio.sleep(1)

    active_sessions.pop(session_id, None)
    raise HTTPException(504, "流程超时，可能长时间无人处理验证码")


# === 接口 2: 人工管理台获取待处理任务列表 (新增) ===
@router.get("/verify/pending")
async def get_pending_captchas():
    pending_list = []
    for sid, session in active_sessions.items():
        if session.get("status") == "CAPTCHA_REQUIRED":
            pending_list.append({
                "session_id": sid,
                "bg_image": session["captcha_data"]["bg_image"],
                "width": session["captcha_data"]["width"],
                "height": session["captcha_data"]["height"],
                "wait_time": int(time.time() - session["start_time"])
            })
    return {"code": 200, "data": pending_list}


# === 接口 3: 人工提交坐标 (非阻塞) ===
@router.post("/verify/submit-query")
async def submit_query(req: SubmitReq):
    session = active_sessions.get(req.session_id)
    if not session:
        raise HTTPException(404, "任务不存在或已过期")

    if session["status"] != "CAPTCHA_REQUIRED":
        raise HTTPException(400, "当前任务状态不可提交坐标")

    # 填入坐标，打破后台 automation_task 线程的 while 阻塞
    session["coords"] = req.points
    session["status"] = "PROCESSING"  # 修改状态，防止管理台重复刷出该任务

    # 立即响应人工前端，不需要等待抓取结果（抓取结果由 init_query 返回给工作流）
    return {"code": 200, "msg": "指令已下发浏览器"}
