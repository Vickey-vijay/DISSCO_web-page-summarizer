"""Builds the Version 2 final-semester deck with the shared builder.

The shared builder is finalsem/docs/build/build_deck.py. It is imported, not copied and not edited.
This file adds one layout, "pair": two pictures side by side, each with its own caption.

Usage (from any folder):
  python "<repo>\\finalsem\\docs\\ppt\\build_final_deck.py" "<repo>\\finalsem\\docs\\ppt\\final_deck.json" "<repo>\\finalsem\\docs\\ppt\\FinalSem_Deck.pptx"
"""
from __future__ import annotations

import sys
from pathlib import Path

from pptx.util import Inches

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "build"))

import build_deck as bd  # noqa: E402  (the shared builder, unchanged)


class FinalDeck(bd.Deck):
    def pair(self, s):
        """Two pictures side by side. Each picture is fitted into a box of max_height inches and
        bottom-aligned; its caption sits under it at the minimum size (16 pt)."""
        slide = self._new()
        self._frame(slide, s["title"])
        items = s["items"]
        bd._check(len(items) == 2, f"slide {self.n}: a pair slide takes exactly 2 pictures")
        max_h = Inches(s.get("max_height", 3.6))
        gap = Inches(0.6)
        half = (bd.CONTENT_W - gap) // 2
        cap_top = bd.CONTENT_TOP + max_h + Inches(0.15)
        for i, item in enumerate(items):
            path = (self.base / item["image"]).resolve()
            bd._check(path.exists(), f"slide {self.n}: image not found: {item['image']}")
            caption = item.get("caption", "")
            bd._check(len(caption) <= 170, f"slide {self.n}: caption too long ({len(caption)} > 170)")
            buf, (px_w, px_h) = bd._prepare_image(path, crop=False)
            w, h = self._fit_size(px_w, px_h, half, max_h)
            left = bd.MARGIN + i * (half + gap)
            picture = slide.shapes.add_picture(buf, left, bd.CONTENT_TOP + max_h - h, w, h)
            bd._alt(picture, item.get("alt", caption))
            bd._text(slide, left, cap_top, half, Inches(1.2), caption, bd.MIN_PT, bd.MUTED, italic=True)
        self._notes(slide, s)


if __name__ == "__main__":
    spec_file, out_file = Path(sys.argv[1]), Path(sys.argv[2])
    count = FinalDeck(spec_file).build(out_file)
    print(f"built {count} slides -> {out_file}")
