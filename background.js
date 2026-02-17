// Track refresh tabs in memory (more reliable than async storage)
const pendingRefreshTabs = new Map();

// Track tabs opened for "track from URL" feature
const pendingTrackFromUrl = new Map();

// Track the incognito window ID for reuse
let incognitoWindowId = null;

// Open side panel when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// Helper to normalize URL for consistent storage keys
function normalizeUrl(url) {
	try {
		const u = new URL(url);
		return (u.origin + u.pathname).replace(/\/+$/, '').toLowerCase();
	} catch (e) {
		return url.toLowerCase();
	}
}

/**
 * Subscription System Integration
 * Verifies user subscription status with Cloudflare Worker backend
 */

// Get or create user ID for this browser
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

// Check subscription status (cached for 5 minutes to avoid excessive API calls)
async function checkSubscription() {
	return new Promise(resolve => {
		chrome.storage.local.get(['subscriptionStatus', 'subscriptionCheckTime'], async result => {
			const now = Date.now();
			const cachedStatus = result.subscriptionStatus;
			const cachedTime = result.subscriptionCheckTime || 0;
			
			// Return cached status if less than 5 minutes old
			if (cachedStatus !== undefined && (now - cachedTime) < 5 * 60 * 1000) {
				resolve(cachedStatus);
				return;
			}
			
			// Fetch fresh subscription status
			try {
				const userId = await getUserId();
				const workerUrl = 'https://your-worker-name.your-subdomain.workers.dev';
				
				const response = await fetch(`${workerUrl}/verify/${userId}`, {
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					}
				});
				
				if (!response.ok) {
					console.log('Subscription check failed');
					resolve(false);
					return;
				}
				
				const data = await response.json();
				const isSubscribed = data.subscribed || false;
				
				// Cache the result
				chrome.storage.local.set({
					subscriptionStatus: isSubscribed,
					subscriptionCheckTime: now
				});
				
				resolve(isSubscribed);
			} catch (error) {
				console.error('Error checking subscription:', error);
				// On error, allow free users to continue using extension
				resolve(false);
			}
		});
	});
}

// Helper to create tab in incognito mode
async function createIncognitoTab(url, callback) {
	try {
		console.log('Booking Tracker: Creating incognito tab for', url);
		
		// Check if extension has incognito access
		const canUseIncognito = await chrome.extension.isAllowedIncognitoAccess();
		console.log('Booking Tracker: Incognito access allowed?', canUseIncognito);
		
		if (!canUseIncognito) {
			console.log('Booking Tracker: Incognito not allowed, using normal tab');
			chrome.tabs.create({ url: url, active: false }, tab => {
				if (tab) {
					console.log('Booking Tracker: Created normal tab', tab.id);
					if (callback) callback(tab);
				}
			});
			return;
		}
		
		// First check if we have an existing incognito window
		const windows = await chrome.windows.getAll({ windowTypes: ['normal'] });
		const incognitoWindow = windows.find(w => w.incognito);
		
		if (incognitoWindow) {
			// Use existing incognito window
			console.log('Booking Tracker: Using existing incognito window', incognitoWindow.id);
			chrome.tabs.create({ windowId: incognitoWindow.id, url: url, active: false }, tab => {
				if (tab) {
					console.log('Booking Tracker: Created tab', tab.id, 'in incognito window');
					if (callback) callback(tab);
				}
			});
		} else {
			// Create new incognito window with the tab
			console.log('Booking Tracker: Creating new incognito window');
			chrome.windows.create({ url: url, incognito: true, focused: false }, window => {
				if (window && window.tabs && window.tabs[0]) {
					incognitoWindowId = window.id;
					console.log('Booking Tracker: Created tab', window.tabs[0].id, 'in new incognito window');
					if (callback) callback(window.tabs[0]);
				}
			});
		}
	} catch (err) {
		console.error('Booking Tracker: Failed to create incognito tab:', err);
		// Fallback to normal tab if incognito fails
		console.log('Booking Tracker: Falling back to normal tab');
		chrome.tabs.create({ url: url, active: false }, tab => {
			if (tab) {
				console.log('Booking Tracker: Created fallback normal tab', tab.id);
				if (callback) callback(tab);
			}
		});
	}
}

