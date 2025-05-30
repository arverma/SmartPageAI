import { AppState } from './src/state.js';
import { PopupUI} from './src/components/popup/PopupUI.js';
import { SettingsUI } from './src/components/settings/SettingsUI.js';
import { OpenAIService, GeminiService } from './src/services/api.js';
import { captureVisibleTab, extractWebpageContent } from './src/utils/helpers.js';
import { MODEL_LIST } from './src/constants/models.js';

let popupUI, settingsUI;

// Accordion logic for provider settings
function setupProviderAccordion() {
  const sections = document.querySelectorAll('.provider-section');
  sections.forEach(section => {
    const header = section.querySelector('.provider-header');
    const body = section.querySelector('.provider-body');
    header.addEventListener('click', () => {
      const isActive = section.classList.contains('active');
      if (isActive) {
        section.classList.remove('active');
        body.style.display = 'none';
      } else {
        section.classList.add('active');
        body.style.display = 'block';
      }
    });
    // Optionally expand OpenAI by default
    if (section.dataset.provider === 'openai') {
      section.classList.add('active');
      body.style.display = 'block';
    }
  });
}

// Provider API key state management
const PROVIDERS = ['openai', 'gemini'];

function saveProviderApiKey(provider, key) {
  chrome.storage.local.get(['apiKeys'], (result) => {
    const apiKeys = result.apiKeys || {};
    apiKeys[provider] = key;
    chrome.storage.local.set({ apiKeys });
  });
}

function loadProviderApiKeys() {
  chrome.storage.local.get(['apiKeys'], (result) => {
    const apiKeys = result.apiKeys || {};
    PROVIDERS.forEach(provider => {
      const input = document.getElementById(`${provider}ApiKey`);
      if (input) input.value = apiKeys[provider] || '';
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await AppState.initialize();

  popupUI = new PopupUI();
  settingsUI = new SettingsUI();

  // Subscribe UI components to state changes
  AppState.subscribe((state) => {
    popupUI.render(state);
    settingsUI.render(state);
  });

  // Initial render
  popupUI.render(AppState.state);
  settingsUI.render(AppState.state);

  // Load saved selections
  chrome.storage.local.get(['selectedModel', 'selectedPrompt'], (result) => {
    if (result.selectedModel) {
      document.getElementById('modelSelect').value = result.selectedModel;
    }
    if (result.selectedPrompt) {
      document.getElementById('promptSelect').value = result.selectedPrompt;
    }
  });

  // Save model selection when changed
  document.getElementById('modelSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedModel: e.target.value });
  });

  // Save prompt selection when changed
  document.getElementById('promptSelect').addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedPrompt: e.target.value });
  });

  // Handle assist button click
  document.getElementById('assist').addEventListener('click', async () => {
    const state = AppState.state;
    try {
      // Check for selected model and API key
      const modelSelect = document.getElementById('modelSelect');
      const selectedModel = modelSelect.value;
      // Get API keys from storage
      const apiKeys = await new Promise(resolve => {
        chrome.storage.local.get(['apiKeys'], (result) => resolve(result.apiKeys || {}));
      });
      const modelObj = MODEL_LIST.find(m => m.id === selectedModel);
      if (!selectedModel || !modelObj || !apiKeys[modelObj.provider]) {
        popupUI.showError('Please select a model and set its API key in settings');
        return;
      }
      // Use the current textarea value as the prompt
      const promptText = document.getElementById('mainCustomPrompt').value.trim();
      if (!promptText) {
        popupUI.showError('Please enter a prompt');
        return;
      }
      // Add Markdown formatting instruction suffix
      const markdownSuffix = "\n\nPlease format your response in Markdown. Use bullet points, numbered lists, and headings where appropriate. Be precise, concise, and correct in your answer.";
      const finalPrompt = promptText + markdownSuffix;
      // Show loading state
      popupUI.updateLoadingState(true);

      // Extract webpage content
      let webpageContent;
      try {
        webpageContent = await extractWebpageContent();
      } catch (error) {
        console.warn('Failed to extract webpage content:', error);
        // Continue without webpage content
      }

      // Screenshot mode logic
      const isDeepContext = AppState.state.isDeepContext;
      let screenshotUrl = null;
      if (!isDeepContext) {
        // Shallow context: only include webpage content, no screenshot
        screenshotUrl = null;
      } else {
        // Deep context: include webpage content + full page screenshot
        screenshotUrl = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({ type: 'START_FULL_PAGE_CAPTURE', showModal: false }, (response) => {
            if (response && response.error) {
              popupUI.showError(response.error);
              reject(new Error(response.error));
            }
          });
          // Listen for the result once
          const handler = (message, sender, sendResponse) => {
            if (message.type === 'FULL_PAGE_CAPTURE_DONE') {
              resolve(message.dataUrl);
              chrome.runtime.onMessage.removeListener(handler);
            }
          };
          chrome.runtime.onMessage.addListener(handler);
        });
      }
      // Instantiate the correct LLM service
      let llmService;
      if (modelObj.provider === 'openai') {
        llmService = new OpenAIService(apiKeys[modelObj.provider]);
      } else if (modelObj.provider === 'gemini') {
        llmService = new GeminiService(apiKeys[modelObj.provider]);
      } else {
        popupUI.showError('Unsupported provider: ' + modelObj.provider);
        return;
      }
      // Generate content
      const resultText = await llmService.generateContent(screenshotUrl, finalPrompt, selectedModel, webpageContent);
      // Update UI with results (pass screenshotUrl to updateResult)
      popupUI.updateResult(resultText, webpageContent, screenshotUrl);
      popupUI.updateScreenshot(screenshotUrl);
      popupUI.showSuccess('Assist Completed!');
    } catch (error) {
      popupUI.showError(error.message || 'Failed to generate result');
    } finally {
      // Hide loading state
      popupUI.updateLoadingState(false);
    }
  });

  document.getElementById('fullPageScreenshotBtn').addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'START_FULL_PAGE_CAPTURE', showModal: true }, (response) => {
      if (response && response.error) {
        alert(response.error);
      }
    });
  });

  document.getElementById('closeScreenshotModal').addEventListener('click', () => {
    document.getElementById('screenshotModal').classList.remove('show');
    document.getElementById('fullPageScreenshotPreview').src = '';
  });

  // Reset button clears all API keys and custom prompts, and shows a snackbar
  document.getElementById('resetPromptsBtn').addEventListener('click', async () => {
    if (!confirm('Are you sure you want to reset all API keys and custom prompts?')) return;
    await new Promise(resolve => chrome.storage.local.remove(['apiKeys'], resolve));
    await new Promise(resolve => chrome.storage.sync.remove(['apiKey', 'customPrompts'], resolve));
    // Restore default prompts in storage and state
    await AppState.resetPromptsToDefault();
    AppState.state.selectedModel = null;
    // Feedback
    const snackbar = document.getElementById('snackbar');
    if (snackbar) {
      snackbar.textContent = 'All API keys and custom prompts have been reset.';
      snackbar.classList.add('show');
      setTimeout(() => snackbar.classList.remove('show'), 2000);
    }
  });

  setupProviderAccordion();
  loadProviderApiKeys();
});
