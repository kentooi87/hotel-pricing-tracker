# Quick Reference Card - Keep This Handy! 

## Three Commands You'll Need

### 1. Start Local Worker
```bash
cd worker
npm install  # First time only
npm run dev
```
Returns: `✨ Listening on http://localhost:8787`

### 2. Test Webhooks Locally
```bash
stripe login  # First time only
stripe listen --forward-to localhost:8787/webhook
stripe trigger charge.succeeded  # In another terminal
```

### 3. Deploy to Production
```bash
cd worker
npx wrangler deploy
```

---

## Four Websites You'll Visit

| Website | Purpose | Notes |
|---------|---------|-------|
| https://stripe.com | Get API keys | Save: pk_test, sk_test, price_id, whsec |
| https://dash.cloudflare.com | Deploy worker | Save: account_id, kv_id, api_token |
| https://github.com | Store code | Add secrets for auto-deploy |
| https://chrome.google.com/webstore/publish | Publish extension | Wait 2-7 days for review |

---

## Four API Keys You'll Need

1. **STRIPE_SECRET_KEY** (starts with `sk_test_` or `sk_live_`)
   - Where: Stripe Dashboard → Developers → API keys
   - Don't share! Keep secret!

2. **STRIPE_PRICE_ID** (starts with `price_`)
   - Where: Stripe Dashboard → Products → Your product
   - It's your $9.99/month subscription

3. **STRIPE_WEBHOOK_SECRET** (starts with `whsec_test_` or `whsec_live_`)
   - Where: Stripe Dashboard → Webhooks
   - Validates messages from Stripe

4. **CLOUDFLARE_API_TOKEN** (starts with `v1.`)
   - Where: Cloudflare Dashboard → Profile → API Tokens
   - For GitHub auto-deployment
   - Keep secret!

---

## Files to Update Before Going Live

### worker/wrangler.toml
```
Find these lines and update:
account_id = "your_account_id_here"
"id = "your_kv_namespace_id"
STRIPE_PRICE_ID = "price_xxx"
STRIPE_SECRET_KEY = "sk_test_xxx"
STRIPE_WEBHOOK_SECRET = "whsec_test_xxx"
```

### popup.js (around line 65)
```
const workerUrl = 'https://your-worker-subdomain.workers.dev';
```

### background.js (around line 60)
```
const workerUrl = 'https://your-worker-subdomain.workers.dev';
```

---

## Test Card Numbers

For testing Stripe Checkout locally:

| Scenario | Card Number | Expiry | CVC | Result |
|----------|-------------|--------|-----|--------|
| Success | 4242 4242 4242 4242 | 12/25 | 123 | ✅ Charge succeeds |
| Decline | 4000 0000 0000 0002 | 12/25 | 123 | ❌ Charge fails |
| Auth needed | 4000 0025 0000 3155 | 12/25 | 123 | ⏳ Requires confirmation |

---

## Webhook Flow (What Happens)

```
User pays $9.99
         ↓
Stripe processes payment
         ↓
Stripe sends webhook: POST /webhook
         ↓
Worker validates signature
         ↓
Worker stores in KV: user_id → {subscribed: true}
         ↓
Extension checks: GET /verify/user_id
         ↓
Extension sees: {subscribed: true}
         ↓
Upgrade banner disappears ✅
Premium features unlocked ✅
```

---

## Timeline

| Phase | Steps | Time | Result |
|-------|-------|------|--------|
| Setup | Read guides + gather credentials | 1 hour | Ready to code |
| Dev | Configure files + local testing | 1 hour | Worker running locally |
| Test | Webhook testing with Stripe CLI | 30 min | Verified webhooks work |
| Deploy | Push to Cloudflare + GitHub | 15 min | Live on production |
| Publish | Submit to Chrome Web Store | 5 min | Under review |
| Wait | Google reviews extension | 2-7 days | ⏳ Waiting... |
| Launch | Approved + live in store | - | 🎉 You're live! |

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| "Signature failed" | Wrong webhook secret | Check wrangler.toml matches Stripe |
| "Worker not found" | Wrong URL | Check Cloudflare dashboard for correct URL |
| "No webhook received" | Endpoint URL wrong | Update Stripe webhook to `xxx.workers.dev/webhook` |
| "Payment declined" | Using wrong test card | Use `4242 4242 4242 4242` |
| "GitHub Actions failed" | Missing secrets | Add CLOUDFLARE_API_TOKEN and ACCOUNT_ID in repo settings |
| "KV write failed" | Namespace not bound | Check `[env]` section in wrangler.toml |

