# Complete Setup Checklist - Hotel Price Tracker Monetization

Print this out or save it - check off items as you complete them!

---

## 📖 PHASE 1: READ & UNDERSTAND (30 minutes)

### Essential Reading
- [ ] Read `README_MONETIZATION.md` - Overview and architecture
- [ ] Read `SUBSCRIPTION_GUIDE.md` - Deep dive into all components
- [ ] Review `IMPLEMENTATION_SUMMARY.md` - What was created and why
- [ ] Understand the payment flow diagram

### Key Questions (Do You Know the Answers?)
- [ ] What problem is Stripe solving for us?
- [ ] Why do we use Cloudflare Workers instead of traditional server?
- [ ] How does the extension know if a user is subscribed?
- [ ] When does the webhook get called?
- [ ] How long does KV storage keep a subscription (30 days)?

---

## 💳 PHASE 2: STRIPE SETUP (30 minutes)

### 2.1: Create Account
- [ ] Go to: https://stripe.com
- [ ] Click "Sign up"
- [ ] Enter email, password, country, timezone
- [ ] Check verification email and click link
- [ ] Fill in account details:
  - [ ] Business name: "Hotel Price Tracker" or your name
  - [ ] Business type: "Other"
  - [ ] Personal info (name, DOB, phone)
  - [ ] Address
  - [ ] Bank account details for deposits
- [ ] Submit - wait for Stripe to approve (1-2 business days)

### 2.2: Get Test API Keys
- [ ] Log in: https://dashboard.stripe.com (you should see "Test data" label)
- [ ] Developers → API keys
- [ ] Copy **Publishable key** (pk_test_...)
  - Save as: `STRIPE_PUBLISHABLE_KEY_TEST`
- [ ] Copy **Secret key** (sk_test_...)
  - Save as: `STRIPE_SECRET_KEY_TEST` (keep secret!)

### 2.3: Create Product
- [ ] Products → Add product
- [ ] Name: "Hotel Price Tracker Pro"
- [ ] Make it recurring (monthly)
- [ ] Price: $9.99
- [ ] Save product
- [ ] Copy **Price ID** (price_...)
  - Save as: `STRIPE_PRICE_ID`

