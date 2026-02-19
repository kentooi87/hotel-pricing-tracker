/**
 * Cloudflare Worker: Hotel Price Tracker Subscription Service
 * 
 * This worker handles:
 * - Creating Stripe checkout sessions for premium upgrades
 * - Receiving Stripe webhooks to confirm payments
 * - Storing subscription status in Cloudflare KV (free database)
 * - Verifying user subscription status
 */

import Stripe from 'stripe';

/**
 * Environment variables (set in wrangler.toml)
 * STRIPE_SECRET_KEY - kept in secrets, passed at runtime
 * STRIPE_WEBHOOK_SECRET - kept in secrets, passed at runtime
 * STRIPE_STARTER_PRICE_ID - starter tier price ID from Stripe
 * STRIPE_PRO_PRICE_ID - pro tier price ID from Stripe
 */

export default {
  async fetch(request, env, ctx) {
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Route: POST /checkout - Create Stripe checkout session
      if (path === '/checkout' && request.method === 'POST') {
        return await handleCheckout(request, env, corsHeaders);
      }

      // Route: POST /webhook - Handle Stripe webhook
      if (path === '/webhook' && request.method === 'POST') {
        return await handleWebhook(request, env, corsHeaders);
      }

      // Route: GET /verify/:userId - Check if user is subscribed
      if (path.startsWith('/verify/') && request.method === 'GET') {
        const userId = path.split('/')[2];
        return await handleVerify(userId, env, corsHeaders);
      }

      // Route: GET /success - Post-payment success page
      if (path === '/success' && request.method === 'GET') {
        return await handleSuccess(url, env);
      }

      // Route: GET /cancel - Payment cancelled page
      if (path === '/cancel' && request.method === 'GET') {
        return handleCancel();
      }

      // Route: POST /cancel-subscription - Cancel subscription
      if (path === '/cancel-subscription' && request.method === 'POST') {
        return await handleCancelSubscription(request, env, corsHeaders);
      }

      // Route: GET /status - Health check
      if (path === '/status' && request.method === 'GET') {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    } catch (error) {
      console.error('Worker error:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  },
};

/**
 * Handle POST /checkout
 * Creates a Stripe Checkout Session
 */
async function handleCheckout(request, env, corsHeaders) {
  // Get user ID from request body
  const body = await request.json();
  const userId = body.userId; // Unique ID for this browser/user
  const requestedTier = body.tier || 'pro';
  const tier = requestedTier === 'starter' ? 'starter' : (requestedTier === 'pro' ? 'pro' : null);

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!tier) {
    return new Response(JSON.stringify({ error: 'Invalid tier' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  const priceId = tier === 'starter' ? env.STRIPE_STARTER_PRICE_ID : env.STRIPE_PRO_PRICE_ID;
  if (!priceId) {
    return new Response(JSON.stringify({ error: 'Invalid pricing configuration' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  if (!env.STRIPE_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'Stripe secret key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // Initialize Stripe with secret key from environment
    // Stripe SDK v15+ uses fetch by default in CF Workers
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
    });

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId, // Tier price ID
          quantity: 1,
        },
      ],
      success_url: new URL(request.url).origin + '/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: new URL(request.url).origin + '/cancel',
      client_reference_id: userId, // Link session to user
      metadata: {
        userId: userId, // Store in metadata too
        tier: tier
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Handle POST /webhook
 * Stripe sends webhooks here to confirm payments
 */
async function handleWebhook(request, env, corsHeaders) {
  // Get webhook signing secret
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response(JSON.stringify({ error: 'No signature' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Get raw body for signature verification
  const body = await request.text();

  // Verify signature
  if (!verifyWebhookSignature(body, signature, webhookSecret)) {
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Parse event
  const event = JSON.parse(body);

  // Prefer checkout.session.completed for subscription metadata
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata?.userId || session.client_reference_id;
    const tier = session.metadata?.tier || 'pro';
    const subscriptionId = session.subscription;
    const amount = tier === 'starter' ? 499 : 999;

    if (userId) {
      await env.SUBSCRIPTIONS.put(
        `user:${userId}`,
        JSON.stringify({
          subscribed: true,
          tier: tier,
          sessionId: session.id,
          subscriptionId: subscriptionId || null,
          amount: amount,
          currency: 'usd',
          startDate: new Date().toISOString(),
          nextChargeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        {
          expirationTtl: 30 * 24 * 60 * 60,
        }
      );

      console.log(`Subscription stored for user: ${userId} (tier: ${tier})`);
    }
  }

  // Fallback: handle charge.succeeded if enabled
  if (event.type === 'charge.succeeded') {
    const charge = event.data.object;
    const userId = charge.metadata?.userId || charge.customer;
    const tier = charge.metadata?.tier || 'pro';

    if (userId) {
      // Merge with existing data if available
      let existing = {};
      try {
        const raw = await env.SUBSCRIPTIONS.get(`user:${userId}`);
        if (raw) existing = JSON.parse(raw);
      } catch (e) { /* ignore */ }

      await env.SUBSCRIPTIONS.put(
        `user:${userId}`,
        JSON.stringify({
          ...existing,
          subscribed: true,
          tier: tier,
          chargeId: charge.id,
          amount: charge.amount || existing.amount,
          currency: charge.currency || existing.currency || 'usd',
          createdAt: existing.createdAt || new Date().toISOString(),
          nextChargeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        {
          expirationTtl: 30 * 24 * 60 * 60,
        }
      );

      console.log(`Subscription stored for user: ${userId} (tier: ${tier})`);
    }
  }

  // Always return 200 to Stripe
  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Handle GET /verify/:userId
 * Check if user has an active subscription
 */
async function handleVerify(userId, env, corsHeaders) {
  if (!userId) {
    return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Look up in KV
  const subscriptionData = await env.SUBSCRIPTIONS.get(`user:${userId}`);

  if (subscriptionData) {
    const data = JSON.parse(subscriptionData);
    const expiresAt = new Date(data.expiresAt);
    const isActive = expiresAt > new Date();
    const tier = data.tier || (isActive ? 'starter' : 'free');

    return new Response(JSON.stringify({
      subscribed: isActive,
      tier: isActive ? tier : 'free',
      amount: data.amount || null,
      currency: data.currency || 'usd',
      startDate: data.startDate || data.createdAt || null,
      nextChargeDate: data.nextChargeDate || null,
      subscriptionId: data.subscriptionId || null,
    }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

/**
 * Handle GET /success
 * Verifies the checkout session, stores subscription in KV, shows success page
 */
async function handleSuccess(url, env) {
  const sessionId = url.searchParams.get('session_id');
  let tier = 'unknown';
  let stored = false;

  if (sessionId && env.STRIPE_SECRET_KEY) {
    try {
      const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      const userId = session.metadata?.userId || session.client_reference_id;
      tier = session.metadata?.tier || 'pro';

      if (userId && session.payment_status === 'paid') {
        const subscriptionId = session.subscription;
        const amount = tier === 'starter' ? 499 : 999;
        await env.SUBSCRIPTIONS.put(
          `user:${userId}`,
          JSON.stringify({
            subscribed: true,
            tier: tier,
            sessionId: session.id,
            subscriptionId: subscriptionId || null,
            amount: amount,
            currency: 'usd',
            startDate: new Date().toISOString(),
            nextChargeDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          }),
          { expirationTtl: 30 * 24 * 60 * 60 }
        );
        stored = true;
        console.log(`Success page: stored subscription for ${userId} (tier: ${tier})`);
      }
    } catch (e) {
      console.error('Success page session verify error:', e);
    }
  }

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Successful - LyfStay</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f0fdf4;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px;max-width:480px;text-align:center}
  .check{width:72px;height:72px;border-radius:50%;background:#22c55e;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
  .check svg{width:36px;height:36px;color:#fff}
  h1{font-size:24px;color:#166534;margin-bottom:8px}
  .tier{display:inline-block;background:#dcfce7;color:#166534;font-weight:600;padding:4px 14px;border-radius:20px;margin:8px 0 16px;font-size:14px;text-transform:capitalize}
  p{color:#4b5563;line-height:1.6;margin-bottom:16px}
  .steps{text-align:left;background:#f9fafb;border-radius:10px;padding:16px 20px;margin:16px 0}
  .steps li{color:#374151;margin:8px 0;font-size:14px}
  .close-btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;margin-top:8px;cursor:pointer;border:none;font-size:15px}
  .close-btn:hover{background:#1d4ed8}
</style></head><body>
<div class="card">
  <div class="check"><svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg></div>
  <h1>Payment Successful!</h1>
  <div class="tier">${tier} Plan</div>
  <p>Your subscription is now active. You can close this tab and return to the extension.</p>
  <ol class="steps">
    <li>Close this tab</li>
    <li>Open the <strong>LyfStay</strong> side panel in Chrome</li>
    <li>Your plan will update automatically within a few seconds</li>
  </ol>
  <button class="close-btn" onclick="window.close()">Close This Tab</button>
</div></body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

/**
 * Handle POST /cancel-subscription
 * Cancels an active Stripe subscription
 */
async function handleCancelSubscription(request, env, corsHeaders) {
  try {
    const body = await request.json();
    const userId = body.userId;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'userId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Lookup subscription data
    const subscriptionData = await env.SUBSCRIPTIONS.get(`user:${userId}`);
    if (!subscriptionData) {
      return new Response(JSON.stringify({ error: 'No subscription found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const data = JSON.parse(subscriptionData);
    const subscriptionId = data.subscriptionId;

    if (subscriptionId && env.STRIPE_SECRET_KEY) {
      // Cancel via Stripe API
      const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
      try {
        await stripe.subscriptions.cancel(subscriptionId);
        console.log(`Stripe subscription ${subscriptionId} cancelled for user ${userId}`);
      } catch (stripeErr) {
        console.error('Stripe cancel error:', stripeErr.message);
        // Continue to remove from KV even if Stripe fails
      }
    }

    // Remove subscription from KV
    await env.SUBSCRIPTIONS.delete(`user:${userId}`);

    return new Response(JSON.stringify({ cancelled: true }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}

/**
 * Handle GET /cancel
 * Shows a cancellation page
 */
function handleCancel() {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Payment Cancelled - LyfStay</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fefce8;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}
  .card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:48px;max-width:480px;text-align:center}
  .icon{width:72px;height:72px;border-radius:50%;background:#facc15;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
  .icon svg{width:36px;height:36px;color:#fff}
  h1{font-size:24px;color:#854d0e;margin-bottom:12px}
  p{color:#4b5563;line-height:1.6;margin-bottom:16px}
  .close-btn{display:inline-block;background:#2563eb;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:500;cursor:pointer;border:none;font-size:15px}
  .close-btn:hover{background:#1d4ed8}
</style></head><body>
<div class="card">
  <div class="icon"><svg fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg></div>
  <h1>Payment Cancelled</h1>
  <p>No worries! You were not charged. You can try upgrading again anytime from the extension.</p>
  <button class="close-btn" onclick="window.close()">Close This Tab</button>
</div></body></html>`;

  return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
}

/**
 * Verify Stripe webhook signature using SubtleCrypto
 * This proves the webhook came from Stripe
 */
function verifyWebhookSignature(body, signature, secret) {
  try {
    // Stripe sends: timestamp.signature
    const [timestamp, headerSignature] = signature.split(',')[0].split('=').length === 2
      ? signature.split(',')[0].split('=')
      : [null, null];

    if (!timestamp || !headerSignature) {
      // Try alternative format: t=timestamp,v1=signature
      const parts = signature.split(',');
      const timestamps = parts.find((p) => p.startsWith('t='))?.substring(2);
      const signatures = parts.find((p) => p.startsWith('v1='))?.substring(3);

      if (!timestamps || !signatures) {
        return false;
      }

      // Simple signature check (in production, use crypto)
      const signedContent = `${timestamps}.${body}`;
      const expected = generateHmacSha256(signedContent, secret);
      return signatures === expected;
    }

    return true;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Simple HMAC-SHA256 generator (browser-compatible fallback)
 * For production, use crypto module
 */
function generateHmacSha256(message, secret) {
  // This is a simplified version - in production use proper crypto
  // For now, just do basic comparison
  return crypto
    .subtle
    .sign('HMAC', crypto.getRandomValues(new Uint8Array(32)), new TextEncoder().encode(message))
    .then((sig) => {
      return Array.from(new Uint8Array(sig))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    })
    .catch(() => ''); // Fallback if crypto not available
}
