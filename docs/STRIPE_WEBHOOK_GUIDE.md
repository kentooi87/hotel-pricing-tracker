# Stripe Webhook Testing Guide

This guide shows you how to test webhooks locally **before deploying to production**. This ensures your backend correctly handles payment confirmations.

## What Are Webhooks?

When someone makes a payment:
1. **Customer** submits card on Stripe Checkout page
2. **Stripe servers** process the payment
3. **Stripe sends webhook** to YOUR backend with payment confirmation
4. **Your backend** receives webhook and stores subscription in database (KV)

If your webhook endpoint has bugs, Stripe can't tell your backend about successful payments!

---

## Prerequisites

- Node.js and npm installed
- Stripe CLI installed (we'll do this)
- Your local worker running (`npm run dev` in worker folder)
- Stripe test API keys (from STRIPE_SETUP.md)

---

## Install Stripe CLI

### Step 1: Download Stripe CLI

**Windows**:
1. Go to: https://github.com/stripe/stripe-cli/releases
2. Download: `stripe_X.X.X_windows_x86_64.zip` (latest version)
3. Unzip it somewhere (e.g., `C:\stripe-cli`)
4. Open Command Prompt and navigate to the folder
5. Run: `stripe.exe --version`
6. Should show version number

**macOS**:
```bash
brew install stripe/stripe-cli/stripe
stripe --version
```

**Linux**:
```bash
# Ubuntu/Debian
sudo apt-get install stripe

# Or using curl
curl https://raw.githubusercontent.com/stripe/stripe-cli/master/install.sh -s | sudo bash
stripe --version
```

### Step 2: Login to Stripe CLI

```bash
stripe login
```

This will:
1. Open a browser to Stripe.com
2. Ask you to authorize CLI access
3. Generate a restricted API key for CLI
4. Paste the key back into terminal
5. You're now logged in!

---

## Test Local Webhook

### Step 3: Start Your Local Worker

In one terminal:
```bash
cd worker
npm run dev
```

You should see:
```
⛅ wrangler 3.x.x
✨ Listening on http://localhost:8787
```

### Step 4: Forward Stripe Events to Your Local Worker

In a **new terminal**:
```bash
stripe listen --forward-to localhost:8787/webhook
```

You'll see:
```
Ready! Your webhook signing secret is whsec_test_xxxxxxxxxxxxx
...
```

**Copy the signing secret** and save it temporarily - you'll need it for testing.

### Step 5: Test Payment in Another Terminal

In a **third terminal**, trigger a test event:
```bash
stripe trigger charge.succeeded
```

You should see:
- In **terminal 2** (stripe listen): "charge.succeeded" received
- In **terminal 1** (worker): Console logs showing webhook processing
- Check Cloudflare KV to verify subscription was stored

---

## Simulate Full Checkout Flow

### Option 1: Test Stripe Checkout Locally

1. In popup.js, update worker URL to:
   ```javascript
   const workerUrl = 'http://localhost:8787'; // Local testing
   ```

2. Click "Upgrade Now" button in extension popup
3. You'll be sent to Stripe Checkout page
4. Enter test card: `4242 4242 4242 4242`
5. Expiry: Any future date (e.g., `12/25`)
6. CVC: Any 3 digits (e.g., `123`)
7. Name: Any name
8. Click **Subscribe**
9. Stripe processes payment
10. Webhook sends event to `stripe listen` terminal
11. Your local worker receives and processes webhook
12. Subscription stored in KV (or local Cloudflare dev storage)

### Option 2: Manually Trigger Webhook

If Stripe Checkout is too complex to test locally:

```bash
# Terminal with stripe listen still running
stripe trigger charge.succeeded
```

This simulates a successful payment without needing Stripe Checkout.

---

## Debug Webhook Processing

### Check Worker Logs

In your worker code, add console logs:

```javascript
async function handleWebhook(request, env, corsHeaders) {
  console.log('📨 Received webhook');
  
  const body = await request.text();
  console.log('Body:', body);
  
  const signature = request.headers.get('stripe-signature');
  console.log('Signature:', signature);
  
  if (!verifyWebhookSignature(body, signature, env.STRIPE_WEBHOOK_SECRET)) {
    console.log('❌ Signature verification failed');
    return new Response(...);
  }
  
  console.log('✅ Signature verified');
  const event = JSON.parse(body);
  console.log('Event type:', event.type);
  
  // ... rest of handler
}
```

Then check output in:
1. **Worker local logs**: Terminal where you ran `npm run dev`
2. **Stripe CLI logs**: Terminal where you ran `stripe listen`

### Common Issues

**"Signature verification failed"**
- Make sure `STRIPE_WEBHOOK_SECRET` matches what Stripe CLI shows
- Make sure you're passing the exact request body (can't modify it)

**"No subscription stored"**
- Check if event reaches your handler
- Check if KV operations are working
- Add more console logs

**"No webhook received"**
- Make sure `stripe listen` is still running
- Make sure `--forward-to localhost:8787/webhook` is correct
- Check your machine's firewall isn't blocking connections

---

## Verify Subscription in KV

After a successful webhook:

1. Go to Cloudflare Dashboard: https://dash.cloudflare.com
2. Select your worker project
3. In left sidebar, click **"KV"**
4. Select **"SUBSCRIPTIONS"** namespace
5. Look for a key like `user:user_1234567890_abc...`
6. Click it to see subscription data:
   ```json
   {
     "subscribed": true,
     "chargeId": "ch_xxxxx",
     "createdAt": "2024-01-15T10:30:00Z",
     "expiresAt": "2024-02-15T10:30:00Z"
   }
   ```

---

## Before Going Live

1. **Test with test API keys** (keys starting with `pk_test_`, `sk_test_`)
2. **Verify all webhook events** arrive correctly
3. **Check KV storage** works
4. **Test subscription verification** endpoint
5. **Test subscription expiry** (manually set old expiry date and verify it expires)
6. **Test Stripe Checkout** full flow end-to-end

Only after all tests pass, switch to **Live API keys** and deploy to production.

---

## Test Checklist

- [ ] Stripe CLI installed and working
- [ ] Can login with `stripe login`
- [ ] Worker runs locally with `npm run dev`
- [ ] Can forward events with `stripe listen`
- [ ] Test webhook arrives with `stripe trigger`
- [ ] Subscription stored in KV
- [ ] Can verify subscription with `/verify/:userId` endpoint
- [ ] Full checkout flow works with test card
- [ ] Webhook signature verification works

---

## Common Test Cards

| Purpose | Card Number | Expiry | CVC | Status |
|---------|------------|--------|-----|--------|
| Success | 4242 4242 4242 4242 | 12/25 | 123 | ✅ Succeeds |
| Auth needed | 4000 0025 0000 3155 | 12/25 | 123 | ⏳ Requires 3D Secure |
| Declined | 4000 0000 0000 0002 | 12/25 | 123 | ❌ Declined |
| Expired card | 4000 0000 0000 0069 | 12/25 | 123 | ❌ Card expired |
| Processing error | 4000 0000 0000 0119 | 12/25 | 123 | ⚠️ Processing error |

---

## Next Steps

1. Test webhooks locally using this guide
2. Once confirmed working, deploy to Cloudflare
3. Update Stripe webhook URL to point to your deployed worker
4. Test again in production
5. Switch to Live API keys and go live!

See DEPLOYMENT.md for deployment instructions.
