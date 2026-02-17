# Chrome Extension Subscription System - Complete Setup Guide

## 📋 Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Project Structure](#project-structure)
4. [Step 1: Stripe Setup](#step-1-stripe-setup)
5. [Step 2: Cloudflare Workers Setup](#step-2-cloudflare-workers-setup)
6. [Step 3: GitHub Setup](#step-3-github-setup)
7. [Step 4: Local Development](#step-4-local-development)
8. [Step 5: Deployment](#step-5-deployment)
9. [Step 6: Chrome Web Store Submission](#step-6-chrome-web-store-submission)

---

## Architecture Overview

Your extension will work like this:

```
Chrome Extension (User's Browser)
    ↓
    ├─→ Check if user has valid subscription (via Cloudflare Worker)
    ├─→ If not subscribed → Show "Upgrade" button in popup
    └─→ If subscribed → Show full features

Stripe (Payment Processing)
    ↑
    ├─ Create checkout sessions (user clicks "Upgrade")
    └─ Handle webhooks (payment confirmation)
    
Cloudflare Workers (Backend - FREE)
    ├─ Receives payment requests from extension
    ├─ Creates Stripe checkout sessions
    ├─ Stores user subscription data in KV (free database)
    └─ Verifies subscriptions when extension starts
```

**Why this stack:**
- **Stripe**: Most popular payment processor, easy integration
- **Cloudflare Workers**: Free tier, no server to manage, instant global deployment
- **Chrome Extension**: Already built, now adding monetization

---

## Prerequisites

Before you start, you need:

1. **Stripe Account** (Free)
   - Go to https://stripe.com/register
   - Sign up and verify email
   - You'll get Test Keys (for development) and Live Keys (for production)

2. **Cloudflare Account** (Free)
   - Go to https://dash.cloudflare.com/sign-up
   - Sign up and verify email

3. **GitHub Account** (Free)
   - Go to https://github.com/join
   - Create account for CI/CD automation

4. **Node.js & npm**
   - Download from https://nodejs.org/
   - Install LTS version
   - Verify: Open terminal and type `node -v` (should show version)

5. **Git** (Free)
   - Download from https://git-scm.com/
   - Verify: Type `git --version` in terminal

---

## Project Structure

After setup, your folder should look like:

```
booking-price-tracker/
├── .github/
│   └── workflows/
│       └── deploy.yml                 (GitHub Actions - auto deploys to Cloudflare)
│
├── worker/                             (Cloudflare Worker backend)
│   ├── src/
│   │   └── index.js                   (Main worker code - handles payments)
│   ├── wrangler.toml                  (Cloudflare configuration)
│   └── package.json
│
├── extension/                          (Chrome Extension frontend)
│   ├── manifest.json                  (Updated with permissions)
│   ├── background.js                  (Updated with payment handling)
│   ├── popup.html                     (Updated with Upgrade button)
│   ├── popup.js                       (Updated with subscription check)
│   ├── popup.css                      (New - styling)
│   ├── agoda.js
│   ├── airbnb.js
│   ├── booking.js
│   └── icon.png
│
├── scripts/
│   └── setup.sh                       (Setup automation script)
│
├── docs/
│   ├── STRIPE_SETUP.md               (Detailed Stripe guide)
│   ├── STRIPE_WEBHOOK_GUIDE.md       (Webhook testing guide)
│   └── DEPLOYMENT.md                 (Deployment checklist)
│
└── README.md                          (Project documentation)
```

---

## Step 1: Stripe Setup

### 1.1 Create Stripe Account
**Time: 5 minutes**

1. Go to https://stripe.com
2. Click **"Sign up"** (top right)
3. Fill in your business details
4. Create password
5. Click **"Create account"**
6. Verify your email

### 1.2 Get API Keys
**⚠️ IMPORTANT: Keep these secret! Never commit to GitHub!**

1. Login to Stripe Dashboard: https://dashboard.stripe.com
2. Click **"Developers"** in the left menu
3. Click **"API keys"**
4. You'll see two sets of keys:
   - **Publishable key** (safe to share/commit) - starts with `pk_`
   - **Secret key** (KEEP PRIVATE!) - starts with `sk_`
5. You need **TEST MODE** keys for development
   - Toggle is in top-left: make sure it says **"Test mode"**
6. Copy both TEST keys and save them somewhere safe (you'll need them)

Example (THESE ARE FAKE):
```
Test Publishable Key: pk_test_...
Test Secret Key: sk_test_...
```

### 1.3 Create a Product
**Time: 3 minutes**

This represents "monthly subscription"

1. Click **"Products"** in left menu
2. Click **"Create product"** button
3. Fill in:
   - **Name**: "Hotel Price Tracker Pro"
   - **Description**: "Premium features for tracking hotel prices across Booking, Airbnb & Agoda"
   - **Type**: Select **"Service"**
   - **Pricing Model**: Select **"Recurring"**
   - **Recurring billing**: 
     - Interval: **Monthly**
     - Price: **$9.99** (or your price)
     - Billing period: **1 month**
4. Click **"Save product"**
5. After creation, click on the product
6. Note the **Price ID** (starts with `price_` in the Pricing section)
7. Save this Price ID - you'll need it in the code

### 1.4 Create API Webhook
**Time: 5 minutes**

This allows Stripe to notify your backend when someone pays

1. Click **"Webhooks"** in left menu
2. Click **"Add an endpoint"**
3. Endpoint URL: `https://your-worker.workers.dev/webhook` 
   - DON'T have the actual URL yet? You'll add this AFTER deploying the worker
   - For now, note this - come back to it
4. Select events to send:
   - Click **"Select events"**
   - Search for: **"charge.succeeded"**
   - Click it to check it
   - Click **"Add events"**
5. Click **"Create endpoint"**
6. After creation, click the endpoint
7. Click **"Signing secret"** 
8. Copy the secret (starts with `whsec_`) and save it
   - This proves the webhook really came from Stripe

---

## Step 2: Cloudflare Workers Setup

### 2.1 Create Cloudflare Account
**Time: 5 minutes**

1. Go to https://dash.cloudflare.com/sign-up
2. Enter email and password
3. Verify email
4. Login to https://dash.cloudflare.com

### 2.2 Install Development Tools
**Time: 10 minutes**

Open Terminal/PowerShell and run:

```bash
# Install wrangler (Cloudflare CLI tool)
npm install -g @cloudflare/wrangler

# Verify installation
wrangler --version
```

### 2.3 Login to Cloudflare from Command Line
**Time: 5 minutes**

```bash
wrangler login
```

This opens a browser window - approve access. Then return to terminal.

### 2.4 Create Cloudflare Workers Project
**Time: 5 minutes**

```bash
# Create new worker project
wrangler init hotel-price-tracker-worker

# Choose options:
# - "Would you like to use TypeScript?" → No
# - "Would you like to use git to manage this project?" → Yes
# - Continue with defaults
```

This creates the `worker/` folder with necessary files.

### 2.5 Set up KV (Free Database)
**Time: 5 minutes**

This stores subscription information (free 100,000 operations/day!)

```bash
cd worker

# Create KV namespace
wrangler kv:namespace create "SUBSCRIPTIONS"
wrangler kv:namespace create "SUBSCRIPTIONS" --preview
```

You'll get output like:
```
🎉 Successfully created kv namespace with ID: a1b2c3d4e5f6
```

Copy this ID - you'll add it to `wrangler.toml`

---

## Step 3: GitHub Setup

### 3.1 Create GitHub Repository
**Time: 5 minutes**

1. Go to https://github.com/new
2. Repository name: `booking-price-tracker`
3. Description: "Hotel price tracker for Booking, Airbnb & Agoda with Stripe subscription"
4. Choose **Public** (so pull requests from others are easier)
5. Click **"Create repository"**

### 3.2 Connect Your Local Code to GitHub
**Time: 10 minutes**

```bash
cd booking-price-tracker

# Initialize git (if not already done)
git init

# Add all files
git add .

# First commit
git commit -m "Initial commit: add extension and worker code"

# Add GitHub as remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/booking-price-tracker.git

# Push to GitHub
git branch -M main
git push -u origin main
```

### 3.3 Create GitHub API Token for Deployments
**Time: 5 minutes**

This lets GitHub Actions automatically deploy to Cloudflare

1. Go to https://github.com/settings/tokens/new
2. Scopes: Select nothing (leave all unchecked)
3. Click **"Generate token"**
4. Copy the token immediately (you won't see it again)
5. Go to your GitHub repo: https://github.com/YOUR_USERNAME/booking-price-tracker
6. Click **"Settings"** tab
7. Click **"Secrets and variables"** → **"Actions"** in left menu
8. Click **"New repository secret"**
9. Name: `CLOUDFLARE_API_TOKEN`
10. Value: Paste your GitHub token
11. Click **"Add secret"**

Do the same for Cloudflare Account ID:

1. Go to https://dash.cloudflare.com/
2. Right side panel, copy your **Account ID**
3. In GitHub secrets, add new secret:
   - Name: `CLOUDFLARE_ACCOUNT_ID`
   - Value: Your account ID

---

## Step 4: Local Development

### 4.1 Test Stripe Webhook Locally
**Time: 10 minutes**

```bash
# Install Stripe CLI
# Windows: Download from https://github.com/stripe/stripe-cli/releases
# Mac: brew install stripe/stripe-cli/stripe
# Linux: Available from official repo

# Login to Stripe
stripe login

# Start webhook forwarder (this will make Stripe events appear locally)
stripe listen --forward-to http://localhost:8787/webhook
```

This outputs a signing secret - you'll use this for testing.

### 4.2 Start Worker Locally
**Time: 5 minutes**

```bash
cd worker

# Install dependencies
npm install

# Start local development server
wrangler dev
```

Worker runs at `http://localhost:8787`

---

## Step 5: Deployment

### 5.1 Deploy Worker to Cloudflare
**Time: 5 minutes**

```bash
cd worker

# Deploy
wrangler deploy

# Output shows your worker URL like:
# ✅ Uploaded worker-name (x.xx s)
# ✨ Success! Your worker is live at:
# https://hotel-price-tracker-worker.YOUR_ACCOUNT.workers.dev
```

Save this URL - you'll need it for:
- Stripe webhook endpoint
- Extension communication

### 5.2 Update Stripe Webhook
**Time: 3 minutes**

Now add your actual worker URL to Stripe:

1. Go to https://dashboard.stripe.com/webhooks
2. Click your webhook endpoint
3. Update URL to: `https://your-worker-name.YOUR_ACCOUNT.workers.dev/webhook`
4. Click **"Update endpoint"**

### 5.3 Deploy Extension to Chrome Web Store
**Time: 15 minutes**

(Covered in Step 6 below)

---

## Step 6: Chrome Web Store Submission

### 6.1 Prepare Extension Package

```bash
# Make sure you're in the extension folder
cd extension/

# Zip all files (don't include node_modules or .git)
# Windows: Highlight all files → Right-click → Send to → Compressed (zipped) folder
# Mac/Linux: zip -r ../extension.zip . -x "*.git*" "node_modules/*"
```

### 6.2 Create Chrome Web Store Account
**Time: 10 minutes**

1. Go to https://chrome.google.com/webstore/devconsole/
2. Click **"Accept and continue"** (accept developer agreement)
3. Pay **$5 one-time fee** (credit card required)
4. After payment, you can publish apps

### 6.3 Submit Your Extension
**Time: 20 minutes**

1. Click **"Create new item"** in Web Store console
2. Upload your `extension.zip` file
3. Fill in Store Listing:
   - **Name**: Hotel Price Tracker
   - **Description**: Track competitor prices on Booking.com, Airbnb & Agoda with automatic monitoring and instant alerts when prices change
   - **Detailed description**: Your full feature list
   - **Category**: Productivity
   - **Supported languages**: English
   - **Add screenshots** (show the popup, the tracking list)
4. Upload **Privacy Policy** (see template below)
5. For hosting permission: Explain you're checking subscription status and payment
6. Click **"Submit for review"**
7. Wait for Chrome Team review (usually 2-7 days)

### Privacy Policy Template

```
PRIVACY POLICY - Hotel Price Tracker Extension

Our extension collects:
- Hotel URLs you add to tracking
- Your subscription status (stored on Cloudflare)
- Price data from public websites

We do NOT:
- Share data with third parties (except payment processor Stripe)
- Store personal information beyond subscription ID
- Track browsing history
- Sell any data

Payment processing by Stripe - see https://stripe.com/privacy

Last updated: [TODAY'S DATE]
```

---

## Important Security Notes

### 🔐 Secret Management

**Never commit these to GitHub:**
- Stripe Secret Keys
- Cloudflare API tokens
- Webhook signing secrets

**Use environment variables instead:**

In `wrangler.toml`:
```toml
[env.production]
vars = { STRIPE_KEY = "pk_test_..." }
```

In GitHub Secrets (encrypted):
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `CLOUDFLARE_KV_ID`

---

## Troubleshooting

### Issue: "Worker not found"
**Solution**: Check your worker is deployed with `wrangler deploy`

### Issue: "Stripe webhook not firing"
**Solution**: 
1. Check signing secret is correct
2. Check endpoint URL matches deployment URL exactly
3. Check KV namespace is created and ID matches wrangler.toml

### Issue: "Users can't subscribe"
**Solution**:
1. Check Price ID is correct (from Stripe)
2. Check your public key is correct
3. Check both Test/Live keys match your environment

---

## Next Steps

1. Follow Step 1-3 above (Stripe, Cloudflare, GitHub)
2. Copy code files from this guide
3. Follow Step 4-5 (local dev & deployment)
4. Go live!

**Estimated total setup time: 2-3 hours**
**Monthly cost to run: $0 (Cloudflare free, Stripe only takes 2.9% + $0.30 per charge)**

---

## Support Resources

- **Stripe Docs**: https://stripe.com/docs
- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **Chrome Extension API**: https://developer.chrome.com/docs/extensions/
- **Stripe CLI**: https://stripe.com/docs/stripe-cli

Good luck! 🚀
