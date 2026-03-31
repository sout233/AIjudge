import cv2
import os
import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms, models


class MultiTaskResNet(nn.Module):
    def __init__(self, num_chars=62):
        super(MultiTaskResNet, self).__init__()
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
IDX_TO_ORIENTATION = {0: "正常", 1: "旋转"}


class CaptchaPredictor:
    def __init__(self, model_path):
        # 服务端默认使用 CPU，只有显式开启时才尝试 CUDA。
        use_cuda = os.getenv("CAPTCHA_USE_CUDA", "0").strip().lower() in {"1", "true", "yes", "on"}
        self.device = torch.device("cuda" if use_cuda and torch.cuda.is_available() else "cpu")
        self.model = MultiTaskResNet(num_chars=62)
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.to(self.device)
        self.model.eval()

        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])

    def predict_cv2(self, cv2_img):
        """支持直接输入 OpenCV 图像"""
        color_coverted = cv2.cvtColor(cv2_img, cv2.COLOR_BGR2RGB)
        pil_img = Image.fromarray(color_coverted)
        image_tensor = self.transform(pil_img).unsqueeze(0).to(self.device)

        with torch.no_grad():
            char_logits, ortho_logits = self.model(image_tensor)
            char_idx = torch.argmax(char_logits, dim=1).item()
            ortho_idx = torch.argmax(ortho_logits, dim=1).item()

        return IDX_TO_CHAR[char_idx], IDX_TO_ORIENTATION[ortho_idx]
