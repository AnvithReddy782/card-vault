#!/usr/bin/env python3
import sys
import os
import json
import argparse
import base64
import io
from PIL import Image, ImageOps, ImageEnhance
import numpy as np

import re

def get_engine():
    from rapidocr_onnxruntime import RapidOCR
    # Initialize with default English / multilingual PP-OCRv4 ONNX models
    return RapidOCR()

def normalize_ocr_text(text: str) -> str:
    if not text:
        return ""
    table = str.maketrans({
        '\uff1a': ':',
        '\uff0c': ',',
        '\uff08': '(',
        '\uff09': ')',
        '\uff0d': '-',
        '\uff20': '@',
        '\u2010': '-',
        '\u2011': '-',
        '\u2012': '-',
        '\u2013': '-',
        '\u2014': '-'
    })
    s = text.translate(table)
    # Ensure space around ampersand (&)
    s = re.sub(r'([A-Za-z0-9])&([A-Za-z0-9])', r'\1 & \2', s)
    # Ensure space after comma and semicolon if followed by word
    s = re.sub(r'([,;])([A-Za-z0-9])', r'\1 \2', s)
    # Ensure space after colon if not part of a URL (e.g. http://) or time
    s = re.sub(r':(?!\/\/|\d{2}\b)([A-Za-z0-9+])', r': \1', s)
    # Ensure space after professional titles like CA., Dr., Eng., Adv., Mr., Ms.
    s = re.sub(r'\b(CA|Dr|Eng|Adv|Mr|Mrs|Ms|Prof)\.([A-Za-z])', r'\1. \2', s, flags=re.IGNORECASE)
    # Ensure space between initials and name (e.g. D.R.G.MAHESH -> D.R.G. MAHESH)
    s = re.sub(r'\b([A-Z]\.)([A-Za-z]{2,})', r'\1 \2', s)
    # Un-fuse common merged words in business cards
    s = re.sub(r'([a-z]{2,})([A-Z][a-z]{2,})', r'\1 \2', s)

    # Un-fuse conjoined ALL-CAPS names (e.g. MUHAMMADLARIK -> MUHAMMAD LARIK, NIRMALCHAULAGAIN -> NIRMAL CHAULAGAIN)
    s = re.sub(
        r'\b(MUHAMMAD|MOHAMMED|MOHAMAD|AHMED|AHMAD|SYED|SAYED|ABDUL|ALI|OMAR|KHALED|TARIQ|ANVITH|KUMAR|RAHUL|MAHESH|VIKRAM|SURESH|RAMESH|JOHN|DAVID|MICHAEL|ROBERT|JAMES|WILLIAM|DEV|NIRMAL|NIMMY)([A-Z][a-z]{2,}|[A-Z]{3,})\b',
        r'\1 \2',
        s
    )

    # Un-fuse conjoined ALL-CAPS role words (e.g. CHIEFCOMPLIANCEOFFICER -> CHIEF COMPLIANCE OFFICER)
    common_roles = ['CHIEF', 'COMPLIANCE', 'OFFICER', 'MANAGING', 'DIRECTOR', 'EXECUTIVE', 'GENERAL', 'MANAGER', 'SENIOR', 'JUNIOR', 'PARTNER', 'ASSOCIATE', 'CONSULTANT', 'DEVELOPMENT', 'BUSINESS', 'MARKETING', 'SALES', 'PRESIDENT', 'FOUNDER', 'LEADER', 'ENGINEER', 'ACCOUNTANT', 'AUDITOR', 'TAXATION', 'SERVICES', 'CORPORATE', 'CONSULTING']
    role_pattern = r'(' + '|'.join(common_roles) + r')(' + '|'.join(common_roles) + r')'
    s = re.sub(role_pattern, r'\1 \2', s)
    s = re.sub(role_pattern, r'\1 \2', s)

    # Un-fuse conjoined legal suffixes (e.g. SERVICESFZE -> SERVICES FZE, CONSULTINGLLC -> CONSULTING LLC)
    s = re.sub(r'\b([A-Za-z]{3,})(FZE|FZCO|DMCC|PJSC|LLC|LTD|PVT|INC|CORP|GMBH|PLC)\b', r'\1 \2', s)

    # Correct common OCR typos in email domains (e.g. .cem -> .com, .c0m -> .com)
    s = re.sub(r'@([A-Za-z0-9.-]+)\.(cem|c0m|corn)\b', r'@\1.com', s, flags=re.IGNORECASE)

    # Standardize multiple spaces to single space
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()

