# Deployment Guide - Going Live

This guide covers deploying your Hotel Price Tracker to production so real users can pay and use it.

## Deployment Checklist

Before deploying, make sure you've completed:

- [ ] Agoda, Booking.com, Airbnb price extraction working correctly
- [ ] Extension popup and background scripts tested
- [ ] Stripe account created with API keys
- [ ] Cloudflare account with Worker created
- [ ] Worker code tested locally
- [ ] Webhooks tested with Stripe CLI
- [ ] GitHub repository created (for CI/CD)
- [ ] GitHub Actions secrets configured

---

## Phase 1: Deploy Cloudflare Worker

### Step 1.1: Get Your Account Information

1. Log in to **Cloudflare Dashboard**: https://dash.cloudflare.com
2. On left sidebar, click **"Workers & Pages"**
3. Click **"Overview"**
4. You'll see your account ID displayed (looks like: `abc123def456...`)
5. **Copy your Account ID** and save it

### Step 1.2: Create Cloudflare API Token

1. Click your **profile icon** (top right) → **"My Profile"**
2. Click **"API Tokens"** on left
3. Click **"Create Token"**
4. Select **"Edit Cloudflare Workers"** template
5. Name it: `GitHub Actions Deployment`
6. Under **"Permissions"**:
   - Account > Cloudflare Workers > Edit
7. Under **"Account Resources"**:
   - All accounts
