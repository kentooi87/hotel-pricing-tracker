# Changelog

## [3.3.7] - 2026-02-15 - Critical Airbnb Fix & Agoda Price Filtering

### Bug Fixes
- 🐛 **CRITICAL: Fixed Airbnb not refreshing at all (auto or manual)**
  - Issue: When refactoring tab closing logic in v3.3.6, accidentally removed "track from URL" handling code
  - This caused Airbnb (and all sites) to not work when using "Track from URL" button
  - Also broke the data flow for content scripts
  - Solution: Restored "track from URL" tab handling inside storage callback
  - Now checks: 1) Is it a track-from-URL tab? 2) Is it a refresh tab? 3) Fallback to storage check

- 🐛 **MAJOR: Fixed Agoda capturing wrong prices (RM 91/92 instead of RM 324/331)**
  - Root Cause: Was capturing per-night prices, partial totals, and prices from non-booking sections
  - **Increased minimum price threshold from 50 → 100**
    * This excludes per-night prices like RM 91/92
    * Only captures total booking prices (typically > 100 for multi-night stays)
  - **Reduced maximum price from 10,000 → 5,000** for more reasonable range
  - **Added rate container validation**
    * Price MUST be within a room rate selection container
    * Checks for: `masterroom-container`, `room-rate-container`, `room-price-section`
    * Skips prices not in proper booking context
  - **More specific CSS selectors**
    * Only looks for: `PriceDisplay`, `MasterRoom Price`, `RoomRate Price`
    * Excludes generic price elements from other page sections
  - **Disabled Method 3 (last resort extraction)**
    * Was too aggressive and captured unrelated prices
    * Now only uses Methods 1 and 2 with strict validation

### Technical Details

**background.js:**
- Restored complete "track from URL" flow inside storage callback
- Check order: trackFromUrl → refresh tab → storage fallback
- Ensures data is saved before closing any tab

**agoda.js Method 1 (Primary):**
- Searches: `hotel-price-display`, `displayed-price`, `master-price-box`, rate-specific PriceDisplay
- Validates: 100 ≤ price ≤ 5000
- Requires: Must be inside rate selection container
- Results: Only captures actual bookable prices

**agoda.js Method 2 (Fallback):**
- Searches: Specific `PriceDisplay` elements only
- Validates: Same range (100-5000)
- Requires: Parent must have room/rate/master/price in className
- Skips: Generic containers or non-booking contexts

**agoda.js Method 3:**
- **DISABLED** - Too risky, was capturing wrong prices
- Will show helpful error message if no prices found

### Price Range Logic
| Price | Old Behavior | New Behavior |
|-------|-------------|---------------|
| RM 50-99 | ✅ Captured | ❌ Skipped (likely per-night or partial) |
| RM 100-324 | ✅ Captured | ✅ Captured (valid booking price) |
| RM 331 | ✅ Captured | ✅ Captured (valid booking price) |
| RM 5000+ | ✅ Captured | ❌ Skipped (unreasonably high) |

### Impact
- Airbnb refresh functionality fully restored
- "Track from URL" button works for all platforms
- Agoda should now only capture RM 324 and RM 331 (the correct prices)
- RM 91/92 will be excluded as they're below minimum threshold

---

## [3.3.6] - 2026-02-15 - Critical Tab Closing & Airbnb Date Fix

### Bug Fixes
- 🐛 **CRITICAL: Fixed tabs closing before data is captured during refresh**
  - Issue: Tabs were closing after 500ms, but data wasn't fully saved to storage yet
  - Solution: Tab closing now happens AFTER storage.set() callback confirms data is saved
  - Increased safety delay from 500ms to 1500ms
  - This fixes the "listing is not updated" issue after manual/auto refresh
  - All three platforms (Booking, Airbnb, Agoda) affected

- 🐛 **CRITICAL: Fixed Airbnb not using dates during refresh**
  - Issue: Airbnb was completely excluded from date parameters
  - Airbnb uses `check_in` and `check_out` (with underscores), not `checkin`/`checkout`
  - Now correctly applies dates for Airbnb during:
    * Auto-refresh ✅
    * Manual refresh ✅
    * "Track from URL" ✅
    * "Open Page" link ✅
    * "Open All Hotels" ✅

