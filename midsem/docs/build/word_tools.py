"""Uses the installed Microsoft Word / PowerPoint (through COM) to finish documents:
update the table of contents and lists, export a PDF, count pages, and render slides to PNG.

Windows only. Requires pywin32.
"""
from __future__ import annotations

import time
from pathlib import Path

import pythoncom
import win32com.client


def _word():
    pythoncom.CoInitialize()
    word = win32com.client.DispatchEx("Word.Application")
    word.Visible = False
    word.DisplayAlerts = 0
    return word


def refresh_and_export(docx_path: str | Path, pdf_path: str | Path | None = None) -> dict:
    """Update every field (TOC, lists of figures/tables, SEQ, page numbers), save the .docx in
    place, export a PDF, and return {'pages': n, 'pdf_bytes': size}."""
    docx_path = Path(docx_path).resolve()
    pdf_path = Path(pdf_path).resolve() if pdf_path else docx_path.with_suffix(".pdf")
    word = _word()
    try:
        doc = word.Documents.Open(str(docx_path))
        doc.Repaginate()
        for _ in range(2):  # twice: page numbers in the TOC depend on the TOC's own length
            for toc in doc.TablesOfContents:
                toc.Update()
            for tof in doc.TablesOfFigures:
                tof.Update()
            doc.Fields.Update()
            doc.Repaginate()
        pages = doc.ComputeStatistics(2)  # wdStatisticPages
        words = doc.ComputeStatistics(0)  # wdStatisticWords
        doc.Save()
        doc.ExportAsFixedFormat(str(pdf_path), 17)  # wdExportFormatPDF
        doc.Close(False)
    finally:
        word.Quit()
    return {"pages": int(pages), "words": int(words), "pdf": str(pdf_path), "pdf_bytes": pdf_path.stat().st_size}


def export_slides_png(pptx_path: str | Path, out_dir: str | Path, width: int = 1600) -> list[str]:
    """Render every slide of a .pptx to a PNG with PowerPoint and return the file paths."""
    pptx_path = Path(pptx_path).resolve()
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    pythoncom.CoInitialize()
    app = win32com.client.DispatchEx("PowerPoint.Application")
    try:
        pres = app.Presentations.Open(str(pptx_path), WithWindow=False)
        height = int(width * pres.PageSetup.SlideHeight / pres.PageSetup.SlideWidth)
        files = []
        for i, slide in enumerate(pres.Slides, start=1):
            f = out_dir / f"slide_{i:02d}.png"
            slide.Export(str(f), "PNG", width, height)
            files.append(str(f))
        pres.Close()
    finally:
        app.Quit()
        time.sleep(0.5)
    return files


def export_pptx_pdf(pptx_path: str | Path, pdf_path: str | Path) -> int:
    pptx_path, pdf_path = Path(pptx_path).resolve(), Path(pdf_path).resolve()
    pythoncom.CoInitialize()
    app = win32com.client.DispatchEx("PowerPoint.Application")
    try:
        pres = app.Presentations.Open(str(pptx_path), WithWindow=False)
        n = pres.Slides.Count
        pres.SaveAs(str(pdf_path), 32)  # ppSaveAsPDF
        pres.Close()
    finally:
        app.Quit()
    return n
