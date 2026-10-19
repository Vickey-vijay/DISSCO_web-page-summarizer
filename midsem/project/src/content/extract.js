// Injected into the active tab AFTER src/lib/readability.js (same isolated world).
// Returns the main text of the page. The last expression of this file is the return value
// that chrome.scripting.executeScript hands back to the service worker.
//
// Plain script (not an ES module) because injected files cannot use import/export.

(() => {
  const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'canvas', 'iframe']);
  const BLOCK_TAGS = new Set([
    'address', 'article', 'aside', 'blockquote', 'dd', 'details', 'div', 'dl', 'dt', 'figcaption',
    'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav',
    'ol', 'p', 'pre', 'section', 'table', 'tr', 'ul',
  ]);

  // Turns an HTML fragment into text with a blank line between blocks, so the chunker
  // later sees real paragraphs. DOMParser builds an inert document: no scripts run and
  // no images load while we read it.
  function htmlToText(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    const walk = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out.push(node.nodeValue);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();
      if (SKIP_TAGS.has(tag)) return;
      if (tag === 'br') {
        out.push('\n');
        return;
      }
      const block = BLOCK_TAGS.has(tag);
      if (block) out.push('\n\n');
      for (const child of node.childNodes) walk(child);
      if (block) out.push('\n\n');
    };
    walk(doc.body);
    return out.join('');
  }

  function tidy(text) {
    return text
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t ]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  try {
    let title = document.title || '';
    let text = '';
    let method = 'readability';

    if (typeof Readability === 'function') {
      // Readability edits the document it is given, so work on a copy.
      const article = new Readability(document.cloneNode(true)).parse();
      if (article && article.content) {
        text = tidy(htmlToText(article.content));
        if (article.title) title = article.title;
      }
    }

    // Pages Readability cannot make sense of (apps, dashboards): fall back to the rendered text.
    if (text.length < 200) {
      const fallback = tidy(document.body ? document.body.innerText : '');
      if (fallback.length > text.length) {
        text = fallback;
        method = 'fallback-innerText';
      }
    }

    return { ok: true, title: tidy(title), url: location.href, text, method, length: text.length };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
})();
