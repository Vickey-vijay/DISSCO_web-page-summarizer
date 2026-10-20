"""Builds the midsem report (.docx + PDF) and the KT document (.docx) from the Markdown chapters
in midsem/docs/report/ and midsem/docs/kt/, then asks Word to fill the table of contents and
reports the real page count and file size.

Run:  python -I midsem/docs/build/build_report.py [report|kt|all]
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import md2docx  # noqa: E402
import word_tools  # noqa: E402

DOCS = HERE.parent
TITLE = "AI-Powered Web Page Summarizer"
SUBTITLE = "A Chrome Extension with a Cloud Engine (V1) and an In-Browser Local Model (V2)"
COMMON = dict(
    title=TITLE,
    subtitle=SUBTITLE,
    student_name="[Insert Student Name]",
    bits_id="[Insert BITS ID]",
    degree="[Insert Degree Program]",
    date_line="[Insert Month and Year]",
)

PROGRESS = {
    "completed": [
        ("Requirement analysis and research", [
            "Studied Manifest V3 extensions, page text extraction, chunked summarization and cloud versus in-browser model options.",
            "Compared the project with Copilot-style assistants and Chrome's built-in Summarizer API; fixed the V1 and V2 scope.",
        ]),
        ("Development of Version 1", [
            "Built the popup, service worker, text extractor (Mozilla Readability), chunker, merger and pipeline.",
            "Built the Gemini cloud engine with retry and back-off, plain-English error messages and the Options page for the API key.",
            "Chose the cloud model by measurement and cut a typical request from about 12 s to about 4 s.",
        ]),
        ("Testing and delivery", [
            "Unit tests, automated browser tests in a visible Chromium window, live runs on real pages, and a real-Chrome manual check list.",
            "Wrote setup.bat and run.bat and tested their success and failure paths; everything is on GitHub.",
        ]),
    ],
    "remaining": [
        ("Version 2 (final semester)", [
            "Test 1B to 3B parameter models in the browser and choose one for the client's laptop.",
            "Build the local engine with first-run download, progress bar, caching and the WebGPU check.",
            "Make summaries work with no network after the first download.",
        ]),
        ("Comparison and final documents", [
            "Measure speed, summary quality and memory for the cloud and local engines on the same pages.",
            "Final testing, final report, presentation and knowledge-transfer document.",
        ]),
    ],
}

REPORT = dict(
    COMMON,
    report_kind="Mid-Semester Report (Version 1)",
    short_title="AI-Powered Web Page Summarizer - Mid-Semester Report",
    cover_rows=[("Student Name", "[Insert Student Name]"), ("BITS ID", "[Insert BITS ID]"), ("Degree Program", "[Insert Degree Program]"), ("Project Carried Out At", "[Insert Organization Name & Location]")],
    progress=PROGRESS,
    base_dir=str(DOCS),
    chapters=sorted(str(p.relative_to(DOCS)) for p in (DOCS / "report").glob("*.md")),
)

KT = dict(
    COMMON,
    report_kind="Knowledge Transfer Document (Version 1)",
    short_title="Page Summarizer - Knowledge Transfer (V1)",
    cover_rows=[("Prepared for", "[Insert Student Name]"), ("BITS ID", "[Insert BITS ID]")],
    front_matter=False,
    base_dir=str(DOCS),
    chapters=sorted(str(p.relative_to(DOCS)) for p in (DOCS / "kt").glob("*.md")),
)


def build(name: str, cfg: dict, out_name: str, export_pdf: bool) -> None:
    if not cfg["chapters"]:
        print(f"[{name}] no chapter files found, skipping")
        return
    out = DOCS / out_name
    info = md2docx.build_document(cfg, out)
    print(f"[{name}] built {out.name}: {info}")
    if info["warnings"]:
        print(f"[{name}] WARNINGS: {info['warnings']}")
    stats = word_tools.refresh_and_export(out, out.with_suffix(".pdf") if export_pdf else DOCS / "_tmp_check.pdf")
    print(f"[{name}] Word says: {stats['pages']} pages, {stats['words']} words, PDF {stats['pdf_bytes'] / 1024:.0f} KB")
    if not export_pdf:
        Path(stats["pdf"]).unlink(missing_ok=True)


if __name__ == "__main__":
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    if what in ("report", "all"):
        build("report", REPORT, "MidSem_Report.docx", export_pdf=True)
    if what in ("kt", "all"):
        # KT PDF is only exported after the author has verified the document (workflow rule).
        build("kt", KT, "KT_Document.docx", export_pdf=False)
