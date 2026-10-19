"""Builds a clean, consistent PowerPoint deck from a JSON spec.

One theme, a few strict layouts. Every slide has a title in the same place, a footer with the
project name and a slide number, and speaker notes. The builder refuses text that is too long,
because a disciplined deck is one where nothing overflows.

Spec (JSON):
{
  "footer": "Page Summarizer - Mid-Semester Review",
  "slides": [
    {"layout": "title", "title": "...", "subtitle": "...", "meta": ["line", "line"], "notes": "..."},
    {"layout": "section", "number": "1", "title": "...", "subtitle": "...", "notes": "..."},
    {"layout": "bullets", "title": "...", "bullets": ["...", "..."], "notes": "..."},
    {"layout": "image", "title": "...", "image": "path.png", "caption": "...", "bullets": ["..."], "notes": "..."},
    {"layout": "two_column", "title": "...", "left_title": "...", "left": ["..."], "right_title": "...", "right": ["..."], "notes": "..."},
    {"layout": "table", "title": "...", "header": ["a","b"], "rows": [["x","y"]], "col_widths": [3,8], "notes": "..."},
    {"layout": "stats", "title": "...", "stats": [{"value": "56", "label": "unit tests"}], "caption": "...", "notes": "..."},
    {"layout": "closing", "title": "...", "lines": ["..."], "notes": "..."}
  ]
}
Image paths are relative to the spec file.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

INK = RGBColor(0x0F, 0x17, 0x2A)
MUTED = RGBColor(0x64, 0x74, 0x8B)
BLUE = RGBColor(0x25, 0x63, 0xEB)
DEEP = RGBColor(0x1E, 0x3A, 0x8A)
SOFT = RGBColor(0xEF, 0xF6, 0xFF)
LINE = RGBColor(0xCB, 0xD5, 0xE1)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
TITLE_FONT = "Segoe UI Semibold"
BODY_FONT = "Segoe UI"

SLIDE_W, SLIDE_H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.75)
CONTENT_W = SLIDE_W - 2 * MARGIN
CONTENT_TOP = Inches(1.6)
CONTENT_BOTTOM = Inches(6.8)

MAX_BULLETS = 6
MAX_BULLET_CHARS = 140
MAX_TITLE_CHARS = 70


class SpecError(ValueError):
    pass


def _check(cond: bool, message: str) -> None:
    if not cond:
        raise SpecError(message)


def _text(slide, left, top, width, height, text, size, color=INK, bold=False, font=BODY_FONT,
          align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, italic=False):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Inches(0.05)
    tf.margin_top = tf.margin_bottom = Inches(0.03)
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.name = font
    run.font.color.rgb = color
    return box


def _rect(slide, left, top, width, height, fill, line=None, shape=MSO_SHAPE.RECTANGLE):
    shp = slide.shapes.add_shape(shape, left, top, width, height)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line is None:
        shp.line.fill.background()
    else:
        shp.line.color.rgb = line
        shp.line.width = Pt(0.75)
    shp.shadow.inherit = False
    return shp


def _bullets(slide, left, top, width, height, items, size=22):
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.05)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(10)
        p.line_spacing = 1.05
        p_pr = p._p.get_or_add_pPr()
        p_pr.set("marL", str(Inches(0.35)))
        p_pr.set("indent", str(-Inches(0.35)))
        bu_color = p_pr.makeelement(qn("a:buClr"), {})
        srgb = bu_color.makeelement(qn("a:srgbClr"), {"val": "2563EB"})
        bu_color.append(srgb)
        p_pr.append(bu_color)
        p_pr.append(p_pr.makeelement(qn("a:buFont"), {"typeface": "Arial"}))
        p_pr.append(p_pr.makeelement(qn("a:buChar"), {"char": "•"}))
        run = p.add_run()
        run.text = item
        run.font.size = Pt(size)
        run.font.name = BODY_FONT
        run.font.color.rgb = INK
    return box


class Deck:
    def __init__(self, spec_path: Path):
        self.base = spec_path.parent
        # utf-8-sig: Windows PowerShell writes a byte-order mark; accept files with or without it
        self.spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = SLIDE_W, SLIDE_H
        self.blank = self.prs.slide_layouts[6]
        self.footer = self.spec.get("footer", "")
        self.n = 0

    # ---- shared pieces
    def _new(self):
        self.n += 1
        return self.prs.slides.add_slide(self.blank)

    def _frame(self, slide, title: str) -> None:
        _check(len(title) <= MAX_TITLE_CHARS, f"slide {self.n}: title too long ({len(title)} > {MAX_TITLE_CHARS})")
        _text(slide, MARGIN, Inches(0.45), CONTENT_W, Inches(0.8), title, 30, INK, bold=True, font=TITLE_FONT, anchor=MSO_ANCHOR.MIDDLE)
        _rect(slide, MARGIN + Inches(0.05), Inches(1.28), Inches(0.9), Inches(0.06), BLUE)
        _text(slide, MARGIN, Inches(7.0), Inches(9), Inches(0.3), self.footer, 11, MUTED)
        _text(slide, SLIDE_W - MARGIN - Inches(1.0), Inches(7.0), Inches(1.0), Inches(0.3), str(self.n), 11, MUTED, align=PP_ALIGN.RIGHT)

    def _notes(self, slide, spec) -> None:
        notes = spec.get("notes", "")
        _check(bool(notes.strip()), f"slide {self.n}: speaker notes are required")
        slide.notes_slide.notes_text_frame.text = notes

    def _check_bullets(self, items, limit=MAX_BULLETS):
        _check(1 <= len(items) <= limit, f"slide {self.n}: use 1 to {limit} bullets, got {len(items)}")
        for b in items:
            _check(len(b) <= MAX_BULLET_CHARS, f"slide {self.n}: bullet too long ({len(b)} > {MAX_BULLET_CHARS}): {b[:50]}...")

    def _fit_image(self, path: Path, box_w, box_h):
        with Image.open(path) as im:
            w, h = im.size
        scale = min(box_w / w, box_h / h)
        return int(w * scale), int(h * scale)

    # ---- layouts
    def title(self, s):
        slide = self._new()
        _rect(slide, 0, 0, SLIDE_W, SLIDE_H, DEEP)
        _rect(slide, MARGIN, Inches(2.0), Inches(1.2), Inches(0.08), RGBColor(0x93, 0xC5, 0xFD))
        _text(slide, MARGIN, Inches(2.2), CONTENT_W, Inches(1.6), s["title"], 44, WHITE, bold=True, font=TITLE_FONT, anchor=MSO_ANCHOR.TOP)
        _text(slide, MARGIN, Inches(3.9), CONTENT_W, Inches(0.8), s.get("subtitle", ""), 24, RGBColor(0xDB, 0xEA, 0xFE))
        for i, line in enumerate(s.get("meta", [])):
            _text(slide, MARGIN, Inches(5.3) + Inches(0.38) * i, CONTENT_W, Inches(0.4), line, 16, RGBColor(0xBF, 0xDB, 0xFE))
        self._notes(slide, s)

    def section(self, s):
        slide = self._new()
        _rect(slide, 0, 0, SLIDE_W, SLIDE_H, DEEP)
        _text(slide, MARGIN, Inches(2.4), Inches(2), Inches(1.2), s.get("number", ""), 72, RGBColor(0x93, 0xC5, 0xFD), bold=True, font=TITLE_FONT)
        _text(slide, MARGIN, Inches(3.7), CONTENT_W, Inches(1.0), s["title"], 40, WHITE, bold=True, font=TITLE_FONT)
        _text(slide, MARGIN, Inches(4.6), CONTENT_W, Inches(0.8), s.get("subtitle", ""), 20, RGBColor(0xDB, 0xEA, 0xFE))
        self._notes(slide, s)

    def bullets(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        self._check_bullets(s["bullets"])
        _bullets(slide, MARGIN, CONTENT_TOP, CONTENT_W, CONTENT_BOTTOM - CONTENT_TOP, s["bullets"], size=24)
        self._notes(slide, s)

    def image(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        path = (self.base / s["image"]).resolve()
        _check(path.exists(), f"slide {self.n}: image not found: {s['image']}")
        side = s.get("bullets", [])
        if side:
            self._check_bullets(side, limit=4)
        img_w_avail = int(CONTENT_W * (0.62 if side else 1.0))
        cap_h = Inches(0.45) if s.get("caption") else 0
        w, h = self._fit_image(path, img_w_avail, CONTENT_BOTTOM - CONTENT_TOP - cap_h - Inches(0.1))
        left = MARGIN + (img_w_avail - w) // 2
        slide.shapes.add_picture(str(path), left, CONTENT_TOP, w, h)
        if s.get("caption"):
            _text(slide, MARGIN, CONTENT_TOP + h + Inches(0.08), img_w_avail, cap_h, s["caption"], 13, MUTED, align=PP_ALIGN.CENTER, italic=True)
        if side:
            _bullets(slide, MARGIN + img_w_avail + Inches(0.3), CONTENT_TOP, CONTENT_W - img_w_avail - Inches(0.3), CONTENT_BOTTOM - CONTENT_TOP, side, size=20)
        self._notes(slide, s)

    def two_column(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        self._check_bullets(s["left"], 5)
        self._check_bullets(s["right"], 5)
        col_w = (CONTENT_W - Inches(0.5)) // 2
        for i, (head, items) in enumerate(((s["left_title"], s["left"]), (s["right_title"], s["right"]))):
            left = MARGIN + i * (col_w + Inches(0.5))
            _rect(slide, left, CONTENT_TOP, col_w, Inches(0.55), SOFT)
            _text(slide, left + Inches(0.1), CONTENT_TOP, col_w - Inches(0.2), Inches(0.55), head, 20, DEEP, bold=True, font=TITLE_FONT, anchor=MSO_ANCHOR.MIDDLE)
            _bullets(slide, left, CONTENT_TOP + Inches(0.7), col_w, CONTENT_BOTTOM - CONTENT_TOP - Inches(0.7), items, size=19)
        self._notes(slide, s)

    def table(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        header, rows = s["header"], s["rows"]
        _check(1 <= len(rows) <= 7, f"slide {self.n}: a table slide takes 1 to 7 rows")
        widths = s.get("col_widths") or [1] * len(header)
        total = sum(widths)
        row_h = Inches(0.62)
        shape = slide.shapes.add_table(len(rows) + 1, len(header), MARGIN, CONTENT_TOP, CONTENT_W, row_h * (len(rows) + 1))
        table = shape.table
        for ci, w in enumerate(widths):
            table.columns[ci].width = int(CONTENT_W * w / total)
        for ri in range(len(rows) + 1):
            table.rows[ri].height = row_h
            for ci in range(len(header)):
                cell = table.cell(ri, ci)
                text = header[ci] if ri == 0 else rows[ri - 1][ci]
                cell.text = ""
                p = cell.text_frame.paragraphs[0]
                run = p.add_run()
                run.text = text
                run.font.size = Pt(16)
                run.font.name = BODY_FONT
                run.font.bold = ri == 0
                run.font.color.rgb = WHITE if ri == 0 else INK
                cell.fill.solid()
                cell.fill.fore_color.rgb = DEEP if ri == 0 else (SOFT if ri % 2 == 0 else WHITE)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.margin_left = cell.margin_right = Inches(0.12)
        self._notes(slide, s)

    def stats(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        stats = s["stats"]
        _check(2 <= len(stats) <= 4, f"slide {self.n}: stats slide takes 2 to 4 numbers")
        gap = Inches(0.4)
        card_w = (CONTENT_W - gap * (len(stats) - 1)) // len(stats)
        for i, st in enumerate(stats):
            left = MARGIN + i * (card_w + gap)
            _rect(slide, left, CONTENT_TOP + Inches(0.3), card_w, Inches(3.2), SOFT, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE)
            _text(slide, left, CONTENT_TOP + Inches(0.7), card_w, Inches(1.4), st["value"], 54, BLUE, bold=True, font=TITLE_FONT, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
            _text(slide, left + Inches(0.15), CONTENT_TOP + Inches(2.2), card_w - Inches(0.3), Inches(1.2), st["label"], 18, INK, align=PP_ALIGN.CENTER)
        if s.get("caption"):
            _text(slide, MARGIN, CONTENT_TOP + Inches(3.9), CONTENT_W, Inches(0.8), s["caption"], 16, MUTED, align=PP_ALIGN.CENTER, italic=True)
        self._notes(slide, s)

    def closing(self, s):
        slide = self._new()
        _rect(slide, 0, 0, SLIDE_W, SLIDE_H, DEEP)
        _text(slide, MARGIN, Inches(2.3), CONTENT_W, Inches(1.2), s["title"], 44, WHITE, bold=True, font=TITLE_FONT)
        for i, line in enumerate(s.get("lines", [])):
            _text(slide, MARGIN, Inches(3.8) + Inches(0.5) * i, CONTENT_W, Inches(0.5), line, 20, RGBColor(0xDB, 0xEA, 0xFE))
        self._notes(slide, s)

    def build(self, out_path: Path) -> int:
        for s in self.spec["slides"]:
            getattr(self, s["layout"])(s)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        self.prs.save(str(out_path))
        return self.n


if __name__ == "__main__":
    spec_file, out_file = Path(sys.argv[1]), Path(sys.argv[2])
    count = Deck(spec_file).build(out_file)
    print(f"built {count} slides -> {out_file}")
