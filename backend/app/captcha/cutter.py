import cv2
import numpy as np


def high_pass_refine(patch):
    """专门针对粘连区域的高通滤波处理"""
    gaussian = cv2.GaussianBlur(patch, (0, 0), 2)
    sharpened = cv2.addWeighted(patch, 2.5, gaussian, -1.5, 0)
    hsv_patch = cv2.cvtColor(sharpened, cv2.COLOR_BGR2HSV)
    mask_dark = cv2.inRange(hsv_patch, np.array([0, 0, 0]), np.array([180, 255, 180]))
    mask_color = cv2.inRange(hsv_patch, np.array([0, 30, 0]), np.array([180, 255, 255]))
    refined_mask = cv2.bitwise_or(mask_dark, mask_color)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
    refined_mask = cv2.morphologyEx(refined_mask, cv2.MORPH_OPEN, kernel)
    return refined_mask


def _create_record(patch, x, y, w, h):
    return {
        "image": patch,
        "x": int(x),
        "y": int(y),
        "w": int(w),
        "h": int(h),
        "center": (int(x + w / 2), int(y + h / 2))
    }


def slice_captcha_in_memory(img_path_or_array):
    """
    在内存中切分验证码
    输入: 图片路径或 OpenCV 图像数组
    返回: List[dict]
    """
    if isinstance(img_path_or_array, str):
        img = cv2.imread(img_path_or_array)
    else:
        img = img_path_or_array

    if img is None:
        return []

    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    mask_dark = cv2.inRange(hsv, np.array([0, 0, 0]), np.array([180, 255, 220]))
    mask_color = cv2.inRange(hsv, np.array([0, 15, 0]), np.array([180, 255, 255]))
    mask = cv2.bitwise_or(mask_dark, mask_color)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=lambda c: cv2.boundingRect(c)[0])

    results = []
    MAX_SINGLE_W = 70
    MAX_SINGLE_H = 70

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        if w < 5 or h < 10:
            continue

        if w > MAX_SINGLE_W or h > MAX_SINGLE_H:
            roi = img[y:y + h, x:x + w]
            refined_mask = high_pass_refine(roi)
            sub_contours, _ = cv2.findContours(refined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            if len(sub_contours) > 1:
                sub_contours = sorted(sub_contours, key=lambda c: cv2.boundingRect(c)[0])
                for sub_cnt in sub_contours:
                    sx, sy, sw, sh = cv2.boundingRect(sub_cnt)
                    if sw < 10 or sh < 10:
                        continue
                    patch = roi[sy:sy + sh, sx:sx + sw]
                    results.append(_create_record(patch, x + sx, y + sy, sw, sh))
            else:
                num_chars = round(w / 30)
                step = w // num_chars
                for i in range(num_chars):
                    cur_x = i * step
                    cur_w = step if (i < num_chars - 1) else (w - cur_x)
                    patch = roi[:, cur_x:cur_x + cur_w]
                    results.append(_create_record(patch, x + cur_x, y, cur_w, h))
        else:
            patch = img[y:y + h, x:x + w]
            results.append(_create_record(patch, x, y, w, h))

    return results
