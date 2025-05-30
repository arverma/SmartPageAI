// Background script for handling messages and side panel state

import { DEFAULT_PROMPTS } from './constants/defaultPrompts.js';

// Inlined StorageService logic (no ES module imports)
async function getApiKey() {
  const result = await chrome.storage.sync.get('apiKey');
  return result.apiKey;
}

async function saveApiKey(apiKey) {
  await chrome.storage.sync.set({ apiKey });
}

async function getCustomPrompts() {
  const result = await chrome.storage.sync.get('customPrompts');
  if (!result.customPrompts || result.customPrompts.length === 0) {
    await initializeDefaultPrompts();
    return DEFAULT_PROMPTS;
  }
  return result.customPrompts;
}

async function initializeDefaultPrompts() {
  await chrome.storage.sync.set({ customPrompts: DEFAULT_PROMPTS });
}

async function saveCustomPrompt(prompt) {
  const prompts = await getCustomPrompts();
  if (!prompts.includes(prompt)) {
    prompts.push(prompt);
    await chrome.storage.sync.set({ customPrompts: prompts });
  }
}

async function deleteCustomPrompt(promptId) {
  const prompts = await getCustomPrompts();
  const updatedPrompts = prompts.filter(p => p.id !== promptId);
  await chrome.storage.sync.set({ customPrompts: updatedPrompts });
}

let panelState = {}; // Keeps track of side panel state per tab

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'saveApiKey':
      saveApiKey(request.apiKey)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      break;

    case 'savePrompt':
      saveCustomPrompt(request.prompt)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      break;

    case 'deletePrompt':
      deleteCustomPrompt(request.promptId)
        .then(() => sendResponse({ success: true }))
        .catch(error => sendResponse({ error: error.message }));
      break;

    case 'getCustomPrompts':
      getCustomPrompts()
        .then(prompts => sendResponse({ prompts }))
        .catch(error => sendResponse({ error: error.message }));
      break;

    case 'captureAndSummarize':
      handleCaptureAndSummarize(request, sendResponse);
      break;
  }
  // Full page screenshot logic
  if (request.type === 'START_FULL_PAGE_CAPTURE') {
    // Prefer sender.tab.id (the tab where the side panel is open)
    const targetTabId = sender.tab && sender.tab.id ? sender.tab.id : null;
    const sendCaptureMessage = (tabId, showModal, retry = false) => {
      chrome.tabs.sendMessage(tabId, { type: 'START_FULL_PAGE_CAPTURE', showModal }, (response) => {
        if (chrome.runtime.lastError) {
          const errMsg = chrome.runtime.lastError.message;
          // Only try to inject if not already retried and error is receiving end does not exist
          if (!retry && errMsg.includes('Could not establish connection. Receiving end does not exist.')) {
            chrome.scripting.executeScript({
              target: { tabId: tabId },
              files: ['src/fullPageCapture.js']
            }, () => {
              // Retry once after injection
              sendCaptureMessage(tabId, showModal, true);
            });
          } else if (!errMsg.includes('Could not establish connection. Receiving end does not exist.')) {
            // Only log other errors
            console.error('[WebPage Assistance] Error sending START_FULL_PAGE_CAPTURE:', errMsg);
            sendResponse({ started: false, error: 'Full page screenshot is not available on this page.' });
          } else {
            // Suppress the error after retry
            sendResponse({ started: false, error: 'Full page screenshot is not available on this page.' });
          }
        } else {
          sendResponse({ started: true });
        }
      });
    };
    if (targetTabId) {
      sendCaptureMessage(targetTabId, request.showModal);
    } else {
      // Fallback: find the active tab in the last focused window
      chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const pageTab = tabs.find(tab =>
          !tab.url.startsWith('chrome://') &&
          !tab.url.startsWith('chrome-extension://')
        );
        if (pageTab) {
          sendCaptureMessage(pageTab.id, request.showModal);
        } else {
          sendResponse({ started: false, error: 'No suitable page tab found' });
        }
      });
    }
    return true;
  }
  if (request.type === 'FULL_PAGE_CAPTURE_DONE') {
    chrome.runtime.sendMessage({ type: 'FULL_PAGE_CAPTURE_DONE', dataUrl: request.dataUrl }, () => {
      if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes('Could not establish connection. Receiving end does not exist.')) {
        // Suppress this error
        return;
      }
    });
    return true;
  }
  if (request.type === 'FULL_PAGE_CAPTURE_REQUEST') {
    console.log('[WebPage Assistance] Background received FULL_PAGE_CAPTURE_REQUEST');
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  }
  return true; // Keep the message channel open for async responses
});

// Dummy listener to prevent 'Could not establish connection' error for FULL_PAGE_CAPTURE_DONE
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'FULL_PAGE_CAPTURE_DONE') {
    // No-op: prevents warning if no one is listening
    return;
  }
});

async function handleCaptureAndSummarize(request, sendResponse) {
  try {
    const screenshotUrl = await captureVisibleTab();
    const prompt = request.customPrompt || "Please summarize the content of this webpage.";
    const base64Image = screenshotUrl.split(",")[1];

    const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      body: JSON.stringify({
        model: "o4-mini",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
      }),
    });

    const result = await openaiRes.json();
    if (result.error) {
      sendResponse({ error: result.error.message });
    } else {
      sendResponse({
        result: result.choices[0].message.content,
        screenshot: screenshotUrl,
      });
    }
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

function captureVisibleTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (screenshotUrl) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(screenshotUrl);
      }
    });
  });
}

chrome.action.onClicked.addListener((tab) => {
  const tabId = tab.id;

  if (panelState[tabId]) {
    // Panel is open → close it
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: false,
    });
    panelState[tabId] = false;
    console.log("🔒 Side panel closed");
  } else {
    // Panel is closed → open it
    chrome.sidePanel.setOptions({
      tabId: tabId,
      path: "popup.html",
      enabled: true,
    });

    chrome.sidePanel.open({ tabId: tabId });
    panelState[tabId] = true;
    console.log("🔓 Side panel opened");
  }
});