// Refresh hotels by opening tabs and letting content.js extract data
function refreshHotels() {
	chrome.storage.local.get({ hotels: [], checkin: '', checkout: '' }, res => {
		const hotels = (res.hotels || []).map(h => ({ site: h.site || 'booking', ...h }));
		const checkin = res.checkin;
		const checkout = res.checkout;
		
		// Clear any stale refresh tabs
		pendingRefreshTabs.clear();
		
		console.log('Booking Tracker: Starting refresh for', hotels.length, 'hotels');
		
		hotels.forEach(hotel => {
			if (hotel.url) {
				const normalizedUrl = normalizeUrl(hotel.normalizedUrl || hotel.url);
				let fetchUrl = hotel.url; // Use original URL as base for adding params
				
				// Add date params based on site
				const isAirbnb = hotel.url.includes('airbnb');
				const isAgoda = hotel.url.includes('agoda');
				
				if (checkin && checkout) {
					const u = new URL(fetchUrl);
					
					if (isAirbnb) {
						// Airbnb uses underscores: check_in / check_out
						u.searchParams.set('check_in', checkin);
						u.searchParams.set('check_out', checkout);
						console.log('Booking Tracker: Adding Airbnb dates - check_in:', checkin, 'check_out:', checkout);
					} else if (isAgoda) {
						// Agoda uses camelCase: checkIn/checkOut
						u.searchParams.set('checkIn', checkin);
						u.searchParams.set('checkOut', checkout);
						
						// Ensure Agoda has required booking parameters (if not already present)
						if (!u.searchParams.has('adults')) {
							u.searchParams.set('adults', '2');
						}
						if (!u.searchParams.has('rooms')) {
							u.searchParams.set('rooms', '1');
						}
						if (!u.searchParams.has('children')) {
							u.searchParams.set('children', '0');
						}
						
						console.log('Booking Tracker: Agoda URL with dates:', u.toString());
					} else {
						// Booking.com uses lowercase: checkin/checkout
						u.searchParams.set('checkin', checkin);
						u.searchParams.set('checkout', checkout);
						console.log('Booking Tracker: Booking.com URL with dates');
					}
					
					fetchUrl = u.toString();
				}
				// Open a background tab in incognito - content.js will extract data and send it back
				createIncognitoTab(fetchUrl, tab => {
					if (tab) {
						// Store tab id in memory immediately for fast lookup
						pendingRefreshTabs.set(tab.id, normalizedUrl);
						console.log('Booking Tracker: Opened refresh tab', tab.id, 'for', normalizedUrl);
						// Also store in persistent storage as backup (important for service worker restarts)
						chrome.storage.local.get({ refreshTabsList: {} }, data => {
							const list = data.refreshTabsList || {};
							list[tab.id] = normalizedUrl;
							chrome.storage.local.set({ refreshTabsList: list }, () => {
								console.log('Booking Tracker: Stored tab', tab.id, 'in persistent storage');
							});
						});
						
						// Safety timeout: close tab after 30 seconds if it hasn't sent data
						setTimeout(() => {
							if (pendingRefreshTabs.has(tab.id)) {
								console.log('Booking Tracker: Tab', tab.id, 'timed out, force closing');
								pendingRefreshTabs.delete(tab.id);
								chrome.storage.local.get({ refreshTabsList: {} }, data => {
									const list = data.refreshTabsList || {};
									delete list[tab.id];
									chrome.storage.local.set({ refreshTabsList: list });
								});
								chrome.tabs.remove(tab.id).catch(err => {
									console.log('Booking Tracker: Tab already closed:', err);
								});
							}
						}, 30000); // 30 second timeout
					}
				});
			}
		});
	});
}

