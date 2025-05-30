import { DEFAULT_PROMPTS } from './constants/defaultPrompts.js';
// Centralized state management for the extension

class State {
  constructor() {
    this.listeners = [];
    this.state = {
      apiKey: '',
      customPrompts: [],
      selectedPromptId: null,
      selectedModel: 'gpt-4o',
      isDeepContext: false
    };
  }

  async initialize() {
    const apiKey = await this.getApiKey();
    const customPrompts = await this.getCustomPrompts();
    const { selectedModel, selectedPromptId, isDeepContext } = await chrome.storage.local.get(['selectedModel', 'selectedPromptId', 'isDeepContext']);
    
    this.state.apiKey = apiKey || '';
    this.state.customPrompts = customPrompts || [];
    
    // Set selected model from storage or default
    this.state.selectedModel = selectedModel || 'gpt-4';
    
    // Set selected prompt from storage or default
    if (selectedPromptId && customPrompts.find(p => p.id === selectedPromptId)) {
      this.state.selectedPromptId = selectedPromptId;
    } else {
      this.state.selectedPromptId = customPrompts[0]?.id || null;
    }

    // Set context mode from storage or default to shallow
    this.state.isDeepContext = isDeepContext || false;
    
    this.notify();
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  async getApiKey() {
    const result = await chrome.storage.sync.get('apiKey');
    return result.apiKey;
  }

  async setApiKey(apiKey) {
    await chrome.storage.sync.set({ apiKey });
    this.state.apiKey = apiKey;
    this.notify();
  }

  async getCustomPrompts() {
    const result = await chrome.storage.sync.get('customPrompts');
    if (!result.customPrompts || result.customPrompts.length === 0) {
      await chrome.storage.sync.set({ customPrompts: DEFAULT_PROMPTS });
      return DEFAULT_PROMPTS;
    }
    // Migrate old string prompts to object format if needed
    if (typeof result.customPrompts[0] === 'string') {
      const migrated = result.customPrompts.map((text, i) => ({ name: `Prompt ${i + 1}`, text }));
      await chrome.storage.sync.set({ customPrompts: migrated });
      return migrated;
    }
    return result.customPrompts;
  }

  async addCustomPrompt(promptObj) {
    const prompts = await this.getCustomPrompts();
    const newPrompt = {
      ...promptObj,
      id: promptObj.id || 'prompt-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };
    prompts.push(newPrompt);
    await chrome.storage.sync.set({ customPrompts: prompts });
    this.state.customPrompts = prompts;
    this.notify();
  }

  async deleteCustomPrompt(promptId) {
    const prompts = await this.getCustomPrompts();
    const updatedPrompts = prompts.filter(p => p.id !== promptId);
    await chrome.storage.sync.set({ customPrompts: updatedPrompts });
    this.state.customPrompts = updatedPrompts;
    // If we deleted the selected prompt, select the first available one
    if (this.state.selectedPromptId === promptId || !updatedPrompts.find(p => p.id === this.state.selectedPromptId)) {
      this.state.selectedPromptId = updatedPrompts[0]?.id || null;
    }
    this.notify();
  }

  setSelectedPromptId(promptId) {
    if (!promptId || promptId === 'undefined') return;
    if (!this.state.customPrompts.find(p => p.id === promptId)) return;
    this.state.selectedPromptId = promptId;
    chrome.storage.local.set({ selectedPromptId: promptId });
    this.notify();
  }

  async resetPromptsToDefault() {
    await chrome.storage.sync.set({ customPrompts: DEFAULT_PROMPTS });
    this.state.customPrompts = DEFAULT_PROMPTS;
    this.state.selectedPromptId = DEFAULT_PROMPTS[0].id;
    this.notify();
  }

  resetState() {
    this.state.selectedModel = null;
    this.state.selectedPromptId = null;
    this.state.customPrompts = [];
    this.notify();
  }

  setSelectedModel(model) {
    this.state.selectedModel = model;
    chrome.storage.local.set({ selectedModel: model });
    this.notify();
  }

  setContextMode(isDeep) {
    this.state.isDeepContext = isDeep;
    chrome.storage.local.set({ isDeepContext: isDeep });
    this.notify();
  }
}

export const AppState = new State(); 