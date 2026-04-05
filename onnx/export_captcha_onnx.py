#!/usr/bin/env python
import argparse
import sys
from pathlib import Path
from typing import Any, Dict

import torch


def _resolve_paths() -> tuple[Path, Path]:
    script_dir = Path(__file__).resolve().parent
    repo_root = script_dir.parent
    backend_dir = repo_root / "backend"
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))
    return repo_root, backend_dir


def _extract_state_dict(payload: Any) -> Dict[str, Any]:
    if isinstance(payload, dict):
        if "state_dict" in payload and isinstance(payload["state_dict"], dict):
            return payload["state_dict"]
        if "model_state_dict" in payload and isinstance(payload["model_state_dict"], dict):
            return payload["model_state_dict"]
        if all(isinstance(k, str) for k in payload.keys()):
            return payload
    raise ValueError("Unsupported checkpoint format: expected state_dict-like payload.")


def _ensure_onnx_installed():
    try:
        import onnx  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Module onnx is not installed. Install with: "
            "backend\\.venv\\Scripts\\python.exe -m pip install onnx"
        ) from exc
    return onnx


def _ensure_onnxruntime_quantization_installed():
    try:
        from onnxruntime.quantization import QuantType, quantize_dynamic  # type: ignore
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "onnxruntime is not installed. Install with: "
            "backend\\.venv\\Scripts\\python.exe -m pip install onnxruntime"
        ) from exc
    return quantize_dynamic, QuantType


def export_onnx(
    pth_path: Path,
    onnx_path: Path,
    image_size: int = 224,
    opset: int = 17,
    dynamic_batch: bool = True,
) -> None:
    _resolve_paths()
    from app.captcha.predictor import MultiTaskResNet  # pylint: disable=import-error
    onnx = _ensure_onnx_installed()

    device = torch.device("cpu")
    model = MultiTaskResNet(num_chars=62).to(device)

    raw = torch.load(str(pth_path), map_location=device)
    state_dict = _extract_state_dict(raw)
    model.load_state_dict(state_dict, strict=True)
    model.eval()

    dummy = torch.randn(1, 3, image_size, image_size, device=device)
    onnx_path.parent.mkdir(parents=True, exist_ok=True)

    input_names = ["image"]
    output_names = ["char_logits", "orientation_logits"]

    dynamic_axes = None
    if dynamic_batch:
        dynamic_axes = {
            "image": {0: "batch_size"},
            "char_logits": {0: "batch_size"},
            "orientation_logits": {0: "batch_size"},
        }

    export_kwargs = dict(
        export_params=True,
        opset_version=opset,
        do_constant_folding=True,
        input_names=input_names,
        output_names=output_names,
        dynamic_axes=dynamic_axes,
    )

    with torch.no_grad():
        try:
            # Prefer the legacy exporter to avoid hard dependency on onnxscript.
            torch.onnx.export(
                model,
                dummy,
                str(onnx_path),
                dynamo=False,
                **export_kwargs,
            )
        except TypeError:
            torch.onnx.export(
                model,
                dummy,
                str(onnx_path),
                **export_kwargs,
            )

    # Lightweight model check.
    loaded = onnx.load(str(onnx_path))
    onnx.checker.check_model(loaded)


def quantize_onnx_dynamic(
    source_onnx_path: Path,
    target_onnx_path: Path,
    per_channel: bool = False,
    reduce_range: bool = False,
) -> None:
    _ensure_onnx_installed()
    quantize_dynamic, QuantType = _ensure_onnxruntime_quantization_installed()

    target_onnx_path.parent.mkdir(parents=True, exist_ok=True)
    quantize_dynamic(
        model_input=str(source_onnx_path),
        model_output=str(target_onnx_path),
        weight_type=QuantType.QInt8,
        per_channel=per_channel,
        reduce_range=reduce_range,
    )


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Export captcha MultiTaskResNet .pth to ONNX."
    )
    parser.add_argument(
        "--pth",
        type=Path,
        default="captcha_multi_task.pth",
        help="Path to source .pth checkpoint.",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("onnx") / "captcha_multi_task.onnx",
        help="Path to exported FP32 .onnx file.",
    )
    parser.add_argument(
        "--int8-out",
        type=Path,
        default=Path("onnx") / "captcha_multi_task.int8.onnx",
        help="Path to exported INT8 dynamic quantized .onnx file.",
    )
    parser.add_argument(
        "--image-size",
        type=int,
        default=224,
        help="Square input image size used by model transform.",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=17,
        help="ONNX opset version.",
    )
    parser.add_argument(
        "--static-batch",
        action="store_true",
        help="Disable dynamic batch axis.",
    )
    parser.add_argument(
        "--fp32-only",
        action="store_true",
        help="Export only the FP32 ONNX model and skip INT8 dynamic quantization.",
    )
    parser.add_argument(
        "--per-channel",
        action="store_true",
        help="Enable per-channel weight quantization for dynamic INT8 export.",
    )
    parser.add_argument(
        "--reduce-range",
        action="store_true",
        help="Use reduced quantization range for better compatibility on some CPUs.",
    )
    return parser


def main() -> int:
    parser = build_arg_parser()
    args = parser.parse_args()

    pth_path = args.pth.resolve()
    out_path = args.out.resolve()
    int8_out_path = args.int8_out.resolve()

    if not pth_path.exists():
        print(f"[ERROR] checkpoint not found: {pth_path}")
        return 1

    try:
        export_onnx(
            pth_path=pth_path,
            onnx_path=out_path,
            image_size=args.image_size,
            opset=args.opset,
            dynamic_batch=not args.static_batch,
        )
        if not args.fp32_only:
            quantize_onnx_dynamic(
                source_onnx_path=out_path,
                target_onnx_path=int8_out_path,
                per_channel=args.per_channel,
                reduce_range=args.reduce_range,
            )
    except Exception as exc:  # pragma: no cover
        print(f"[ERROR] export failed: {exc}")
        return 1

    print(f"[OK] exported FP32 ONNX model to: {out_path}")
    if not args.fp32_only:
        print(f"[OK] exported INT8 dynamic ONNX model to: {int8_out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
