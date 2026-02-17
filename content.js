


async function getHotelData() {
	// Wait for the room table to fully load (max 12s)
	function waitForRooms(timeout = 12000) {
		return new Promise(resolve => {
			const check = () => {
				// Look for the main room/price table
				const table = document.querySelector('#hprt-table, .hprt-table, [data-testid="property-section-rooms-and-rates"], table.roomstable');
				if (table) {
					resolve(table);
					return true;
				}
				return false;
			};
			if (check()) return;
			const observer = new MutationObserver(() => {
				if (check()) observer.disconnect();
			});
			observer.observe(document.body, { childList: true, subtree: true });
			setTimeout(() => {
				observer.disconnect();
				// Final attempt - get any table or room container
				resolve(document.querySelector('#hprt-table, .hprt-table, table, [class*="room"]'));
			}, timeout);
		});
	}

	const nameEl = document.querySelector('[data-testid="title"], h1.pp-header__title, h2.hp__hotel-name, h1, h2');
	const roomTable = await waitForRooms();

	let rooms = [];
	const processedElements = new WeakSet(); // Track processed DOM elements to avoid duplicates

	if (roomTable) {
		// Method 1: Find all table rows with room data
		const allRows = roomTable.querySelectorAll('tr');
		let currentRoomType = '';
		
		allRows.forEach(row => {
			// Check if this row has a room type name
			const roomNameEl = row.querySelector(
				'.hprt-roomtype-icon-link, ' +
				'a.hprt-roomtype-link, ' + 
				'.hprt-roomtype-name, ' +
				'span.hprt-roomtype-icon-link, ' +
				'[data-testid="room-name"], ' +
				'.room-info a, ' +
				'td.hprt-table-cell-roomtype a'
			);
			
			if (roomNameEl) {
				currentRoomType = roomNameEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 100);
			}
			
			// Check if this row has a price
			const priceEl = row.querySelector(
				'.bui-price-display__value, ' +
				'.prco-valign-middle-helper, ' +
				'.hprt-price-price, ' +
				'[data-testid*="price"], ' +
				'.bui-price-display__value, ' +
				'td.hprt-table-cell-price .bui-price-display__value'
			);
			
			if (priceEl && !processedElements.has(priceEl)) {
				processedElements.add(priceEl);
				const priceText = priceEl.textContent.replace(/[^\d.,]/g, '').trim();
				
				// Extract booking conditions (cancellation policy, etc.)
				let conditions = [];
				const conditionSelectors = [
					'.hprt-conditions-header',
					'.hprt-conditions li',
					'[data-testid*="cancellation"]',
					'[data-testid*="condition"]',
					'.bui-list__description',
					'.hprt-table-cell-conditions li',
					'.mpc-inline-block',
					'.hprt-conditions-cell .mpc-wrapper',
					'[class*="cancellation"]',
					'[class*="conditions"]'
				];
				
				// Look in the row itself for conditions
				conditionSelectors.forEach(sel => {
					row.querySelectorAll(sel).forEach(el => {
						const text = el.textContent.trim().replace(/\s+/g, ' ');
						if (text && text.length > 2 && text.length < 100) {
							// Filter for relevant condition text
							const lowerText = text.toLowerCase();
							if (lowerText.includes('cancel') || 
								lowerText.includes('refund') || 
								lowerText.includes('flexible') ||
								lowerText.includes('reschedule') ||
								lowerText.includes('non-') ||
								lowerText.includes('free') ||
								lowerText.includes('no prepayment') ||
								lowerText.includes('pay at') ||
								lowerText.includes('breakfast') ||
								lowerText.includes('included')) {
								if (!conditions.includes(text)) {
									conditions.push(text);
								}
							}
						}
					});
				});
				
				// Also check sibling cells in the same row for conditions
				const conditionCell = row.querySelector('.hprt-table-cell-conditions, [data-testid*="conditions"]');
				if (conditionCell) {
					const cellText = conditionCell.textContent.trim().replace(/\s+/g, ' ');
					// Split by common delimiters and filter
					cellText.split(/[•·|]/).forEach(part => {
						const text = part.trim();
						if (text && text.length > 2 && text.length < 100 && !conditions.includes(text)) {
							conditions.push(text);
						}
					});
				}
				
				// Extract condition label as a single string
				let conditionLabel = conditions.length > 0 ? conditions.join(' | ') : 'Standard Rate';
				
				if (priceText && currentRoomType) {
					rooms.push({ 
						room: currentRoomType, 
						price: priceText,
						condition: conditionLabel
					});
				}
			}
		});
	}

	// Method 2: Alternative approach - find all room type blocks
	if (rooms.length === 0) {
		const roomBlocks = document.querySelectorAll(
			'.hprt-table-room-block, ' +
			'[data-testid*="room-row"], ' +
			'.roomrow, ' +
			'tr[data-block-id]'
		);
		
		roomBlocks.forEach(block => {
			const nameEl = block.querySelector(
				'.hprt-roomtype-icon-link, a[data-room-name], .hprt-roomtype-name, h3, h4'
			);
			const priceEl = block.querySelector(
				'.bui-price-display__value, .prco-valign-middle-helper, .hprt-price-price'
			);
			
			if (nameEl && priceEl && !processedElements.has(priceEl)) {
				processedElements.add(priceEl);
				const roomType = nameEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 100);
				const price = priceEl.textContent.replace(/[^\d.,]/g, '').trim();
				if (roomType && price) {
					rooms.push({ room: roomType, price: price, condition: 'Standard Rate' });
				}
			}
		});
	}

	// Method 3: Direct price element search with parent traversal
	if (rooms.length === 0) {
		const priceEls = document.querySelectorAll(
			'.bui-price-display__value, .prco-valign-middle-helper, .hprt-price-price'
		);
		
		priceEls.forEach((priceEl, idx) => {
			if (processedElements.has(priceEl)) return;
			const price = priceEl.textContent.replace(/[^\d.,]/g, '').trim();
			if (!price) return;
			
			processedElements.add(priceEl);
			
			// Walk up to find associated room name
			let parent = priceEl.parentElement;
			let roomType = '';
			for (let i = 0; i < 10 && parent; i++) {
				const nameEl = parent.querySelector(
					'.hprt-roomtype-icon-link, .hprt-roomtype-name, a[data-room-name]'
				);
				if (nameEl) {
					roomType = nameEl.textContent.trim().replace(/\s+/g, ' ').substring(0, 100);
					break;
				}
				parent = parent.parentElement;
			}
			
			if (!roomType) roomType = 'Room Option ' + (idx + 1);
			
			rooms.push({ room: roomType, price: price, condition: 'Standard Rate' });
		});
	}

	// Method 4: Last resort - capture any visible prices
	if (rooms.length === 0) {
		const allPrices = document.querySelectorAll('[class*="price"]');
		allPrices.forEach((el, idx) => {
			if (processedElements.has(el)) return;
			const text = el.textContent;
			const match = text.match(/\d[\d,.\s]*\d/);
			if (match) {
				processedElements.add(el);
				const price = match[0].replace(/\s/g, '');
				rooms.push({ room: `Room Option ${idx + 1}`, price: price, condition: 'Standard Rate' });
			}
		});
	}

	// Log for debugging
	console.log('Booking Tracker: Found', rooms.length, 'room options');
	console.log('Booking Tracker: Rooms:', rooms);

	// Normalize URL by removing query params, trailing slashes for consistent tracking
	const urlObj = new URL(window.location.href);
	const normalizedUrl = (urlObj.origin + urlObj.pathname).replace(/\/+$/, '').toLowerCase();

	return {
		site: 'booking',
		name: nameEl ? nameEl.innerText : "Unknown Hotel",
		rooms: rooms,
		url: window.location.href,
		normalizedUrl: normalizedUrl,
		lastChecked: new Date().toLocaleString()
	};
}



