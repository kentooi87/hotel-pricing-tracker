# Hotel Price Tracker - Monetization Setup Guide

Welcome! This guide helps you transform your Hotel Price Tracker extension into a paid subscription service. You don't need any backend experience - we've built everything for you.

## What We're Building

Your extension will have:
- ✅ **Free tier**: Track up to 5 hotels with basic features
- ✅ **Premium tier**: Unlimited tracking ($9.99/month via Stripe)
- ✅ **Automatic billing**: Stripe handles payments & security
- ✅ **Scalable backend**: Cloudflare Workers (free tier can handle thousands of users)
- ✅ **Auto-deployment**: GitHub Actions deploys updates automatically

## The Stack

| Component | Purpose | Cost |
|-----------|---------|------|
| **Stripe** | Payment processing | 2.9% + $0.30 per transaction |
| **Cloudflare Workers** | Backend server | Free (100k requests/day) |
| **Cloudflare KV** | User database | Free (100k operations/day) |
| **GitHub Actions** | Auto-deployment | Free |
| **Chrome Web Store** | Distribution | $5 one-time fee |
| **Your own domain** (optional) | Custom branding | $10-12/year |
| **TOTAL MONTHLY COST** | | **$0** (until you make sales) |

## How It Works

```
┌──────────────┐         ┌──────────────┐        ┌───────────┐
│  Background  │         │   Stripe     │        │ Cloudflare│
│  Extension   │ ------> │   Checkout   │ -----> │  Workers  │
│  (Chrome)    │ (REST)  │   (Payment)  │        │ (Backend) │
└──────────────┘         └──────────────┘        └───────────┘
       |                        |                       |
       |                        |_____________(webhook)_|
       |                                       |
       |______________________(verify)_________|
                                               
                                   Cloudflare
                                      KV
                                   (Database)
```

## Quick Start (30 minutes)

### 1. Stripe Setup (5 minutes)
```bash
Go to: https://stripe.com/en-gb
1. Sign up for account
2. Get Test API keys
3. Create Product "Hotel Price Tracker Pro" ($9.99/month)
4. Set up Webhook endpoint
→ See: docs/STRIPE_SETUP.md for detailed steps
```

### 2. Cloudflare Setup (5 minutes)
```bash
Go to: https://dash.cloudflare.com
1. Create Worker project
2. Create KV namespace "SUBSCRIPTIONS"
3. Get Account ID and API Token
→ See: worker/wrangler.toml for config template
```

### 3. GitHub Setup (5 minutes)
```bash
1. Create GitHub repository
2. Push your code
3. Add GitHub Actions secrets (CLOUDFLARE_API_TOKEN, ACCOUNT_ID)
4. Push to main branch → auto-deploys!
→ See: .github/workflows/deploy.yml
```

### 4. Local Testing (5 minutes)
```bash
cd worker
npm install
npm run dev  # Start local worker on http://localhost:8787
```

Test with Stripe CLI:
```bash
npm install -g stripe
stripe login
stripe listen --forward-to localhost:8787/webhook
stripe trigger charge.succeeded  # Test webhook
```

### 5. Deploy & Publish (10 minutes)
```bash
# Deploy to Cloudflare (goes live immediately)
cd worker
npx wrangler deploy

# Update extension with worker URL, increment version
# Upload to Chrome Web Store

# Wait 2-7 days for Google review
# Once approved, you're live!
```

## File Structure

```
hotel-price-tracker/
├── manifest.json              # Extension config (updated with permissions)
├── popup.html                 # Popup UI (added upgrade banner)
├── popup.js                   # Popup logic (added subscription check)
├── background.js              # Background tasks (added subscription verification)
├── content.js                 # Price extraction
├── airbnb.js                  # Airbnb-specific
├── agoda.js                   # Agoda-specific
│
├── worker/                    # Cloudflare Workers backend
│   ├── src/
│   │   └── index.js          # Main webhook & payment handler
│   ├── package.json          # Dependencies (Stripe SDK)
│   └── wrangler.toml         # Configuration (API keys, KV namespace)
│
├── .github/
│   └── workflows/
│       └── deploy.yml        # GitHub Actions auto-deployment
│
├── docs/
│   ├── STRIPE_SETUP.md       # Step-by-step Stripe config
│   ├── STRIPE_WEBHOOK_GUIDE.md # Testing webhooks locally
│   └── DEPLOYMENT.md         # Publishing to Web Store
│
├── setup.sh                   # Automation script (optional)
└── SUBSCRIPTION_GUIDE.md      # Main guide (you're reading related content)
```

## Step-by-Step Guides

| Guide | Purpose | Time |
|-------|---------|------|
| **SUBSCRIPTION_GUIDE.md** | Overview of entire architecture | 15 min |
| **STRIPE_SETUP.md** | Configure Stripe (payment processor) | 20 min |
| **STRIPE_WEBHOOK_GUIDE.md** | Test webhooks before going live | 20 min |
| **DEPLOYMENT.md** | Deploy worker & publish to Web Store | 30 min |

