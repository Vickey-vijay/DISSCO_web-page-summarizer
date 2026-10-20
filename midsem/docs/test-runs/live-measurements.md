# Live runs against the real Gemini API

Model `gemini-3.5-flash-lite`, thinking level `low`, default part size 8000 characters. Headless Chromium (hidden window), extension loaded, real pages. Times are measured by the test, not estimated.

| ID | Page | Text chars | Parts | Requests | Merge levels | Extraction | Total time (s) | Outcome |
|---|---|---|---|---|---|---|---|---|
| L01 | Short article (fixture) | 1711 | 1 | 1 | 0 | readability | 1.7 | summary |
| L02 | Long article (fixture), default limit | 10532 | 2 | 3 | 1 | readability | 5.9 | summary |
| L03 | Long article (fixture), 3,000-character parts | 10532 | 4 | 5 | 1 | readability | 7.2 | summary |
| L04 | Wikipedia: Lighthouse | 36752 | 5 | 6 | 1 | readability | 17.8 | summary |
| L05 | Wikipedia: Fresnel lens | 48289 | 7 | 8 | 1 | readability | 23 | summary |
| L06 | Chrome docs: Manifest V3 | 521 | 1 | 1 | 0 | readability | 1.9 | summary |
| L07 | MDN: WebGPU API | 29599 | 4 | 5 | 1 | readability | 7.5 | summary |
| L08 | Wikipedia: World War II (very long), page limit lowered to 10 parts | - | - | - | - | - | 0.6 | error (TOO_LONG) |
| L09 | Wrong API key, real service | - | - | - | - | - | 0.5 | error (INVALID_KEY) |