// Listen for manual background fetch requests from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	if (msg && msg.action === 'FORCE_BACKGROUND_FETCH') {
		refreshHotels();
		sendResponse({ ok: true });
		return true;
	}
	if (msg && msg.action === 'RESET_ALARM') {
		setBackgroundFetchAlarm();
		sendResponse({ ok: true });
		return true;
	}
	if (msg && msg.action === 'OPEN_INCOGNITO_TAB') {
		createIncognitoTab(msg.url, tab => {
			sendResponse({ ok: true, tabId: tab ? tab.id : null });
		});
		return true; // Keep channel open for async response
	}
	if (msg && msg.action === 'TRACK_FROM_URL') {
		const normalizedUrl = normalizeUrl(msg.url);
		const site = msg.url.includes('airbnb') ? 'airbnb' : 
		             msg.url.includes('agoda') ? 'agoda' : 'booking';
		createIncognitoTab(msg.url, tab => {
			if (tab) {
				// Mark this tab as a "track from URL" tab
				pendingTrackFromUrl.set(tab.id, {
					site,
					normalizedUrl: normalizedUrl,
					originalUrl: msg.url
				});
				
				// Safety timeout: close tab after 30 seconds if it hasn't sent data
				setTimeout(() => {
					if (pendingTrackFromUrl.has(tab.id)) {
						console.log('Booking Tracker: Track-from-URL tab', tab.id, 'timed out, force closing');
						pendingTrackFromUrl.delete(tab.id);
						chrome.tabs.remove(tab.id).catch(err => {
							console.log('Booking Tracker: Tab already closed:', err);
						});
					}
				}, 30000); // 30 second timeout
			}
			sendResponse({ ok: true, tabId: tab ? tab.id : null });
		});
		return true;
	}
});

