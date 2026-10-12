// ─── BRIDGE ─────────────────────────────────────────────────────────────────
// Relaie les données captées par inject.js (page) vers l'extension.
window.addEventListener('message', e => {
  if (e.source !== window || !e.data || !e.data.__laney) return;
  const { url, page, data, seenOnly, account, hello, probe } = e.data;
  try {
    chrome.runtime.sendMessage({ type: 'capture', url, page, data, seenOnly, account, hello, probe }).catch(() => {});
  } catch (err) {
    // Extension rechargée : la page doit être rafraîchie
  }
});