## Common Questions

**Q: Do I need a server?**
A: No! Cloudflare Workers IS your server. Free tier handles thousands of users.

**Q: How much does it cost?**
A: $0 until you make sales. Then Stripe takes 2.9% + $0.30 per transaction.

**Q: Can users use the extension for free?**
A: Yes! Free tier can use basic features. Premium features require subscription.

**Q: What if the extension fails to capture a price?**
A: That's a separate issue from subscription. Check agoda.js, airbnb.js, content.js for extraction logic.

**Q: How do I get my money?**
A: Stripe deposits to your bank account. Default: weekly transfers.

**Q: What if someone disputes a charge?**
A: Stripe handles chargebacks. You can view disputes in Stripe Dashboard.

**Q: Can I change the price later?**
A: Yes! Create new Stripe Price, update STRIPE_PRICE_ID in wrangler.toml, redeploy.

## Detailed Walkthrough Video Script

If making a video tutorial for beginners:

```
Section 1: What we're building (2 min)
- Show extension popup with "Upgrade Now" button
- Show Stripe Checkout
- Explain $9.99/month model
- Show backend architecture diagram

Section 2: Stripe account (3 min)
- Go to stripe.com
- Sign up process
- Create product & set price
- Get API keys

Section 3: Cloudflare setup (3 min)
- Create KV namespace
- Deploy worker
- Get account info

Section 4: Local testing (5 min)
- Clone repo
- Copy API keys into wrangler.toml
- Run npm install
- Start worker locally
- Test with Stripe CLI

Section 5: Deploy to production (5 min)
- Add GitHub secrets
- Push to main branch
- Worker auto-deploys
- Update extension manifest
- Upload to Chrome Web Store

Section 6: First payment test (3 min)
- User installs from Web Store
- Clicks "Upgrade Now"
- Enters test card 4242 4242 4242 4242
- Payment succeeds
- Subscription verified
- Extension features unlocked
```

## First 10 Users

When you launch:

1. **Testing phase** (You):
   - Test everything with test Stripe keys
   - Test with friends/family
   - Fix any bugs
   - Get 10 beta testers

2. **Launch phase** (Real users):
   - Switch to live Stripe keys
   - Join Chrome Web Store
   - First 10 users will find edge cases
   - Monitor Stripe dashboard daily
   - Respond to any support emails

3. **Scaling phase** (Growing):
   - Monitor analytics
   - Optimize based on feedback
   - Add new features
   - Scale marketing efforts

## My Checklist

Before going live:

- [ ] Stripe account created with test API keys
- [ ] Cloudflare Worker deployed & tested
- [ ] Local webhook testing passes
- [ ] Extension popup shows upgrade button
- [ ] Extension manifest updated with new permissions
- [ ] GitHub Actions workflow configured
- [ ] Chrome Web Store developer account created ($5 fee)
- [ ] Privacy policy written
- [ ] Screenshots taken for Web Store
- [ ] Title, description, icon prepared
- [ ] Support email set up
- [ ] Stripe keys rotated to live mode (final step)
- [ ] First payment test succeeds
- [ ] Subscription verification working
- [ ] User sees premium features after payment

## Troubleshooting

**If something breaks:**

1. Check CloudFlare logs:
   ```bash
   npx wrangler tail
   ```

2. Check your worker endpoint:
   ```bash
   curl https://your-worker-subdomain.workers.dev/status
   ```

3. Check Stripe webhook status:
   - Stripe Dashboard → Webhooks
   - Look for failed events (red X)

4. Check KV storage:
   - Cloudflare Dashboard → Workers → KV
   - Look for your user key

5. Check browser console:
   - Open DevTools (F12)
   - Look for errors in Console tab

## Support

- **Stripe docs**: https://stripe.com/docs
- **Cloudflare docs**: https://developers.cloudflare.com
- **Chrome Extension docs**: https://developer.chrome.com/docs/extensions/
- **GitHub Actions**: https://docs.github.com/en/actions

## Next Steps

1. **Read** [SUBSCRIPTION_GUIDE.md](SUBSCRIPTION_GUIDE.md) - Full architecture overview
2. **Follow** [STRIPE_SETUP.md](docs/STRIPE_SETUP.md) - Create Stripe account
3. **Deploy** worker locally and test
4. **Test webhooks** with [STRIPE_WEBHOOK_GUIDE.md](docs/STRIPE_WEBHOOK_GUIDE.md)
5. **Deploy to production** with [DEPLOYMENT.md](docs/DEPLOYMENT.md)
6. **Celebrate** - You're now selling! 🎉

Good luck! You've got this! 🚀
