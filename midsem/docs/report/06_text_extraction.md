# Text extraction

## What this part does and why it exists

Before a summary can be made, the extension needs the words of the page. This step is called extraction. It reads the page the reader has open, keeps the main article text, removes what is not article text (menus, cookie notices, adverts and footers), and passes the clean text to the next step.

A web page is built from HTML, the markup that tells a browser which part is a heading, a paragraph or a menu. Copying every word would waste the model's input on navigation links, cookie banners and footers.

Extraction also decides when to stop. A page with almost no readable text, or a page that Chrome does not let an extension read, is refused before any request is sent.

## How it works

Extraction is split between the service worker (the background script Chrome runs for the extension) and a small script that runs inside the page. The steps follow `midsem/project/src/background/extract-tab.js` and `midsem/project/src/content/extract.js`.

**Step 1: check the address.** The service worker asks Chrome for the tab's address. If the address starts with a scheme Chrome keeps for itself (`chrome://`, `edge://`, `about:`, `view-source:`, `file:`, `data:` or `blob:`), or the page is the Chrome Web Store, the code stops with RESTRICTED_PAGE. No request is sent. Test T10 opens `chrome://version` and checks this result with zero requests.

**Step 2: inject the reader.** Chrome lets the extension run two small scripts inside the tab, a content script (a script that runs inside the page you are reading). They are Readability and then `extract.js`. Only the main page is read, because the call does not ask Chrome to include frames. If Chrome refuses the script, the error text decides the code. A permission-type refusal becomes RESTRICTED_PAGE, and any other failure becomes EXTRACT_FAILED.

**Step 3: find the article.** Readability is a library maintained by Mozilla, and it is the library behind Reader View in Firefox. The extension gives it a copy of the page (`document.cloneNode(true)`), so the page on screen is not changed. Readability returns the main article as HTML. The library is copied into the project as one file, its Apache 2.0 licence sits beside it, and no build tool is needed.

**Step 4: turn the article into plain text.** `extract.js` walks the tags and skips `script`, `style`, `noscript`, `template`, `svg`, `canvas` and `iframe` contents. Blocks such as paragraphs, headings, list items and tables start on a new line. Table cells are separated by " | ", and each row ends on its own line. Repeated spaces are collapsed, and runs of blank lines are cut to one.

**Step 5: fall back to the visible text.** If the article text is under 200 characters, the code reads the text the browser shows for the page body, and keeps it only when it is longer. This covers dashboards and app-style pages where Readability finds no article.

midsem/project/src/content/extract.js, lines 71 to 77:

```js
    if (text.length < 200) {
      const fallback = tidy(document.body ? document.body.innerText : '');
      if (fallback.length > text.length) {
        text = fallback;
        method = 'fallback-innerText';
      }
    }
```

**Step 6: check the length.** The pipeline (`midsem/project/src/core/pipeline.js`) cleans the whitespace again. If fewer than 200 characters remain, the code raises TOO_LITTLE_TEXT and stops. The popup shows "This page has too little readable text to summarize." and no request is made.

![Extraction flow, from the tab address to the clean text](../figures/F05_extraction_flow.png)

Reading the figure: two columns. The left column is the service worker. It reads the tab address, checks for a restricted address, injects the two scripts and checks the result. The right column is the tab. It clones the page, runs Readability, converts the article to text and returns the title, address, text and method name. The arrow labelled "result" carries that answer back to the "Result ok?" check, which either returns the text or stops with EXTRACT_FAILED.

### What this means in plain words

The extension copies the page, picks out the article with a known library, turns it into plain text, and uses the visible text only when the article is too short. Each known failure becomes a short popup message.

## Design decisions

Table: Options considered for finding the article text

| Option | Decision | Reason |
|---|---|---|
| Mozilla Readability, copied into the project as one file | Chosen | Built to drop menus, adverts and footers. No build step is needed. |
| Hand-written heuristics, meaning the project's own rules for finding the main block | Rejected | The V1 plan judged a purpose-built library better for this job. |
| The whole visible text of the page | Kept only as a fallback | It includes menus, cookie text and footers. |

The trade-offs are one extra third-party file with a licence to credit, and the chance that Readability drops real text on an unusual layout. The fallback helps only when Readability returns very little.

### What this means in plain words

The project uses a known article finder with a simple fallback. It accepts that the finder sometimes misses text on unusual pages.