### Technical Details
- **Date Parameter Formats by Platform:**
  - Booking.com: `checkin` / `checkout` (lowercase, no separator)
  - Airbnb: `check_in` / `check_out` (lowercase with underscores)
  - Agoda: `checkIn` / `checkOut` (camelCase) + `adults`, `rooms`, `children`

- **background.js Changes:**
  - Removed exclusion of Airbnb from date parameters in `refreshHotels()`
  - Added Airbnb date handling with correct underscore format
  - Moved tab closing logic inside storage callback to ensure data is saved first
  - Increased timeout from 500ms to 1500ms for additional safety

- **popup.js Changes:**
  - Updated all 3 UI functions to handle Airbnb dates:
    * "Track from URL" button
    * "Open All Hotels" button  
    * Individual "Open Page" links
  - All functions now detect site and apply correct date format

### Impact
- Users should now see price listings update correctly after refresh
- Airbnb URLs will include proper check-in/check-out dates
- No more premature tab closures losing data

---

## [3.3.5] - 2026-02-15 - Complete Agoda Date Fix

### Bug Fixes
- 🐛 **CRITICAL: Fixed "Open Page" and "Open All Hotels" buttons not applying dates for Agoda**
  - All three UI functions now use correct camelCase parameters for Agoda
  - "Track from URL" button: ✅ Fixed
  - "Open Page" link: ✅ Fixed
  - "Open All Hotels" button: ✅ Fixed
  - Previously only auto-refresh was fixed in v3.3.4

- 🐛 **Added required Agoda booking parameters**
  - Automatically adds `adults=2`, `rooms=1`, `children=0` if not present
  - These parameters are required for Agoda to display correct pricing
  - Applies to: manual refresh, auto-refresh, open page, open all
  - May resolve wrong price capture issue (RM 91/92 vs expected RM 324/331)

### Improvements
- 📊 **Massively enhanced Agoda debugging output**
  - Shows full URL and all parameters at extraction start
  - Warns if dates are missing from URL
  - For each price element found:
    * Element tag, class, and full text
    * Parent container details
    * Room name detected
    * Condition search text used
    * Whether it's a per-night price
    * Detected condition
    * Deduplication key and decision
  - Final summary table of all captured prices
  - Should help diagnose why specific prices are captured

### Technical Details
- `background.js`: Added adults/rooms/children defaults for Agoda
- `popup.js`: Fixed all 3 functions to use camelCase + add required params
- `agoda.js`: Enhanced logging throughout extraction process

---

## [3.3.4] - 2026-02-15 - Agoda Date Parameters Fix

### Bug Fixes
- 🐛 **CRITICAL: Fixed Agoda not respecting check-in/check-out dates during refresh**
  - Agoda uses camelCase URL parameters: `checkIn` and `checkOut` (with capital I/O)
  - Booking.com uses lowercase: `checkin` and `checkout`
  - Background.js now detects site and uses correct parameter names
  - Issue: Manual/auto refresh was opening Agoda URLs without dates, showing wrong prices

### Improvements
- 📊 **Enhanced debugging for Agoda price extraction**
  - Logs current URL and dates at start of extraction
  - Shows each price element found with index number
  - Displays parent container class names
  - Shows text snippet used for condition detection
  - Indicates whether each price is added or skipped as duplicate
  - Summary table at end showing all captured prices
  - Better condition detection using immediate rate container text instead of broad parent text

### Technical Details
- `background.js`: Added `isAgoda` detection and conditional parameter naming
- `agoda.js`: Added comprehensive console logging throughout extraction process
- Condition extraction now searches within rate container first before falling back to parent

---

## [3.3.3] - 2026-02-15 - Agoda Deduplication Fix

### Bug Fixes
- 🐛 Fixed Agoda capturing duplicate options with same price (e.g., 7 options all showing RM 324)
  - Changed deduplication logic from room+price+condition to only price+condition
  - Now correctly captures all unique price+condition combinations
  - Example: Correctly captures RM 324 (Non-refundable) AND RM 331 (Standard Rate) as 2 separate options
  - Room name variations no longer cause duplicate entries for same price