// Listen for hotel data from content.js and store it
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
	console.log('Booking Tracker: Received message:', msg?.action, 'from tab:', sender?.tab?.id);
	
	if (msg && msg.action === 'HOTEL_PRICE_UPDATE' && msg.normalizedUrl) {
		console.log('Booking Tracker: Processing HOTEL_PRICE_UPDATE for', msg.normalizedUrl, 'from tab', sender?.tab?.id);
		const site = msg.site || 'booking';
		const storageKey = 'backgroundHotelData_' + site + '_' + msg.normalizedUrl;
		
		// Get previous data to detect price changes
		chrome.storage.local.get([storageKey, 'priceChanges'], prevData => {
			const oldData = prevData[storageKey];
			const priceChanges = prevData.priceChanges || [];
			
			const withTime = {
				name: msg.name,
				prices: msg.rooms ? msg.rooms.map(r => r.price) : [],
				rooms: msg.rooms,
				previousRooms: oldData ? oldData.rooms : msg.rooms, // Store previous for comparison
				fetchedAt: new Date().toLocaleString()
			};
			
			// Detect price changes and send notifications
			if (oldData && oldData.rooms && msg.rooms) {
				const oldPriceMap = {};
				oldData.rooms.forEach(r => { oldPriceMap[r.room] = r.price; });
				
				msg.rooms.forEach(newRoom => {
					const oldPrice = oldPriceMap[newRoom.room];
					if (oldPrice && oldPrice !== newRoom.price) {
						const oldNum = parseFloat(oldPrice.replace(/,/g, ''));
						const newNum = parseFloat(newRoom.price.replace(/,/g, ''));
						
						if (!isNaN(oldNum) && !isNaN(newNum) && oldNum !== newNum) {
							const diff = newNum - oldNum;
							const pct = Math.abs((diff / oldNum) * 100).toFixed(1);
							const direction = diff < 0 ? 'down' : 'up';
							
							// Add to price changes list
							priceChanges.unshift({
								site: site,
								hotelName: msg.name,
								normalizedUrl: msg.normalizedUrl,
								roomType: newRoom.room,
								oldPrice: oldPrice,
								newPrice: newRoom.price,
								changePercent: pct,
								direction: direction,
								timestamp: new Date().toLocaleString()
							});
							
							// Keep only last 20 changes
							if (priceChanges.length > 20) {
								priceChanges.length = 20;
							}
							
							// Send Chrome notification
							const notifId = 'price-change-' + Date.now();
							const arrow = direction === 'down' ? '↓' : '↑';
							const verb = direction === 'down' ? 'dropped' : 'increased';
							chrome.notifications.create(notifId, {
								type: 'basic',
								iconUrl: chrome.runtime.getURL('icon.png'),
								title: `Price ${verb}! ${arrow}${pct}%`,
										message: `${msg.name}\n${newRoom.room}\nRM ${String(oldPrice).replace(/^(RM|MYR)\s*/i, '')} → RM ${String(newRoom.price).replace(/^(RM|MYR)\s*/i, '')}`,    
								priority: 2
							});
						}
					}
				});
				
				// Save updated price changes
				chrome.storage.local.set({ priceChanges });
			}
			
			chrome.storage.local.set({ [storageKey]: withTime }, () => {
				console.log('Booking Tracker: Saved data for', msg.normalizedUrl);
				
				// Handle tab closing AFTER data is saved
				if (sender.tab && sender.tab.id) {
					const tabId = sender.tab.id;
					
					// First, check if this is a "track from URL" tab - auto-add to hotels list
					if (pendingTrackFromUrl.has(tabId)) {
						const trackInfo = pendingTrackFromUrl.get(tabId);
						pendingTrackFromUrl.delete(tabId);
						console.log('Booking Tracker: Received data from track-from-URL tab', tabId);
						
						// Add to hotels list if not already tracked
						chrome.storage.local.get({ hotels: [] }, res => {
							let hotels = res.hotels || [];
							const exists = hotels.some(h => {
								const hSite = h.site || (h.url && h.url.includes('airbnb') ? 'airbnb' : 
														 h.url && h.url.includes('agoda') ? 'agoda' : 'booking');
								const hNorm = normalizeUrl(h.normalizedUrl || h.url);
								return hSite === (trackInfo.site || msg.site || 'booking') && hNorm === msg.normalizedUrl;
							});
							
							if (!exists) {
								const newHotel = {
									site: trackInfo.site || msg.site || 'booking',
									name: msg.name,
									url: trackInfo.originalUrl,
									normalizedUrl: msg.normalizedUrl,
									rooms: msg.rooms,
									lastChecked: new Date().toLocaleString()
								};
								hotels.push(newHotel);
								// Deduplicate by site + normalized URL before saving
								const seen = new Set();
								const cleaned = [];
								hotels.forEach(h => {
									const site = h.site || (h.url && h.url.includes('airbnb') ? 'airbnb' : 
															h.url && h.url.includes('agoda') ? 'agoda' : 'booking');
									const key = site + '|' + normalizeUrl(h.normalizedUrl || h.url);
									if (!seen.has(key)) {
										seen.add(key);
										cleaned.push({ ...h, site, normalizedUrl: normalizeUrl(h.normalizedUrl || h.url) });
									}
								});
								chrome.storage.local.set({ hotels: cleaned }, () => {
									console.log('Booking Tracker: Auto-tracked hotel from URL:', msg.name);
									// Send notification
									chrome.notifications.create('tracked-' + Date.now(), {
										type: 'basic',
										iconUrl: chrome.runtime.getURL('icon.png'),
										title: 'Hotel Tracked!',
										message: `${msg.name} has been added to your tracking list.`,
										priority: 1
									});
								});
							}
						});
						
						// Close the tab after a short delay
						console.log('Booking Tracker: Closing track-from-URL tab', tabId);
						setTimeout(() => {
							chrome.tabs.remove(tabId).catch(err => {
								console.log('Booking Tracker: Failed to close tab', tabId, err);
							});
						}, 1000);
					}
					// Otherwise, check if it's a refresh tab
					else if (pendingRefreshTabs.has(tabId)) {
						console.log('Booking Tracker: Found refresh tab', tabId, 'in memory, closing after save...');
						pendingRefreshTabs.delete(tabId);
						// Also remove from persistent storage
						chrome.storage.local.get({ refreshTabsList: {} }, data => {
							const list = data.refreshTabsList || {};
							if (list[tabId]) {
								delete list[tabId];
								chrome.storage.local.set({ refreshTabsList: list });
							}
						});
						// Close tab after ensuring data is saved (increased delay for safety)
						setTimeout(() => {
							chrome.tabs.remove(tabId).catch(err => {
								console.log('Booking Tracker: Failed to close tab', tabId, err);
							});
						}, 1500); // Increased from 500ms to 1500ms
					} else {
						// Fallback: check persistent storage (important if service worker restarted)
						console.log('Booking Tracker: Tab', tabId, 'not in memory, checking storage...');
						chrome.storage.local.get({ refreshTabsList: {} }, data => {
							const list = data.refreshTabsList || {};
							if (list[tabId]) {
								console.log('Booking Tracker: Found refresh tab', tabId, 'in storage, closing after save...');
								delete list[tabId];
								chrome.storage.local.set({ refreshTabsList: list });
								setTimeout(() => {
									chrome.tabs.remove(tabId).catch(err => {
										console.log('Booking Tracker: Failed to close tab', tabId, err);
									});
								}, 1500); // Increased from 500ms to 1500ms
							} else {
								console.log('Booking Tracker: Tab', tabId, 'not found in refresh tabs list');
							}
						});
					}
				}
			});
		});
		
		// Send response to confirm receipt
		sendResponse({ ok: true });
		return true;
	}
});



