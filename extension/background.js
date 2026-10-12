import { handleCapture, refreshBadge } from './lib/sync.js';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'capture') {
    handleCapture(msg).then(
      () => sendResponse({ ok: true }),
      e => sendResponse({ ok: false, error: String(e) })
    );
    return true;
  }
});

chrome.runtime.onInstalled.addListener(refreshBadge);
chrome.runtime.onStartup.addListener(refreshBadge);
