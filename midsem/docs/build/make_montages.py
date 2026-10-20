"""Assembles labelled sheets of popup screenshots from the browser test output, so the report can
show several UI states side by side on one page.

Run after `npm run test:e2e` (it reads midsem/project/test-output/*.png):
    python -I midsem/docs/build/make_montages.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "project" / "test-output"
OUT = ROOT / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

PAPER = (251, 248, 241)
INK = (28, 27, 26)
MUTED = (107, 102, 92)
RULE = (217, 210, 195)

SHEETS = {
    "ui-states-1.png": [
        ("T17-navigated", "A. Idle, ready to summarize"),
        ("T03-no-key", "B. No key yet: the Key box is open"),
        ("T25-key-saved-in-popup", "C. Key saved inside the popup"),
    ],
    "ui-states-2.png": [
        ("T01-progress", "D. Progress, part by part"),
        ("T05-retry-notice", "E. Service busy, retrying"),
        ("T01-done", "F. Finished summary"),
    ],
    "ui-states-3.png": [
        ("T02-near-empty", "G. Too little text on the page"),
        ("T10-restricted", "H. Page Chrome does not allow"),
        ("T23-too-long", "I. Page too long for V1"),
        ("T24-quota-used-up", "J. Free-tier limit used up"),
    ],
}


def font(size, bold=False):
    for name in (("segoeuib.ttf" if bold else "segoeui.ttf"), "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def build(sheet_name, items):
    frames = []
    for stem, label in items:
        path = SRC / f"{stem}.png"
        if not path.exists():
            raise SystemExit(f"missing screenshot {path}; run npm run test:e2e first")
        frames.append((Image.open(path).convert("RGB"), label))
    pad, gap, label_h = 28, 28, 52
    # crop each popup to its content height (plus a little air) so the sheet is not mostly empty
    cropped = []
    for im, label in frames:
        px = im.load()
        last = 0
        for y in range(im.height - 1, 0, -1):
            if any(px[x, y] != PAPER for x in range(0, im.width, 4)):
                last = y
                break
        cropped.append((im.crop((0, 0, im.width, min(im.height, last + 24))), label))
    height = max(c.height for c, _ in cropped)
    width = pad * 2 + sum(c.width for c, _ in cropped) + gap * (len(cropped) - 1)
    sheet = Image.new("RGB", (width, pad * 2 + height + label_h), (255, 255, 255))
    d = ImageDraw.Draw(sheet)
    x = pad
    for im, label in cropped:
        d.rectangle([x - 1, pad - 1, x + im.width, pad + im.height], outline=RULE)
        sheet.paste(im, (x, pad))
        d.text((x, pad + height + 14), label, font=font(20, bold=True), fill=INK)
        x += im.width + gap
    sheet.save(OUT / sheet_name, optimize=True)
    print(f"{sheet_name}: {sheet.size[0]}x{sheet.size[1]}")


for name, items in SHEETS.items():
    build(name, items)

# single full-size images used on their own
for stem, out in (("T15-saved", "options-page.png"), ("T14-hostile-output", "hostile-output-as-text.png")):
    src = SRC / f"{stem}.png"
    if src.exists():
        Image.open(src).convert("RGB").save(OUT / out, optimize=True)
        print(out)
