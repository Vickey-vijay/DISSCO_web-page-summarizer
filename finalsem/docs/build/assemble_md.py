"""Checks and assembles the Markdown documents.

1. Checks every chapter for banned filler words and for figure or screenshot links that do not
   point to a real file.
2. Writes one combined file per document (finalsem/docs/report/FinalSem_Report_full.md and
   finalsem/docs/kt/KT_full.md) with a page break between chapters, so Vignesh can open one file
   and turn it into a PDF himself.

Run:  python -I finalsem/docs/build/assemble_md.py
"""
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "finalsem" / "docs"
BANNED = [
    "delve", "seamless", "robust", "leverage", "game-changer", "game changer", "cutting-edge",
    "it is important to note", "in today's world", "navigate the landscape", "unlock", "empower",
    "tapestry", "testament", "furthermore", "moreover", "in conclusion,", "harness", "paradigm", "state-of-the-art",
]
LINK = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")

PLAN = {
    "report": [
        "00_front_matter.md", "01_introduction.md", "02_how_a_language_model_works.md",
        "03_running_a_model_in_the_browser.md", "04_requirements.md", "05_system_design.md",
        "06_technology_choices.md", "07_graphics_card_check_and_model_choice.md",
        "08_getting_the_model_onto_the_laptop.md", "09_offscreen_page_and_messages.md",
        "10_summarizing_with_a_small_model.md", "11_user_interface.md", "12_errors_and_fallbacks.md",
        "13_setup_and_running.md", "14_testing_and_results.md", "15_problems_and_solutions.md",
        "16_limitations_and_next_steps.md", "17_conclusion.md", "18_references.md",
        "appendix_a_file_guide.md", "appendix_b_messages_and_settings.md",
    ],
    "kt": [
        "00_read_me_first.md", "01_how_it_works.md", "02_module_by_module.md",
        "03_how_to_run_and_demo.md", "04_decisions_in_your_words.md", "05_glossary.md",
        "06_viva_questions.md",
    ],
}
COMBINED = {"report": "FinalSem_Report_full.md", "kt": "KT_full.md"}


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
    for marker in ("<!-- check against",):
        if marker in text:
            problems.append(f"{name}: unresolved review marker '{marker}'")
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
