// Agoda content script

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
  } catch (e) {
    return url.toLowerCase();
  }
}

async function waitForPrice(timeout = 15000) {
  const selectors = [
    '[data-selenium="master-price-box"]',
    '[data-selenium="hotel-price-display"]',
    '.PropertyCardPrice',
    '.PropertyCardPrice__Value',
    '.MasterRoom',
    '.MasterRoom-price',
    '.PriceDisplay',
    '[class*="MasterRoom"]',
    '[class*="PriceDisplay"]'
  ];

  const currencyRegex = /RM|MYR|[$€£¥₩₫₹฿₱₦₪]/;

  return new Promise(resolve => {
    const findPriceEl = () => {
      // Try each selector
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) return el;
      }

      // Fallback: search for any element with currency + digits
      const candidates = document.querySelectorAll('span, div, strong, [class*="price" i], [class*="Price" i]');
      for (const el of candidates) {
        const text = (el.textContent || '').trim();
        if (currencyRegex.test(text) && /\d/.test(text) && text.length < 50) {
          return el;
        }
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

async function getAgodaData() {
  console.log('=================================================');
  console.log('Agoda Tracker: Starting extraction');
  console.log('Agoda Tracker: Full URL:', window.location.href);
  
  // Check if dates are in URL
  const currentUrl = new URL(window.location.href);
  const checkIn = currentUrl.searchParams.get('checkIn');
  const checkOut = currentUrl.searchParams.get('checkOut');
  const adults = currentUrl.searchParams.get('adults');
  const roomsParam = currentUrl.searchParams.get('rooms');
  
  console.log('Agoda Tracker: URL Parameters:');
  console.log('  - checkIn:', checkIn || 'NOT SET');
  console.log('  - checkOut:', checkOut || 'NOT SET');
  console.log('  - adults:', adults || 'not specified');
  console.log('  - rooms:', roomsParam || 'not specified');
  
  if (!checkIn || !checkOut) {
    console.warn('⚠️ WARNING: Dates not set in URL! Prices may be incorrect.');
  }
  console.log('=================================================');
  
  // Wait for price elements to load
  await waitForPrice();

  // --- Hotel Name extraction ---
  const nameSelectors = [
    '[data-selenium="hotel-header-name"]',
    '[data-selenium="hotel-name"]',
    'h1[class*="HeaderCerebrum"]',
    'h1[data-selenium*="hotel"]',
    'h2[data-selenium="hotel-name"]',
    '.PropertyHeaderCard h1',
    'h1',
    'h2'
  ];
  
  let nameEl = null;
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
  
  // Detect currency from URL (e.g., currencyCode=MYR → RM)
  const urlCurrency = currentUrl.searchParams.get('currencyCode') || '';
  let primaryCurrencyRegex;
  let currencyLabel;
  
  if (urlCurrency === 'MYR' || urlCurrency === '') {
    primaryCurrencyRegex = /(RM|MYR)\s*([\d,]+(?:\.\d{2})?)/;
    currencyLabel = 'RM';
  } else {
    primaryCurrencyRegex = /([$€£¥₩₫₹฿₱₦₪]|RM|MYR)\s*([\d,]+(?:\.\d{2})?)/;
    currencyLabel = urlCurrency;
  }

  // --- AGODA PRICE EXTRACTION v3.5.0 ---
  console.log('\n=== Agoda Price Extraction v3.5.0 ===');
  console.log(`Currency: ${currencyLabel}\n`);
  
  // ═══════════════════════════════════════════════════════════════
  // PRIMARY: Target elements with class "finalPr" (finalPrice)
  // These are the actual final selling prices after all discounts/vouchers
  // ═══════════════════════════════════════════════════════════════
  console.log('STEP 1: Looking for finalPrice elements...');
  
  const finalPriceElements = document.querySelectorAll('[class*="finalPr"]');
  console.log(`  Found ${finalPriceElements.length} elements with finalPrice class`);
  
  finalPriceElements.forEach((el, idx) => {
    const text = el.textContent?.trim() || '';
    const match = text.match(primaryCurrencyRegex);
    if (match && match[2]) {
      const priceNum = parseFloat(match[2].replace(/,/g, ''));
      console.log(`  #${idx + 1}: text="${text}", price=${priceNum}`);
      
      if (priceNum >= 30 && priceNum <= 10000 && !priceSet.has(priceNum)) {
        priceSet.add(priceNum);
        
        // Detect rate condition from the room/rate container
        const rateContainer = el.closest('.PriceDisplay, [class*="PriceDisplay"], [class*="ChildRoomsList"], [class*="MasterRoom"]');
        const containerText = rateContainer?.textContent?.toLowerCase() || '';
        
        let condition = 'Standard Rate';
        if (containerText.includes('non-refundable') || containerText.includes('non refundable')) {
          condition = 'Non-refundable';
        } else if (containerText.includes('free cancellation') || containerText.includes('free cancel')) {
          condition = 'Free Cancellation';
        } else if (containerText.includes('pay later') || containerText.includes('pay at hotel') || containerText.includes('pay at property')) {
          condition = 'Pay Later';
        }
        
        rooms.push({
          room: 'Agoda Room',
          price: `${currencyLabel} ${match[2]}`,
          condition: condition
        });
        console.log(`  ✓ CAPTURED: ${currencyLabel} ${match[2]} - ${condition}`);
      }
    }
  });
  
  // ═══════════════════════════════════════════════════════════════
  // FALLBACK 1: Target elements inside "effective-price-wrapper"
  // ═══════════════════════════════════════════════════════════════
  if (rooms.length === 0) {
    console.log('\nSTEP 2: Looking for effective-price-wrapper elements...');
    
    const wrappers = document.querySelectorAll('[class*="effective-price-wrapper"], [class*="applied-cashback"]');
    console.log(`  Found ${wrappers.length} effective-price wrappers`);
    
    wrappers.forEach((wrapper, idx) => {
      const text = wrapper.textContent?.trim() || '';
      const match = text.match(primaryCurrencyRegex);
      if (match && match[2]) {
        const priceNum = parseFloat(match[2].replace(/,/g, ''));
        if (priceNum >= 30 && priceNum <= 10000 && !priceSet.has(priceNum)) {
          priceSet.add(priceNum);
          rooms.push({
            room: 'Agoda Room',
            price: `${currencyLabel} ${match[2]}`,
            condition: 'Standard Rate'
          });
          console.log(`  ✓ CAPTURED: ${currencyLabel} ${match[2]}`);
        }
      }
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FALLBACK 2: Scan PriceDisplay containers, exclude noise
  // ═══════════════════════════════════════════════════════════════
  if (rooms.length === 0) {
    console.log('\nSTEP 3: Scanning PriceDisplay containers...');
    
    const priceDisplays = document.querySelectorAll('.PriceDisplay, [class*="PriceDisplay"]');
    console.log(`  Found ${priceDisplays.length} PriceDisplay containers`);
    
    priceDisplays.forEach((container, idx) => {
      // Look for price elements that are NOT crossed out and NOT voucher labels
      const allSpans = container.querySelectorAll('span, div');
      
      allSpans.forEach(el => {
        const text = el.textContent?.trim() || '';
        const className = (el.className || '').toString();
        
        // Skip crossed out prices
        if (className.includes('CrossedOut')) return;
        // Skip voucher/applied labels
        if (text.includes('applied') || text.includes('Original price')) return;
        // Skip screen reader only elements
        if (className.includes('ScreenReaderOnly')) return;
        // Skip cashback/rewards
        if (text.includes('Cashback') || text.includes('cashback')) return;
        
        // Only match short text that is just a price
        if (text.length <= 20) {
          const match = text.match(primaryCurrencyRegex);
          if (match && match[2]) {
            const priceNum = parseFloat(match[2].replace(/,/g, ''));
            const style = window.getComputedStyle(el);
            
            if (priceNum >= 30 && priceNum <= 10000 && !priceSet.has(priceNum) &&
                !style.textDecoration.includes('line-through') &&
                style.display !== 'none') {
              priceSet.add(priceNum);
              rooms.push({
                room: 'Agoda Room',
                price: `${currencyLabel} ${match[2]}`,
                condition: 'Standard Rate'
              });
              console.log(`  ✓ CAPTURED: ${currencyLabel} ${match[2]}`);
            }
          }
        }
      });
    });
  }
  
  // ═══════════════════════════════════════════════════════════════
  // FALLBACK 3: Broad scan excluding known noise patterns
  // ═══════════════════════════════════════════════════════════════
  if (rooms.length === 0) {
    console.log('\nSTEP 4: Broad scan with noise filtering...');
    
    const allElements = document.querySelectorAll('span, div');
    
    for (const el of allElements) {
      const text = el.textContent?.trim() || '';
      const className = (el.className || '').toString();
      const parentClass = (el.parentElement?.className || '').toString();
      
      // Skip noise: flights, attractions, carousel, sticky nav, crossed out, vouchers
      if (className.includes('CrossedOut') || parentClass.includes('CrossedOut')) continue;
      if (className.includes('StickyNav') || parentClass.includes('StickyNav')) continue;
      if (className.includes('Carousel') || parentClass.includes('Carousel')) continue;
      if (className.includes('Cardstyled') || parentClass.includes('Cardstyled')) continue;
      if (className.includes('ScreenReaderOnly')) continue;
      if (text.includes('applied') || text.includes('Original price')) continue;
      if (text.includes('Cashback') || text.includes('cashback')) continue;
      if (text.includes('AirAsia') || text.includes('Firefly') || text.includes('Batik Air')) continue;
      if (text.includes('LEGOLAND') || text.includes('Attractions')) continue;
      
      // Only short text that looks like a standalone price
      if (text.length >= 3 && text.length <= 25) {
        const match = text.match(primaryCurrencyRegex);
        if (match && match[2]) {
          const priceNum = parseFloat(match[2].replace(/,/g, ''));
          if (priceNum >= 100 && priceNum <= 10000 && !priceSet.has(priceNum)) {
            const style = window.getComputedStyle(el);
            if (!style.textDecoration.includes('line-through') && style.display !== 'none') {
              priceSet.add(priceNum);
              rooms.push({
                room: 'Agoda Room',
                price: `${currencyLabel} ${match[2]}`,
                condition: 'Standard Rate'
              });
              console.log(`  ✓ CAPTURED: ${currencyLabel} ${match[2]}`);
              if (rooms.length >= 3) break;
            }
          }
        }
      }
    }
  }

  console.log('\nAgoda Tracker: ========================================');
  console.log('Agoda Tracker: EXTRACTION SUMMARY');
  console.log('Agoda Tracker: Found', rooms.length, 'price(s)');
  rooms.forEach((r, i) => {
    console.log(`Agoda Tracker: [${i+1}] ${r.price} - ${r.condition}`);
  });
  console.log('Agoda Tracker: ========================================\n');

  const url = window.location.href;
  const normalizedUrl = normalizeUrl(url);

  return {
    site: 'agoda',
    name: nameEl ? nameEl.textContent.trim() : 'Agoda Hotel',
    rooms,
    url,
    normalizedUrl,
    lastChecked: new Date().toLocaleString()
  };
}

// Listen for GET_HOTEL_DATA requests (for manual fetch)
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'GET_HOTEL_DATA') {
    getAgodaData().then(sendResponse);
    return true;
  }
});

// Auto-send Agoda data with retry logic
if (window.location.hostname.includes('agoda')) {
  let retryCount = 0;
  const maxRetries = 6;
  
  function sendAgodaUpdate() {
    getAgodaData().then(data => {
      // Only send if we have room data
      if (data && data.rooms && data.rooms.length > 0) {
        chrome.runtime.sendMessage({ action: 'HOTEL_PRICE_UPDATE', ...data }, response => {
          // Check for errors (service worker might be inactive)
          if (chrome.runtime.lastError && retryCount < maxRetries) {
            console.log('Agoda Tracker: Retrying send...', chrome.runtime.lastError);
            retryCount++;
            setTimeout(sendAgodaUpdate, 2000);
          } else {
            console.log('Agoda Tracker: Data sent successfully');
          }
        });
      } else if (retryCount < maxRetries) {
        // No rooms found, retry after a delay (Agoda loads prices dynamically)
        console.log('Agoda Tracker: No rooms found, retrying... (' + (retryCount + 1) + '/' + maxRetries + ')');
        retryCount++;
        setTimeout(sendAgodaUpdate, 3000); // 3 second delay for dynamic loading
      } else {
        console.log('Agoda Tracker: Max retries reached, no room data found');
      }
    });
  }
  
  // Start after page is ready - allow extra time for dynamic content
  if (document.readyState === 'complete') {
    setTimeout(sendAgodaUpdate, 2000);
  } else {
    window.addEventListener('load', () => {
      setTimeout(sendAgodaUpdate, 2000);
    });
  }
}
