// Small URL helper shared by the service worker and the popup.

/** True when two URLs are the same page, ignoring the #fragment (in-page links). */
export function samePage(a, b) {
  const strip = (u) => String(u ?? '').split('#')[0];
  return strip(a) === strip(b);
}
