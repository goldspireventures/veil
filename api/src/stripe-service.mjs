import Stripe from 'stripe';
import { httpError } from './org-service.mjs';

function getStripe(env) {
  const key = String(env.STRIPE_SECRET_KEY || '').trim();
  if (!key) return null;
  return new Stripe(key);
}

export async function handleStripeWebhook(rawBody, signature, env) {
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  if (!webhookSecret) {
    throw httpError(500, 'STRIPE_WEBHOOK_SECRET is not configured.');
  }

  const stripe = getStripe(env);
  if (!stripe) {
    throw httpError(500, 'STRIPE_SECRET_KEY is not configured.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    throw httpError(400, `Webhook signature verification failed: ${err.message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed':
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'invoice.paid':
    case 'invoice.payment_failed':
      console.log('[stripe/webhook]', event.type, event.id);
      break;
    default:
      console.log('[stripe/webhook] unhandled:', event.type);
  }

  return { received: true, type: event.type };
}
