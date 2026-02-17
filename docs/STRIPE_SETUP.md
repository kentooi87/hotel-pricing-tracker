# Stripe Setup Guide for Hotel Price Tracker

This guide walks you through setting up Stripe to accept payments for your Hotel Price Tracker extension. **Read each step carefully - we'll take screenshots and screenshots of what you should see.**

## Table of Contents
1. [Create Stripe Account](#create-stripe-account)
2. [Get API Keys](#get-api-keys)
3. [Create Product and Price](#create-product-and-price)
4. [Set Up Webhooks](#set-up-webhooks)
5. [Test Your Setup](#test-your-setup)

---

## Create Stripe Account

### Step 1.1: Sign Up for Stripe

1. Go to **https://stripe.com**
2. Click **"Sign up"** button (top right corner)
3. You'll be asked:
   - **Email address**: Use your business email (you'll receive important confirmations here)
   - **Password**: Create a strong password (mix of uppercase, lowercase, numbers, symbols)
   - **Country**: Select your country
   - **Timezone**: Select your timezone

4. Click **"Sign up"** button
5. Stripe will send you a verification email - check your email and click the verification link
6. You'll be taken to account setup - fill in:
   - **Business name**: "Hotel Price Tracker" or your company name
   - **Website**: Leave blank or enter your website if you have one
   - **Business type**: Select "Other"

7. Click **"Enable Payments"**
8. You'll need to provide:
   - **Personal information**: Your name, date of birth, email
   - **Phone number**: For account verification
   - **Business address**: Your address
   - **Bank account details**: Where Stripe should deposit your payments

Once submitted, Stripe will review your application (usually takes 1-2 business days).

---

## Get API Keys

### Step 2.1: Access Your API Keys

1. Log in to **Stripe Dashboard**: https://dashboard.stripe.com
2. On the left sidebar, click **"Developers"** (you might see 👨‍💻 icon)
3. Click **"API keys"** in the submenu
4. You'll see two sections:
   - **Standard keys** (visible by default)
   - **Restricted keys** (for additional security)

### Step 2.2: Test Mode Keys

**IMPORTANT**: When you first sign up, Stripe puts you in **Test Mode** (you'll see "Test data" indicator). This is perfect for development.

In Test Mode, you'll see:
- **Publishable key** (starts with `pk_test_`)
- **Secret key** (starts with `sk_test_`)

⚠️ **Keep secret key protected!** Never share it or commit it to public GitHub.

**Copy these keys** and save them temporarily:
- **Publishable key**: `pk_test_...` (paste into extension popup.html comment)
- **Secret key**: `sk_test_...` (paste into wrangler.toml)

### Step 2.3: Create a Webhook Secret

Later when we set up webhooks, you'll get another secret for webhook verification.

---

## Create Product and Price

### Step 3.1: Create a Product

A "Product" in Stripe is what you're selling - in our case, "Hotel Price Tracker Pro".

1. In Stripe Dashboard, click **"Products"** on the left sidebar
2. Click **"Add product"** button (blue button, top right)
3. Fill in the details:
   - **Product name**: `Hotel Price Tracker Pro`
   - **Description**: "Premium subscription for unlimited hotel tracking and advanced features"
   - **Image**: (optional) Upload an extension icon
4. Under **"Pricing"**, select **"Recurring"** (for monthly subscription)
5. Under **"Billing cycle"**, select **"Monthly"**
6. Enter **Price**: `9.99` (or your desired price in $)
7. Leave **"Tax code"** as default
8. Leave all other options as default
9. Click **"Save"** (blue button, bottom right)

### Step 3.2: Get Your Price ID

After saving, you'll see your product details page. Look for:
- **Price section** with:
  - Amount: $9.99
  - Billing: Monthly
  - **Price ID**: `price_xxxxxxxxxxxxx` (this is what we need!)

**Copy the Price ID** and save it - you'll paste this into `wrangler.toml` as `STRIPE_PRICE_ID`.

---

## Set Up Webhooks

Webhooks are how Stripe tells your backend when someone successfully pays.

### Step 4.1: Create Webhook Endpoint

1. In Stripe Dashboard, click **"Webhooks"** (you might need to click "Developers" > "Events" > "Webhooks")
2. Click **"Add endpoint"** button
3. You'll see a form asking for:
   - **Endpoint URL**: Enter your Cloudflare Worker URL:
     ```
     https://your-worker-name.your-subdomain.workers.dev/webhook
     ```
     *(Replace with your actual worker URL)*

4. Click **"Events to send"** to expand options
5. Uncheck **"All events"** (optional, for security)
6. Check only: **"charge.succeeded"** and **"charge.failed"**
7. Click **"Add endpoint"** button
8. You'll see a success message with your **Webhook signing secret**

### Step 4.2: Get Webhook Secret

After creating the webhook:
1. Find your new endpoint in the Webhooks list
2. Click on it to open details
3. You'll see **"Signing secret"** with a value like `whsec_xxxxxxxxxxxxx`
4. Copy this value and save it - you'll paste into `wrangler.toml` as `STRIPE_WEBHOOK_SECRET`

---

## Test Your Setup

### Step 5.1: Test Credentials

Stripe provides test card numbers for development:

**Important**: These only work in Test Mode (where your keys start with `test`). Your live keys (production) require real payment information.

**Test card numbers**:
- **Successful payment**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 0002`

For all test cards:
- **Expiry**: Any future date (e.g., `12/25`)
- **CVC**: Any 3 digits (e.g., `123`)
- **Cardholder name**: Any name (e.g., `Test User`)

### Step 5.2: Test Payment Flow

Once you deploy your worker, you can test:

1. Open extension popup
2. Click **"Upgrade Now"** button
3. You'll be redirected to Stripe Checkout
4. Enter test card: `4242 4242 4242 4242`
5. Enter any expiry and CVC
6. Click **"Subscribe"**
7. Stripe should show success message
8. Your worker will receive webhook confirmation
9. Backend stores subscription in Cloudflare KV

---

## Summary: Keys to Save

After completing setup, you should have:

1. **Publishable key**: `pk_test_...` (for client-side, less sensitive)
2. **Secret key**: `sk_test_...` (keep secret!)
3. **Price ID**: `price_...` (what you're selling)
4. **Webhook secret**: `whsec_...` (validates webhook messages)

These go in `worker/wrangler.toml`:
```toml
[env.development]
vars = { STRIPE_PRICE_ID = "price_xxx..." }
secrets = { STRIPE_SECRET_KEY = "sk_test_...", STRIPE_WEBHOOK_SECRET = "whsec_..." }
```

---

## Troubleshooting

**Q: I see "Test mode" warning - is that bad?**
A: No! Test mode is perfect for development. When you're ready to sell, you'll switch to Live mode and repeat this process with real API keys.

**Q: I can't find my API keys**
A: 
1. Make sure you're logged in
2. Click "Developers" on left sidebar
3. Click "API keys"
4. Keys are under "Standard keys" section

**Q: Webhook shows red X (failed events)**
A: 
1. Check your worker URL is correct
2. Check your worker is deployed
3. Check `/webhook` endpoint exists in your code
4. Check logs in Cloudflare Dashboard for errors

**Q: Webhook shows orange clock (pending)**
A: Wait a moment and refresh - it might still be processing

---

## Next Steps

1. Save all your keys
2. Update `wrangler.toml` with the keys
3. Deploy your worker (see DEPLOYMENT.md)
4. Update popup.js with your worker URL
5. Test payment flow with test card numbers
6. When ready for real sales, create Live API keys (repeat this guide with Live mode)

Need help? Check Stripe docs: https://stripe.com/docs/payments/setup-intent
