import { stripe } from '../utils/stripe';
import { supabaseAdmin } from '../utils/supabase';
import { config } from '../config';
import { ADMIN_FEE_PERCENT } from '../types';

/**
 * Ensures a Stripe customer exists for the given user.
 * Creates one if it doesn't exist, stores the customer ID.
 */
export async function getOrCreateStripeCustomer(userId: string, email: string): Promise<string> {
  // Check if user already has a Stripe customer
  const existingCustomers = await stripe.customers.list({ email, limit: 1 });

  if (existingCustomers.data.length > 0) {
    return existingCustomers.data[0].id;
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    metadata: { ripple_user_id: userId },
  });

  return customer.id;
}

/**
 * Creates a Stripe Checkout Session for a new subscription.
 * User completes payment on Stripe-hosted page (avoids Apple's 30% IAP fee).
 */
export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  organisationId: string;
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
}) {
  const customerId = await getOrCreateStripeCustomer(params.userId, params.email);

  // Look up the organisation
  const { data: org, error } = await supabaseAdmin
    .from('organisations')
    .select('id, name, stripe_account_id')
    .eq('id', params.organisationId)
    .single();

  if (error || !org) throw new Error('Organisation not found');

  // Create a dynamic price for the subscription amount
  const price = await stripe.prices.create({
    unit_amount: params.amountCents,
    currency: 'aud',
    recurring: { interval: 'month' },
    product_data: {
      name: `Ripple – ${org.name}`,
      metadata: { organisation_id: org.id },
    },
  });

  // Create checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: price.id, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    subscription_data: {
      metadata: {
        ripple_user_id: params.userId,
        ripple_organisation_id: params.organisationId,
        ripple_amount_cents: params.amountCents.toString(),
      },
    },
    metadata: {
      ripple_user_id: params.userId,
      ripple_organisation_id: params.organisationId,
    },
  });

  return session;
}

/**
 * Cancels a subscription at the end of the current billing period.
 */
export async function cancelSubscription(subscriptionId: string) {
  const updated = await stripe.subscriptions.update(subscriptionId, {
    cancel_at_period_end: true,
  });

  await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscriptionId);

  return updated;
}

/**
 * Calculates the fee split for a donation.
 */
export function calculateFeeSplit(grossAmountCents: number) {
  const adminFeeCents = Math.round(grossAmountCents * (ADMIN_FEE_PERCENT / 100));
  const netAmountCents = grossAmountCents - adminFeeCents;
  return { grossAmountCents, adminFeeCents, netAmountCents };
}
