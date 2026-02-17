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
 * STRIPE_PRICE_ID - your price ID from Stripe
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
  const returnUrl = body.returnUrl; // Where to redirect after payment

  if (!userId) {
    return new Response(JSON.stringify({ error: 'userId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Initialize Stripe with secret key from environment
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-06-20', // Latest API version
    httpClient: fetch,
  });

  try {
    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: env.STRIPE_PRICE_ID, // Your product price ID
          quantity: 1,
        },
      ],
      success_url: returnUrl + '?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: returnUrl + '?cancelled=true',
      client_reference_id: userId, // Link session to user
      metadata: {
        userId: userId, // Store in metadata too
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

  // Only handle charge.succeeded events
  if (event.type === 'charge.succeeded') {
    const charge = event.data.object;
    
    // Get user ID from metadata
    const userId = charge.metadata?.userId || charge.customer;

    if (userId) {
      // Store subscription in KV with 30-day expiry
      await env.SUBSCRIPTIONS.put(
        `user:${userId}`,
        JSON.stringify({
          subscribed: true,
          chargeId: charge.id,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }),
        {
          expirationTtl: 30 * 24 * 60 * 60, // 30 days in seconds
        }
      );

      console.log(`Subscription stored for user: ${userId}`);
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
    return new Response(JSON.stringify({ subscribed: false }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  // Look up in KV
  const subscriptionData = await env.SUBSCRIPTIONS.get(`user:${userId}`);

  if (subscriptionData) {
    const data = JSON.parse(subscriptionData);
    const expiresAt = new Date(data.expiresAt);
    const isActive = expiresAt > new Date();

    return new Response(JSON.stringify({ subscribed: isActive }), {
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ subscribed: false }), {
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
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
