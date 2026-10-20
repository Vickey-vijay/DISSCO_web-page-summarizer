"""Checks and assembles the Markdown documents.

1. Checks every chapter for banned filler words and for figure or screenshot links that do not
   point to a real file.
2. Writes one combined file per document (midsem/docs/report/MidSem_Report_full.md and
   midsem/docs/kt/KT_full.md) with a page break between chapters, so Vignesh can open one file
   and turn it into a PDF himself.

Run:  python -I midsem/docs/build/assemble_md.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "midsem" / "docs"
BANNED = [
    "delve", "seamless", "robust", "leverage", "game-changer", "game changer", "cutting-edge",
    "it is important to note", "in today's world", "navigate the landscape", "unlock", "empower",
    "tapestry", "testament", "furthermore", "moreover", "in conclusion,",
]
LINK = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")

PLAN = {
    "report": [
        "00_front_matter.md", "01_introduction.md", "02_background_and_survey.md", "03_requirements.md",
        "04_system_design.md", "05_technology_choices.md", "06_text_extraction.md", "07_long_pages.md",
        "08_cloud_model_and_errors.md", "09_user_interface.md", "10_storage_and_jobs.md",
        "11_setup_and_running.md", "12_testing_and_results.md", "13_problems_and_solutions.md",
        "14_limitations_and_next_steps.md", "15_conclusion.md", "16_references.md",
        "appendix_a_file_guide.md", "appendix_b_messages_and_settings.md",
    ],
    "kt": [
        "00_read_me_first.md", "01_how_it_works.md", "02_module_by_module.md",
        "03_how_to_run_and_demo.md", "04_decisions_in_your_words.md", "05_glossary.md",
        "06_viva_questions.md",
    ],
}
COMBINED = {"report": "MidSem_Report_full.md", "kt": "KT_full.md"}


def check(folder: Path, name: str, problems: list[str]) -> str:
    path = folder / name
    if not path.exists():
        problems.append(f"{name}: file is missing")
        return ""
    text = path.read_text(encoding="utf-8-sig")
    low = text.lower()
    for word in BANNED:
        if word in low:
            problems.append(f"{name}: banned phrase '{word}'")
    for target in LINK.findall(text):
        if target.startswith("http"):
            continue
        if not (folder / target).resolve().exists():
            problems.append(f"{name}: image not found: {target}")
    words = len(re.findall(r"\w+", text))
    print(f"  {name:<40} {words:>6} words")
    return text


def assemble(kind: str) -> None:
    folder = DOCS / kind
    problems: list[str] = []
    print(f"[{kind}]")
    parts = []
    for name in PLAN[kind]:
        text = check(folder, name, problems)
        if text:
            parts.append(text.strip() + "\n")
    out = folder / COMBINED[kind]
    body = '\n\n<div style="page-break-after: always"></div>\n\n'.join(parts)
    out.write_text(body + "\n", encoding="utf-8")
    print(f"  wrote {out.relative_to(ROOT)}")
    if problems:
        print(f"  PROBLEMS ({len(problems)}):")
        for p in problems:
            print("   - " + p)
    else:
        print("  no problems found")


if __name__ == "__main__":
    targets = sys.argv[1:] or ["report", "kt"]
    for t in targets:
        assemble(t)
