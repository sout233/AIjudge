import os
import threading
from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np
import torch
import torch.nn as nn
from PIL import Image
from torchvision import models, transforms

try:
    import onnxruntime as ort
except ModuleNotFoundError:  # pragma: no cover
    ort = None


class MultiTaskResNet(nn.Module):
    def __init__(self, num_chars=62):
        super().__init__()
        self.backbone = models.resnet18(weights=None)
        num_ftrs = self.backbone.fc.in_features
        self.backbone.fc = nn.Identity()
        self.fc_char = nn.Linear(num_ftrs, num_chars)
        self.fc_ortho = nn.Linear(num_ftrs, 2)

    def forward(self, x):
        features = self.backbone(x)
        return self.fc_char(features), self.fc_ortho(features)


CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
IDX_TO_CHAR = {i: char for i, char in enumerate(CHARS)}
IDX_TO_ORIENTATION = {0: "姝ｅ父", 1: "鏃嬭浆"}

_TRANSFORM = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])

_PREDICTOR_CACHE: Dict[str, "BaseCaptchaPredictor"] = {}
_CACHE_LOCK = threading.Lock()


def _preprocess_cv2_image(cv2_img) -> np.ndarray:
    color_converted = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(color_converted)
    image_tensor = _TRANSFORM(pil_img).unsqueeze(0)
    return image_tensor.numpy().astype(np.float32, copy=False)


class BaseCaptchaPredictor:
    def predict_cv2(self, cv2_img) -> Tuple[str, str]:
        raise NotImplementedError


class PytorchCaptchaPredictor(BaseCaptchaPredictor):
    def __init__(self, model_path: str):
        use_cuda = os.getenv("CAPTCHA_USE_CUDA", "0").strip().lower() in {"1", "true", "yes", "on"}
        self.device = torch.device("cuda" if use_cuda and torch.cuda.is_available() else "cpu")
        self.model = MultiTaskResNet(num_chars=62)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()

    def predict_cv2(self, cv2_img) -> Tuple[str, str]:
        image_array = _preprocess_cv2_image(cv2_img)
        image_tensor = torch.from_numpy(image_array).to(self.device)

        with torch.no_grad():
            char_logits, ortho_logits = self.model(image_tensor)
            char_idx = torch.argmax(char_logits, dim=1).item()
            ortho_idx = torch.argmax(ortho_logits, dim=1).item()

        return IDX_TO_CHAR[char_idx], IDX_TO_ORIENTATION[ortho_idx]


class OnnxCaptchaPredictor(BaseCaptchaPredictor):
    def __init__(self, model_path: str):
        if ort is None:
            raise RuntimeError(
                "onnxruntime is not installed, cannot load ONNX captcha model."
            )
        providers = self._resolve_providers()
        self.session = ort.InferenceSession(model_path, providers=providers)
        self.input_name = self.session.get_inputs()[0].name

    @staticmethod
    def _resolve_providers():
        available = set(ort.get_available_providers())
        preferred = []
        if os.getenv("CAPTCHA_USE_CUDA", "0").strip().lower() in {"1", "true", "yes", "on"}:
            if "CUDAExecutionProvider" in available:
                preferred.append("CUDAExecutionProvider")
        if "CPUExecutionProvider" in available:
            preferred.append("CPUExecutionProvider")
        return preferred or None

    def predict_cv2(self, cv2_img) -> Tuple[str, str]:
        image_array = _preprocess_cv2_image(cv2_img)
        char_logits, ortho_logits = self.session.run(None, {self.input_name: image_array})
        char_idx = int(np.argmax(char_logits, axis=1)[0])
        ortho_idx = int(np.argmax(ortho_logits, axis=1)[0])
        return IDX_TO_CHAR[char_idx], IDX_TO_ORIENTATION[ortho_idx]


def build_captcha_predictor(model_path: str) -> BaseCaptchaPredictor:
    model_suffix = Path(model_path).suffix.lower()
    if model_suffix == ".onnx":
        return OnnxCaptchaPredictor(model_path)
    return PytorchCaptchaPredictor(model_path)


def get_captcha_predictor(model_path: str) -> BaseCaptchaPredictor:
    normalized_path = str(Path(model_path).resolve())
    with _CACHE_LOCK:
        predictor = _PREDICTOR_CACHE.get(normalized_path)
        if predictor is None:
            predictor = build_captcha_predictor(normalized_path)
            _PREDICTOR_CACHE[normalized_path] = predictor
        return predictor


CaptchaPredictor = PytorchCaptchaPredictor