def process_image(engine, img_input):
    """
    img_input can be raw bytes, file path, numpy array, or PIL image.
    Applies EXIF transposition, contrast optimization, and multi-angle fallback.
    """
    pil_img = None
    if isinstance(img_input, bytes):
        pil_img = Image.open(io.BytesIO(img_input))
    elif isinstance(img_input, str) and os.path.exists(img_input):
        pil_img = Image.open(img_input)
    elif isinstance(img_input, Image.Image):
        pil_img = img_input
    elif isinstance(img_input, np.ndarray):
        pil_img = Image.fromarray(img_input)

    if pil_img is not None:
        try:
            pil_img = ImageOps.exif_transpose(pil_img)
        except Exception:
            pass
        if pil_img.mode != "RGB":
            pil_img = pil_img.convert("RGB")
        target_np = np.array(pil_img)
    else:
        target_np = img_input

    result, elapse = engine(target_np)

    # If 0 or very few lines detected, try adaptive contrast & sharpness enhancement
    if not result or len(result) < 2:
        if pil_img is not None:
            try:
                enhanced = ImageEnhance.Contrast(pil_img).enhance(1.4)
                enhanced = ImageEnhance.Sharpness(enhanced).enhance(1.5)
                res_enh, _ = engine(np.array(enhanced))
                if res_enh and len(res_enh) > len(result or []):
                    result = res_enh
            except Exception:
                pass

    # If still 0 lines, try 90 and 270 degree rotations for cards captured in portrait or vertical format
    if (not result or len(result) == 0) and pil_img is not None:
        for rot in [Image.Transpose.ROTATE_90, Image.Transpose.ROTATE_270, Image.Transpose.ROTATE_180]:
            try:
                rotated = pil_img.transpose(rot)
                res_rot, _ = engine(np.array(rotated))
                if res_rot and len(res_rot) > 0:
                    result = res_rot
                    break
            except Exception:
                pass

    if not result:
        return {
            "success": True,
            "lines": [],
            "rawText": "",
            "avgConfidence": 0.0,
            "elapse": elapse if isinstance(elapse, list) else []
        }

    lines = []
    text_pieces = []
    conf_sum = 0.0

    for item in result:
        box = item[0]
        raw_text = item[1].strip()
        text = normalize_ocr_text(raw_text)
        score = float(item[2])
        if text:
            lines.append({
                "text": text,
                "confidence": round(score, 4),
                "box": box
            })
            text_pieces.append(text)
            conf_sum += score

    avg_conf = round((conf_sum / len(lines)) * 100, 2) if lines else 0.0

    return {
        "success": True,
        "lines": lines,
        "rawText": "\n".join(text_pieces),
        "avgConfidence": avg_conf,
        "elapse": elapse if isinstance(elapse, list) else []
    }

def main():
    parser = argparse.ArgumentParser(description="RapidOCR Local Business Card Engine")
    parser.add_argument("--image", type=str, help="Path to image file")
    parser.add_argument("--stdin", action="store_true", help="Read base64 or image path from stdin")
    parser.add_argument("--base64", type=str, help="Base64 encoded image string")
    parser.add_argument("--daemon", action="store_true", help="Run in persistent daemon mode listening on stdin for JSON requests")
    args = parser.parse_args()

    try:
        engine = get_engine()

        if args.daemon:
            # Reconfigure stdin and stdout for immediate unbuffered line processing
            try:
                sys.stdin.reconfigure(line_buffering=True)
                sys.stdout.reconfigure(line_buffering=True)
            except Exception:
                pass

            # Warm up ONNX models once so live inference is primed
            dummy = np.ones((100, 100, 3), dtype=np.uint8) * 255
            try:
                engine(dummy)
            except Exception:
                pass
            print(json.dumps({"status": "ready"}), flush=True)

            while True:
                line = sys.stdin.readline()
                if not line:
                    break
                line = line.strip()
                if not line:
                    continue
                req_id = None
                try:
                    payload = json.loads(line)
                    req_id = payload.get("id")
                    img_source = None
                    if "imagePath" in payload and os.path.exists(payload["imagePath"]):
                        img_source = payload["imagePath"]
                    elif "imageBase64" in payload:
                        b64_data = payload["imageBase64"]
                        if "," in b64_data:
                            b64_data = b64_data.split(",", 1)[1]
                        img_source = base64.b64decode(b64_data)

                    if img_source is None:
                        res = {"success": False, "error": "No image data provided"}
                    else:
                        res = process_image(engine, img_source)

                    if req_id is not None:
                        res["id"] = req_id
                    print(json.dumps(res), flush=True)
                except Exception as ex:
                    err_res = {"success": False, "error": str(ex)}
                    if req_id is not None:
                        err_res["id"] = req_id
                    print(json.dumps(err_res), flush=True)
            sys.exit(0)

        img_source = None

        if args.image:
            if not os.path.exists(args.image):
                print(json.dumps({"success": False, "error": f"File not found: {args.image}"}))
                sys.exit(1)
            img_source = args.image

        elif args.base64:
            b64_data = args.base64
            if "," in b64_data:
                b64_data = b64_data.split(",", 1)[1]
            img_source = base64.b64decode(b64_data)

        elif args.stdin:
            input_data = sys.stdin.read().strip()
            if not input_data:
                print(json.dumps({"success": False, "error": "No input received on stdin"}))
                sys.exit(1)
            
            # Check if input is JSON or raw path / base64
            if input_data.startswith("{"):
                payload = json.loads(input_data)
                if "imagePath" in payload and os.path.exists(payload["imagePath"]):
                    img_source = payload["imagePath"]
                elif "imageBase64" in payload:
                    b64_data = payload["imageBase64"]
                    if "," in b64_data:
                        b64_data = b64_data.split(",", 1)[1]
                    img_source = base64.b64decode(b64_data)
            elif os.path.exists(input_data):
                img_source = input_data
            else:
                # Assume raw base64 string
                b64_data = input_data
                if "," in b64_data:
                    b64_data = b64_data.split(",", 1)[1]
                img_source = base64.b64decode(b64_data)

        else:
            print(json.dumps({"success": False, "error": "Must provide --image, --base64, or --stdin"}))
            sys.exit(1)

        result = process_image(engine, img_source)
        print(json.dumps(result))

    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))
        sys.exit(1)

if __name__ == "__main__":
    main()
