// Show last input value for auto refresh interval and dates

// Toast notification at top of page
function showToast(message, isError = false) {
	const toast = document.getElementById('toast');
	if (!toast) return;
	toast.textContent = message;
	toast.className = isError ? 'show error' : 'show success';
	setTimeout(() => { toast.className = ''; }, 4000);
}

// Legacy feedback (hidden by default, keep for fallback)
function showFeedback(message, isError = false) {
	showToast(message, isError);
}

/**
 * Subscription System Integration
 * Requires Google login and enforces tier limits
 */

const WORKER_URL = 'https://hotel-price-tracker-worker.kent-ooi1987.workers.dev';
const TIER_LIMITS = {
	free: { hotels: 3, sites: ['booking'] },
	starter: { hotels: 10, sites: ['booking', 'agoda'] },
	pro: { hotels: Number.POSITIVE_INFINITY, sites: ['booking', 'agoda', 'airbnb'] }
};

let currentTier = 'free';
let isLoggedIn = false;

// Get or create a unique user ID for this browser (uses Google login when available)
function getUserId() {
	return new Promise(resolve => {
		chrome.storage.local.get(['authUserId', 'userId'], result => {
			if (result.authUserId) {
				resolve(result.authUserId);
				return;
			}
			if (result.userId) {
				resolve(result.userId);
				return;
			}
			const newUserId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
			chrome.storage.local.set({ userId: newUserId }, () => {
				resolve(newUserId);
			});
		});
	});
}

function getAuthInfo() {
	return new Promise(resolve => {
		chrome.storage.local.get(['authUserId', 'authEmail'], result => {
			resolve({ authUserId: result.authUserId || '', authEmail: result.authEmail || '' });
		});
	});
}

function setMainLocked(locked) {
	const main = document.getElementById('mainContent');
	if (!main) return;
	main.classList.toggle('locked', locked);
}

function updateLoginUI(loggedIn, email) {
	const banner = document.getElementById('loginBanner');
	const loginBtn = document.getElementById('loginBtn');
	const logoutBtn = document.getElementById('logoutBtn');
	const status = document.getElementById('loginStatus');
	const profileToggle = document.getElementById('profileToggle');
	const accountCard = document.getElementById('accountCard');
	if (!banner || !loginBtn || !logoutBtn || !status) return;

	banner.classList.add('show');
	if (loggedIn) {
		status.textContent = `Signed in as ${email}`;
		loginBtn.style.display = 'none';
		logoutBtn.style.display = 'inline-block';
		// Show the collapsible profile toggle/card
		if (profileToggle) profileToggle.classList.add('show');
		setMainLocked(false);
		// Re-enable auto-refresh checkbox
		const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
		if (autoRefreshCheckbox) autoRefreshCheckbox.disabled = false;
	} else {
		status.textContent = 'Sign in with Google to use the tracker.';
		loginBtn.style.display = 'inline-block';
		logoutBtn.style.display = 'none';
		setMainLocked(true);
		// Hide account card and profile toggle when logged out
		if (accountCard) accountCard.classList.remove('show', 'expanded');
		if (profileToggle) profileToggle.classList.remove('show');
		// Disable auto-refresh
		const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
		if (autoRefreshCheckbox) {
			autoRefreshCheckbox.checked = false;
			autoRefreshCheckbox.disabled = true;
		}
	}
}

async function fetchEmailFromToken(token) {
	try {
		const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
			headers: {
				Authorization: `Bearer ${token}`
			}
		});
		if (!response.ok) return '';
		const data = await response.json();
		return data.email || '';
	} catch (error) {
		return '';
	}
}

async function ensureLoginRequired() {
	const auth = await getAuthInfo();
	isLoggedIn = Boolean(auth.authUserId);
	updateLoginUI(isLoggedIn, auth.authEmail);
	return isLoggedIn;
}

// Verify subscription status with backend
async function checkSubscriptionStatus() {
	try {
		const userId = await getUserId();
		const response = await fetch(`${WORKER_URL}/verify/${userId}`, {
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
			}
		});
		
		if (!response.ok) {
			console.log('Subscription check failed, showing upgrade banner');
			return { subscribed: false, tier: 'free' };
		}
		
		const data = await response.json();
		return {
			subscribed: data.subscribed || false,
			tier: data.tier || 'free',
			amount: data.amount || null,
			currency: data.currency || 'usd',
			startDate: data.startDate || null,
			nextChargeDate: data.nextChargeDate || null,
			subscriptionId: data.subscriptionId || null,
		};
	} catch (error) {
		console.error('Error checking subscription:', error);
		return { subscribed: false, tier: 'free' };
	}
}

