// Utility functions for the extension

export const captureVisibleTab = () => {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(null, { format: 'png' }, (screenshotUrl) => {
      if (chrome.runtime.lastError) {
        reject(new Error('Failed to capture screenshot: ' + chrome.runtime.lastError.message));
      } else {
        resolve(screenshotUrl);
      }
    });
  });
};

export function showSnackbar(message, type = 'success') {
  const snackbar = document.getElementById('snackbar');
  if (!snackbar) return;
  const icon = type === 'error'
    ? '<span class="material-icons" style="vertical-align:middle;color:#c62828;">error</span> '
    : '<span class="material-icons" style="vertical-align:middle;color:#388e3c;">check_circle</span> ';
  snackbar.innerHTML = icon + message;
  snackbar.className = 'show';
  snackbar.style.background = type === 'error' ? '#c62828' : '#323232';
  snackbar.style.color = '#fff';
  setTimeout(() => {
    snackbar.className = snackbar.className.replace('show', '');
  }, 3000);
}

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const validateApiKey = (apiKey) => {
  if (!apiKey) return false;
  if (typeof apiKey !== 'string') return false;
  if (apiKey.trim().length === 0) return false;
  // Add more specific validation if needed
  return true;
};

export const formatPrompt = (prompt) => {
  if (!prompt) return '';
  return prompt.trim();
};

export const createLoadingIndicator = (parentElement) => {
  const loader = document.createElement('div');
  loader.className = 'loading-indicator';
  loader.innerHTML = `
    <div class="spinner"></div>
    <span>Processing...</span>
  `;
  parentElement.appendChild(loader);
  return loader;
};

export const removeLoadingIndicator = (loader) => {
  if (loader && loader.parentElement) {
    loader.parentElement.removeChild(loader);
  }
};

export const sanitizeHTML = (str) => {
  const temp = document.createElement('div');
  temp.textContent = str;
  return temp.innerHTML;
};

export const extractWebpageContent = () => {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) {
        reject(new Error('No active tab found'));
        return;
      }
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: function() {
          try {
            const getVisibleText = (element) => {
              if (!element) return '';
              let style;
              try { style = window.getComputedStyle(element); } catch (e) { style = {}; }
              if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return '';
              let text = '';
              if (element.nodeType === Node.TEXT_NODE) {
                text = element.textContent.trim();
              } else {
                if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS'].includes(element.tagName)) return '';
                for (const child of element.childNodes) {
                  text += getVisibleText(child) + ' ';
                }
              }
              return text.trim();
            };
            const mainContentSelectors = [
              'article',
              'main',
              '[role="main"]',
              '.main-content',
              '.content',
              '#content',
              '.post',
              '.article',
              '.entry-content',
              '.post-content',
              '.article-content',
              '.story-content',
              '.blog-post',
              '.news-content'
            ];
            let mainContent = null;
            for (const selector of mainContentSelectors) {
              const element = document.querySelector(selector);
              if (element) {
                mainContent = element;
                break;
              }
            }
            mainContent = mainContent || document.body;
            const content = getVisibleText(mainContent);
            const metadata = {
              title: document.title,
              url: window.location.href,
              description: document.querySelector('meta[name="description"]')?.content || '',
              author: document.querySelector('meta[name="author"]')?.content || '',
              date: document.querySelector('meta[property="article:published_time"]')?.content || ''
            };
            return { content, metadata };
          } catch (e) {
            return null;
          }
        }
      }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(results[0]?.result);
      });
    });
  });
};
