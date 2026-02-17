# LyfStay Hotel Price Tracker Extension

Track and compare hotel prices across **Booking.com**, **Airbnb**, and **Agoda** with automatic price monitoring and change notifications.

## Features

### 🏨 Multi-Platform Support
- **Booking.com** - Full room type and price tracking
- **Airbnb** - Nightly rates and total prices with cancellation policies  
- **Agoda** - Room options with flexible pricing

### 🔄 Auto Refresh
- Configurable refresh intervals (default: 30 minutes)
- Background price monitoring
- Automatic tab management (opens, extracts data, closes)
- Service worker reliability with retry logic

### 🔔 Price Change Notifications
- Real-time Chrome notifications when prices change
- Shows percentage increase/decrease
- Price history for last 20 changes
- Visual indicators (↑ / ↓)

### 📅 Date Management
- Set check-in and check-out dates
- Automatically applied to price checks
- Consistent date tracking across all hotels

### 🎯 Track Hotels
- Track current tab hotel instantly
- Track by pasting URLs (all three platforms)
- Manual refresh all tracked hotels
- Open all hotels in new tabs with set dates

### 💼 Organized Interface
- Tab-based organization by platform
- Side panel for persistent access
- Popup for quick actions
- Visual price comparisons

## Installation

### From Source

1. **Download or clone this repository**

2. **Open Chrome Extensions**
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (top right)

3. **Load Extension**
   - Click "Load unpacked"
   - Select the extension folder

4. **Enable Incognito Access** (Important!)
   - Click "Details" on the extension
   - Scroll down and enable "Allow in Incognito"
   - This is required for auto-refresh to work properly

5. **Reload the extension** after enabling incognito access

## Usage

### Quick Start

1. **Set Travel Dates**
   - Open the extension popup
   - Set check-in and check-out dates
   - Click "Set Dates"

2. **Track a Hotel**
   - Navigate to a hotel page (Booking.com, Airbnb, or Agoda)
   - Click extension icon
   - Click "➕ Track Hotel"
   
   OR
   
   - Copy hotel URL
   - Paste in "Track by URL" field
   - Click "📥 Track from URL"

3. **Monitor Prices**
   - Extension automatically refreshes every 30 minutes (configurable)
   - Or click "🔄 Refresh" for manual update
   - Get notifications when prices change

### Configuration

#### Auto Refresh Interval
- Default: 30 minutes
- Minimum: 1 minute
- Change in "⏰ Auto Refresh" section

#### Travel Dates
- Set once, applies to all hotels
- Only affects Booking.com and Agoda (Airbnb uses its own date selection)
- Updates URLs with date parameters on refresh

## File Structure

```
├── manifest.json          # Extension configuration
├── background.js          # Service worker (background tasks, auto-refresh)
├── content.js            # Booking.com data extraction
├── airbnb.js             # Airbnb data extraction  
├── agoda.js              # Agoda data extraction
├── popup.html            # Extension popup interface
├── popup.js              # Popup logic and UI
├── sidepanel.html        # Side panel interface
├── icon.png              # Extension icon
├── CHANGELOG.md          # Version history
└── DEBUGGING.md          # Troubleshooting guide
```

## How It Works

### Data Extraction Flow

1. **Background Script** opens hotel page in incognito tab
2. **Content Script** (site-specific) waits for page to load
3. Script extracts:
   - Hotel name
   - Room types
   - Prices
   - Cancellation policies
4. Data sent to background script via messaging
5. Background script:
   - Stores data in Chrome storage
   - Compares with previous prices
   - Sends notification if price changed
   - Closes the tab
6. Popup/sidepanel displays updated data

### Price Change Detection

- Compares current price with last saved price
- Calculates percentage change
- Creates Chrome notification with details
- Stores change in price change history (last 20)

### Tab Management

- Tabs opened during refresh are tracked in-memory and persistent storage
- When data received, tab is automatically closed (500ms delay)
- Safety timeout: tabs auto-close after 30 seconds if no data received
- Handles service worker restarts gracefully

## Troubleshooting

### Tabs Don't Close Automatically

**Solution:**
1. Make sure extension is enabled in incognito mode:
   - Go to `chrome://extensions/`
   - Find extension → Details
   - Enable "Allow in Incognito"
2. Reload the extension
3. Check background service worker console for logs

### No Price Data Captured

**Check:**
- Are you on a hotel details page (not search results)?
- Is the extension enabled for that site?
- Check browser console for "Tracker: Found X room options"
- Try manual refresh after a few seconds

### Extension Doesn't Update

**Solution:**
1. Check auto-refresh interval is set properly
2. View service worker console: `chrome://extensions/` → Service Worker
3. Look for "Starting refresh for X hotels" message
4. Verify dates are set if tracking Booking.com/Agoda

See [DEBUGGING.md](DEBUGGING.md) for detailed troubleshooting steps.

## Version History

- **3.3.0** - Added Agoda support (current)
- **3.2.3** - Stable release with Booking.com + Airbnb (checkpoint)
- **3.2.1-3.2.2** - Bug fixes for tab auto-closing
- **3.2.0** - Core functionality

See [CHANGELOG.md](CHANGELOG.md) for complete version history.

## Technical Details

### Browser Compatibility
- Chrome 88+ (Manifest V3)
- Edge 88+ (Chromium-based)

### Permissions Used
- `storage` - Save hotel data and preferences
- `activeTab` - Access current tab for tracking
- `tabs` - Tab management for auto-refresh
- `scripting` - Inject content scripts
- `notifications` - Price change alerts
- `alarms` - Scheduled auto-refresh
- `sidePanel` - Side panel interface

### Incognito Mode
- Uses "spanning" mode - single service worker instance
- Required for reliable messaging between incognito tabs and extension
- Must be manually enabled by user

## Privacy

- All data stored locally in Chrome storage
- No data sent to external servers
- Extension only accesses hotel pages you explicitly track
- Incognito mode prevents tracking cookies between sessions

## Development

### Building from Source
No build step required - pure vanilla JavaScript.

### Testing Changes
1. Make code changes
2. Go to `chrome://extensions/`
3. Click reload icon on extension card
4. Test functionality

### Adding New Hotel Sites

1. Create new content script (e.g., `newsite.js`)
2. Add site detection in `background.js`
3. Update `manifest.json` with host permissions and content script
4. Add tab in `popup.html` and `sidepanel.html`
5. Update `detectSite()` function in `popup.js`

## License

This project is for private/internal use. Not for public distribution.

## Support

For issues or questions about this extension, refer to:
- [DEBUGGING.md](DEBUGGING.md) - Troubleshooting guide
- [CHANGELOG.md](CHANGELOG.md) - Version history and known issues
- Background service worker console - Real-time logs

---

**Current Version:** 3.3.0  
**Last Updated:** February 15, 2026  
**Status:** ✅ Stable
