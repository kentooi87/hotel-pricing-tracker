// Airbnb content script

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

async function waitForPrice(timeout = 20000) {
  const selectors = [
    '[data-testid="book-it-default"]',
    '[data-testid="book-it-trigger"]',
    '[data-section-id="BOOK_IT_PANEL"]',
    '[data-testid="price-summary"]',
    '[class*="book-it" i]',
    '[class*="booking" i]',
    '[class*="reserve" i]'
  ];

  const currencyRegex = /RM|MYR|[$€£¥₩₫₹฿₱₦₪]/;

  return new Promise(resolve => {
    const findPriceEl = () => {
      const bySelector = selectors
        .map(sel => document.querySelector(sel))
        .find(Boolean);
      if (bySelector) return bySelector;

      // Fallback: search inside the booking panel for any element with currency + digits
      const panel = document.querySelector('[data-testid="book-it-default"], [data-section-id="BOOK_IT_PANEL"], [data-testid="book-it-trigger"]');
      if (panel) {
        const candidate = Array.from(panel.querySelectorAll('[data-testid*="price"], span, div, strong'))
          .find(el => {
            const text = (el.textContent || '').trim();
            return currencyRegex.test(text) && /\d/.test(text);
          });
        if (candidate) return candidate;
      }
      return null;
    };

    const check = () => {
      const priceEl = findPriceEl();
      if (priceEl) {
        resolve(priceEl);
        return true;
      }
      return false;
    };

    if (check()) return;

    const obs = new MutationObserver(() => { if (check()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

async function getAirbnbData() {
  // Wait for price panel first — this ensures the page DOM is fully rendered
  await waitForPrice();

  // --- Name extraction: try multiple selectors for the listing title ---
  // Runs AFTER waitForPrice so the SPA has rendered the title by now
  const nameSelectors = [
    '[data-testid="listing-title"]',
    'h1[elementtiming="LCP-target"]',
    '[data-section-id="TITLE_DEFAULT"] h1',
    '[data-section-id="TITLE_DEFAULT"] [data-testid="title"]',
    '[data-testid="title"]',
    'h1'
  ];
  let nameEl = null;
  // Retry up to 3 times (1s apart) in case title renders slightly after prices
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const sel of nameSelectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 1) {
        nameEl = el;
        break;
      }
    }
    if (nameEl) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  const rooms = [];
  const priceSet = new Set();
  
  // Try multiple selectors for the booking panel
  let panel = document.querySelector('[data-testid="book-it-default"]');
  if (!panel) panel = document.querySelector('[data-section-id="BOOK_IT_PANEL"]');
  if (!panel) panel = document.querySelector('[data-testid="book-it-trigger"]');
  if (!panel) panel = document.querySelector('[class*="book-it" i]');
  if (!panel) panel = document.querySelector('[class*="BookingPanel" i]');
  if (!panel) {
    // Last resort: look for any section with prices
    console.log('Airbnb Tracker: No booking panel found, searching entire page');
    panel = document.body;
  }

  const currencyRegex = /(RM|MYR|[$€£¥₩₫₹฿₱₦₪])\s*([\d.,]+)/;

  // --- Nightly rate extraction ---
  // Strategy: find price elements near the word "night" (e.g. "RM 329 night" or "RM 329 / night")
  // This excludes service fees, cleaning fees, and totals.

  function extractNightlyRate() {
    if (!panel) return;

    // Method 1: Look for an element whose own text (or nearby sibling) contains "night"
    const allEls = panel.querySelectorAll('span, div, strong, [data-testid*="price"]');
    for (const el of allEls) {
      // Check this element and its parent for "night" context
      const elText = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const parentText = (el.parentElement?.textContent || '').replace(/\s+/g, ' ').trim();
      const contextText = parentText || elText;

      // Must contain "night" to be the nightly rate
      if (!/night/i.test(contextText)) continue;
      // Must NOT be a total, fee, or "nights" (plural means total breakdown)
      if (/total|service fee|cleaning fee|before taxes/i.test(elText)) continue;

      const match = elText.match(currencyRegex);
      if (match && match[2]) {
        const price = match[2];
        // Check if "free cancellation" exists anywhere in the panel
        const panelText = (panel.textContent || '').toLowerCase();
        const isFreeCancel = /free cancell?ation/i.test(panelText);
        const condition = isFreeCancel ? 'Free cancellation' : 'Standard Rate';
        const key = price + '|' + condition;
        if (!priceSet.has(key)) {
          priceSet.add(key);
          rooms.push({ room: 'Nightly Rate', price, condition });
        }
        return; // Found the nightly rate, stop
      }
    }

    // Method 2: Scan panel text for "RM XXX / night" or "RM XXX night" pattern
    const panelText = (panel.textContent || '').replace(/\s+/g, ' ');
    const nightlyMatch = panelText.match(/(RM|[$€£¥₩₫₹฿₱₦₪])\s*([\d.,]+)\s*(?:\/\s*)?night/i);
    if (nightlyMatch && nightlyMatch[2]) {
      const price = nightlyMatch[2];
      const isFreeCancel = /free cancell?ation/i.test(panelText);
      const condition = isFreeCancel ? 'Free cancellation' : 'Standard Rate';
      const key = price + '|' + condition;
      if (!priceSet.has(key)) {
        priceSet.add(key);
        rooms.push({ room: 'Nightly Rate', price, condition });
      }
    }
  }

  extractNightlyRate();

  // --- Extract refundable / non-refundable rate options ---
  // Airbnb shows: "Non-refundable · RM273.40 total" and "Refundable · RM303.78 total"
  function extractRateOptions() {
    if (!panel) return;
    const panelText = (panel.textContent || '').replace(/\s+/g, ' ');

    // Pattern: "Non-refundable · RM XXX total"
    const nonRefMatch = panelText.match(/Non[- ]?refundable\s*[·:]\s*(RM|[$€£¥₩₫₹฿₱₦₪])\s*([\d.,]+)\s*total/i);
    if (nonRefMatch && nonRefMatch[2]) {
      const key = nonRefMatch[2] + '|Non-refundable';
      if (!priceSet.has(key)) {
        priceSet.add(key);
        rooms.push({ room: 'Total (Non-refundable)', price: nonRefMatch[2], condition: 'Non-refundable' });
      }
    }

    // Pattern: "Refundable · RM XXX total"
    const refMatch = panelText.match(/(?<!Non[- ]?)Refundable\s*[·:]\s*(RM|[$€£¥₩₫₹฿₱₦₪])\s*([\d.,]+)\s*total/i);
    if (refMatch && refMatch[2]) {
      const key = refMatch[2] + '|Free cancellation';
      if (!priceSet.has(key)) {
        priceSet.add(key);
        rooms.push({ room: 'Total (Refundable)', price: refMatch[2], condition: 'Free cancellation' });
      }
    }

    // Also try element-by-element scan for rate options (in case text layout differs)
    if (!nonRefMatch && !refMatch) {
      const allEls = panel.querySelectorAll('span, div, strong, label, [data-testid*="rate"]');
      for (const el of allEls) {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        // Look for "Non-refundable" with a price and "total"
        if (/non[- ]?refundable/i.test(text) && /total/i.test(text)) {
          const m = text.match(currencyRegex);
          if (m && m[2]) {
            const key = m[2] + '|Non-refundable';
            if (!priceSet.has(key)) {
              priceSet.add(key);
              rooms.push({ room: 'Total (Non-refundable)', price: m[2], condition: 'Non-refundable' });
            }
          }
        }
        // Look for "Refundable" (but not "Non-refundable") with a price and "total"
        if (/refundable/i.test(text) && !/non[- ]?refundable/i.test(text) && /total/i.test(text)) {
          const m = text.match(currencyRegex);
          if (m && m[2]) {
            const key = m[2] + '|Free cancellation';
            if (!priceSet.has(key)) {
              priceSet.add(key);
              rooms.push({ room: 'Total (Refundable)', price: m[2], condition: 'Free cancellation' });
            }
          }
        }
      }
    }
  }

  extractRateOptions();

  // Fallback: if we found nothing, search more aggressively
  if (rooms.length === 0 && panel) {
    console.log('Airbnb Tracker: Using fallback price extraction');
    
    // Look for any price-like elements
    const priceElements = panel.querySelectorAll(
      'span[class*="price" i], ' +
      'div[class*="price" i], ' +
      'span[aria-label*="price" i], ' +
      'strong, b'
    );
    
    const foundPrices = new Set();
    priceElements.forEach(el => {
      const text = el.textContent.trim();
      const match = text.match(currencyRegex);
      if (match && match[2] && text.length < 100) {
        const price = match[2];
        // Avoid duplicate prices
        if (!foundPrices.has(price)) {
          foundPrices.add(price);
          
          // Check context for condition
          const parentText = el.parentElement?.textContent?.toLowerCase() || '';
          let condition = 'Standard Rate';
          if (/free cancel/i.test(parentText)) {
            condition = 'Free cancellation';
          } else if (/non[- ]?refund/i.test(parentText)) {
            condition = 'Non-refundable';
          }
          
          // Determine if it's nightly or total
          let roomType = 'Price';
          if (/night/i.test(parentText) && !/\d\s*night/i.test(parentText)) {
            roomType = 'Nightly Rate';
          } else if (/total/i.test(parentText)) {
            roomType = 'Total Price';
          }
          
          rooms.push({ room: roomType, price: price, condition: condition });
        }
      }
    });
  }

  const url = window.location.href;
  const normalizedUrl = normalizeUrl(url);

  return {
    site: 'airbnb',
    name: nameEl ? nameEl.textContent.trim() : 'Airbnb Stay',
    rooms,
    url,
    normalizedUrl,
    lastChecked: new Date().toLocaleString()
  };
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'GET_HOTEL_DATA') {
    getAirbnbData().then(sendResponse);
    return true;
  }
});

// Auto-send Airbnb data with retry logic (matching content.js pattern)
if (window.location.hostname.includes('airbnb')) {
  let retryCount = 0;
  const maxRetries = 6;
  
  function sendAirbnbUpdate() {
    getAirbnbData().then(data => {
      // Only send if we have room data
      if (data && data.rooms && data.rooms.length > 0) {
        chrome.runtime.sendMessage({ action: 'HOTEL_PRICE_UPDATE', ...data }, response => {
          // Check for errors (service worker might be inactive)
          if (chrome.runtime.lastError && retryCount < maxRetries) {
            console.log('Airbnb Tracker: Retrying send...', chrome.runtime.lastError);
            retryCount++;
            setTimeout(sendAirbnbUpdate, 2000);
          } else {
            console.log('Airbnb Tracker: Data sent successfully');
          }
        });
      } else if (retryCount < maxRetries) {
        // No rooms found, retry after a delay (Airbnb loads prices dynamically)
        console.log('Airbnb Tracker: No rooms found, retrying... (' + (retryCount + 1) + '/' + maxRetries + ')');
        retryCount++;
        setTimeout(sendAirbnbUpdate, 3000); // 3 second delay for dynamic loading
      } else {
        console.log('Airbnb Tracker: Max retries reached, no room data found');
      }
    });
  }
  
  // Start after page is ready - allow extra time for dynamic content
  if (document.readyState === 'complete') {
    setTimeout(sendAirbnbUpdate, 1500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(sendAirbnbUpdate, 1500);
    });
  }
}
