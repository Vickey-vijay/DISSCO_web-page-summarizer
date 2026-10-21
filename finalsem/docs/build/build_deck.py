"""Builds a clean PowerPoint deck from a JSON spec. Shared by the Version 1 and Version 2 decks.

Look: a printed page. Warm paper background, near-black ink, one brick-red accent, thin rules
instead of boxes, Georgia for titles and Segoe UI for body text. Titles are left-aligned, with
generous white space. Nothing is smaller than MIN_PT, and the builder refuses text that is too
long, so nothing overflows.

Every slide gets speaker notes, which the builder requires.

Layouts: title, section, bullets, image, two_column, table, stats, quote, closing.

Spec (JSON):
{
  "deck_title": "Page Summarizer, mid-semester deck",
  "footer": "Page Summarizer | Mid-Semester Review (Version 1)",
  "slides": [
    {"layout": "title", "title": "...", "subtitle": "...", "meta": ["line"], "logo": "path.png", "notes": "..."},
    {"layout": "section", "number": "1", "title": "...", "subtitle": "...", "notes": "..."},
    {"layout": "bullets", "title": "...", "bullets": ["..."], "notes": "..."},
    {"layout": "image", "title": "...", "image": "path.png", "alt": "...", "caption": "...", "bullets": ["..."], "notes": "..."},
    {"layout": "two_column", "title": "...", "left_title": "...", "left": ["..."], "right_title": "...", "right": ["..."], "notes": "..."},
    {"layout": "table", "title": "...", "header": ["a", "b"], "rows": [["x", "y"]], "col_widths": [3, 8], "caption": "...", "notes": "..."},
    {"layout": "stats", "title": "...", "stats": [{"value": "65", "label": "unit tests"}], "caption": "...", "notes": "..."},
    {"layout": "quote", "title": "...", "text": "...", "source": "...", "notes": "..."},
    {"layout": "closing", "title": "...", "lines": ["..."], "notes": "..."}
  ]
}
Image paths are relative to the spec file.
"""
from __future__ import annotations

import json
import sys
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt

# Palette: the printed-page colours used in the report figures.
PAPER = RGBColor(0xFB, 0xF8, 0xF1)
INK = RGBColor(0x1C, 0x1B, 0x1A)
BRICK = RGBColor(0xB4, 0x39, 0x1F)
MUTED = RGBColor(0x6B, 0x66, 0x5C)
OLIVE = RGBColor(0x3F, 0x5F, 0x2A)
LINE = RGBColor(0xD9, 0xD2, 0xC3)
TITLE_FONT = "Georgia"
BODY_FONT = "Segoe UI"
# Built-in table style "No Style, No Grid": no fills and no borders, so only the rules drawn here show.
NO_STYLE_TABLE = "{2D5ABB26-0587-4C30-8999-92F81FD0307C}"

MIN_PT = 16  # nothing on a slide is set smaller than this

SLIDE_W, SLIDE_H = Inches(13.333), Inches(7.5)
MARGIN = Inches(0.75)
CONTENT_W = SLIDE_W - 2 * MARGIN
CONTENT_TOP = Inches(1.75)
CONTENT_BOTTOM = Inches(6.7)
FOOTER_Y = Inches(6.95)

MAX_BULLETS = 6
MAX_BULLET_CHARS = 140
MAX_TITLE_CHARS = 70
MAX_CAPTION_CHARS = 150
MAX_TABLE_ROWS = 9
MAX_QUOTE_CHARS = 160


class SpecError(ValueError):
    pass


def _check(cond: bool, message: str) -> None:
    if not cond:
        raise SpecError(message)


def _text(slide, left, top, width, height, text, size, color=INK, bold=False, font=BODY_FONT,
          align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, italic=False):
    _check(size >= MIN_PT, f"font size {size} pt is below the {MIN_PT} pt minimum")
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


def _rect(slide, left, top, width, height, fill):
    shp = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    shp.line.fill.background()
    shp.shadow.inherit = False
    return shp


