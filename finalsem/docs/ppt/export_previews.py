"""Renders every slide of a .pptx to preview/slide_NN.png with PowerPoint, invisibly.

Uses export_slides_png from midsem/docs/build/word_tools.py (imported, not edited). That helper
opens the file with WithWindow=False and quits PowerPoint in a finally block.

Usage:
  python export_previews.py "<repo>\\finalsem\\docs\\ppt\\FinalSem_Deck.pptx" "<repo>\\finalsem\\docs\\ppt\\preview"
"""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

WORD_TOOLS_DIR = Path(r"C:\Users\Vicke\OneDrive\Desktop\Python\COH_11\Jeffy\midsem\docs\build")
sys.path.insert(0, str(WORD_TOOLS_DIR))

from word_tools import export_slides_png  # noqa: E402


if __name__ == "__main__":
    pptx_file, out_dir = Path(sys.argv[1]), Path(sys.argv[2])
    if out_dir.exists():
        shutil.rmtree(out_dir)
    files = export_slides_png(pptx_file, out_dir, width=1600)
    print(f"exported {len(files)} slides -> {out_dir}")
    for f in files:
        print(f)
