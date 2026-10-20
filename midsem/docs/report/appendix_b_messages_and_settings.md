# [nonum] Appendix B: Messages and Settings

The first table lists the error messages from core/errors.js, exactly as the code writes them. The text in braces is filled in when the message appears.

## B.1 Error messages

| Code | Exact text | When it appears | What to do |
|---|---|---|---|
| NO_KEY | No API key yet. Paste your Gemini key in the Key box and save it. | Summarize is pressed and no key is saved. No request is sent. | Paste the key in the Key box or on the Options page. |
| INVALID_KEY | Your API key was rejected. Paste a correct key in the Key box. | Google rejects the key. Not retried. | Check the key for typing mistakes, or copy a new one from AI Studio. |
| RATE_LIMIT | The free tier is busy right now. Wait a minute and try again. | Google answers 429 on the first try and on all three retries. | Wait a minute and press Summarize again. |
| QUOTA_EXHAUSTED | The free-tier limit for your API key is used up for now. Try again {wait}, or use a different key. | Google asks for a wait longer than 25 seconds. No retry. {wait} reads "in about a minute", "in about 12 minutes" or "later". | Wait for the time shown, or use another key. |
| NETWORK | Cannot reach the service. Check your internet connection. | The request fails before any answer. Not retried. | Check the connection and try again. |
| TIMEOUT | The service took too long to answer. Try again. | No answer within 25 seconds. Not retried. | Press Summarize again. |
| SERVICE_ERROR | The service had a problem. Try again in a moment. | Google answers 500 to 504 after the retries, or another unexpected error. | Wait a moment and try again. |
| TOO_LITTLE_TEXT | This page has too little readable text to summarize. | Fewer than 200 characters are found. No request is sent. | Try a page with more text. |
| TOO_LONG | This page is too long for Version 1 to summarize. Try a shorter page. | The page needs more than 30 parts. No request is sent. | Try a shorter page. |
| RESTRICTED_PAGE | Chrome does not allow extensions to read this page. | Chrome settings pages, the Chrome Web Store, file and blank pages. No request is sent. | Open an ordinary web page. |
| EXTRACT_FAILED | Could not read the text of this page. | The extractor returns nothing or cannot be injected. | Reload the page and try again. |
| EMPTY_OR_BLOCKED | The model returned no summary for this page. | The answer has no text, or Google blocks it for safety. Not retried. | Try again. If it repeats, try another page. |
| INTERRUPTED | The summary was interrupted. Press Summarize to try again. | Chrome stopped the background worker mid-job, or a job has had no update for 3 minutes. | Press Summarize again. |
| CANCELLED | Cancelled. | The tab moved to another page or was closed. The popup never shows it. | Nothing to do. |

Other short messages come from the popup and the Options page:

- "Paste your Gemini key to begin." (popup, no key saved)
- "Reading the page...", "Summarizing part N of M...", "Combining N summaries..." (popup, progress)
- "The service is busy. Trying again in N s (attempt x of y)." (popup, retry)
- "Key saved. Now press Summarize." and "Paste a key first." (popup key box)
- "Saved. You can close this tab and press Summarize." (Options page)

## B.2 Settings

The defaults are in core/config.js. A user never edits them. The keys stored in chrome.storage.local can override some of them. Only the apiKey is meant for users. The others are test seams, which let the browser tests point at the mock service and force retries, timeouts and several parts on a short page.

| Setting | Default | Plain description | Test only? |
|---|---|---|---|
| model | gemini-3.5-flash-lite | The Google model that writes the summaries, chosen by measurement. | No |
| thinkingLevel | low | How much the model thinks before it answers. Low keeps answers fast. | No |
| apiBaseUrl | https://generativelanguage.googleapis.com | The address the requests go to. | Yes, tests point it at the mock service |
| chunkChars | 8000 | The longest part sent in one request, in characters. | Yes, tests force small parts |
| minTextChars | 200 | Pages with less text than this are refused. | No |
| maxChunks | 30 | Pages that need more parts than this are refused. | Yes, tests lower it |
| requestTimeoutMs | 25000 | How long to wait for one answer, in milliseconds. | Yes, tests shorten it |
| maxRetries | 3 | How many times a 429 or 5xx answer is retried. | No |
| retryBaseDelayMs | 2000 | The first retry wait. It doubles on each retry. | Yes, tests shorten it |
| temperature | 0.2 | A low value keeps the summary close to the page text. | No |
| apiKey | none (empty) | The user's key, kept in chrome.storage.local and never synced to the Google account. | No |

The config file calls chunkChars a test seam, but its default of 8000 is also the size used in normal use.

## What this means in plain words

Each message says what happened and what to do next. Technical detail, such as the HTTP status or the reason for a block, goes to the console and the job record, not to the screen. All limits sit in one file, so a change to a page size or a timeout is made in one place.