// Show/hide upgrade banner based on subscription status
async function updateUpgradeBanner() {
	const banner = document.getElementById('upgradeBanner');
	const planSelect = document.getElementById('planSelect');
	const tierStatus = document.getElementById('tierStatus');
	if (!banner) return;

	const status = await checkSubscriptionStatus();
	currentTier = status.tier || 'free';
	chrome.storage.local.set({ subscriptionTier: currentTier });

	// Update account card
	updateAccountCard(status);

	if (currentTier === 'pro') {
		banner.classList.remove('show');
		return;
	}

	banner.classList.add('show');
	if (tierStatus) {
		tierStatus.textContent = currentTier === 'starter'
			? 'Starter plan active. Upgrade to Pro for Airbnb and unlimited tracking.'
			: 'Free plan: Booking.com only (max 3 hotels).';
	}
	if (planSelect) {
		planSelect.value = currentTier === 'starter' ? 'pro' : 'starter';
	}
}

const TIER_DESCRIPTIONS = {
	free: 'Free plan: Track up to 3 hotels on Booking.com only.',
	starter: 'Starter plan: Track up to 10 hotels on Booking.com and Agoda.',
	pro: 'Pro plan: Unlimited hotel tracking across Booking.com, Agoda, and Airbnb.'
};

const TIER_PRICES = { starter: '$4.99', pro: '$9.99' };