## Worked example

The fixture page `article-short.html` shows the effect of extraction. The page held 2164 visible characters. The text sent to the model had 1711 characters, so 453 characters (about 21 percent) were removed. The raw text began "Harbour Daily HomeWorldScienceTravelSubscribe How a Lighthouse Lens Works". The text sent to the model began "A lighthouse lamp on its own is weak." The page held six kinds of noise: "SUBSCRIBE NOW", "Accept all cookies", "Related articles", "Advertise with us", "SPONSORED" and "Terms of use". None reached the model (`midsem/docs/test-runs/examples.md`).

Table: Extraction results on the fixture pages (examples.md)

| Page | Outcome | Method | Characters |
|---|---|---|---|
| article-short.html | Summarized | readability | 1711 |
| dashboard.html | Summarized | fallback-innerText | 384 |
| late-content.html (300 ms delay) | Summarized | readability | 602 |
| near-empty.html | Refused: too little readable text | none | none |

The real pages in the live runs also used the readability method. The Wikipedia article on lighthouses gave 36,752 characters (L04), and the Wikipedia article on Fresnel lenses gave 48,289 characters (L05) (`midsem/docs/test-runs/live-measurements.md`).

## Failure cases and how they are handled

- **Restricted page.** Refused before any request (T10).
- **Almost no text.** Refused with TOO_LITTLE_TEXT and no request (T02, near-empty page).
- **Script refused by Chrome.** RESTRICTED_PAGE or EXTRACT_FAILED, depending on the error text.
- **Late text.** The extension does not wait. It reads the page when Summarize is pressed. A page whose text arrives 500 ms after load is summarized (T12). A page whose text is still missing is refused (T12b).

## What went wrong while building it

The table bug (B3) was the most serious extraction problem. On `table-article.html`, the model received "QuarterRevenueMargin" and "Q14.5M12%" instead of separate cells. The popup still showed a normal summary, so nothing on screen revealed the damage (`run-1.md`).

The cause was that the text walker added no separator between cells. The fix puts " | " between cells and ends each row on its own line, so a row reads "Q1 | 4.5M | 12%". The first attempt made every row its own paragraph, and test T21 caught that too. Run 2 tightened T21 to require the single-line format, and then passed 26 of 26 browser scenarios.

Test T12b also had a timing problem. Its page started a timer on load, so under load the text had arrived before the test pressed Summarize. The delay was raised from 4 seconds to 20 seconds (`run-1.md`, section 3).

### What this means in plain words

The most serious bug changed numbers in the text the model read and showed no error. The lesson recorded is that silent damage is worse than a visible error, so the test uses markup that real sites produce, with no spaces between cells.

## How it was tested

- `midsem/project/tests/e2e/smoke.test.js`: a short article, with noise removed before the model sees it.
- `midsem/project/tests/e2e/pipeline.test.js`: T02 (near-empty page), T10 (restricted page), T12 and T12b (late content), T13 (dashboard fallback) and T21 (table cells).
- Six fixture pages in `midsem/project/tests/fixtures/`.
- No unit test calls `extract.js` directly. The browser scenarios check it. The chunker unit tests cover the text after extraction.

## Limitations

- **Frames.** Text inside an iframe is not read. Not tested with a real framed page.
- **Pages behind a login.** The extension reads only what the tab shows and does not sign in. A page showing only a sign-in form gives a summary of that form, or a too-little-text refusal. Not tested with a real login.
- **Text drawn without HTML.** Text on a `canvas` or inside `svg` is skipped, and the fallback cannot see it either. Not tested.
- **Few live sites.** Four real websites (L04 to L07) were run live, plus fixture pages.

## Questions this chapter answers

**Why not copy the whole page?**
Menus, cookie notices and footers would reach the model and dilute the summary. Extraction keeps the article and drops the rest.

**What happens when a page has almost no text?**
The extension stops before any request is sent and shows the too-little-text message. The check uses 200 characters, the same limit as the fallback step.

**Why was the table bug not caught by eye?**
The summary on screen looked normal, and the popup reported success. The model had been given fused numbers such as "Q14.5M12%". Only a test that inspects the text sent to the model could show the problem.

**What would break first on a page drawn with a canvas?**
The text is not in the page's HTML, so neither Readability nor the visible-text fallback can read it. The most likely result is the too-little-text message. This case has not been tested.
