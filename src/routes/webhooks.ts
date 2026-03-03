import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { stripe } from '../utils/stripe';
import { supabaseAdmin } from '../utils/supabase';
import { config } from '../config';
import { calculateFeeSplit } from '../services/subscription';

const router = Router();

/**
 * POST /api/webhooks/stripe
 *
 * Handles incoming Stripe webhook events.
 * IMPORTANT: This route must use express.raw() body parser, NOT json.
 * This is configured in index.ts.
 */
router.post('/', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature header');

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
  } catch (err: any) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`[Webhook] Received: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;

      case 'invoice.payment_failed':
        await handleInvoiceFailed(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
  } catch (err) {
    console.error(`[Webhook] Error processing ${event.type}:`, err);
    // Return 200 anyway to prevent Stripe from retrying endlessly
    // The error is logged for investigation
  }

  res.json({ received: true });
});

// ── Event Handlers ──────────────────────────

/**
 * checkout.session.completed
 * User finished the Stripe Checkout flow – create the subscription record.
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const userId = session.metadata?.ripple_user_id;
  const orgId = session.metadata?.ripple_organisation_id;

  if (!userId || !orgId || !session.subscription) {
    console.warn('[Webhook] Checkout session missing metadata:', session.id);
    return;
  }

  // Fetch the full subscription from Stripe
  const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
  const priceId = subscription.items.data[0]?.price.id;
  const amountCents = subscription.items.data[0]?.price.unit_amount || 0;

  await supabaseAdmin.from('subscriptions').upsert({
    user_id: userId,
    organisation_id: orgId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    amount_cents: amountCents,
    status: 'active',
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
  }, {
    onConflict: 'stripe_subscription_id',
  });

  console.log(`[Webhook] ✓ Subscription created: ${subscription.id} (${userId} → ${orgId})`);
}

/**
 * invoice.paid
 * A subscription payment succeeded – record the donation.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return; // Skip non-subscription invoices

  const amountCents = invoice.amount_paid;
  if (amountCents === 0) return; // Skip $0 invoices (trials etc.)

  // Look up our subscription record
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('id, user_id, organisation_id')
    .eq('stripe_subscription_id', invoice.subscription as string)
    .single();

  if (!sub) {
    console.warn(`[Webhook] No subscription found for ${invoice.subscription}`);
    return;
  }

  const fees = calculateFeeSplit(amountCents);

  await supabaseAdmin.from('donations').upsert({
    user_id: sub.user_id,
    organisation_id: sub.organisation_id,
    subscription_id: sub.id,
    stripe_invoice_id: invoice.id,
    stripe_payment_intent_id: invoice.payment_intent as string,
    gross_amount_cents: fees.grossAmountCents,
    admin_fee_cents: fees.adminFeeCents,
    net_amount_cents: fees.netAmountCents,
    status: 'succeeded',
    donated_at: new Date(invoice.created * 1000).toISOString(),
  }, {
    onConflict: 'stripe_invoice_id',
  });

  console.log(`[Webhook] ✓ Donation recorded: $${(amountCents / 100).toFixed(2)} from ${sub.user_id}`);
}

/**
 * invoice.payment_failed
 * Payment failed – update subscription status.
 */
async function handleInvoiceFailed(invoice: Stripe.Invoice) {
  if (!invoice.subscription) return;

  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due' })
    .eq('stripe_subscription_id', invoice.subscription as string);

  console.log(`[Webhook] ⚠ Payment failed for subscription: ${invoice.subscription}`);
}

/**
 * customer.subscription.updated
 * Sync status changes (e.g. active → past_due → active).
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    paused: 'paused',
  };

  const rippleStatus = statusMap[subscription.status] || 'active';

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: rippleStatus,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);
}

/**
 * customer.subscription.deleted
 * Subscription was fully cancelled/expired.
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  console.log(`[Webhook] ✓ Subscription cancelled: ${subscription.id}`);
}

export default router;