function formatDate(iso) {
	if (!iso) return '\u2014';
	const d = new Date(iso);
	return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function updateAccountCard(status) {
	const card = document.getElementById('accountCard');
	const toggle = document.getElementById('profileToggle');

	const tier = status.tier || 'free';

	// Update profile toggle bar (visible when logged in)
	if (toggle) {
		if (!isLoggedIn) {
			toggle.classList.remove('show');
		} else {
			toggle.classList.add('show');
			getAuthInfo().then(auth => {
				const email = auth.authEmail || '';
				const toggleAvatar = document.getElementById('toggleAvatar');
				const toggleEmail = document.getElementById('toggleEmail');
				const toggleTier = document.getElementById('toggleTier');
				if (toggleAvatar) toggleAvatar.textContent = email ? email.charAt(0).toUpperCase() : '?';
				if (toggleEmail) toggleEmail.textContent = email.split('@')[0] || 'Account';
				if (toggleTier) {
					toggleTier.className = 'tier-sm ' + tier;
					toggleTier.textContent = tier.toUpperCase();
				}
			});
		}
	}

	// Account card stays hidden until toggle is clicked
	if (!card) return;

	// Avatar & email (for expanded card)
	getAuthInfo().then(auth => {
		const email = auth.authEmail || '';
		const avatar = document.getElementById('accountAvatar');
		const nameEl = document.getElementById('accountName');
		const emailEl = document.getElementById('accountEmail');
		if (avatar) avatar.textContent = email ? email.charAt(0).toUpperCase() : '?';
		if (nameEl) nameEl.textContent = email.split('@')[0] || '\u2014';
		if (emailEl) emailEl.textContent = email || '\u2014';
	});

	// Tier badge
	const badge = document.getElementById('accountTierBadge');
	if (badge) {
		badge.className = 'tier-badge ' + tier;
		badge.textContent = tier.toUpperCase();
	}

	// Tier description
	const desc = document.getElementById('accountTierDesc');
	if (desc) desc.textContent = TIER_DESCRIPTIONS[tier] || TIER_DESCRIPTIONS.free;

	// Subscription details (paid plans only)
	const details = document.getElementById('accountDetails');
	const cancelBtn = document.getElementById('cancelSubBtn');

	if (status.subscribed && (tier === 'starter' || tier === 'pro')) {
		if (details) {
			details.style.display = 'block';
			const costEl = document.getElementById('accountCost');
			const startEl = document.getElementById('accountStartDate');
			const nextEl = document.getElementById('accountNextCharge');
			if (costEl) costEl.textContent = `${TIER_PRICES[tier] || '\u2014'}/month`;
			if (startEl) startEl.textContent = formatDate(status.startDate);
			if (nextEl) nextEl.textContent = formatDate(status.nextChargeDate);
		}
		if (cancelBtn) cancelBtn.style.display = 'inline-block';
	} else {
		if (details) details.style.display = 'none';
		if (cancelBtn) cancelBtn.style.display = 'none';
	}

	// Update auto-refresh controls based on tier
	updateAutoRefreshControls(tier);
}

function updateAutoRefreshControls(tier) {
	const locked = document.getElementById('autoRefreshLocked');
	const controls = document.getElementById('autoRefreshControls');
	const badge = document.getElementById('autoRefreshPaidBadge');
	const isPaid = tier === 'starter' || tier === 'pro';

	if (locked) locked.style.display = isPaid ? 'none' : 'block';
	if (controls) controls.style.display = isPaid ? 'block' : 'none';
	if (badge) badge.style.display = isPaid ? 'none' : 'inline';
}

function isSiteAllowed(site) {
	const tier = currentTier || 'free';
	const allowed = TIER_LIMITS[tier]?.sites || ['booking'];
	return allowed.includes(site);
}

function getHotelLimit() {
	const tier = currentTier || 'free';
	return TIER_LIMITS[tier]?.hotels ?? 3;
}

function requirePaidForSite(site) {
	const message = site === 'airbnb'
		? 'Airbnb tracking is a paid feature. Please upgrade.'
		: 'Agoda tracking is a paid feature. Please upgrade.';
	showFeedback(message, true);
}

function ensureSiteAllowed(site) {
	if (!isSiteAllowed(site)) {
		requirePaidForSite(site);
		return false;
	}
	return true;
}

function requireLoginAction() {
	if (!isLoggedIn) {
		showFeedback('Please sign in with Google to continue.', true);
		ensureLoginRequired();
		return false;
	}
	return true;
}

// Handle login and upgrade actions
document.addEventListener('DOMContentLoaded', () => {
	const upgradeBtn = document.getElementById('upgradeBtn');
	const loginBtn = document.getElementById('loginBtn');
	const logoutBtn = document.getElementById('logoutBtn');
	const planSelect = document.getElementById('planSelect');

	if (loginBtn) {
		loginBtn.addEventListener('click', () => {
			chrome.identity.getAuthToken({ interactive: true }, token => {
				if (chrome.runtime.lastError || !token) {
					showFeedback('Google sign-in failed. Please try again.', true);
					return;
				}
				chrome.identity.getProfileUserInfo(info => {
					const email = info.email || '';
					const handleLogin = (finalEmail) => {
						if (!finalEmail) {
							chrome.identity.clearAllCachedAuthTokens(() => {
								showFeedback('Unable to read Google profile. Try again.', true);
							});
							return;
						}
						chrome.storage.local.set({ authUserId: finalEmail, authEmail: finalEmail }, async () => {
							await ensureLoginRequired();
							await updateUpgradeBanner();
							loadHotels();
						});
					};

					if (email) {
						handleLogin(email);
						return;
					}

					fetchEmailFromToken(token).then(handleLogin);
				});
			});
		});
	}

	if (logoutBtn) {
		logoutBtn.addEventListener('click', () => {
			chrome.identity.clearAllCachedAuthTokens(() => {
				chrome.storage.local.remove(['authUserId', 'authEmail'], async () => {
					// Stop auto-refresh when logging out
					chrome.runtime.sendMessage({ action: 'stopAutoRefresh' });
					// Disable auto-refresh checkbox
					const autoRefreshCheckbox = document.getElementById('autoRefreshEnabled');
					if (autoRefreshCheckbox) {
						autoRefreshCheckbox.checked = false;
						autoRefreshCheckbox.disabled = true;
					}
					const autoRefreshInputs = document.getElementById('autoRefreshInputs');
					if (autoRefreshInputs) autoRefreshInputs.style.display = 'none';
					// Clear stored auto-refresh settings
					chrome.storage.local.set({ autoRefreshEnabled: false });
					await ensureLoginRequired();
					currentTier = 'free';
					updateUpgradeBanner();
				});
			});
		});
	}

	if (upgradeBtn) {
		upgradeBtn.addEventListener('click', async () => {
			try {
				const loggedIn = await ensureLoginRequired();
				if (!loggedIn) {
					showFeedback('Please sign in with Google first.', true);
					return;
				}

				const userId = await getUserId();
				const selectedPlan = planSelect ? planSelect.value : 'pro';

				const response = await fetch(`${WORKER_URL}/checkout`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						userId: userId,
						tier: selectedPlan
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

	// Cancel subscription button
	const cancelSubBtn = document.getElementById('cancelSubBtn');
	if (cancelSubBtn) {
		cancelSubBtn.addEventListener('click', async () => {
			if (!confirm('Are you sure you want to cancel your subscription? You will lose access to premium features immediately.')) {
				return;
			}
			try {
				cancelSubBtn.disabled = true;
				cancelSubBtn.textContent = 'Cancelling...';
				const userId = await getUserId();
				const response = await fetch(`${WORKER_URL}/cancel-subscription`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ userId: userId })
				});
				if (!response.ok) {
					showFeedback('Failed to cancel subscription. Please try again.', true);
					return;
				}
				const data = await response.json();
				if (data.cancelled) {
					currentTier = 'free';
					chrome.storage.local.set({ subscriptionTier: 'free', subscriptionStatus: false });
					showFeedback('Subscription cancelled. You are now on the Free plan.');
					await updateUpgradeBanner();
				}
			} catch (error) {
				console.error('Cancel error:', error);
				showFeedback('Error cancelling subscription.', true);
			} finally {
				cancelSubBtn.disabled = false;
				cancelSubBtn.textContent = 'Cancel Subscription';
			}
		});
	}

	// Profile toggle: expand/collapse account card
	const profileToggle = document.getElementById('profileToggle');
	const accountCard = document.getElementById('accountCard');
	if (profileToggle && accountCard) {
		profileToggle.addEventListener('click', () => {
			const isExpanded = accountCard.classList.contains('expanded');
			if (isExpanded) {
				accountCard.classList.remove('expanded');
				profileToggle.querySelector('.expand-icon').textContent = '▼';
			} else {
				accountCard.classList.add('expanded');
				profileToggle.querySelector('.expand-icon').textContent = '▲';
			}
		});
	}

	// Auto-refresh checkbox: show/hide interval inputs
	const autoRefreshEnabled = document.getElementById('autoRefreshEnabled');
	const autoRefreshInputs = document.getElementById('autoRefreshInputs');
	if (autoRefreshEnabled && autoRefreshInputs) {
		// Restore saved state and disable if not logged in
		chrome.storage.local.get(['autoRefreshEnabled'], result => {
			autoRefreshEnabled.checked = result.autoRefreshEnabled || false;
			autoRefreshInputs.style.display = autoRefreshEnabled.checked && isLoggedIn ? 'flex' : 'none';
			autoRefreshEnabled.disabled = !isLoggedIn;  // Disable if not logged in
		});
		autoRefreshEnabled.addEventListener('change', () => {
			if (!isLoggedIn) {
				autoRefreshEnabled.checked = false;
				showToast('Please sign in to use auto-refresh');
				return;
			}
			const enabled = autoRefreshEnabled.checked;
			autoRefreshInputs.style.display = enabled ? 'flex' : 'none';
			chrome.storage.local.set({ autoRefreshEnabled: enabled });
			if (!enabled) {
				// Stop any running auto-refresh
				chrome.runtime.sendMessage({ action: 'stopAutoRefresh' });
				showToast('Auto-refresh paused');
			}
		});
	}

	// Track Hotel button: expand track options
	const trackBtn = document.getElementById('trackBtn');
	const trackOptions = document.getElementById('trackOptions');
	if (trackBtn && trackOptions) {
		trackBtn.addEventListener('click', () => {
			const isVisible = trackOptions.style.display !== 'none';
			trackOptions.style.display = isVisible ? 'none' : 'block';
			trackBtn.textContent = isVisible ? '➕ Track Hotel' : '✖ Close';
		});
	}

	// Track Current Page button
	const trackCurrentBtn = document.getElementById('trackCurrentBtn');
	if (trackCurrentBtn) {
		trackCurrentBtn.addEventListener('click', () => {
			// Hide track options and restore button
			if (trackOptions) trackOptions.style.display = 'none';
			if (trackBtn) trackBtn.textContent = '➕ Track Hotel';
			// Trigger the original track hotel logic (existing global handler will catch this)
			document.dispatchEvent(new CustomEvent('trackCurrentHotel'));
		});
	}

	// Track URL toggle button
	const trackUrlToggleBtn = document.getElementById('trackUrlToggleBtn');
	const trackUrlSection = document.getElementById('trackUrlSection');
	if (trackUrlToggleBtn && trackUrlSection) {
		trackUrlToggleBtn.addEventListener('click', () => {
			const isVisible = trackUrlSection.style.display !== 'none';
			trackUrlSection.style.display = isVisible ? 'none' : 'block';
			trackUrlToggleBtn.textContent = isVisible ? '🔗 Track by URL' : '✖ Cancel';
		});
	}

	// Help button: open help modal
	const helpBtn = document.getElementById('helpBtn');
	const helpModal = document.getElementById('helpModal');
	const helpModalClose = document.getElementById('helpModalClose');
	if (helpBtn && helpModal) {
		helpBtn.addEventListener('click', () => {
			helpModal.classList.add('show');
		});
	}
	if (helpModalClose && helpModal) {
		helpModalClose.addEventListener('click', () => {
			helpModal.classList.remove('show');
		});
	}
	// Close modal when clicking outside
	if (helpModal) {
		helpModal.addEventListener('click', (e) => {
			if (e.target === helpModal) {
				helpModal.classList.remove('show');
			}
		});
	}

	// Upgrade banner: toggle collapse/expand
	const upgradeBanner = document.getElementById('upgradeBanner');
	if (upgradeBanner) {
		const upgradeToggle = upgradeBanner.querySelector('.upgrade-toggle');
		if (upgradeToggle) {
			upgradeToggle.addEventListener('click', () => {
				const isCollapsed = upgradeBanner.classList.contains('collapsed');
				if (isCollapsed) {
					upgradeBanner.classList.remove('collapsed');
					upgradeBanner.classList.add('expanded');
				} else {
					upgradeBanner.classList.remove('expanded');
					upgradeBanner.classList.add('collapsed');
				}
			});
		}
	}
});

// Initialize login + subscription status, then site loading
(async () => {
	await ensureLoginRequired();
	if (isLoggedIn) {
		await updateUpgradeBanner();
		// Initialize site selection AFTER tier is loaded
		initializeSiteLoading();
	}
})();
// Check again every 30 seconds (only if logged in)
setInterval(async () => {
	const loggedIn = await ensureLoginRequired();
	if (loggedIn) {
		await updateUpgradeBanner();
	}
}, 30000);

// Re-check subscription when side panel regains focus (e.g. after Stripe checkout)
document.addEventListener('visibilitychange', async () => {
	if (document.visibilityState === 'visible' && isLoggedIn) {
		console.log('Side panel visible — refreshing subscription status');
		await updateUpgradeBanner();
	}
});
window.addEventListener('focus', async () => {
	if (isLoggedIn) {
		console.log('Side panel focused — refreshing subscription status');
		await updateUpgradeBanner();
	}
});

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
	if (!ensureSiteAllowed(site)) {
		return;
	}
	activeSite = site;
	chrome.storage.local.set({ activeSite: site });
	// Toggle tab UI
	document.querySelectorAll('.site-tab').forEach(tab => {
		tab.classList.toggle('active', tab.getAttribute('data-site') === site);
	});
	loadHotels();
	loadPriceChangeNotifications();
}

// Initialize site loading ONLY after subscription tier is loaded and user is logged in
function initializeSiteLoading() {
	if (!isLoggedIn) return;
	chrome.storage.local.get({ activeSite: 'booking' }, res => {
		activeSite = res.activeSite || 'booking';
		setActiveSite(activeSite);
		// Initialize tab events
		document.querySelectorAll('.site-tab').forEach(tab => {
			tab.addEventListener('click', () => setActiveSite(tab.getAttribute('data-site')));
		});
	});
}

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
	if (!requireLoginAction()) return;
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

// Track current hotel (triggered by trackCurrentBtn via custom event)
document.addEventListener("trackCurrentHotel", function() {
	if (!requireLoginAction()) return;
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
	if (!requireLoginAction()) return;
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
	if (!requireLoginAction()) return;
	// Check if paid tier
	if (currentTier !== 'starter' && currentTier !== 'pro') {
		showFeedback('Auto-refresh is a paid feature. Please upgrade.', true);
		return;
	}
	// Check if checkbox is enabled
	const checkbox = document.getElementById('autoRefreshEnabled');
	if (!checkbox || !checkbox.checked) {
		showFeedback('Please enable auto-refresh first.', true);
		return;
	}
	if (!confirm('Set auto refresh interval?')) return;
	setAutoRefresh();
});
document.getElementById("intervalInput").addEventListener("keydown", function(e) {
	if (e.key === "Enter") {
		if (!requireLoginAction()) return;
		if (currentTier !== 'starter' && currentTier !== 'pro') {
			showFeedback('Auto-refresh is a paid feature. Please upgrade.', true);
			return;
		}
		const checkbox = document.getElementById('autoRefreshEnabled');
		if (!checkbox || !checkbox.checked) {
			showFeedback('Please enable auto-refresh first.', true);
			return;
		}
		if (!confirm('Set auto refresh interval?')) return;
		setAutoRefresh();
	}
});

// Track hotel by URL
document.getElementById("trackUrlBtn").addEventListener("click", function() {
	if (!requireLoginAction()) return;
	const urlInput = document.getElementById("hotelUrlInput");
	const url = urlInput.value.trim();
	
	if (!url) {
		showFeedback('Please enter a hotel URL.', true);
		return;
	}
	
	// Validate booking or airbnb URL
	const isBooking = url.includes('booking.com');
	const isAirbnb = url.includes('airbnb');
	const isAgoda = url.includes('agoda');
	if (!isBooking && !isAirbnb && !isAgoda) {
		showFeedback('Please enter a Booking.com, Airbnb, or Agoda URL.', true);
		return;
	}

	const requestedSite = isAirbnb ? 'airbnb' : (isAgoda ? 'agoda' : 'booking');
	if (!ensureSiteAllowed(requestedSite)) return;
	
	// Check dates are set - required for prices to show
	chrome.storage.local.get({ checkin: '', checkout: '' }, res => {
		if (!res.checkin || !res.checkout) {
			showFeedback('Please set check-in and check-out dates first. Prices won\'t show without dates.', true);
			return;
		}

		chrome.storage.local.get({ hotels: [] }, res2 => {
			const totalHotels = (res2.hotels || []).length;
			const limit = getHotelLimit();
			if (totalHotels >= limit) {
				showFeedback(`Hotel limit reached (${limit}). Please upgrade to add more.`, true);
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
});

// Open all tracked hotels with set dates
document.getElementById("openAllBtn").addEventListener("click", async function() {
	if (!requireLoginAction()) return;
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
				if (!ensureSiteAllowed(currentSite)) return;

				const limit = getHotelLimit();
				if (hotels.length >= limit) {
					showFeedback(`Hotel limit reached (${limit}). Please upgrade to add more.`, true);
					return;
				}
			
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

					// Generate all rooms in table, but only first is visible by default
					const hasMultipleRooms = rooms.length > 1;
					const tableClass = hasMultipleRooms ? 'room-table collapsed' : 'room-table';

					roomsHtml = `
						<table class="${tableClass}" data-total-rooms="${rooms.length}">
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
									return `<tr data-row="${i}" class="${i > 0 ? 'extra-room' : ''}">
										<td class="room-cell"><span class="cell-text ${collapsedClass}" title="${roomName.replace(/"/g, '&quot;')}">${roomName}</span></td>
										<td class="cond-cell"><span class="cell-text ${collapsedClass} ${condClass}" title="${conditionHtml}">${conditionHtml}</span></td>
										<td class="price">RM ${String(r.price).replace(/^(RM|MYR)\s*/i, '')}</td>
										<td>${changeHtml}</td>
										<td class="expand-cell">${expandBtn}</td>
									</tr>`;
								}).join('')}
							</tbody>
						</table>
						${hasMultipleRooms ? `<button class="expand-all-rooms" data-total="${rooms.length}">+ Show all ${rooms.length} room options</button>` : ''}
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

			// Expand all rooms button: toggle showing all price options for a hotel
			document.querySelectorAll(".expand-all-rooms").forEach(btn => {
				btn.addEventListener("click", e => {
					const table = e.target.previousElementSibling;
					if (!table || !table.classList.contains('room-table')) return;
					
					const totalRooms = parseInt(table.getAttribute('data-total-rooms')) || 0;
					const isCollapsed = table.classList.contains('collapsed');
					
					if (isCollapsed) {
						// Expand - show all rows
						table.classList.remove('collapsed');
						e.target.textContent = `- Hide extra options`;
					} else {
						// Collapse - hide extra rows
						table.classList.add('collapsed');
						e.target.textContent = `+ Show all ${totalRooms} room options`;
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
