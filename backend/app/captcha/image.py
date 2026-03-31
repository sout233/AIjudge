import random
from io import BytesIO

import cv2
import numpy as np
import requests


def download_image(url: str, referer: str = "") -> bytes:
    """下载远程图片（带反爬头）"""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.0.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.0"
        ),
        "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Referer": referer or "https://captcha.qq.com/",
    }
    try:
        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        raise Exception(f"下载图片失败: {url}, 错误: {e}")


def identify_gap_tcaptcha(bg_bytes: bytes, slider_bytes: bytes) -> tuple:
    """腾讯防水墙缺口识别（优化版） 返回: (gap_x, confidence)"""
    bg_img = cv2.imdecode(np.frombuffer(bg_bytes, np.uint8), cv2.IMREAD_COLOR)
    slider_img = cv2.imdecode(np.frombuffer(slider_bytes, np.uint8), cv2.IMREAD_UNCHANGED)

    if bg_img is None or slider_img is None:
        raise ValueError("图片解码失败")

    if len(slider_img.shape) == 3 and slider_img.shape[2] == 4:
        alpha_channel = slider_img[:, :, 3]
        coords = cv2.findNonZero((alpha_channel > 128).astype(np.uint8))
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            slider_img = slider_img[y:y + h, x:x + w, :3]
        else:
            slider_img = slider_img[:, :, :3]
    else:
        slider_img = cv2.cvtColor(slider_img, cv2.COLOR_BGR2GRAY)
        slider_img = cv2.cvtColor(slider_img, cv2.COLOR_GRAY2BGR)

    bg_gray = cv2.cvtColor(bg_img, cv2.COLOR_BGR2GRAY)
    slider_gray = cv2.cvtColor(slider_img, cv2.COLOR_BGR2GRAY)

    bg_gray = cv2.GaussianBlur(bg_gray, (3, 3), 0)
    slider_gray = cv2.GaussianBlur(slider_gray, (3, 3), 0)

    bg_edge = cv2.Canny(bg_gray, 50, 150)
    slider_edge = cv2.Canny(slider_gray, 50, 150)

    best_val = -1
    best_loc = (0, 0)
    best_scale = 1.0

    for scale in [0.8, 0.9, 1.0, 1.1, 1.2]:
        resized_slider = cv2.resize(slider_edge, None, fx=scale, fy=scale)
        if resized_slider.shape[0] > bg_edge.shape[0] or resized_slider.shape[1] > bg_edge.shape[1]:
            continue

        result = cv2.matchTemplate(bg_edge, resized_slider, cv2.TM_CCOEFF_NORMED)
        _, max_val, _, max_loc = cv2.minMaxLoc(result)

        if max_val > best_val:
            best_val = max_val
            best_loc = max_loc
            best_scale = scale

    if best_val < 0.3:
        print(f"匹配置信度过低: {best_val}")

    return best_loc[0], best_val


def generate_tcaptcha_track(distance: int) -> list:
    """极速轨迹生成：减少步数，增大步长，目标总步数 < 25 步"""
    tracks = []
    current = 0

    v = random.uniform(10, 15)
    while current < distance * 0.85:
        a = random.uniform(20, 35)
        step = round(v + random.uniform(2, 5))
        step = min(step, distance - current)
        tracks.append(step)
        current += step
        v += a * 0.1

    while current < distance:
        remaining = distance - current
        if remaining > 10:
            step = random.randint(5, 8)
        else:
            step = remaining
        tracks.append(step)
        current += step

    if random.random() > 0.8:
        tracks.extend([1, -1])

    return tracks


def calculate_display_ratio(element_width: int, natural_width: int) -> float:
    """计算显示比例"""
    return natural_width / element_width if element_width > 0 else 1.0
