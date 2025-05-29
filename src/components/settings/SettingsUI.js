import { AppState } from '../../state.js';
import { showSnackbar } from '../../utils/helpers.js';

// SettingsUI component for managing the settings panel
export class SettingsUI {
  constructor() {
    this.PROVIDERS = ['openai', 'gemini'];
    this.elements = {
      customPromptList: document.getElementById('customPromptList'),
      promptList: document.getElementById('promptList'),
      savePromptBtn: document.getElementById('savePromptBtn'),
      cancelEditBtn: null, // will be created dynamically
      settingsCustomPrompt: document.getElementById('settingsCustomPrompt'),
      promptName: document.getElementById('promptName'),
      promptFeedback: document.getElementById('promptFeedback'),
      resetPromptsBtn: document.getElementById('resetPromptsBtn'),
      advancedToggle: document.getElementById('advancedToggle')
    };
    this.editingPromptId = null;
    this._setupListeners();
  }

  _setupListeners() {
    // Provider API key listeners
    this.PROVIDERS.forEach(provider => {
      const input = document.getElementById(`${provider}ApiKey`);
      if (input) {
        input.addEventListener('change', (e) => {
          const key = e.target.value.trim();
          chrome.storage.local.get(['apiKeys'], (result) => {
            const apiKeys = result.apiKeys || {};
            apiKeys[provider] = key;
            chrome.storage.local.set({ apiKeys }, () => {
              // Show feedback
              const feedback = document.getElementById(`${provider}ApiKeyFeedback`);
              if (feedback) {
                feedback.textContent = 'Saved!';
                setTimeout(() => { feedback.textContent = ''; }, 1200);
              }
              // Notify state/UI to update model dropdown
              AppState.notify();
            });
          });
        });
      }
    });
    this.elements.savePromptBtn.addEventListener('click', () => this.handleSaveOrUpdatePrompt());
    this.elements.advancedToggle.addEventListener('click', () => {
      const btn = this.elements.resetPromptsBtn;
      const toggle = this.elements.advancedToggle;
      const isHidden = btn.style.display === 'none';
      btn.style.display = isHidden ? 'inline-flex' : 'none';
      toggle.textContent = isHidden ? 'Advanced ▲' : 'Advanced ▼';
    });
    this.elements.resetPromptsBtn.addEventListener('click', () => this.handleResetPrompts());
  }

  async handleSaveOrUpdatePrompt() {
    const name = this.elements.promptName.value.trim();
    const text = this.elements.settingsCustomPrompt.value.trim();
    if (!name) {
      showSnackbar('Prompt name cannot be empty', 'error');
      return;
    }
    if (!text) {
      showSnackbar('Prompt text cannot be empty', 'error');
      return;
    }
    if (this.editingPromptId !== null) {
      // Update existing prompt
      const prompts = [...AppState.state.customPrompts];
      const promptIndex = prompts.findIndex(p => p.id === this.editingPromptId);
      if (promptIndex === -1) {
        showSnackbar('Prompt not found', 'error');
        return;
      }
      prompts[promptIndex] = { ...prompts[promptIndex], name, text };
      await chrome.storage.sync.set({ customPrompts: prompts });
      AppState.state.customPrompts = prompts;
      AppState.notify();
      showSnackbar('Prompt updated successfully', 'success');
      this.exitEditMode();
      this.render(AppState.state);
    } else {
      // Add new prompt
      const newPrompt = { name, text };
      await AppState.addCustomPrompt(newPrompt);
      showSnackbar('Prompt saved successfully', 'success');
      this.elements.promptName.value = '';
      this.elements.settingsCustomPrompt.value = '';
      this.render(AppState.state);
    }
  }

  async handleDeletePrompt(promptId) {
    await AppState.deleteCustomPrompt(promptId);
    showSnackbar('Prompt deleted successfully', 'success');
    this.exitEditMode();
    this.render(AppState.state);
  }

  handleEditPrompt(promptId) {
    const prompt = AppState.state.customPrompts.find(p => p.id === promptId);
    if (!prompt) {
      showSnackbar('Prompt not found. Please try again.', 'error');
      return;
    }
    this.elements.promptName.value = prompt.name;
    this.elements.settingsCustomPrompt.value = prompt.text;
    this.editingPromptId = promptId;
    this.updateEditModeUI(true);
    this.renderPrompts(AppState.state);
  }

