// Show last input value for auto refresh interval and dates

// Helper function to show feedback messages with proper styling
function showFeedback(message, isError = false) {
	const feedback = document.getElementById('feedback');
	feedback.textContent = message;
	feedback.className = isError ? 'show error' : 'show success';
	// Auto-hide after 5 seconds
	setTimeout(() => {
		feedback.className = '';
	}, 5000);
}

/**
 * Subscription System Integration
 * Checks if user has an active subscription and shows upgrade banner if not
 */

// Get or create a unique user ID for this browser
function getUserId() {
	return new Promise(resolve => {
		chrome.storage.local.get(['userId'], result => {
			if (result.userId) {
				resolve(result.userId);
			} else {
				// Generate new user ID
				const newUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
				chrome.storage.local.set({ userId: newUserId }, () => {
					resolve(newUserId);
				});
			}
		});
	});
}

// Verify subscription status with backend
async function checkSubscriptionStatus() {
	try {
		const userId = await getUserId();
		// Replace YOUR_WORKER_URL with your actual Cloudflare Worker URL
		const workerUrl = 'https://hotel-price-tracker-worker.kent-ooi1987.workers.dev';
		
		const response = await fetch(`${workerUrl}/verify/${userId}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});
		
		if (!response.ok) {
			console.log('Subscription check failed, showing upgrade banner');
			return false;
		}
		
		const data = await response.json();
		return data.subscribed || false;
	} catch (error) {
		console.error('Error checking subscription:', error);
		// On error, default to showing upgrade banner
		return false;
	}
}

// Show/hide upgrade banner based on subscription status
async function updateUpgradeBanner() {
	const banner = document.getElementById('upgradeBanner');
	if (!banner) return;
	
	const isSubscribed = await checkSubscriptionStatus();
	if (isSubscribed) {
		banner.classList.remove('show');
	} else {
		banner.classList.add('show');
	}
}

// Handle upgrade button click
document.addEventListener('DOMContentLoaded', () => {
	const upgradeBtn = document.getElementById('upgradeBtn');
	if (upgradeBtn) {
		upgradeBtn.addEventListener('click', async () => {
			try {
				const userId = await getUserId();
				const workerUrl = 'https://hotel-price-tracker-worker.kent-ooi1987.workers.dev';
				const returnUrl = chrome.runtime.getURL('popup.html');
				
				const response = await fetch(`${workerUrl}/checkout`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						userId: userId,
						returnUrl: returnUrl
					})
				});
				
				if (!response.ok) {
					showFeedback('Failed to open checkout. Please try again.', true);
					return;
				}
				
				const data = await response.json();
				if (data.url) {
					chrome.tabs.create({ url: data.url });
				}
			} catch (error) {
				console.error('Error starting checkout:', error);
				showFeedback('Error opening checkout page', true);
			}
		});
	}
});

// Check subscription status on popup load
updateUpgradeBanner();
// Check again every 30 seconds
setInterval(updateUpgradeBanner, 30000);

let activeSite = 'booking';
let _loadGeneration = 0; // Guard against concurrent loadHotels() race conditions

// Helper: detect site from data/url
function detectSite(h) {
	if (h.site) return h.site;
	const url = h.url || '';
	if (url.includes('airbnb')) return 'airbnb';
	if (url.includes('agoda')) return 'agoda';
	return 'booking';
}

// Helper: normalize URL for comparison
function normalizeForComparison(url) {
	if (!url) return '';
	try {
		const u = new URL(url);
		return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
	} catch (e) {
		return (url || '').toLowerCase();
	}
}

function setActiveSite(site) {
	activeSite = site;
	chrome.storage.local.set({ activeSite: site });
	// Toggle tab UI
	document.querySelectorAll('.site-tab').forEach(tab => {
		tab.classList.toggle('active', tab.getAttribute('data-site') === site);
	});
	loadHotels();
	loadPriceChangeNotifications();
}

chrome.storage.local.get({ activeSite: 'booking' }, res => {
	activeSite = res.activeSite || 'booking';
	setActiveSite(activeSite);
	// Initialize tab events
	document.querySelectorAll('.site-tab').forEach(tab => {
		tab.addEventListener('click', () => setActiveSite(tab.getAttribute('data-site')));
	});
});

chrome.storage.local.get({ autoRefresh: 30, checkin: '', checkout: '' }, res => {
    const input = document.getElementById('intervalInput');
    if (input && res.autoRefresh) {
        input.value = res.autoRefresh;
    }
    const checkinInput = document.getElementById('checkinInput');
    if (checkinInput && res.checkin) {
        checkinInput.value = res.checkin;
    }
    const checkoutInput = document.getElementById('checkoutInput');
    if (checkoutInput && res.checkout) {
        checkoutInput.value = res.checkout;
    }
});

document.getElementById('setDateBtn').addEventListener('click', () => {
	const checkin = document.getElementById('checkinInput').value;
	const checkout = document.getElementById('checkoutInput').value;
	if (!checkin || !checkout) {
		showFeedback('Please select both check-in and check-out dates.', true);
		return;
	}
	chrome.storage.local.set({ checkin, checkout }, () => {
		showFeedback('Dates updated!');
	});
});

document.getElementById("trackBtn").addEventListener("click", function() {
	// Check dates are set first
	chrome.storage.local.get({ checkin: '', checkout: '' }, res => {
		if (!res.checkin || !res.checkout) {
			showFeedback('Please set check-in and check-out dates first.', true);
			return;
		}
		trackHotel();
	});
});
document.getElementById("refreshBtn").addEventListener("click", () => {
	chrome.storage.local.get({ checkin: '', checkout: '' }, res => {
		if (!res.checkin || !res.checkout) {
			showFeedback('Please set check-in and check-out dates first.', true);
			return;
		}
		if (!confirm('Refresh all tracked hotels now?')) return;
		chrome.runtime.sendMessage({ action: "FORCE_BACKGROUND_FETCH" }, () => {
			showFeedback('Refreshing...');
			// Poll for updated data, up to 10 times
			let tries = 0;
			function poll() {
				loadHotels();
				tries++;
				if (tries < 10) setTimeout(poll, 500);
			}
			setTimeout(poll, 500);
		});
	});
});

document.getElementById("setIntervalBtn").addEventListener("click", function() {
	if (!confirm('Set auto refresh interval?')) return;
	setAutoRefresh();
});
document.getElementById("intervalInput").addEventListener("keydown", function(e) {
	if (e.key === "Enter") {
		if (!confirm('Set auto refresh interval?')) return;
		setAutoRefresh();
	}
});

// Track hotel by URL
document.getElementById("trackUrlBtn").addEventListener("click", function() {
	const urlInput = document.getElementById("hotelUrlInput");
	const url = urlInput.value.trim();
	
	if (!url) {
		showFeedback('Please enter a hotel URL.', true);
		return;
	}
	
	// Validate booking or airbnb URL
	const isBooking = url.includes('booking.com');
	const isAirbnb = url.includes('airbnb');
	if (!isBooking && !isAirbnb) {
		showFeedback('Please enter a Booking.com or Airbnb URL.', true);
		return;
	}
	
	// Check dates are set - required for prices to show
	chrome.storage.local.get({ checkin: '', checkout: '' }, res => {
		if (!res.checkin || !res.checkout) {
			showFeedback('Please set check-in and check-out dates first. Prices won\'t show without dates.', true);
			return;
		}
		
		let fetchUrl = url;
		try {
			const u = new URL(url);
			// Different sites use different date parameter formats
			if (isAgoda) {
				// Agoda: camelCase checkIn/checkOut
				u.searchParams.set('checkIn', res.checkin);
				u.searchParams.set('checkOut', res.checkout);
				// Ensure required Agoda parameters
				if (!u.searchParams.has('adults')) u.searchParams.set('adults', '2');
				if (!u.searchParams.has('rooms')) u.searchParams.set('rooms', '1');
				if (!u.searchParams.has('children')) u.searchParams.set('children', '0');
			} else if (isAirbnb) {
				// Airbnb: underscores check_in/check_out
				u.searchParams.set('check_in', res.checkin);
				u.searchParams.set('check_out', res.checkout);
			} else {
				// Booking.com: lowercase checkin/checkout
				u.searchParams.set('checkin', res.checkin);
				u.searchParams.set('checkout', res.checkout);
			}
			fetchUrl = u.toString();
		} catch (e) {}
		
		showFeedback('Opening hotel page...');
		
		// Open in incognito and listen for data
		const site = isAirbnb ? 'airbnb' : (fetchUrl.includes('agoda') ? 'agoda' : 'booking');
		chrome.runtime.sendMessage({ action: 'TRACK_FROM_URL', url: fetchUrl, site: site }, response => {
			if (response && response.ok) {
				urlInput.value = '';
				showFeedback('Hotel page opened. Waiting for data...');
			}
		});
	});
});

// Open all tracked hotels with set dates
document.getElementById("openAllBtn").addEventListener("click", async function() {
	if (!confirm('Open all tracked hotel pages with set dates?')) return;
	chrome.storage.local.get({ hotels: [], checkin: '', checkout: '' }, res => {
		let { hotels, checkin, checkout } = res;
		hotels = (hotels || []).filter(h => (h.site || detectSite(h)) === activeSite);
		if (!hotels.length) {
			showFeedback('No hotels tracked.', true);
			return;
		}
		if (!checkin || !checkout) {
			showFeedback('Please set both check-in and check-out dates before opening tracked hotels.', true);
			return;
		}
		// Track status for each hotel using normalizedUrl
		let statusMap = {};
		hotels.forEach((hotel, idx) => {
			// Use normalizedUrl as key, add dates to URL
			const normalizedUrl = hotel.normalizedUrl || hotel.url;
			let url = normalizedUrl;
			if (checkin && checkout) {
				const u = new URL(url);
				// Different sites use different date parameter formats
				const isAgoda = url.includes('agoda');
				const isAirbnb = url.includes('airbnb');
				
				if (isAgoda) {
					// Agoda: camelCase checkIn/checkOut
					u.searchParams.set('checkIn', checkin);
					u.searchParams.set('checkOut', checkout);
					// Ensure required Agoda parameters
					if (!u.searchParams.has('adults')) u.searchParams.set('adults', '2');
					if (!u.searchParams.has('rooms')) u.searchParams.set('rooms', '1');
					if (!u.searchParams.has('children')) u.searchParams.set('children', '0');
				} else if (isAirbnb) {
					// Airbnb: underscores check_in/check_out
					u.searchParams.set('check_in', checkin);
					u.searchParams.set('check_out', checkout);
				} else {
					// Booking.com: lowercase checkin/checkout
					u.searchParams.set('checkin', checkin);
					u.searchParams.set('checkout', checkout);
				}
				url = u.toString();
			}
			statusMap[normalizedUrl] = 'Opening...';
			// Open in incognito mode via background script
			chrome.runtime.sendMessage({ action: 'OPEN_INCOGNITO_TAB', url: url }, response => {
				// Tab opened
			});
		});
		// Show initial status
		updateOpenAllStatus(statusMap);
		showFeedback('Opening all tracked hotels...');
		// Listen for updates from content script
		chrome.runtime.onMessage.addListener(function handler(msg, sender) {
			if (msg.action === 'HOTEL_PRICE_UPDATE' && msg.normalizedUrl && statusMap[msg.normalizedUrl] !== undefined && statusMap[msg.normalizedUrl] !== 'Updated') {
				statusMap[msg.normalizedUrl] = 'Updated';
				updateOpenAllStatus(statusMap);
				// If all updated, remove listener
				if (Object.values(statusMap).every(s => s === 'Updated')) {
					chrome.runtime.onMessage.removeListener(handler);
					showFeedback('All hotels updated!');
				}
			}
		});
	});
});

function updateOpenAllStatus(statusMap) {
	const list = document.getElementById('list');
	let html = '<b>Status:</b><ul>';
	for (const [url, status] of Object.entries(statusMap)) {
		html += `<li>${url}: ${status}</li>`;
	}
	html += '</ul>';
	list.innerHTML = html;
}
function trackHotel() {
	chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
		chrome.tabs.sendMessage(tabs[0].id, { action: "GET_HOTEL_DATA" }, data => {
			if (!data || !data.url) {
				showFeedback('Failed to get hotel data.', true);
				return;
			}
			chrome.storage.local.get({ hotels: [] }, res => {
				let hotels = res.hotels || [];

				const normalizedUrl = normalizeForComparison(data.normalizedUrl || data.url);
				const currentSite = data.site || activeSite || 'booking';
			
			// Check for duplicates
			const exists = hotels.some(h => {
				const hNormalized = normalizeForComparison(h.normalizedUrl || h.url);
				const hSite = h.site || detectSite(h);
				return hSite === currentSite && hNormalized === normalizedUrl;
			});
			if (exists) {
				showFeedback('This hotel is already in your list.', true);
				return;
			}
			
			data.normalizedUrl = normalizedUrl;
			data.site = currentSite;
			hotels.push(data);
			chrome.storage.local.set({ hotels: hotels }, () => {
					showFeedback('Hotel tracked!');
					loadHotels();
				});
			});
		});
	});
}

function removeHotel(url, site) {
	chrome.storage.local.get({ hotels: [] }, res => {
		let hotels = res.hotels || [];
		const normalized = normalizeForComparison(url);
		// Remove hotel matching this site + normalized URL
		hotels = hotels.filter(h => {
			const hSite = h.site || detectSite(h);
			const hUrl = normalizeForComparison(h.normalizedUrl || h.url);
			return !(hSite === site && hUrl === normalized);
		});
		chrome.storage.local.set({ hotels: hotels }, loadHotels);
	});
}


function updateCountdown() {
	chrome.storage.local.get(['nextBackgroundFetch'], res => {
		const countdownEl = document.getElementById('countdown');
		if (!countdownEl) return;
		const next = res.nextBackgroundFetch;
		if (!next) {
			countdownEl.textContent = '';
			return;
		}
		const now = Date.now();
		let diff = Math.max(0, Math.floor((next - now) / 1000));
		const min = Math.floor(diff / 60);
		const sec = diff % 60;
		countdownEl.textContent = `Next auto update in: ${min}m ${sec < 10 ? '0' : ''}${sec}s`;
	});
}


function loadHotels() {
	const gen = ++_loadGeneration; // Increment generation to invalidate older calls
	chrome.storage.local.get({ hotels: [] }, res => {
		if (gen !== _loadGeneration) return; // Stale call, skip
		const list = document.getElementById("list");
		if (!list) return;
		
		let hotels = res.hotels || [];
		
		// Ensure all hotels have site and normalizedUrl set
		hotels = hotels.map(h => ({
			...h,
			site: h.site || detectSite(h),
			normalizedUrl: h.normalizedUrl || normalizeForComparison(h.url)
		}));
		
		// Deduplicate by site + normalizedUrl
		const seen = new Set();
		const uniqueHotels = [];
		hotels.forEach(h => {
			const key = h.site + '|' + h.normalizedUrl;
			if (!seen.has(key)) {
				seen.add(key);
				uniqueHotels.push(h);
			}
		});
		
		// Save back if we deduplicated
		if (uniqueHotels.length !== hotels.length) {
			chrome.storage.local.set({ hotels: uniqueHotels });
			hotels = uniqueHotels;
		} else {
			hotels = uniqueHotels;
		}

		// Filter by active site
		const filtered = hotels.filter(h => h.site === activeSite);
		
		// Update badge
		const countEl = document.getElementById('hotelCount');
		if (countEl) countEl.textContent = filtered.length;
		
		if (filtered.length === 0) {
			list.innerHTML = "";
			return;
		}

		const bgKeys = filtered.map(h => 'backgroundHotelData_' + h.site + '_' + h.normalizedUrl);
		chrome.storage.local.get(bgKeys, bgData => {
			if (gen !== _loadGeneration) return; // Stale call, skip
			list.innerHTML = ""; // Clear here (inside innermost callback) to prevent race duplicates
			filtered.forEach((h, index) => {
				const bgKey = 'backgroundHotelData_' + h.site + '_' + h.normalizedUrl;
				const bg = bgData[bgKey];
				let refreshedAt = null;
				let roomsHtml = "<span class='room'>No room data</span>";

				let rooms = [];
				if (bg && Array.isArray(bg.rooms) && bg.rooms.length > 0) {
					refreshedAt = bg.fetchedAt || null;
					rooms = bg.rooms;
				} else if (Array.isArray(h.rooms) && h.rooms.length > 0) {
					refreshedAt = h.lastChecked || null;
					rooms = h.rooms;
				}

				if (rooms.length > 0) {
					const prevRooms = (bg && bg.previousRooms) ? bg.previousRooms : (h.rooms || []);
					const prevPriceMap = {};
					prevRooms.forEach((r, i) => { prevPriceMap[r.room + '|' + i] = r.price; });

					roomsHtml = `
						<table class="room-table">
							<thead>
								<tr><th style="width:35%">Room Type</th><th style="width:30%">Condition</th><th style="width:17%">Price</th><th style="width:10%">Chg</th><th style="width:8%"></th></tr>
							</thead>
							<tbody>
								${rooms.map((r, i) => {
									const prevPrice = prevPriceMap[r.room + '|' + i];
									let changeHtml = '<span class="no-change">-</span>';
									if (prevPrice && prevPrice !== r.price) {
										const oldNum = parseFloat(prevPrice.replace(/,/g, ''));
										const newNum = parseFloat(r.price.replace(/,/g, ''));
										if (!isNaN(oldNum) && !isNaN(newNum) && oldNum !== newNum) {
											const diff = newNum - oldNum;
											const pct = Math.abs((diff / oldNum) * 100).toFixed(1);
											changeHtml = diff < 0 ? `<span class="price-down">↓${pct}%</span>` : `<span class="price-up">↑${pct}%</span>`;
										}
									}
									let conditionHtml = r.condition || 'Standard Rate';
									const condLower = conditionHtml.toLowerCase();
									let condClass = 'condition-standard';
									if (condLower.includes('free cancel') || condLower.includes('free cancellation')) {
										condClass = 'condition-free';
									} else if (condLower.includes('non-refund') || condLower.includes('no refund') || condLower.includes('non refund')) {
										condClass = 'condition-nonrefund';
									} else if (condLower.includes('flexible')) {
										condClass = 'condition-flexible';
									}
									const roomName = r.room || 'Unknown';
									const needsExpand = roomName.length > 20 || conditionHtml.length > 15;
									const collapsedClass = needsExpand ? 'collapsed' : '';
									const expandBtn = needsExpand ? `<span class="expand-btn" data-row="${i}">▼</span>` : '';
									return `<tr data-row="${i}">
										<td class="room-cell"><span class="cell-text ${collapsedClass}" title="${roomName.replace(/"/g, '&quot;')}">${roomName}</span></td>
										<td class="cond-cell"><span class="cell-text ${collapsedClass} ${condClass}" title="${conditionHtml}">${conditionHtml}</span></td>
										<td class="price">RM ${String(r.price).replace(/^(RM|MYR)\s*/i, '')}</td>
										<td>${changeHtml}</td>
										<td class="expand-cell">${expandBtn}</td>
									</tr>`;
								}).join('')}
							</tbody>
						</table>
					`;
				}

				const statusLine = refreshedAt
					? `<span style='color:#28a745;'>✓ ${refreshedAt}</span>`
					: `<span style='color:#dc3545;'>⚠ Never refreshed</span>`;
				const siteBadge = h.site === 'airbnb' ? '<span class="condition-flexible" style="margin-left:6px;">Airbnb</span>' : 
				                  h.site === 'agoda' ? '<span class="condition-good" style="margin-left:6px;">Agoda</span>' : 
				                  '<span class="condition-standard" style="margin-left:6px;">Booking</span>';
				const div = document.createElement("div");
				div.className = "hotel";
				div.innerHTML = `
					<div class="hotel-name">${h.name} ${siteBadge}</div>
					<div class="hotel-meta">
						${statusLine} · <span class="open-page-link" data-url="${h.url.replace(/"/g, '&quot;')}" style="color:#003580;cursor:pointer;text-decoration:underline;">Open Page ↗</span>
					</div>
					${roomsHtml}
				<button class="btn-remove" data-url="${h.normalizedUrl}" data-site="${h.site}">✕ Remove</button>
				`;
				list.appendChild(div);
			});

			document.querySelectorAll("button[data-url]").forEach(btn => {
				btn.addEventListener("click", e => {
					const url = e.target.getAttribute("data-url");
					const site = e.target.getAttribute("data-site");
					removeHotel(url, site);
				});
			});

			document.querySelectorAll(".expand-btn").forEach(btn => {
				btn.addEventListener("click", e => {
					const row = e.target.closest('tr');
					if (row) {
						const cells = row.querySelectorAll('.cell-text');
						const isCollapsed = cells[0] && cells[0].classList.contains('collapsed');
						cells.forEach(cell => {
							if (isCollapsed) {
								cell.classList.remove('collapsed');
							} else {
								cell.classList.add('collapsed');
							}
						});
						e.target.textContent = isCollapsed ? '▲' : '▼';
					}
				});
			});

			document.querySelectorAll(".open-page-link").forEach(link => {
				link.addEventListener("click", e => {
					let url = e.target.getAttribute('data-url');
					if (url) {
						chrome.storage.local.get({ checkin: '', checkout: '' }, res => {
							if (res.checkin && res.checkout) {
								try {
									const u = new URL(url);
									// Different sites use different date parameter formats
									const isAgoda = url.includes('agoda');
									const isAirbnb = url.includes('airbnb');
									
									if (isAgoda) {
										// Agoda: camelCase checkIn/checkOut
										u.searchParams.set('checkIn', res.checkin);
										u.searchParams.set('checkOut', res.checkout);
										// Ensure required Agoda parameters
										if (!u.searchParams.has('adults')) u.searchParams.set('adults', '2');
										if (!u.searchParams.has('rooms')) u.searchParams.set('rooms', '1');
										if (!u.searchParams.has('children')) u.searchParams.set('children', '0');
									} else if (isAirbnb) {
										// Airbnb: underscores check_in/check_out
										u.searchParams.set('check_in', res.checkin);
										u.searchParams.set('check_out', res.checkout);
									} else {
										// Booking.com: lowercase checkin/checkout
										u.searchParams.set('checkin', res.checkin);
										u.searchParams.set('checkout', res.checkout);
									}
									url = u.toString();
								} catch (e) {}
							}
							chrome.runtime.sendMessage({ action: 'OPEN_INCOGNITO_TAB', url: url });
						});
					}
				});
			});
		});
	});
}

function setAutoRefresh() {
	const val = document.getElementById("intervalInput").value;
	const minutes = parseInt(val);
	if (!minutes || minutes < 1) {
		showFeedback('Please enter a valid number of minutes.', true);
		return;
	}
	chrome.storage.local.set({ autoRefresh: minutes }, () => {
		showFeedback('Auto refresh interval set to ' + minutes + ' minutes.');
		chrome.runtime.sendMessage({ action: "RESET_ALARM" });
	});
}



// Add countdown element if not present
if (!document.getElementById('countdown')) {
	const cd = document.createElement('div');
	cd.id = 'countdown';
	cd.style = 'font-size:12px;color:#888;margin-bottom:5px;';
	const list = document.getElementById('list');
	if (list) list.parentNode.insertBefore(cd, list);
}

// Show last input value for auto refresh interval
chrome.storage.local.get({ autoRefresh: 30 }, res => {
	const input = document.getElementById('intervalInput');
	if (input && res.autoRefresh) {
		input.value = res.autoRefresh;
	}
});

setInterval(updateCountdown, 1000);
updateCountdown();
loadHotels();

// Auto-refresh popup when background data changes
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local') {
		// Check if any backgroundHotelData, priceChanges, or hotels list were updated
		const relevantKeys = Object.keys(changes).filter(k => 
			k.startsWith('backgroundHotelData_') || k === 'priceChanges' || k === 'hotels'
		);
		if (relevantKeys.length > 0) {
			loadHotels();
			loadPriceChangeNotifications();
		}
	}
});

// Load and display price change notifications
function loadPriceChangeNotifications() {
	chrome.storage.local.get({ priceChanges: [] }, res => {
		const notifContainer = document.getElementById('priceChangeNotifications');
		if (!notifContainer) return;
		let changes = res.priceChanges || [];
		changes = changes.filter(c => (c.site || 'booking') === activeSite);
		if (changes.length === 0) {
			notifContainer.innerHTML = '';
			notifContainer.style.display = 'none';
			return;
		}
		notifContainer.style.display = 'block';
		notifContainer.innerHTML = `
			<div class="notif-header">
				<b>Price Changes Detected!</b>
				<button id="clearNotifBtn" style="float:right;font-size:10px;">Clear All</button>
			</div>
			${changes.map((c, i) => `
				<div class="price-change-item ${c.direction}">
					<b>${c.hotelName}</b> <span class="condition-standard" style="margin-left:4px;">${(c.site || 'booking').toUpperCase()}</span><br>
					<span>${c.roomType}</span><br>
					<span class="old-price">RM ${String(c.oldPrice).replace(/^(RM|MYR)\s*/i, '')}</span> → 
					<span class="new-price">RM ${String(c.newPrice).replace(/^(RM|MYR)\s*/i, '')}</span>
					<span class="change-badge ${c.direction}">${c.direction === 'down' ? '↓' : '↑'} ${c.changePercent}%</span>
					<small style="display:block;color:#666;">${c.timestamp}</small>
				</div>
			`).join('')}
		`;
		document.getElementById('clearNotifBtn')?.addEventListener('click', () => {
			chrome.storage.local.set({ priceChanges: [] }, loadPriceChangeNotifications);
		});
	});
}

// Load notifications on startup
loadPriceChangeNotifications();
