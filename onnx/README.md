# Captcha ONNX Export

This folder contains the export script for converting the captcha model from `.pth` to `.onnx`, with INT8 dynamic quantization support.

## Quick Start

From repository root:

```powershell
backend\.venv\Scripts\python.exe -m pip install onnx
backend\.venv\Scripts\python.exe -m pip install onnxruntime
backend\.venv\Scripts\python.exe onnx/export_captcha_onnx.py
```

If you use a different Python environment, make sure `torch` and `onnx` are installed in that environment.

```powershell
python onnx/export_captcha_onnx.py
```

Default paths:
- Input: `backend/captcha_multi_task.pth`
- FP32 output: `onnx/captcha_multi_task.onnx`
- INT8 dynamic output: `onnx/captcha_multi_task.int8.onnx`

## Common Usage

Export FP32 + INT8 dynamic:

```powershell
python onnx/export_captcha_onnx.py
```

Custom output paths:

```powershell
python onnx/export_captcha_onnx.py --out onnx/captcha_fp32.onnx --int8-out onnx/captcha_int8.onnx
```

Export only FP32:

```powershell
python onnx/export_captcha_onnx.py --fp32-only
```

Enable per-channel dynamic quantization:

```powershell
python onnx/export_captcha_onnx.py --per-channel
```

Use reduced range for compatibility:

```powershell
python onnx/export_captcha_onnx.py --reduce-range
```

Custom opset:

```powershell
python onnx/export_captcha_onnx.py --opset 18
```

Static batch export:

```powershell
python onnx/export_captcha_onnx.py --static-batch
```

## Notes

- The script supports checkpoints saved as:
  - plain `state_dict`
  - dict containing `state_dict`
  - dict containing `model_state_dict`
- FP32 model check is performed using `onnx.checker.check_model` after export.
- INT8 export uses `onnxruntime.quantization.quantize_dynamic` with `QuantType.QInt8`.
