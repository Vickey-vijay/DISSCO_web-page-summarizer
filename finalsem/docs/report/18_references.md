# [nonum] References

The list below holds the only external sources used in this part of the report. Each entry gives the address and a short plain description of what the source is and how the project uses it. The access date is to be filled in when the report is submitted.

1. **WebLLM.** https://github.com/mlc-ai/web-llm and https://webllm.mlc.ai. The open-source browser library that loads the language model and runs it on the graphics card. The project uses version 0.2.86, copied into `src/lib/web-llm.js` with its licence text. [accessed: insert date]

2. **MLC LLM.** https://llm.mlc.ai. The compiler and deployment project that WebLLM's code refers to. The extension does not call it directly. The compiled model library that WebLLM downloads is published in a repository of the same organization, named in `src/lib/web-llm.js`. [accessed: insert date]

3. **Chrome offscreen API.** https://developer.chrome.com/docs/extensions/reference/api/offscreen. Chrome's reference for the hidden page that an extension may open to do heavy work. The project uses it to hold the model in `src/offscreen/`. [accessed: insert date]

4. **Chrome extension manifest V3 migration guide.** https://developer.chrome.com/docs/extensions/develop/migrate. Chrome's guide to the Manifest V3 extension format, which the project's `manifest.json` uses. [accessed: insert date]

5. **WebGPU specification.** https://www.w3.org/TR/webgpu/. The W3C specification of the browser interface to the graphics card, which the model uses to run. [accessed: insert date]

6. **Mozilla Readability.** https://github.com/mozilla/readability. The article-reading library, copied into `src/lib/readability.js`, that finds the main text of a page. [accessed: insert date]

7. **Llama 3.2 model card (1B Instruct).** https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct. The model card of the 1 billion parameter model that is the project's default. [accessed: insert date]

8. **SmolLM2 model card (360M Instruct).** https://huggingface.co/HuggingFaceTB/SmolLM2-360M-Instruct. The description of the 360 million parameter model that the project uses as its fallback and on integrated graphics. [accessed: insert date]

9. **Playwright.** https://playwright.dev. The browser automation tool that runs the browser tests and the real-model script. [accessed: insert date]
