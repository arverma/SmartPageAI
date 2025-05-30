// Content script for full page screenshot

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let isCapturing = false;

async function captureFullPage(showModal = true) {
  if (isCapturing) {
    return;
  }
  isCapturing = true;
  try {
    const body = document.body;
    const html = document.documentElement;
    const width = Math.max(
      body.scrollWidth, body.offsetWidth,
      html.clientWidth, html.scrollWidth, html.offsetWidth
    );
    const height = Math.max(
      body.scrollHeight, body.offsetHeight,
      html.clientHeight, html.scrollHeight, html.offsetHeight
    );
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const devicePixelRatio = window.devicePixelRatio || 1;

    // Optionally hide sticky headers/footers here

    const originalScrollX = window.scrollX;
    const originalScrollY = window.scrollY;

    const images = [];
    let y = 0;
    while (y < height) {
      window.scrollTo(0, y);
      await sleep(600); // Wait longer to avoid Chrome's capture rate limit
      // Request screenshot from background
      const dataUrl = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type: 'FULL_PAGE_CAPTURE_REQUEST' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (!response || !response.dataUrl) {
            reject(new Error('No screenshot data received from background.'));
            return;
          }
          resolve(response.dataUrl);
        });
      });
      images.push({ y, dataUrl });
      y += viewportHeight;
    }

    // Restore scroll position
    window.scrollTo(originalScrollX, originalScrollY);

    // Stitch images
    const canvas = document.createElement('canvas');
    canvas.width = width * devicePixelRatio;
    canvas.height = height * devicePixelRatio;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < images.length; i++) {
      const img = new window.Image();
      img.src = images[i].dataUrl;
      await new Promise(res => { img.onload = res; });
      ctx.drawImage(
        img,
        0, 0, viewportWidth * devicePixelRatio, viewportHeight * devicePixelRatio,
        0, images[i].y * devicePixelRatio, viewportWidth * devicePixelRatio, viewportHeight * devicePixelRatio
      );
    }

    const finalDataUrl = canvas.toDataURL('image/png');
    window.postMessage({ type: 'FULL_PAGE_CAPTURE_DONE', dataUrl: finalDataUrl }, '*');
    chrome.runtime.sendMessage({ type: 'FULL_PAGE_CAPTURE_DONE', dataUrl: finalDataUrl }, () => {
      if (chrome.runtime.lastError && chrome.runtime.lastError.message.includes('Could not establish connection. Receiving end does not exist.')) {
        // Suppress this error
        return;
      }
    });
    if (showModal) showScreenshotModal(finalDataUrl);
  } catch (err) {
    console.error('[WebPage Assistance] Full page capture failed:', err);
    window.postMessage({ type: 'FULL_PAGE_CAPTURE_ERROR', error: err.message || String(err) }, '*');
    throw err;
  } finally {
    isCapturing = false;
  }
}

function showScreenshotModal(dataUrl) {
  // Remove existing modal if present
  const existing = document.getElementById('webpageassistance-screenshot-modal');
  if (existing) existing.remove();

  // Create modal elements
  const modal = document.createElement('div');
  modal.id = 'webpageassistance-screenshot-modal';
  modal.innerHTML = `
    <div class="webpageassistance-modal-content">
      <div class="webpageassistance-modal-img-container">
        <img src="${dataUrl}" class="webpageassistance-modal-img" alt="Full Page Screenshot" />
      </div>
      <div class="webpageassistance-modal-controls webpageassistance-modal-controls-inline">
        <a class="webpageassistance-modal-download-btn" href="${dataUrl}" download="fullpage-screenshot.png" title="Download Screenshot" aria-label="Download">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 3V14M10 14L6 10M10 14L14 10" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>Download</span>
        </a>
        <button class="webpageassistance-modal-close-btn" title="Close" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6L14 14M14 6L6 14" stroke="#555" stroke-width="2" stroke-linecap="round"/></svg>
          <span>Close</span>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // Add styles
  const style = document.createElement('style');
  style.id = 'webpageassistance-screenshot-modal-style';
  style.textContent = `
    #webpageassistance-screenshot-modal {
      position: fixed; z-index: 999999; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.55); display: flex; align-items: center; justify-content: center;
    }
    .webpageassistance-modal-content {
      position: relative; background: #fff; border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,0.18);
      padding: 24px 24px 16px 24px; max-width: 90vw; max-height: 90vh; display: flex; flex-direction: column; align-items: center;
    }
    .webpageassistance-modal-img-container {
      overflow: auto; max-height: 70vh; max-width: 80vw; border-radius: 8px; box-shadow: 0 2px 8px rgba(60,64,67,.10);
      background: #f8f8f8;
    }
    .webpageassistance-modal-img {
      display: block; max-width: 100%; height: auto; margin: 0 auto;
    }
    .webpageassistance-modal-controls {
      position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
      display: flex; gap: 18px; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.7); border-radius: 18px; box-shadow: 0 2px 8px rgba(60,64,67,.10);
      padding: 8px 24px;
      min-width: 220px;
    }
    .webpageassistance-modal-controls-inline {
      flex-direction: row;
      gap: 18px;
    }
    .webpageassistance-modal-download-btn, .webpageassistance-modal-close-btn {
      display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 500;
      border: none; outline: none; border-radius: 8px; padding: 8px 18px; cursor: pointer; transition: background 0.15s, color 0.15s;
      box-shadow: none; text-decoration: none;
    }
    .webpageassistance-modal-download-btn {
      background: #2563eb; color: #fff;
    }
    .webpageassistance-modal-download-btn:hover, .webpageassistance-modal-download-btn:focus {
      background: #1746a2;
    }
    .webpageassistance-modal-close-btn {
      background: #f3f4f6; color: #222;
    }
    .webpageassistance-modal-close-btn:hover, .webpageassistance-modal-close-btn:focus {
      background: #e5e7eb;
    }
    .webpageassistance-modal-close-btn svg {
      stroke: #555;
    }
    .webpageassistance-modal-download-btn svg {
      stroke: #fff;
    }
  `;
  document.head.appendChild(style);

  // Close button logic
  modal.querySelector('.webpageassistance-modal-close-btn').onclick = () => {
    modal.remove();
    style.remove();
  };
}

if (window.top === window) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'START_FULL_PAGE_CAPTURE') {
      captureFullPage(message.showModal !== false)
        .then(() => sendResponse({ success: true }))
        .catch((err) => {
          sendResponse({ error: err.message || 'Full page capture failed' });
        });
      return true; // Keep the message channel open for async response
    }
  });
} 