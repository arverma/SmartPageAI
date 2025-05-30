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
      assist: document.getElementById('assist'),
      contextModeToggle: document.getElementById('contextModeToggle')
    };
    this._setupListeners();
  }

  _setupListeners() {
    this.elements.toggleSettings.addEventListener('click', () => this.toggleSettings());
    this.elements.promptSelect.addEventListener('change', (e) => this.handlePromptChange(e));
    this.elements.mainCustomPrompt.addEventListener('input', () => this.autoResizeTextarea());
    this.elements.modelSelect.addEventListener('change', (e) => this.handleModelChange(e));
    this.elements.contextModeToggle.addEventListener('change', (e) => this.handleContextModeChange(e));
  }

  toggleSettings() {
    const isVisible = this.elements.settingsPanel.style.display !== 'none';
    this.elements.settingsPanel.style.display = isVisible ? 'none' : 'block';
    this.elements.mainPromptArea.style.display = isVisible ? 'block' : 'none';
  }

  handlePromptChange(event) {
    const selectedPromptId = event.target.value;
    AppState.setSelectedPromptId(selectedPromptId);
    // Update the textarea with the selected prompt's text
    const selectedPrompt = AppState.state.customPrompts.find(p => p.id === selectedPromptId);
    if (selectedPrompt) {
      this.elements.mainCustomPrompt.value = selectedPrompt.text;
    }
  }

  handleModelChange(event) {
    const selectedModel = event.target.value;
    AppState.setSelectedModel(selectedModel);
  }

  handleContextModeChange(event) {
    const isDeep = event.target.checked;
    AppState.setContextMode(isDeep);
  }

  autoResizeTextarea() {
    const textarea = this.elements.mainCustomPrompt;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight + 2, 60); // 120px max
    textarea.style.height = newHeight + 'px';
  }

  async render(state) {
    // Update model select
    const modelSelect = this.elements.modelSelect;
    modelSelect.innerHTML = MODEL_LIST.map(model => 
      `<option value="${model.id}" ${state.selectedModel === model.id ? 'selected' : ''}>${model.name}</option>`
    ).join('');

    // Update prompt select
    const promptSelect = this.elements.promptSelect;
    promptSelect.innerHTML = state.customPrompts.map(prompt => 
      `<option value="${prompt.id}" ${state.selectedPromptId === prompt.id ? 'selected' : ''}>${prompt.name}</option>`
    ).join('');

    // Update textarea with selected prompt text
    const selectedPrompt = state.customPrompts.find(p => p.id === state.selectedPromptId);
    if (selectedPrompt) {
      this.elements.mainCustomPrompt.value = selectedPrompt.text;
    }

    // Update context mode toggle
    if (this.elements.contextModeToggle) {
      this.elements.contextModeToggle.checked = state.isDeepContext;
    }
  }

  updateResult(result, context, screenshotUrl) {
    // Render the Markdown output as before
    if (!result) {
      this.elements.result.innerHTML = '<div class="error">No result generated</div>';
      return;
    }
    this.elements.result.style.display = 'block';
    this.elements.result.innerHTML = marked.parse(result);

    // Render the context section (including screenshot) in the dedicated container
    const contextContainer = document.getElementById('contextContainer');
    if (contextContainer) {
      // Always show the context area for testing
      const { content = '', metadata = {} } = context || {};
      const contextHtml = `
        <div class="context-section">
          <button class="context-toggle">
            <span class="material-icons">expand_more</span>
            View Context Sent to Model
          </button>
          <div class="context-content">
            <div class="context-metadata">
              <strong>Title:</strong> ${metadata.title || ''}<br>
              <strong>URL:</strong> ${metadata.url || ''}<br>
              ${metadata.description ? `<strong>Description:</strong> ${metadata.description}<br>` : ''}
              ${metadata.author ? `<strong>Author:</strong> ${metadata.author}<br>` : ''}
              ${metadata.date ? `<strong>Date:</strong> ${metadata.date}<br>` : ''}
            </div>
            <div class="context-text">
              <strong>Content:</strong><br>
              <pre>${content}</pre>
            </div>
            ${screenshotUrl ? `<div class="context-screenshot"><strong>Screenshot:</strong><br><img src="${screenshotUrl}" alt="Screenshot preview" style="max-width:100%;border-radius:8px;margin-top:8px;" /></div>` : ''}
          </div>
        </div>
      `;
      contextContainer.innerHTML = contextHtml;
      contextContainer.style.display = 'block';
      // Add event listener for the toggle (CSP-safe)
      const toggleBtn = contextContainer.querySelector('.context-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function() {
          this.parentElement.classList.toggle('expanded');
        });
      }
    }
    // Always hide the main screenshot element
    if (this.elements.screenshot) {
      this.elements.screenshot.style.display = 'none';
      this.elements.screenshot.src = '';
    }
  }

  updateScreenshot(screenshotUrl) {
    // Only store the screenshot URL, do not display the image
    if (this.elements.screenshot) {
      this.elements.screenshot.src = screenshotUrl || '';
      this.elements.screenshot.style.display = 'none';
    }
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