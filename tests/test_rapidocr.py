#!/usr/bin/env python3
import subprocess
import json
import os
import sys

def test_rapidocr_engine():
    image_path = os.path.abspath("public/assets/aistudio/17949358974903685834212116556903_190d2311.jpg")
    assert os.path.exists(image_path), f"Sample image not found at {image_path}"

    cmd = [sys.executable, "scripts/ocr_engine.py", "--image", image_path]
    proc = subprocess.run(cmd, capture_output=True, text=True)

    assert proc.returncode == 0, f"Engine failed with returncode {proc.returncode}: {proc.stderr}"
    data = json.loads(proc.stdout)

    assert data["success"] is True, f"OCR returned failure: {data}"
    lines = data["lines"]
    assert len(lines) >= 10, f"Expected at least 10 lines from business card, got {len(lines)}"

    full_text = data["rawText"]
    print("Test passed! Raw text extracted:\n" + full_text)
    print(f"Average confidence: {data['avgConfidence']}% over {len(lines)} lines")

    # Specific business card field assertions
    assert "STUART" in full_text or "HAMLYN" in full_text, "Company name missing"
    assert "MAHESH" in full_text, "Person name missing"
    assert "971502133593" in full_text.replace(" ", "").replace("-", ""), "Mobile number missing"
    assert "stuaham.com" in full_text, "Domain / email missing"

if __name__ == "__main__":
    test_rapidocr_engine()
    print("ALL TESTS PASSED!")