8. Click **"Continue to summary"** → **"Create Token"**
9. You'll see a long token like: `v1.xxxxxxxxxxxxx`
10. **Copy this token** (you'll only see it once!)

### Step 1.3: Deploy to Cloudflare

**Option A: Command Line (Quickest)**

```bash
cd worker
npm run build
npx wrangler deploy
```

You'll see:
```
✅ Uploaded your Worker
✅ Published your Worker on your domain
```

Your worker is now live at: `https://your-subdomain.your-project.workers.dev`

**Option B: GitHub Actions (For Auto-Deployment)**

If you want auto-deployment on every git push:

1. Go to your GitHub repo
2. Click **"Settings"** (top menu)
3. Click **"Secrets and variables"** → **"Actions"** (left sidebar)
4. Click **"New repository secret"** for each:

**Secret 1: CLOUDFLARE_API_TOKEN**
- Name: `CLOUDFLARE_API_TOKEN`
- Value: Your token from Step 1.2 (the long `v1.xxx...` token)
- Click **"Add secret"**

**Secret 2: CLOUDFLARE_ACCOUNT_ID**
- Name: `CLOUDFLARE_ACCOUNT_ID`
- Value: Your account ID from Step 1.1
- Click **"Add secret"**

Now every time you push to `main` branch, GitHub automatically deploys your worker!

### Step 1.4: Verify Deployment

```bash
curl https://your-worker-subdomain.workers.dev/status
```

Should return:
```json
{"status": "ok"}
```

If you see an error, check:
1. Worker URL is correct (check Cloudflare dashboard)
2. /status endpoint exists in index.js
3. Check Cloudflare logs for errors

---

## Phase 2: Configure Stripe

### Step 2.1: Update Webhook URL

After deploying your worker:

1. Login to **Stripe Dashboard**: https://dashboard.stripe.com
2. Go to **"Webhooks"** section
3. Find your webhook endpoint
4. Click **"Edit"**
5. Change **Endpoint URL** from `localhost:8787` to:
   ```
   https://your-worker-subdomain.workers.dev/webhook
   ```
   (Use your actual worker URL)
6. Click **"Update endpoint"**

### Step 2.2: Update Signed Secrets

1. In your webhook endpoint settings, you'll see **"Signing secret"**
2. Click the copy icon to get the new secret
3. Update your `worker/wrangler.toml`:
   ```toml
   secrets = { STRIPE_WEBHOOK_SECRET = "whsec_live_xxxxx" }
   ```
4. Redeploy worker:
   ```bash
   cd worker
   npx wrangler deploy
   ```

---

## Phase 3: Update Extension

### Step 3.1: Update Worker URL in Code

1. Open `popup.js`
2. Find `const workerUrl = ...`
3. Change from `localhost:8787` to your deployed URL:
   ```javascript
   const workerUrl = 'https://your-worker-subdomain.workers.dev';
   ```

4. Open `background.js`
5. Find `const workerUrl = ...` (if you added it)
6. Update same way

### Step 3.2: Update manifest.json Version

For Chrome Web Store, increment version:

```json
{
  "version": "3.6.0"
}
```

### Step 3.3: Test Before Publishing

1. Load extension in Chrome (without publishing):
   - Chrome menu → **"More tools"** → **"Extensions"**
   - Enable **"Developer mode"** (top right)
   - Click **"Load unpacked"**
   - Select your extension folder
2. Click **"Upgrade Now"** button
3. Verify Stripe Checkout opens
4. Use test card `4242 4242 4242 4242`
5. Verify payment succeeds
6. Check extension shows subscription active

---

## Phase 4: Publish to Chrome Web Store

Publishing allows users to install your extension from the official store.

### Step 4.1: Prepare Extension Package

1. Create a folder `extension-release`
2. Copy these files:
   - ✅ `manifest.json`
   - ✅ `background.js`
   - ✅ `popup.html`
   - ✅ `popup.js`
   - ✅ `content.js`
   - ✅ `airbnb.js` (if you have it)
   - ✅ `agoda.js` (if you have it)
   - ✅ Any image files (icon.png, etc)
   - ❌ Don't include: `.github`, `worker`, `docs`, `.git`, `package.json` (from root)

3. Create `extension-release.zip`:
   - Compress the folder
   - Should be ~150KB (not too large)

### Step 4.2: Create Chrome Web Store Account

1. Go to **https://chrome.google.com/webstore/publish**
2. Click **"Create new"**
3. Pay **$5 USD** one-time developer fee (requires credit card)
4. Confirm payment
5. You now have a developer account!

### Step 4.3: Upload to Chrome Web Store

1. Go to **Chrome Web Store Dashboard**: https://chrome.google.com/webstore/category/extensions
   - Or: https://developer.chrome.com/docs/webstore/
2. Click **"Publish new item"**
3. Click **"Add"** or **"Upload new"**
4. Select `extension-release.zip`
5. Click **"Upload"**

### Step 4.4: Fill in Store Listing

After uploading, you'll see a form:

**Required fields:**

1. **Short description** (max 132 characters):
   ```
   Track and compare hotel prices across Booking.com, Airbnb & Agoda
   ```

2. **Full description**:
   ```
   Hotel Price Tracker Pro helps you monitor and compare hotel prices 
   across the three major booking platforms:
   
   Features:
   - Track prices on Booking.com, Airbnb, and Agoda
   - Get notified when prices drop
   - Compare prices across platforms
   - Set custom date ranges and refresh intervals
   - Premium features with monthly subscription
   
   Free tier: Track up to 5 hotels with basic features
   Premium: Unlimited tracking, advanced analytics, price history
   
   Pricing: $9.99/month subscription
   ```

3. **Category**: Select "Productivity Tools" or "Shopping"

4. **Language**: English (US)

5. **Screenshots** (at least 1 required):
   - Take 3-4 screenshots of your extension in action
   - Recommended size: 1280x800 pixels
   - Show: popup with tracked hotels, price tracking, upgrade button
   - Can use Chrome DevTools to screenshot at exact size

6. **Icon** (128x128 pixels):
   - Your extension icon/logo

7. **Promotional image** (440x280 pixels):
   - Banner image showing what extension does

8. **Homepage URL** (optional):
   - Your personal website or GitHub repo URL

9. **Support email**:
   - Email for users to contact with issues

10. **Privacy Policy** (REQUIRED):
    - Create a simple privacy policy:
    ```
    Privacy Policy for Hotel Price Tracker
    
    We respect your privacy. Our extension:
    - Does not collect personal data
    - Does not track your browsing
    - Only stores hotel URLs and prices locally in your browser
    - Uses HTTPS for all communications
    - Does not sell or share user data
    
    Payments are processed securely by Stripe.
    
    Contact: your-email@example.com
    Last updated: January 2024
    ```

11. **Permissions Justification**:
    For each permission you request, explain why:
    ```
    - storage: To save your tracked hotels locally
    - activeTab: To read prices from hotel pages
    - scripting: To inject price-checking scripts
    - notifications: To alert you of price changes
    - alarms: To auto-refresh prices every 30 minutes
    ```

### Step 4.5: Review and Submit

1. Click **"Review"** button
2. Verify all info is correct
3. Click **"Publish"**
4. You'll see: "Your item has been submitted for review"

### Step 4.6: Wait for Review

Google will review your extension (2-7 days):
- ✅ Verify it works as described
- ✅ Check for security issues
- ✅ Review privacy policy
- ✅ Confirm no malware

You'll receive an email when:
- ✅ **Approved**: Extension is live in Web Store!
- ❌ **Rejected**: Email will explain why, you can resubmit

---

## Phase 5: Switch to Live Stripe Keys

⚠️ **IMPORTANT**: Only do this after:
1. Extension is published to Chrome Web Store
2. You've tested thoroughly with test keys
3. You're confident everything works

### Step 5.1: Get Live API Keys

1. Login to **Stripe Dashboard**: https://dashboard.stripe.com
2. Look for **"Live data"** toggle (currently showing "Test data")
3. Click toggle to **"Live data"**
4. Now you'll see **Live API keys** (starting with `pk_live_`, `sk_live_`)
5. **Copy your live keys**

### Step 5.2: Update Configuration

1. Update `worker/wrangler.toml`:
   ```toml
   [env.production]
   secrets = {
     STRIPE_SECRET_KEY = "sk_live_xxxxx",  # Your live secret key
     STRIPE_WEBHOOK_SECRET = "whsec_live_xxxxx"  # Your live webhook secret
   }
   ```

2. Verify `STRIPE_PRICE_ID` is set correctly (it stays same)

### Step 5.3: Deploy Live Version

```bash
cd worker
npx wrangler deploy --env production
```

### Step 5.4: Update Stripe Webhook

1. Create new webhook endpoint pointing to production worker
2. Configure with live API key
3. Stripe will now validate real payments

---

## Phase 6: Monitor and Maintain

### Check Logs

**Cloudflare Logs**:
```bash
npx wrangler tail  # Streams real-time logs
```

**Stripe Dashboard**:
1. View all payments: **"Payments"** section
2. View failed webhooks: **"Webhooks"** section
3. View subscriptions: **"Subscriptions"** section

### Handle Failed Webhooks

If webhooks fail:
1. Go to Stripe Dashboard → **"Webhooks"**
2. Find failed event
3. Click **"Resend"**
4. Check CloudFlare logs to see if it processed

### Update Extension

To push updates:
1. Update extension code
2. Increment version in `manifest.json`
3. Zip and re-upload to Chrome Web Store
4. Wait for Google review
5. Once approved, users get auto-update

---

## Troubleshooting

**Q: Extension can't connect to worker**
- A: Check worker URL is correct in popup.js
- A: Check worker is deployed (test /status endpoint)
- A: Check CORS headers are correct in worker

**Q: Stripe checkout doesn't open**
- A: Check worker can create checkout sessions
- A: Check STRIPE_PRICE_ID is correct
- A: Check your Stripe account is activated

**Q: Webhooks not received**
- A: Verify webhook URL is correct in Stripe dashboard
- A: Check worker logs for 500 errors
- A: Make sure secret key is correct

**Q: Chrome Web Store review rejected**
- A: Read rejection email carefully
- A: Fix issues mentioned
- A: Resubmit
- A: Usually rejected for: missing privacy policy, misleading description, or security issues

---

## Post-Launch Checklist

- [ ] Extension published on Chrome Web Store
- [ ] Got first user reviews (celebrate! 🎉)
- [ ] Monitored first few payments in Stripe
- [ ] No failed webhooks
- [ ] Support email receives inquiries
- [ ] Website/repo listed for support
- [ ] Live API keys active
- [ ] CloudFlare monitoring alerts set up
- [ ] Privacy policy published/accessible
- [ ] Plan future features based on user feedback

---

## Next: Long-Term Maintenance

1. Monitor error logs weekly
2. Respond to user reviews
3. Track usage metrics
4. Plan feature updates
5. Keep dependencies updated
6. Monitor Stripe for suspicious activity
7. Plan pricing adjustments based on adoption

Congratulations - you're live! 🚀
