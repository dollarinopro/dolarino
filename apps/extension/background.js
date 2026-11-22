const DEFAULT_API_BASE = 'https://dollarino.pages.dev';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('dollarino-badge-sync', { periodInMinutes: 1 });
  syncBadgeState();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'dollarino-badge-sync') {
    syncBadgeState();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === 'SYNC_BADGE') {
    syncBadgeState().then(() => sendResponse({ ok: true })).catch(() => sendResponse({ ok: false }));
    return true;
  }
});

async function syncBadgeState() {
  try {
    const cfg = await chrome.storage.local.get(['apiBase', 'extKey']);
    const apiBase = (cfg.apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
    const extKey = (cfg.extKey || '').trim();
    if (!extKey) {
      await chrome.action.setBadgeText({ text: '' });
      return;
    }
    const res = await fetch(`${apiBase}/api/trading/overview`, {
      headers: { 'X-Dollarino-Extension-Key': extKey },
    });
    if (!res.ok) {
      await chrome.action.setBadgeText({ text: '!' });
      await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      return;
    }
    const data = await res.json();
    const state = data?.config?.bot_state || 'STOPPED';
    const isRunning = state === 'RUNNING_PAPER' || state === 'RUNNING_LIVE';
    const openCnt = Array.isArray(data?.openTrades) ? data.openTrades.length : 0;
    await chrome.action.setBadgeText({ text: isRunning ? (openCnt > 0 ? String(openCnt) : 'ON') : 'OFF' });
    await chrome.action.setBadgeBackgroundColor({ color: isRunning ? '#10b981' : '#64748b' });
  } catch {
    // ignore transient offline error
  }
}