def _plain_line(line) -> None:
    """Drop the theme style of a connector, so no theme shadow is drawn under the rule."""
    style = line._element.find(qn("p:style"))
    if style is not None:
        line._element.remove(style)


def _rule(slide, left, top, width, color=LINE, weight=0.75):
    """A thin horizontal rule. Used instead of boxes."""
    line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, left, top, left + width, top)
    _plain_line(line)
    line.line.color.rgb = color
    line.line.width = Pt(weight)
    return line


def _vrule(slide, left, top, height, color=LINE, weight=0.75):
    line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, left, top, left, top + height)
    _plain_line(line)
    line.line.color.rgb = color
    line.line.width = Pt(weight)
    return line


def _accent(slide, left, top, width=Inches(0.9)):
    """The short brick-red bar that marks a title or a statement."""
    return _rect(slide, left, top, width, Inches(0.05), BRICK)


def _background(slide) -> None:
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = PAPER


def _bullets(slide, left, top, width, height, items, size=22):
    _check(size >= MIN_PT, f"bullet size {size} pt is below the {MIN_PT} pt minimum")
    box = slide.shapes.add_textbox(left, top, width, height)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(0.05)
    for i, item in enumerate(items):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(12)
        p.line_spacing = 1.05
        p_pr = p._p.get_or_add_pPr()
        p_pr.set("marL", str(Inches(0.35)))
        p_pr.set("indent", str(-Inches(0.35)))
        bu_color = p_pr.makeelement(qn("a:buClr"), {})
        bu_color.append(bu_color.makeelement(qn("a:srgbClr"), {"val": "B4391F"}))
        p_pr.append(bu_color)
        p_pr.append(p_pr.makeelement(qn("a:buFont"), {"typeface": "Arial"}))
        p_pr.append(p_pr.makeelement(qn("a:buChar"), {"char": "•"}))
        run = p.add_run()
        run.text = item
        run.font.size = Pt(size)
        run.font.name = BODY_FONT
        run.font.color.rgb = INK
    return box


def _cell_rule(cell, color, weight_pt: float) -> None:
    """Bottom border of one table cell. The line element must come before the cell fill."""
    tc_pr = cell._tc.get_or_add_tcPr()
    hex_color = f"{color[0]:02X}{color[1]:02X}{color[2]:02X}"
    ln = tc_pr.makeelement(qn("a:lnB"), {"w": str(int(Pt(weight_pt)))})
    solid = ln.makeelement(qn("a:solidFill"), {})
    solid.append(solid.makeelement(qn("a:srgbClr"), {"val": hex_color}))
    ln.append(solid)
    tc_pr.insert(0, ln)


def _alt(picture, text: str) -> None:
    picture._element.nvPicPr.cNvPr.set("descr", text)


def _prepare_image(path: Path, crop: bool):
    """Returns (PNG bytes, (width, height)) for a picture.

    Transparent pixels are placed on the paper colour, and near-white pixels become paper, so a
    figure with a white background sits on the page without a white box. With crop=True the empty
    margins are trimmed, so the drawing takes more of the slide. The source file is not changed.
    """
    with Image.open(path) as src:
        rgba = src.convert("RGBA")
    paper_rgb = (PAPER[0], PAPER[1], PAPER[2])
    base = Image.new("RGB", rgba.size, paper_rgb)
    base.paste(rgba, mask=rgba.split()[3])
    paper = Image.new("RGB", rgba.size, paper_rgb)
    near_white = base.convert("L").point(lambda v: 255 if v >= 246 else 0)
    base.paste(paper, mask=near_white)
    if crop:
        ink = ImageChops.difference(base, paper).convert("L").point(lambda v: 255 if v > 30 else 0)
        box = ink.getbbox()
        if box:
            pad = 16
            left, top, right, bottom = box
            base = base.crop((max(0, left - pad), max(0, top - pad),
                              min(base.width, right + pad), min(base.height, bottom + pad)))
    buf = BytesIO()
    base.save(buf, format="PNG")
    buf.seek(0)
    return buf, base.size