### 2.4: Set Up Webhook
- [ ] Developers → Webhooks
- [ ] Add endpoint
- [ ] **Endpoint URL**: Leave for now (we'll update after deploying worker)
- [ ] Select events: "charge.succeeded", "charge.failed"
- [ ] Create endpoint
- [ ] Copy **Signing secret** (whsec_...)
  - Save as: `STRIPE_WEBHOOK_SECRET_TEST`

### 2.5: Save Your Credentials
Create a text file `stripe_credentials_test.txt` (keep secure!):
```
STRIPE_PUBLISHABLE_KEY_TEST: pk_test_...
STRIPE_SECRET_KEY_TEST: sk_test_...
STRIPE_PRICE_ID: price_...
STRIPE_WEBHOOK_SECRET_TEST: whsec_...
```

---

## ☁️ PHASE 3: CLOUDFLARE SETUP (20 minutes)

### 3.1: Create Account
- [ ] Go to: https://dash.cloudflare.com
- [ ] Sign up with email/password
- [ ] Verify email

### 3.2: Create Worker
- [ ] Left sidebar → Workers & Pages
- [ ] Create Application
- [ ] Pick a worker subdomain (you'll see URL: `yourname.workers.dev`)
  - Save as: `WORKER_URL`

### 3.3: Create KV Namespace
- [ ] Workers Dashboard → KV
- [ ] "Create Namespace"
- [ ] Name: `SUBSCRIPTIONS`
- [ ] Create
- [ ] Copy the **ID** (looks like: abc123def456...)
  - Save as: `KV_NAMESPACE_ID_DEV`

### 3.4: Get Account Info
- [ ] Workers & Pages → Overview
- [ ] Copy **Account ID** (you'll see it on the page)
  - Save as: `CLOUDFLARE_ACCOUNT_ID`

### 3.5: Create API Token
- [ ] Top right → Your profile icon
- [ ] My Profile → API Tokens
- [ ] "Create Token"
- [ ] Use template: "Edit Cloudflare Workers"
- [ ] Name: "GitHub Actions Deployment"
- [ ] Permissions: Account > Cloudflare Workers > Edit
- [ ] Account Resources: All accounts
- [ ] Create
- [ ] Copy the token (long string like: v1.xxx...)
  - Save as: `CLOUDFLARE_API_TOKEN` (keep secret!)

### 3.6: Save Credentials
Create a text file `cloudflare_credentials.txt`:
```
WORKER_URL: https://yourname.workers.dev
CLOUDFLARE_ACCOUNT_ID: abc123...
KV_NAMESPACE_ID_DEV: def456...
CLOUDFLARE_API_TOKEN: v1.xxx... (KEEP SECRET)
```

---

## 🔧 PHASE 4: CONFIGURE CODE (15 minutes)

### 4.1: Update Worker Configuration
- [ ] Open: `worker/wrangler.toml`
- [ ] Replace `account_id = "your_id"` with your CLOUDFLARE_ACCOUNT_ID
- [ ] Find `[env.development]` section
- [ ] Replace:
  - `id = "your_kv_id"` with your KV_NAMESPACE_ID_DEV
  - `STRIPE_PRICE_ID = "..."` with your STRIPE_PRICE_ID
  - `STRIPE_SECRET_KEY = "..."` with your STRIPE_SECRET_KEY_TEST
  - `STRIPE_WEBHOOK_SECRET = "..."` with your STRIPE_WEBHOOK_SECRET_TEST

### 4.2: Update Extension Code
- [ ] Open: `popup.js` (around line 65)
- [ ] Find: `const workerUrl = 'https://your-worker...`
- [ ] Replace with: `const workerUrl = 'YOUR_WORKER_URL'`

- [ ] Open: `background.js` (around line 60)
- [ ] Find: `const workerUrl = 'https://your-worker...`
- [ ] Replace with: `const workerUrl = 'YOUR_WORKER_URL'`

### 4.3: Verify Config
- [ ] Check `wrangler.toml` - no placeholder values (all real)
- [ ] Check files are saved
- [ ] Check no typos in credentials

---

## 🧪 PHASE 5: LOCAL TESTING (20 minutes)

### 5.1: Install Dependencies
```bash
cd worker
npm install
```
- [ ] Completes without errors
- [ ] See `node_modules/` folder created

### 5.2: Start Local Worker
```bash
npm run dev
```
- [ ] See: `⛅ wrangler` and `✨ Listening on http://localhost:8787`
- [ ] Leave running in this terminal

### 5.3: Test /status Endpoint
In a new terminal:
```bash
curl http://localhost:8787/status
```
- [ ] Returns: `{"status":"ok"}`

### 5.4: Set Up Stripe CLI
In another terminal:
```bash
npm install -g stripe
stripe --version
```
- [ ] Shows version number (e.g., `stripe version 1.17.0`)

### 5.5: Login to Stripe
```bash
stripe login
```
- [ ] Opens browser for authorization
- [ ] Paste authorization code
- [ ] See: `Done! The Stripe CLI is configured for this device.`

### 5.6: Forward Webhooks
In another terminal:
```bash
stripe listen --forward-to localhost:8787/webhook
```
- [ ] See: `Ready! Your webhook signing secret is whsec_test_...`
- [ ] Copy the signing secret
- [ ] This is your **STRIPE_WEBHOOK_SECRET_LOCAL**

### 5.7: Test Webhook Locally
In yet another terminal:
```bash
stripe trigger charge.succeeded
```
- [ ] `stripe listen` terminal shows: `Webhook received! charge.succeeded`
- [ ] `npm run dev` terminal should show processing logs
- [ ] Congratulations! Webhook works locally!

---

## 📂 PHASE 6: PREPARE FOR DEPLOYMENT (10 minutes)

### 6.1: Create .gitignore (if not exists)
- [ ] File: `.gitignore`
- [ ] Add:
  ```
  node_modules/
  dist/
  build/
  .env
  .env.local
  stripe_credentials_*.txt
  cloudflare_credentials.txt
  ```

### 6.2: Check Files
- [ ] No `stripe_credentials*.txt` in git
- [ ] No actual API keys in `wrangler.toml` comments
- [ ] All sensitive values use environment variables

### 6.3: Prepare for Git
- [ ] Have you installed Git? (`git --version`)
- [ ] Do you have a GitHub account?
- [ ] Have you created a new repo on GitHub?

---

## 🚀 PHASE 7: DEPLOY TO CLOUDFLARE (10 minutes)

### 7.1: Deploy via CLI
```bash
cd worker
npx wrangler deploy
```
- [ ] See: `✅ Uploaded your Worker`
- [ ] See: `✅ Published your Worker`
- [ ] Note the URL shown

### 7.2: Verify Deployed Worker
```bash
curl https://your-worker-subdomain.workers.dev/status
```
- [ ] Returns: `{"status":"ok"}`

### 7.3: Update Stripe Webhook
- [ ] Go to: https://dashboard.stripe.com
- [ ] Developers → Webhooks
- [ ] Find your webhook
- [ ] Click to edit
- [ ] Change URL to: `https://your-worker-url.workers.dev/webhook`
- [ ] Save
- [ ] See green checkmark (endpoint is active)

### 7.4: Get New Webhook Secret
After updating the URL, you might get a new secret:
- [ ] Copy new webhook secret (whsec_...)
- [ ] Save as: `STRIPE_WEBHOOK_SECRET_PROD`

---

## 🐙 PHASE 8: GITHUB SETUP (15 minutes)

### 8.1: Create GitHub Repository
- [ ] Go to: https://github.com/new
- [ ] Repository name: `hotel-price-tracker` (or your name)
- [ ] Public (so you can show others)
- [ ] Create repository
- [ ] Copy the HTTPS URL

### 8.2: Upload Code
```bash
git init
git add .
git commit -m "Initial commit: Monetization system"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME
git push -u origin main
```
- [ ] No errors
- [ ] See: `branch 'main' set up to track 'origin/main'`

### 8.3: Add GitHub Secrets
- [ ] Go to: Your repo on GitHub
- [ ] Settings (top menu)
- [ ] Secrets and variables → Actions (left sidebar)
- [ ] "New repository secret" (green button)

**Add Secret 1:**
- [ ] Name: `CLOUDFLARE_API_TOKEN`
- [ ] Value: (paste your CLOUDFLARE_API_TOKEN)
- [ ] "Add secret"

**Add Secret 2:**
- [ ] Name: `CLOUDFLARE_ACCOUNT_ID`
- [ ] Value: (paste your CLOUDFLARE_ACCOUNT_ID)
- [ ] "Add secret"

### 8.4: Test GitHub Actions
```bash
cd worker
# Make a small change
echo "# Updated" >> README.md
git add .
git commit -m "Test deployment"
git push
```
- [ ] Go to: GitHub repo → Actions tab
- [ ] See workflow running
- [ ] Wait for green checkmark (✅ deployed)

---

## 🎨 PHASE 9: EXTENSION TESTING (10 minutes)

### 9.1: Load Extension in Chrome
- [ ] Open Chrome
- [ ] chrome://extensions
- [ ] Enable "Developer mode" (top right toggle)
- [ ] "Load unpacked"
- [ ] Select your extension folder
- [ ] See extension appear in list

### 9.2: Check Upgrade Banner
- [ ] Click extension icon
- [ ] Should see purple "Upgrade Now" banner
- [ ] Test with test mode

### 9.3: Test Upgrade Flow
- [ ] Click "Upgrade Now" button
- [ ] Stripe Checkout should open
- [ ] Enter test card: `4242 4242 4242 4242`
- [ ] Expiry: `12/25`
- [ ] CVC: `123`
- [ ] Name: `Test User`
- [ ] Click Subscribe
- [ ] Wait for confirmation
- [ ] Check banner changes (disappears if subscription active)

---

## 💬 PHASE 10: CHROME WEB STORE PREPARATION (30 minutes)

### 10.1: Prepare Files
- [ ] Create `extension_package` folder
- [ ] Copy these files only:
  - [ ] manifest.json
  - [ ] popup.html
  - [ ] popup.js
  - [ ] background.js
  - [ ] content.js
  - [ ] airbnb.js
  - [ ] agoda.js
  - [ ] icon.png (and any other images)
- [ ] Don't copy: `.git`, `worker`, `docs`, `node_modules`

### 10.2: Create ZIP File
- [ ] Compress `extension_package` folder
- [ ] Save as: `hotel-price-tracker.zip`
- [ ] Size should be < 200KB

### 10.3: Prepare Store Listing Text
- [ ] Write **Short description** (max 132 characters):
  ```
  Track & compare hotel prices on Booking.com, Airbnb & Agoda
  ```

- [ ] Write **Full description**:
  ```
  Save money by tracking hotel prices across the top booking sites.
  
  FEATURES:
  - Track prices on Booking.com, Airbnb, and Agoda
  - Get alerts when prices drop
  - Compare across platforms
  - Set custom dates and refresh intervals
  
  FREE TIER: Track up to 5 hotels
  PREMIUM: Unlimited tracking for just $9.99/month
  
  Safe, fast, and completely private.
  ```

- [ ] Take 3-4 screenshots (1280x800px each):
  - [ ] Screenshot 1: Popup showing tracked hotels
  - [ ] Screenshot 2: Price tracking in action
  - [ ] Screenshot 3: Upgrade button and features
  - [ ] Screenshot 4: Settings and controls

- [ ] Create icon image (128x128px):
  - [ ] Use your extension icon
  - [ ] Make it stand out

### 10.4: Write Privacy Policy
Create `privacy-policy.txt`:
```
PRIVACY POLICY

We respect your privacy. This extension:

1. DOES NOT collect personal information
2. DOES NOT track your browsing history
3. ONLY stores hotel URLs and prices locally on your device
4. Uses HTTPS encryption for all communications
5. Does not sell or share user data with third parties

Payments are processed securely by Stripe (see stripe.com/privacy).

Data Stored Locally:
- Hotel URLs you add
- Price history
- Your preferences

Data NOT stored:
- Your credit card information (processed by Stripe)
- Your browsing history
- Your personal identity

For questions: your-email@example.com

Last updated: January 2024
```

### 10.5: Prepare for Store Submission
- [ ] Have business email ready
- [ ] Have valid payment method for $5 fee
- [ ] Privacy policy written and saved
- [ ] Screenshots captured
- [ ] Description texts prepared
- [ ] Icon created

---

## 🏪 PHASE 11: SUBMIT TO CHROME WEB STORE (30 minutes)

### 11.1: Create Developer Account
- [ ] Go to: https://chrome.google.com/webstore/publish
- [ ] Click "Create new"
- [ ] Pay $5 USD fee
- [ ] Confirm payment
- [ ] Save invoice

### 11.2: Upload Extension
- [ ] Click "Publish new item"
- [ ] Select your `hotel-price-tracker.zip` file
- [ ] Click "Upload"
- [ ] Wait for upload to complete

### 11.3: Fill Store Listing
Fill in all required fields:
- [ ] **Title**: "Hotel Price Tracker"
- [ ] **Short description**: (from Phase 10.3)
- [ ] **Full description**: (from Phase 10.3)
- [ ] **Category**: "Productivity" or "Shopping"
- [ ] **Language**: English (US)
- [ ] **Screenshots**: (from Phase 10.3 - upload 3-4)
- [ ] **Icon**: (128x128 PNG from Phase 10.3)
- [ ] **Promotional image**: (optional - 440x280 PNG)
- [ ] **Homepage URL**: (your website or GitHub - optional)
- [ ] **Support email**: (your email)
- [ ] **Privacy policy**: (paste your policy text)

### 11.4: Submit for Review
- [ ] Click "Review" button
- [ ] Verify all information is correct
- [ ] Click "Publish"
- [ ] You see: "Your item has been submitted for review"
- [ ] Save confirmation

### 11.5: Monitor Review Status
- [ ] Go to: Chrome Web Store Developer Dashboard
- [ ] Monitor your submission status
- [ ] Watch for approval or rejection email
- [ ] Review takes 2-7 business days
- [ ] No action needed - wait for Google

---

## ✅ PHASE 12: GO LIVE (Final Steps)

### 12.1: Wait for Approval
- [ ] Extension approved by Google
- [ ] Email confirms approval
- [ ] Extension appears in Chrome Web Store
- [ ] Share your store URL: `https://chrome.google.com/webstore/detail/YOUR_EXTENSION_ID`

### 12.2: Switch to Live Stripe Keys
⚠️ Only after extension is published!

- [ ] Go to: https://dashboard.stripe.com
- [ ] Click "Live data" toggle (switch from Test to Live)
- [ ] Copy **Live Publishable key** (pk_live_...)
- [ ] Copy **Live Secret key** (sk_live_...)
- [ ] Note your **Live Webhook secret** (whsec_live_...)

### 12.3: Update Production Configuration
- [ ] Update `worker/wrangler.toml`:
  ```toml
  [env.production]
  vars = { STRIPE_PRICE_ID = "price_..." }
  secrets = { 
    STRIPE_SECRET_KEY = "sk_live_xxxxx",
    STRIPE_WEBHOOK_SECRET = "whsec_live_xxxxx"
  }
  ```

### 12.4: Deploy Live Version
```bash
cd worker
npx wrangler deploy --env production
```
- [ ] See success message
- [ ] Worker updated with live keys

### 12.5: Update Stripe Webhook (Live)
- [ ] Go to: https://dashboard.stripe.com
- [ ] Webhooks section
- [ ] Create NEW webhook endpoint for production:
  - [ ] URL: `https://your-worker.workers.dev/webhook`
  - [ ] Events: charge.succeeded, charge.failed
  - [ ] Save
- [ ] Copy live webhook secret
- [ ] Update wrangler.toml with live secret

### 12.6: Final Verification
```bash
curl https://your-worker.workers.dev/status
```
- [ ] Returns: `{"status":"ok"}` (live version running)

### 12.7: Celebrate! 🎉
- [ ] Your extension is live!
- [ ] Users can install from Chrome Web Store
- [ ] Users can pay via Stripe
- [ ] You're earning recurring revenue!

---

## 📊 PHASE 13: MONITOR & MAINTAIN (Daily)

### Daily Tasks (First 2 Weeks)
- [ ] Check Stripe Dashboard for payments
- [ ] Check CloudFlare logs for errors
- [ ] Read & respond to support emails
- [ ] Monitor user reviews (aim for 4.5+ stars)

### Weekly Tasks
- [ ] Review metrics:
  - [ ] Number of installs
  - [ ] Number of paying users
  - [ ] Conversion rate %
  - [ ] Monthly recurring revenue (MRR)
  - [ ] Churn rate (canceled subscriptions)
- [ ] Check all endpoints still working

### Monthly Tasks
- [ ] Plan next feature update
- [ ] Analyze customer feedback
- [ ] Optimize based on data
- [ ] Plan marketing/promotion

---

## 📋 COMPLETION STATUS

Count how many checkboxes you've completed:

- [ ] **Phase 1**: Read & Understand (7/7)
- [ ] **Phase 2**: Stripe Setup (20/20)
- [ ] **Phase 3**: Cloudflare Setup (18/18)
- [ ] **Phase 4**: Configure Code (7/7)
- [ ] **Phase 5**: Local Testing (21/21)
- [ ] **Phase 6**: Prepare Deployment (6/6)
- [ ] **Phase 7**: Deploy to Cloudflare (11/11)
- [ ] **Phase 8**: GitHub Setup (15/15)
- [ ] **Phase 9**: Extension Testing (10/10)
- [ ] **Phase 10**: Chrome Web Store Prep (19/19)
- [ ] **Phase 11**: Submit to Store (17/17)
- [ ] **Phase 12**: Go Live (12/12)
- [ ] **Phase 13**: Monitor & Maintain (12/12)

**Total Checkboxes: 192**

---

## 🎯 YOU'RE DONE!

Once you've checked all boxes, you have:
- ✅ Production-ready Hotel Price Tracker
- ✅ Stripe payment integration
- ✅ Cloudflare backend
- ✅ Published on Chrome Web Store
- ✅ Receiving real payments
- ✅ Growing recurring revenue

**Congratulations! You're now a SaaS business owner!** 🚀

---

**Print this checklist and track your progress. Good luck!**