  exitEditMode() {
    this.editingPromptId = null;
    this.elements.promptName.value = '';
    this.elements.settingsCustomPrompt.value = '';
    this.updateEditModeUI(false);
    this.render(AppState.state);
  }

  updateEditModeUI(isEditing) {
    if (isEditing) {
      this.elements.savePromptBtn.className = 'mdc-button mdc-button--outlined edit-prompt';
      this.elements.savePromptBtn.innerHTML = '<span class="material-icons">check</span>';
      this.elements.savePromptBtn.setAttribute('aria-label', 'Update Prompt');
      if (!this.elements.cancelEditBtn) {
        this.elements.cancelEditBtn = document.createElement('button');
        this.elements.cancelEditBtn.className = 'mdc-button mdc-button--outlined delete-prompt';
        this.elements.cancelEditBtn.innerHTML = '<span class="material-icons">close</span>';
        this.elements.cancelEditBtn.setAttribute('aria-label', 'Cancel editing prompt');
        this.elements.cancelEditBtn.onclick = () => this.exitEditMode();
        this.elements.savePromptBtn.parentNode.insertBefore(this.elements.cancelEditBtn, this.elements.savePromptBtn.nextSibling);
      } else {
        this.elements.cancelEditBtn.className = 'mdc-button mdc-button--outlined delete-prompt';
        this.elements.cancelEditBtn.innerHTML = '<span class="material-icons">close</span>';
        this.elements.cancelEditBtn.setAttribute('aria-label', 'Cancel editing prompt');
      }
      this.elements.cancelEditBtn.style.display = 'inline-block';
    } else {
      this.elements.savePromptBtn.className = 'mdc-button mdc-button--outlined edit-prompt';
      this.elements.savePromptBtn.innerHTML = '<span class="material-icons">save</span>';
      this.elements.savePromptBtn.setAttribute('aria-label', 'Save Prompt');
      if (this.elements.cancelEditBtn) {
        this.elements.cancelEditBtn.style.display = 'none';
      }
    }
  }

  handleResetPrompts() {
    if (confirm('Are you sure you want to reset all prompts to the default set? This will remove all your custom prompts.')) {
      AppState.resetPromptsToDefault();
      showSnackbar('Prompts reset to default.', 'success');
      this.exitEditMode();
    }
  }

  render(state) {
    this.renderPrompts(state);
    // Set all provider API key values from storage
    chrome.storage.local.get(['apiKeys'], (result) => {
      const apiKeys = result.apiKeys || {};
      this.PROVIDERS.forEach(provider => {
        const input = document.getElementById(`${provider}ApiKey`);
        if (input) input.value = apiKeys[provider] || '';
      });
    });
    this.updateEditModeUI(this.editingPromptId !== null);
  }

  renderPrompts(state) {
    const promptList = this.elements.promptList;
    promptList.innerHTML = '';
    if (!state.customPrompts?.length) {
      promptList.innerHTML = '<div class="empty-state">No saved prompts yet</div>';
    } else {
      state.customPrompts.forEach(prompt => {
        const li = document.createElement('li');
        li.className = 'prompt-item' + (this.editingPromptId === prompt.id ? ' editing' : '');
        li.innerHTML = `
          <div class="prompt-text"><b>${prompt.name}</b>: ${prompt.text.substring(0, 50)}${prompt.text.length > 50 ? '...' : ''}</div>
          <span class="prompt-actions">
            <button class="edit-prompt mdc-button mdc-button--outlined" data-prompt-id="${prompt.id}" aria-label="Edit prompt ${prompt.name}">
              <span class="material-icons" style="font-size:1.2em;vertical-align:middle;">edit</span>
            </button>
            <button class="delete-prompt mdc-button mdc-button--outlined" data-prompt-id="${prompt.id}" aria-label="Delete prompt ${prompt.name}">
              <span class="material-icons" style="font-size:1.2em;vertical-align:middle;">delete_outline</span>
            </button>
          </span>
        `;
        promptList.appendChild(li);
      });
    }
    // Add edit/delete event listeners
    promptList.querySelectorAll('.edit-prompt').forEach(button => {
      button.onclick = (e) => this.handleEditPrompt(e.target.closest('button').dataset.promptId);
    });
    promptList.querySelectorAll('.delete-prompt').forEach(button => {
      button.onclick = (e) => this.handleDeletePrompt(e.target.closest('button').dataset.promptId);
    });
  }
} 