// Helper to set/restart the background fetch alarm
function setBackgroundFetchAlarm() {
	chrome.storage.local.get({ autoRefresh: 30 }, res => {
		const interval = parseInt(res.autoRefresh) || 30;
		chrome.alarms.clear('backgroundFetch', () => {
			chrome.alarms.create('backgroundFetch', { periodInMinutes: interval });
			// Store the next fetch time for countdown
			const nextFetch = Date.now() + interval * 60 * 1000;
			chrome.storage.local.set({ nextBackgroundFetch: nextFetch });
		});
	});
}

// Cleanup orphaned refresh tabs on startup
function cleanupOrphanedTabs() {
	chrome.storage.local.get({ refreshTabsList: {} }, data => {
		const list = data.refreshTabsList || {};
		const tabIds = Object.keys(list).map(id => parseInt(id));
		
		if (tabIds.length > 0) {
			// Verify which tabs are still open/valid
			tabIds.forEach(tabId => {
				chrome.tabs.get(tabId).then(tab => {
					// Tab exists - restore it to the in-memory map so it can be closed when data arrives
					if (tab) {
						pendingRefreshTabs.set(tabId, list[tabId]);
						console.log('Booking Tracker: Restored pending refresh tab', tabId);
					}
				}).catch(() => {
					// Tab doesn't exist anymore - remove from storage
					delete list[tabId];
					chrome.storage.local.set({ refreshTabsList: list });
				});
			});
		}
	});
}

// Initial alarm setup
setBackgroundFetchAlarm();

// Restore pending refresh tabs from storage (handles service worker restarts)
cleanupOrphanedTabs();

// Listen for changes to autoRefresh and reset alarm
chrome.storage.onChanged.addListener((changes, area) => {
	if (area === 'local' && changes.autoRefresh) {
		setBackgroundFetchAlarm();
	}
});

// Handle alarm: refresh all tracked hotels
chrome.alarms.onAlarm.addListener(alarm => {
	if (alarm.name === 'backgroundFetch') {
		refreshHotels();
		// Update next fetch time for countdown
		chrome.storage.local.get({ autoRefresh: 30 }, res => {
			const interval = parseInt(res.autoRefresh) || 30;
			const nextFetch = Date.now() + interval * 60 * 1000;
			chrome.storage.local.set({ nextBackgroundFetch: nextFetch });
		});
	}
});

chrome.runtime.onInstalled.addListener(() => {
	setBackgroundFetchAlarm();
	cleanupOrphanedTabs();
});
