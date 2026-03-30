import cv2
import numpy as np


def get_main_color(patch_img):
    """分析 OpenCV 图像对象的主色调（针对白色背景优化）"""
    if patch_img is None or patch_img.size == 0:
        return "unknown"

    blurred = cv2.medianBlur(patch_img, 3)
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)

    mask_red = cv2.bitwise_or(
        cv2.inRange(hsv, np.array([0, 43, 30]), np.array([15, 255, 255])),
        cv2.inRange(hsv, np.array([155, 43, 30]), np.array([180, 255, 255]))
    )
    mask_blue = cv2.inRange(hsv, np.array([85, 30, 30]), np.array([150, 255, 255]))
    mask_green = cv2.inRange(hsv, np.array([35, 43, 30]), np.array([85, 255, 255]))
    mask_yellow = cv2.inRange(hsv, np.array([15, 43, 30]), np.array([35, 255, 255]))
    mask_gray = cv2.inRange(hsv, np.array([0, 0, 40]), np.array([180, 45, 200]))
    mask_white = cv2.inRange(hsv, np.array([0, 0, 201]), np.array([180, 30, 255]))

    counts = {
        "red": cv2.countNonZero(mask_red),
        "blue": cv2.countNonZero(mask_blue),
        "green": cv2.countNonZero(mask_green),
        "yellow": cv2.countNonZero(mask_yellow),
        "gray": cv2.countNonZero(mask_gray)
    }

    max_color = max(counts, key=counts.get)
    if counts[max_color] >= 10:
        return max_color

    if cv2.countNonZero(mask_white) > 10:
        return "white"

    return "unknown"


def get_color_name_cn(color_eng):
    dic = {
        "red": "红色",
        "yellow": "黄色",
        "green": "绿色",
        "blue": "蓝色",
        "gray": "灰色",
        "white": "白色",
        "unknown": "未知"
    }
    return dic.get(color_eng, "未知")
