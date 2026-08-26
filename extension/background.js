importScripts("config.js");

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.contextMenus.create({
    id: "orbyva-open",
    title: "Abrir painel Orbyva",
    contexts: ["page", "selection", "link"],
  });
});

chrome.contextMenus.onClicked.addListener((_info, tab) => {
  if (!tab?.id) return;
  void chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "OPEN_PANEL" && sender.tab?.id) {
    void chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => undefined);
    sendResponse({ ok: true });
    return;
  }
  if (message?.type === "GET_ORIGIN") {
    sendResponse({ origin: ORBYVA_ORIGIN });
  }
});
