const OPEN_DEDUPE_WINDOW_MS = 20_000;
const openedRecently = new Map();

function normalizeUrl(raw) {
  try {
    const u = new URL(raw);

    u.hash = '';
    return u.toString();
  } catch {
    return raw || '';
  }
}

function makeDedupeKey({ url, accountNumber, dedupeKey }) {
  if (dedupeKey) return dedupeKey;
  const nurl = normalizeUrl(url || '');
  return `${nurl}|${accountNumber || ''}`;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of openedRecently.entries()) {
    if (now - ts > OPEN_DEDUPE_WINDOW_MS * 3) openedRecently.delete(key);
  }
}, 60_000);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.action === 'openAccountTab' && msg.url) {
    const key = makeDedupeKey(msg);
    const now = Date.now();
    const last = openedRecently.get(key) || 0;

    if (now - last < OPEN_DEDUPE_WINDOW_MS) {
      sendResponse({ ok: true, deduped: true });
      return;
    }

    openedRecently.set(key, now);

    chrome.tabs.create({ url: msg.url, active: false }, (tab) => {
      sendResponse({ ok: !!tab, tabId: tab?.id || null });
    });

    return true;
  }

  return false;
});
