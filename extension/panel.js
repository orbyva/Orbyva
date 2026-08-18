const iframe = document.getElementById("app");
const origin = ORBYVA_ORIGIN.replace(/\/$/, "");
iframe.src = `${origin}/ext`;

const SOURCE = "orbyva-extension";
let lastPage = null;

function postToApp(message) {
  const win = iframe.contentWindow;
  if (!win) return;
  win.postMessage({ source: SOURCE, ...message }, origin);
}

function requestPageFromTab(tabId) {
  chrome.tabs.sendMessage(tabId, { type: "REQUEST_PAGE" }, (response) => {
    if (chrome.runtime.lastError) return;
    if (response?.payload) {
      lastPage = response.payload;
      postToApp({ type: "PAGE_CONTEXT", payload: lastPage });
    }
  });
}

iframe.addEventListener("load", () => {
  postToApp({ type: "HELLO" });
  if (lastPage) postToApp({ type: "PAGE_CONTEXT", payload: lastPage });
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id) requestPageFromTab(tab.id);
  });
});

window.addEventListener("message", (event) => {
  if (event.origin !== origin) return;
  if (event.data?.source === "orbyva-ext-app" && event.data.type === "READY") {
    postToApp({ type: "HELLO" });
    if (lastPage) postToApp({ type: "PAGE_CONTEXT", payload: lastPage });
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "PAGE_CONTEXT" && message.payload) {
    lastPage = message.payload;
    postToApp({ type: "PAGE_CONTEXT", payload: lastPage });
  }
});

chrome.tabs.onActivated.addListener((info) => {
  requestPageFromTab(info.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    requestPageFromTab(tabId);
  }
});
