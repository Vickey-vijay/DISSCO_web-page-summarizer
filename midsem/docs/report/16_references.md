# [nonum] References

1. Chrome for Developers. (n.d.). *Manifest V3*. Google. https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3 (accessed 20 October 2026). This is the reference for the extension platform used here, including background code that runs in a service worker.

2. Ruan, C. F., Qin, Y., Parthasarathy, A. R., et al. (2024). *WebLLM: A High-Performance In-Browser LLM Inference Engine*. arXiv:2412.15803. https://arxiv.org/abs/2412.15803. This is the in-browser engine considered for Version 2, which runs language models in the browser with WebGPU and WebAssembly.

3. Mozilla. (n.d.). *Readability.js*. GitHub, licensed under Apache-2.0. https://github.com/mozilla/readability. This is the library that pulls the main article text out of a page, and it is the source of the vendored copy in the extension.

4. Google AI for Developers. (2026). *Text generation* and *Using Gemini API keys*, Gemini API documentation. https://ai.google.dev/gemini-api/docs/text-generation. This is the reference for the cloud service called in Version 1 and for how the user's own key is used.

5. W3C. (2026). *WebGPU*, W3C Candidate Recommendation Draft, 15 September 2026. https://www.w3.org/TR/webgpu/. This is the specification of the GPU interface that Version 2 depends on, which is why a WebGPU check is part of the scope.

6. Liu, N. F., Lin, K., Hewitt, J., Paranjape, A., Bevilacqua, M., Petroni, F., & Liang, P. (2023). *Lost in the Middle: How Language Models Use Long Contexts*. arXiv:2307.03172. https://arxiv.org/abs/2307.03172. This paper shows that accuracy drops when the important information sits in the middle of a long input, which is one reason long pages are split into smaller parts.

7. Meta. (2024). *Llama 3.2: Revolutionizing edge AI and vision with open, customizable models*. Meta AI blog, 25 September 2024. https://ai.meta.com/blog/llama-3-2-connect-2024-vision-edge-mobile-devices/. This announces the 1B and 3B text models built for devices like laptops and phones, which is the size class tested for Version 2.

8. Chrome for Developers. (2025). *Summarize with built-in AI* (Summarizer API). Google. https://developer.chrome.com/docs/ai/summarizer-api. This is Chrome's own on-device summarizing interface, and its hardware, storage and language limits are part of the comparison in the project.
