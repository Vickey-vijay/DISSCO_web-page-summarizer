# Live runs against the real Gemini API

Model `gemini-3.8-flash`, thinking level `low`, default part size 8000 characters. Visible Chromium, extension loaded, real pages. Times are measured by the test, not estimated.

| ID | Page | Text chars | Parts | Requests | Merge levels | Extraction | Total time (s) | Outcome |
|---|---|---|---|---|---|---|---|---|
| L03 | Long article (fixture), 3,000-character parts | 10532 | 4 | 6 | 2 | readability | 51.4 | summary |
| L04 | Wikipedia: Lighthouse | - | - | - | - | - | 15.4 | error (RATE_LIMIT) |
| L05 | Wikipedia: Fresnel lens | - | - | - | - | - | 15.7 | error (RATE_LIMIT) |
| L06 | Chrome docs: Manifest V3 | - | - | - | - | - | 15.6 | error (RATE_LIMIT) |
| L07 | MDN: WebGPU API | - | - | - | - | - | 15.6 | error (RATE_LIMIT) |
| L08 | Wikipedia: World War II (very long), page limit lowered to 10 parts | - | - | - | - | - | 0.7 | error (TOO_LONG) |
| L09 | Wrong API key, real service | - | - | - | - | - | 0.2 | error (INVALID_KEY) |