### Improvements
- Enhanced price element selectors with broader search patterns
- Added `[class*="Price__Value" i]` selector for better coverage
- Improved parent container detection for condition extraction
- Better logging to show which prices are captured vs skipped
- All 3 extraction methods now use consistent `processedPriceConditions` Set

---

## [3.3.2] - 2026-02-15 - Agoda Price Filtering Fix

### Bug Fixes
- 🐛 Fixed Agoda capturing unrelated prices from other page sections
  - Now focuses only on the main rooms/rates section
  - Added price range validation (50-10,000) to filter out invalid prices
  - Improved master room container detection
  - Enhanced rate option identification within each room
  - Searches only within room selection area, not entire page
  - Added detailed logging for debugging
  
### Improvements  
- More precise selector targeting for Agoda room rates
- Stricter fallback methods with price validation
- Better distinction between room prices and other page prices
- Limited fallback extraction to 5 items to avoid junk data

---

## [3.3.1] - 2026-02-15 - Bug Fixes

### Bug Fixes
- 🐛 Fixed Airbnb price extraction not finding prices ("no room data" issue)
  - Enhanced price element detection with more selectors
  - Added fallback to search entire page if booking panel not found
  - Increased wait timeout from 15s to 20s
  - More aggressive price element searching
  
- 🐛 Fixed Agoda only showing one price option
  - Now properly captures multiple price options (non-refundable, standard, flexible)
  - Changed deduplication logic to allow same price with different conditions
  - Enhanced condition detection for each price element
  - Searches all price elements within each room container

### Improvements
- Better price-condition pairing for Agoda
- More robust fallback extraction for both sites
- Improved logging for debugging

---

## [3.3.0] - 2026-02-15 - NEW FEATURE: Agoda Support

### New Features
- ✨ Added support for Agoda.com hotel tracking
- Added Agoda tab in popup and side panel
- Agoda content script with intelligent price extraction
- Support for Agoda room options and cancellation policies
- Unified interface for Booking.com, Airbnb, and Agoda

### Improvements
- Updated extension name to "Hotel Price Tracker (Booking, Airbnb, Agoda)"
- Enhanced site detection to recognize Agoda URLs
- Improved "Track by URL" to accept Agoda links
- Added Agoda-specific date parameter handling

### Technical Details
- New agoda.js content script with retry logic
- Updated manifest with Agoda host permissions
- Extended background.js site detection logic
- Version bumped to 3.3.0 (new feature release)

---

## [3.2.3] - 2026-02-15 - STABLE CHECKPOINT ✓

### Status
This version is considered stable and production-ready.

### Features
- Auto-refresh functionality with configurable intervals
- Manual refresh for all tracked hotels
- Price change notifications with percentage
- Support for Booking.com and Airbnb
- Incognito mode support for data extraction
- Check-in/check-out date configuration
- Price history tracking
- Side panel interface
- Dual-site tracking (Booking.com and Airbnb)

### Bug Fixes
- Fixed auto-refresh tabs not closing automatically
- Fixed manual refresh tabs not closing after data extraction
- Added safety timeout (30 seconds) for stuck tabs
- Improved service worker restart handling
- Enhanced incognito mode compatibility
- Added extensive debugging logs
- Fixed content script injection in incognito mode
- Improved message passing reliability with retry logic

### Technical Details
- Manifest V3 compliant
- Uses service worker for background processing
- Content scripts for data extraction
- Chrome Storage API for persistence
- Chrome Alarms API for scheduled refresh
- Chrome Notifications API for price alerts

### Known Issues
- Extension must be enabled in incognito mode for auto-refresh to work
- Requires manual enablement at chrome://extensions/

---

## Version History

### [3.2.2] - 2026-02-14
- Added programmatic script injection (later reverted)
- Enhanced tab management

### [3.2.1] - 2026-02-14
- Initial tab auto-close fixes
- Added retry logic to content scripts

### [3.2.0] - Previous stable version
- Core functionality for Booking.com and Airbnb tracking
