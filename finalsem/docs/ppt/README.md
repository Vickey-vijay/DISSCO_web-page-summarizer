# Version 2 final-semester deck

The slides for the Version 2 presentation, built from a JSON spec with the shared builder in `finalsem/docs/build/`.

## Files

| File | What it is |
|---|---|
| `final_deck.json` | The spec: 24 slides, layouts, text and speaker notes. Edit this to change the deck. |
| `build_final_deck.py` | Builds the `.pptx`. Imports `finalsem/docs/build/build_deck.py` (not copied, not edited) and adds one layout, `pair`, for two pictures side by side. |
| `FinalSem_Deck.pptx` | The deck, built from `final_deck.json`. |
| `export_previews.py` | Renders every slide to `preview/slide_NN.png` with PowerPoint, hidden (`WithWindow=False`). Uses `export_slides_png` from `midsem/docs/build/word_tools.py`, imported and not edited. |
| `preview/slide_01.png` to `slide_24.png` | One picture per slide, 1600 x 900 px, from the current `.pptx`. |

## Rebuild (Windows PowerShell)

Needs Python with `python-pptx`, `Pillow`, and `pywin32`, and Microsoft PowerPoint installed.

```powershell
cd "C:\Users\Vicke\OneDrive\Desktop\Python\COH_11\Jeffy\finalsem\docs\ppt"
python build_final_deck.py final_deck.json FinalSem_Deck.pptx
python export_previews.py "C:\Users\Vicke\OneDrive\Desktop\Python\COH_11\Jeffy\finalsem\docs\ppt\FinalSem_Deck.pptx" "C:\Users\Vicke\OneDrive\Desktop\Python\COH_11\Jeffy\finalsem\docs\ppt\preview"
```

The export step deletes the old `preview` folder and writes 24 new PNGs. It quits PowerPoint in a `finally` block. Check that no `POWERPNT` process is left running afterwards.

## Pictures

- The screenshots `ui-01`, `ui-04`, `ui-07` and `ui-12` are from `finalsem/docs/screenshots/`. They were made with the pretend model, and the captions say so.
- The `v2-*.png` screenshots (real model) are 380 px wide. At slide size their text is too small, so they are not used.
- The V figures (`finalsem/docs/figures/V01` to `V17`) are not embedded. Their text is about 7 to 9 pt at slide size (checked on V16), so their content is drawn as native tables on the slides.
