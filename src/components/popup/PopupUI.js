import { AppState } from '../../state.js';
import { showSnackbar } from '../../utils/helpers.js';
import { MODEL_LIST } from '../../constants/models.js';

// PopupUI component for managing the main popup interface
export class PopupUI {
  constructor() {
    this.elements = {
      settingsPanel: document.getElementById('settingsPanel'),
      mainPromptArea: document.getElementById('mainPromptArea'),
      apiKey: document.getElementById('apiKey'),
      promptSelect: document.getElementById('promptSelect'),
      modelSelect: document.getElementById('modelSelect'),
      mainCustomPrompt: document.getElementById('mainCustomPrompt'),
      result: document.getElementById('result'),
      screenshot: document.getElementById('screenshot'),
      toggleSettings: document.getElementById('toggleSettings'),
      assist: document.getElementById('assist')
    };
    this._setupListeners();
  }

  _setupListeners() {
    this.elements.toggleSettings.addEventListener('click', () => this.toggleSettings());
    this.elements.promptSelect.addEventListener('change', (e) => this.handlePromptChange(e));
    this.elements.mainCustomPrompt.addEventListener('input', () => this.autoResizeTextarea());
    this.elements.modelSelect.addEventListener('change', (e) => this.handleModelChange(e));
  }

  toggleSettings() {
    const isVisible = this.elements.settingsPanel.style.display !== 'none';
    this.elements.settingsPanel.style.display = isVisible ? 'none' : 'block';
    this.elements.mainPromptArea.style.display = isVisible ? 'block' : 'none';
  }

  handlePromptChange(event) {
    const selectedPromptId = event.target.value;
    AppState.setSelectedPromptId(selectedPromptId);
    // Do NOT update the textarea here; let render() handle it.
  }

  handleModelChange(event) {
    AppState.setSelectedModel(event.target.value);
  }

  autoResizeTextarea() {
    const textarea = this.elements.mainCustomPrompt;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight + 2, 60); // 120px max
    textarea.style.height = newHeight + 'px';
  }

  async render(state) {
    // Debug log to check if render is called and what the state is
    this.renderPrompts(state);
    this.renderModels(state);
    // Always set textarea to the selected prompt's value ONLY if the user hasn't edited it
    if (state.customPrompts && state.customPrompts.length > 0) {
      const selected = state.customPrompts.find(p => p.id === state.selectedPromptId) || state.customPrompts[0];
      if (this.elements.mainCustomPrompt.value !== selected.text) {
        this.elements.mainCustomPrompt.value = selected.text;
        requestAnimationFrame(() => this.autoResizeTextarea());
      }
    } else {
      this.elements.mainCustomPrompt.value = '';
    }
  }

  renderPrompts(state) {
    const promptSelect = this.elements.promptSelect;
    promptSelect.innerHTML = '';
    if (!state.customPrompts || state.customPrompts.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'No prompts available';
      promptSelect.appendChild(option);
      return;
    }
    state.customPrompts.forEach(prompt => {
      const option = document.createElement('option');
      option.value = prompt.id;
      option.textContent = prompt.name;
      option.setAttribute('aria-label', prompt.name);
      promptSelect.appendChild(option);
    });
    // Set the select value to a valid prompt ID
    const validId = state.selectedPromptId && state.customPrompts.find(p => p.id === state.selectedPromptId) ? state.selectedPromptId : state.customPrompts[0].id;
    promptSelect.value = validId;
  }

  renderModels(state) {
    const modelSelect = this.elements.modelSelect;
    modelSelect.innerHTML = '';
    chrome.storage.local.get(['apiKeys'], (result) => {
      const apiKeys = result.apiKeys || {};
      const filteredModels = MODEL_LIST.filter(model => apiKeys[model.provider]);
      const grouped = {};
      filteredModels.forEach(model => {
        if (!grouped[model.provider]) grouped[model.provider] = [];
        grouped[model.provider].push(model);
      });
      if (filteredModels.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'No models available';
        modelSelect.appendChild(option);
        // Disable Assist button if no models
        this.elements.assist.disabled = true;
        return;
      }
      Object.keys(grouped).forEach(provider => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = provider.charAt(0).toUpperCase() + provider.slice(1);
        grouped[provider].forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = model.name;
          if (state.selectedModel === model.id) option.selected = true;
          optgroup.appendChild(option);
        });
        modelSelect.appendChild(optgroup);
      });
      // Enable Assist button if a model is selected
      this.elements.assist.disabled = !modelSelect.value;
    });
  }

  updateResult(result) {
    if (!result) {
      this.elements.result.innerHTML = '<div class="error">No result generated</div>';
      return;
    }
    this.elements.result.style.display = 'block';
    this.elements.result.innerHTML = marked.parse(result);
  }

  updateScreenshot(screenshotUrl) {
    if (!screenshotUrl) {
      this.elements.screenshot.style.display = 'none';
      return;
    }
    this.elements.screenshot.style.display = 'block';
    this.elements.screenshot.src = screenshotUrl;
  }

  updateLoadingState(isLoading) {
    if (isLoading) {
      this.elements.assist.disabled = true;
      this.elements.assist.innerHTML = 'Assist <span class="button-spinner"></span>';
      this.elements.result.innerHTML = '';
      this.elements.result.style.display = 'none';
      this.clearScreenshot();
    } else {
      this.elements.assist.disabled = false;
      this.elements.assist.innerHTML = 'Assist';
    }
  }

  clearScreenshot() {
    this.elements.screenshot.style.display = 'none';
    this.elements.screenshot.src = '';
  }

  showError(message) {
    showSnackbar(message, 'error');
  }

  showSuccess(message) {
    showSnackbar(message, 'success');
  }
} 