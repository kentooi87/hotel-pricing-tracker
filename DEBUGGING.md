# Debugging Tab Auto-Close Issues

## Setup Required

### 1. Enable Extension in Incognito Mode
For the extension to work properly with auto-refresh:
1. Open Chrome and go to `chrome://extensions/`
2. Find "LyfStay Hotel Price Tracker"
3. Click "Details"
4. Scroll down and **enable "Allow in Incognito"**
5. Reload the extension

### 2. Check Console Logs

#### Background Service Worker Logs:
1. Go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Find "LyfStay Hotel Price Tracker"
4. Click "Service Worker" or "Inspect views: background page"
5. Look for logs starting with "Booking Tracker:"

Expected log sequence for successful refresh:
```
Booking Tracker: Starting refresh for X hotels
Booking Tracker: Creating incognito tab for [URL]
Booking Tracker: Incognito access allowed? true
Booking Tracker: Created tab [ID] in incognito window
Booking Tracker: Opened refresh tab [ID] for [normalized URL]
Booking Tracker: Stored tab [ID] in persistent storage
Booking Tracker: Received message: HOTEL_PRICE_UPDATE from tab: [ID]
Booking Tracker: Processing HOTEL_PRICE_UPDATE for [URL] from tab [ID]
Booking Tracker: Found refresh tab [ID] in memory, closing...
```

#### Content Script Logs (for opened tabs):
1. When a tab opens during refresh, right-click the page
2. Select "Inspect"
3. Go to Console tab
4. Look for logs starting with "Booking Tracker:" or "Airbnb Tracker:"

Expected logs:
```
Booking Tracker: Found X room options
Booking Tracker: Data sent successfully
```

## Common Issues

### Issue: "Incognito access allowed? false"
**Solution**: Enable the extension in incognito mode (see step 1 above)

### Issue: No "Received message: HOTEL_PRICE_UPDATE" logs
**Problem**: Content scripts aren't running or sendingmessages
**Check**:
- Are content script logs appearing in opened tabs?
- Is the extension enabled on the booking.com/airbnb.com pages?  
- Check for any JavaScript errors in the tab's console

### Issue: Tab closes after 30 seconds
**This is expected**: Safety timeout to prevent tabs staying open forever
**Fix**: If data extraction takes longer, increase timeout in background.js

### Issue: "Tab X not found in refresh tabs list"
**Problem**: Tab ID not being tracked properly
**Check**:
- Look for "Opened refresh tab" log - was the tab tracked?
- Check "pendingRefreshTabs keys" log - does it contain the tab ID?

## Manual Testing

1. Open the extension popup
2. Click "Refresh All" button
3. Watch the console logs in background service worker
4. Verify tabs open and close within ~5-15 seconds
5. Check that hotel data is updated in the popup

## Still Not Working?

If tabs still don't close after following all steps:
1. Export your tracked hotels data (if possible)
2. Remove and reinstall the extension
3. Re-enable incognito access
4. Import your data back
5. Test with a single tracked hotel first
