# Mid-semester deck (Version 1)

- `MidSem_Deck.pptx` is the 20-slide deck. `midsem_deck.json` is its spec (slide text, speaker notes, layouts, figure paths). `preview/` holds one PNG per slide, rendered by PowerPoint.
- Rebuild from the Jeffy folder: `python -B finalsem/docs/build/build_deck.py midsem/docs/ppt/midsem_deck.json midsem/docs/ppt/MidSem_Deck.pptx`
- Re-render previews: `python -B -c "import sys; sys.path.insert(0, 'midsem/docs/build'); import word_tools; word_tools.export_slides_png('midsem/docs/ppt/MidSem_Deck.pptx', 'midsem/docs/ppt/preview', 1600)"`
- The shared builder is `finalsem/docs/build/build_deck.py`; its palette and fonts are at the top. Fill the `[Insert ...]` placeholders in the JSON before the talk.