class Deck:
    def __init__(self, spec_path: Path):
        self.base = spec_path.parent
        # utf-8-sig: Windows PowerShell writes a byte-order mark; accept files with or without it
        self.spec = json.loads(spec_path.read_text(encoding="utf-8-sig"))
        self.prs = Presentation()
        self.prs.slide_width, self.prs.slide_height = SLIDE_W, SLIDE_H
        self.prs.core_properties.title = self.spec.get("deck_title", "Page Summarizer deck")
        self.blank = self.prs.slide_layouts[6]
        self.footer = self.spec.get("footer", "")
        self.n = 0

    # ---- shared pieces
    def _new(self):
        self.n += 1
        slide = self.prs.slides.add_slide(self.blank)
        _background(slide)
        return slide

    def _frame(self, slide, title: str) -> None:
        _check(len(title) <= MAX_TITLE_CHARS, f"slide {self.n}: title too long ({len(title)} > {MAX_TITLE_CHARS})")
        _text(slide, MARGIN, Inches(0.45), CONTENT_W, Inches(0.85), title, 30, INK, bold=True, font=TITLE_FONT, anchor=MSO_ANCHOR.BOTTOM)
        _rule(slide, MARGIN, Inches(1.4), CONTENT_W)
        _accent(slide, MARGIN, Inches(1.37))
        _text(slide, MARGIN, FOOTER_Y, Inches(10), Inches(0.4), self.footer, MIN_PT, MUTED)
        _text(slide, SLIDE_W - MARGIN - Inches(1.0), FOOTER_Y, Inches(1.0), Inches(0.4), str(self.n), MIN_PT, MUTED, align=PP_ALIGN.RIGHT)

    def _notes(self, slide, spec) -> None:
        notes = spec.get("notes", "")
        _check(bool(notes.strip()), f"slide {self.n}: speaker notes are required")
        slide.notes_slide.notes_text_frame.text = notes

    def _check_bullets(self, items, limit=MAX_BULLETS):
        _check(1 <= len(items) <= limit, f"slide {self.n}: use 1 to {limit} bullets, got {len(items)}")
        for b in items:
            _check(len(b) <= MAX_BULLET_CHARS, f"slide {self.n}: bullet too long ({len(b)} > {MAX_BULLET_CHARS}): {b[:50]}...")

    @staticmethod
    def _fit_size(w, h, box_w, box_h):
        scale = min(box_w / w, box_h / h)
        return int(w * scale), int(h * scale)

    # ---- layouts
    def title(self, s):
        slide = self._new()
        if s.get("logo"):
            logo = (self.base / s["logo"]).resolve()
            _check(logo.exists(), f"slide {self.n}: logo not found: {s['logo']}")
            buf, _ = _prepare_image(logo, crop=False)
            picture = slide.shapes.add_picture(buf, MARGIN, Inches(0.7), height=Inches(0.95))
            _alt(picture, "BITS Pilani logo")
        _accent(slide, MARGIN, Inches(2.05), Inches(1.2))
        _text(slide, MARGIN, Inches(2.25), CONTENT_W, Inches(1.5), s["title"], 44, INK, bold=True, font=TITLE_FONT)
        _text(slide, MARGIN, Inches(3.75), CONTENT_W, Inches(0.6), s.get("subtitle", ""), 24, MUTED)
        _rule(slide, MARGIN, Inches(4.6), CONTENT_W)
        for i, line in enumerate(s.get("meta", [])):
            _text(slide, MARGIN, Inches(4.85) + Inches(0.42) * i, CONTENT_W, Inches(0.4), line, 18, INK if i == 0 else MUTED)
        self._notes(slide, s)

    def section(self, s):
        slide = self._new()
        _text(slide, MARGIN, Inches(2.2), Inches(2), Inches(1.2), s.get("number", ""), 72, BRICK, bold=True, font=TITLE_FONT)
        _accent(slide, MARGIN, Inches(3.5), Inches(1.2))
        _text(slide, MARGIN, Inches(3.7), CONTENT_W, Inches(1.0), s["title"], 40, INK, bold=True, font=TITLE_FONT)
        _text(slide, MARGIN, Inches(4.7), CONTENT_W, Inches(0.8), s.get("subtitle", ""), 22, MUTED)
        self._notes(slide, s)

    def bullets(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        self._check_bullets(s["bullets"])
        _bullets(slide, MARGIN, CONTENT_TOP, CONTENT_W, CONTENT_BOTTOM - CONTENT_TOP, s["bullets"], size=22)
        self._notes(slide, s)

    def image(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        path = (self.base / s["image"]).resolve()
        _check(path.exists(), f"slide {self.n}: image not found: {s['image']}")
        side = s.get("bullets", [])
        if side:
            self._check_bullets(side, limit=4)
        caption = s.get("caption", "")
        _check(len(caption) <= MAX_CAPTION_CHARS, f"slide {self.n}: caption too long ({len(caption)} > {MAX_CAPTION_CHARS})")
        img_w_avail = int(CONTENT_W * (0.6 if side else 1.0))
        # About 8 characters of 16 pt text fit in each inch of width; the caption box grows with its lines.
        caption_lines = max(1, -(-len(caption) // int(img_w_avail / Inches(1) * 8)))
        cap_h = Inches(0.25 + 0.28 * caption_lines) if caption else 0
        buf, (img_w, img_h) = _prepare_image(path, crop=s.get("crop", False))
        w, h = self._fit_size(img_w, img_h, img_w_avail, CONTENT_BOTTOM - CONTENT_TOP - cap_h - Inches(0.05))
        left = MARGIN + (img_w_avail - w) // 2
        picture = slide.shapes.add_picture(buf, left, CONTENT_TOP, w, h)
        _alt(picture, s.get("alt", s["title"]))
        if caption:
            _text(slide, MARGIN, CONTENT_TOP + h + Inches(0.1), img_w_avail, cap_h, caption, MIN_PT, MUTED, italic=True)
        if side:
            x = MARGIN + img_w_avail + Inches(0.35)
            _vrule(slide, x - Inches(0.2), CONTENT_TOP, CONTENT_BOTTOM - CONTENT_TOP)
            _bullets(slide, x, CONTENT_TOP, CONTENT_W - img_w_avail - Inches(0.35), CONTENT_BOTTOM - CONTENT_TOP, side, size=20)
        self._notes(slide, s)

    def two_column(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        self._check_bullets(s["left"], 5)
        self._check_bullets(s["right"], 5)
        col_w = (CONTENT_W - Inches(0.6)) // 2
        for i, (head, items) in enumerate(((s["left_title"], s["left"]), (s["right_title"], s["right"]))):
            left = MARGIN + i * (col_w + Inches(0.6))
            _text(slide, left, CONTENT_TOP, col_w, Inches(0.5), head, 20, INK, bold=True, font=TITLE_FONT, anchor=MSO_ANCHOR.BOTTOM)
            _rule(slide, left, CONTENT_TOP + Inches(0.6), col_w)
            _bullets(slide, left, CONTENT_TOP + Inches(0.75), col_w, CONTENT_BOTTOM - CONTENT_TOP - Inches(0.75), items, size=20)
        self._notes(slide, s)

    def table(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        header, rows = s["header"], s["rows"]
        _check(1 <= len(rows) <= MAX_TABLE_ROWS, f"slide {self.n}: a table slide takes 1 to {MAX_TABLE_ROWS} rows")
        widths = s.get("col_widths") or [1] * len(header)
        total = sum(widths)
        n_rows = len(rows) + 1
        row_h = min(Inches(0.62), (CONTENT_BOTTOM - CONTENT_TOP - Inches(0.5)) // n_rows)
        shape = slide.shapes.add_table(n_rows, len(header), MARGIN, CONTENT_TOP, CONTENT_W, row_h * n_rows)
        table = shape.table
        tbl_pr = shape._element.graphic.graphicData.tbl.tblPr
        style_id = tbl_pr.find(qn("a:tableStyleId"))
        if style_id is None:
            style_id = tbl_pr.makeelement(qn("a:tableStyleId"), {})
            tbl_pr.append(style_id)
        style_id.text = NO_STYLE_TABLE
        table.first_row = True
        table.horz_banding = False
        for ci, w in enumerate(widths):
            table.columns[ci].width = int(CONTENT_W * w / total)
        for ri in range(n_rows):
            table.rows[ri].height = row_h
            for ci in range(len(header)):
                cell = table.cell(ri, ci)
                text = header[ci] if ri == 0 else rows[ri - 1][ci]
                cell.text = ""
                p = cell.text_frame.paragraphs[0]
                run = p.add_run()
                run.text = text
                run.font.size = Pt(MIN_PT)
                run.font.name = BODY_FONT
                run.font.bold = ri == 0
                run.font.color.rgb = INK
                cell.fill.background()
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                cell.margin_left = cell.margin_right = Inches(0.1)
                cell.margin_top = cell.margin_bottom = Inches(0.03)
                _cell_rule(cell, INK if ri == 0 else LINE, 1.0 if ri == 0 else 0.75)
        if s.get("caption"):
            _text(slide, MARGIN, CONTENT_TOP + row_h * n_rows + Inches(0.15), CONTENT_W, Inches(0.7), s["caption"], MIN_PT, MUTED, italic=True)
        self._notes(slide, s)

    def stats(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        stats = s["stats"]
        _check(2 <= len(stats) <= 4, f"slide {self.n}: stats slide takes 2 to 4 numbers")
        gap = Inches(0.5)
        card_w = (CONTENT_W - gap * (len(stats) - 1)) // len(stats)
        for i, st in enumerate(stats):
            left = MARGIN + i * (card_w + gap)
            _accent(slide, left, CONTENT_TOP + Inches(0.2), Inches(0.6))
            _text(slide, left, CONTENT_TOP + Inches(0.4), card_w, Inches(1.3), st["value"], 66, INK, bold=True, font=TITLE_FONT)
            _text(slide, left, CONTENT_TOP + Inches(1.8), card_w - Inches(0.1), Inches(0.9), st["label"], 18, INK)
        _rule(slide, MARGIN, CONTENT_TOP + Inches(2.9), CONTENT_W)
        if s.get("caption"):
            _text(slide, MARGIN, CONTENT_TOP + Inches(3.1), CONTENT_W, Inches(1.0), s["caption"], MIN_PT, MUTED, italic=True)
        self._notes(slide, s)

    def quote(self, s):
        slide = self._new()
        self._frame(slide, s["title"])
        text = s["text"]
        _check(len(text) <= MAX_QUOTE_CHARS, f"slide {self.n}: statement too long ({len(text)} > {MAX_QUOTE_CHARS})")
        _text(slide, MARGIN, CONTENT_TOP + Inches(0.5), CONTENT_W - Inches(1.0), Inches(2.9), text, 34, INK, font=TITLE_FONT)
        if s.get("source"):
            _text(slide, MARGIN, CONTENT_TOP + Inches(3.7), CONTENT_W, Inches(0.5), s["source"], MIN_PT, MUTED, italic=True)
        self._notes(slide, s)

    def closing(self, s):
        slide = self._new()
        _accent(slide, MARGIN, Inches(2.2), Inches(1.2))
        _text(slide, MARGIN, Inches(2.4), CONTENT_W, Inches(1.2), s["title"], 44, INK, bold=True, font=TITLE_FONT)
        for i, line in enumerate(s.get("lines", [])):
            _text(slide, MARGIN, Inches(3.8) + Inches(0.55) * i, CONTENT_W, Inches(0.5), line, 22, INK if i == 0 else MUTED)
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