// Listen for GET_HOTEL_DATA requests (for manual fetch)
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
	if (req.action === "GET_HOTEL_DATA") {
		getHotelData().then(sendResponse);
		return true; // indicate async response
	}
});

// On hotel page load, send price data to extension for auto-update
if (window.location.hostname.includes('booking.com')) {
	// Wait for page to be fully loaded before extracting data
	let retryCount = 0;
	const maxRetries = 6;
	
	function sendHotelUpdate() {
		getHotelData().then(data => {
			// Only send if we have room data
				if (data && data.rooms && data.rooms.length > 0) {
					chrome.runtime.sendMessage({ action: 'HOTEL_PRICE_UPDATE', ...data, site: 'booking' }, response => {
					// Check for errors (service worker might be inactive)
					if (chrome.runtime.lastError && retryCount < maxRetries) {
						console.log('Booking Tracker: Retrying send...', chrome.runtime.lastError);
						retryCount++;
						setTimeout(sendHotelUpdate, 2000);
					} else {
						console.log('Booking Tracker: Data sent successfully');
					}
				});
			} else if (retryCount < maxRetries) {
				// No rooms found, retry after a delay (Booking.com loads rooms dynamically)
				console.log('Booking Tracker: No rooms found, retrying... (' + (retryCount + 1) + '/' + maxRetries + ')');
				retryCount++;
				setTimeout(sendHotelUpdate, 4000); // 4 second delay for dynamic loading
			} else {
				console.log('Booking Tracker: Max retries reached, no room data found');
			}
		});
	}
	
	// Start after page is ready - allow extra time for dynamic content
	if (document.readyState === 'complete') {
		setTimeout(sendHotelUpdate, 2000); // 2 second initial delay
	} else {
		window.addEventListener('load', () => {
			setTimeout(sendHotelUpdate, 2000);
		});
	}
}