---

## Documentation Files

Start here and read in order:

1. **README_MONETIZATION.md** - Overview (5 min read)
2. **SUBSCRIPTION_GUIDE.md** - Deep dive (20 min read)
3. **docs/STRIPE_SETUP.md** - Create Stripe account (follow along, 30 min)
4. **docs/STRIPE_WEBHOOK_GUIDE.md** - Test locally (hands-on, 20 min)
5. **docs/DEPLOYMENT.md** - Go live (follow along, 30 min)
6. **SETUP_CHECKLIST.md** - Track progress (print it!)

---

## Before You Start

### Do You Have?
- [ ] Node.js installed (`node --version`)
- [ ] npm installed (`npm --version`)
- [ ] Git installed (`git --version`)
- [ ] Chrome browser
- [ ] Email address (for accounts)
- [ ] Credit card (for Stripe $5 fee + for testing... just kidding, just $5)
- [ ] 3 hours of uninterrupted time

### Have You Done?
- [ ] Fixed Agoda price extraction (v3.5.0)?
- [ ] Tested extension locally in Chrome?
- [ ] Know how your extension works (price tracking flow)?

---

## Your Worker Endpoints

After deployment, you'll have 4 endpoints:

```
GET /status
  → Returns: {"status":"ok"}
  → Use: Health check

POST /checkout
  → Sends: {userId, returnUrl}
  → Returns: {url: "https://checkout.stripe.com/..."}
  → Use: Create checkout session

POST /webhook
  → Receives: Stripe webhook event
  → Validates: Signature with STRIPE_WEBHOOK_SECRET
  → Action: Stores subscription in KV
  → Use: Stripe → Your backend (automatic)

GET /verify/:userId
  → Returns: {subscribed: true/false}
  → Use: Extension checks if user paid
```

---

## Money Flow

Each $9.99 payment splits like this:

```
Customer pays:        $9.99
                        ↓
Stripe fee (2.9%):   -$0.29
Fixed fee:           -$0.30
                        ↓
You keep:            $9.40
                        ↓
Bank deposit:      Usually weekly
```

So for every 10 new paying subscribers:
- Revenue: $99.90
- Stripe takes: $5.90
- You get: $94.00

---

## Monitoring After Launch

### Daily
```
Check: https://dashboard.stripe.com
See: New payments? Failed charges? Disputes?
```

### Weekly
```
Analyze metrics:
- How many new installs?
- How many users upgraded?
- How many canceled?
- What's your conversion rate?
- Monthly recurring revenue (MRR)?
```

### Monthly
```
Plan next features based on:
- User feedback
- Feature requests
- Competitor analysis
- Usage patterns
```

---

## How to Get Help

**If something breaks:**

1. Check CloudFlare logs:
   ```bash
   npx wrangler tail
   ```

2. Check Chrome DevTools:
   - F12 in browser
   - Console tab for errors

3. Check Stripe Dashboard:
   - Webhooks section (look for red X ❌)
   - Logs section

4. Rebuild locally:
   ```bash
   npm run dev
   ```

**Resources:**
- Stripe Docs: https://stripe.com/docs
- Cloudflare Docs: https://developers.cloudflare.com
- Chrome Extension: https://developer.chrome.com/docs/extensions/

---

## Success Milestones

Track your wins:

- [ ] ✅ All files created and configured
- [ ] ✅ Worker deployed and /status responds
- [ ] ✅ Webhook tested locally with Stripe CLI
- [ ] ✅ Extension shows upgrade banner
- [ ] ✅ Test payment succeeds in Stripe Checkout
- [ ] ✅ Extension hides banner after payment
- [ ] ✅ Submitted to Chrome Web Store
- [ ] ✅ 🎉 **APPROVED** by Google!
- [ ] ✅ Live in Chrome Web Store
- [ ] ✅ First user installs
- [ ] ✅ **First payment received!**
- [ ] ✅ 10 paying subscribers
- [ ] ✅ $100+ monthly recurring revenue

Each milestone = reason to celebrate! 🎉

---

**Remember: You've got this! This guide has everything you need to succeed.** 🚀
