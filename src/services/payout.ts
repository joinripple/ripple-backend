import { stripe } from '../utils/stripe';
import { supabaseAdmin } from '../utils/supabase';

/**
 * Runs the monthly payout process.
 * Aggregates all donations for the period, then transfers net amounts
 * to each organisation's Stripe Connect account.
 *
 * Intended to be called by a cron job on the 1st of each month.
 */
export async function processMonthlyPayouts() {
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1); // 1st of previous month

  const periodStartStr = periodStart.toISOString().split('T')[0];
  const periodEndStr = periodEnd.toISOString().split('T')[0];

  console.log(`[Payouts] Processing period: ${periodStartStr} → ${periodEndStr}`);

  // Aggregate donations by organisation for the period
  const { data: donations, error } = await supabaseAdmin
    .from('donations')
    .select('organisation_id, gross_amount_cents, admin_fee_cents, net_amount_cents')
    .eq('status', 'succeeded')
    .gte('donated_at', periodStart.toISOString())
    .lt('donated_at', periodEnd.toISOString());

  if (error) {
    console.error('[Payouts] Failed to fetch donations:', error);
    throw error;
  }

  if (!donations || donations.length === 0) {
    console.log('[Payouts] No donations to process for this period.');
    return { processed: 0 };
  }

  // Group by organisation
  const orgTotals = new Map<string, {
    totalGross: number;
    totalFees: number;
    totalNet: number;
    count: number;
  }>();

  for (const d of donations) {
    const existing = orgTotals.get(d.organisation_id) || {
      totalGross: 0, totalFees: 0, totalNet: 0, count: 0,
    };
    existing.totalGross += d.gross_amount_cents;
    existing.totalFees += d.admin_fee_cents;
    existing.totalNet += d.net_amount_cents;
    existing.count += 1;
    orgTotals.set(d.organisation_id, existing);
  }

  console.log(`[Payouts] ${orgTotals.size} organisations to pay out.`);

  let processed = 0;

  for (const [orgId, totals] of orgTotals) {
    // Get org's Stripe Connect account
    const { data: org } = await supabaseAdmin
      .from('organisations')
      .select('name, stripe_account_id')
      .eq('id', orgId)
      .single();

    if (!org?.stripe_account_id) {
      console.warn(`[Payouts] Skipping ${orgId} – no Stripe Connect account.`);
      // Still create a payout record marked as failed
      await supabaseAdmin.from('payouts').insert({
        organisation_id: orgId,
        period_start: periodStartStr,
        period_end: periodEndStr,
        total_gross_cents: totals.totalGross,
        total_admin_fee_cents: totals.totalFees,
        total_net_cents: totals.totalNet,
        donation_count: totals.count,
        status: 'failed',
      });
      continue;
    }

    try {
      // Transfer net amount to the org's Connect account
      const transfer = await stripe.transfers.create({
        amount: totals.totalNet,
        currency: 'aud',
        destination: org.stripe_account_id,
        description: `Ripple payout: ${periodStartStr} to ${periodEndStr}`,
        metadata: {
          ripple_org_id: orgId,
          period_start: periodStartStr,
          period_end: periodEndStr,
          donation_count: totals.count.toString(),
        },
      });

      // Record the payout
      await supabaseAdmin.from('payouts').insert({
        organisation_id: orgId,
        stripe_transfer_id: transfer.id,
        period_start: periodStartStr,
        period_end: periodEndStr,
        total_gross_cents: totals.totalGross,
        total_admin_fee_cents: totals.totalFees,
        total_net_cents: totals.totalNet,
        donation_count: totals.count,
        status: 'completed',
        paid_at: new Date().toISOString(),
      });

      console.log(`[Payouts] ✓ ${org.name}: $${(totals.totalNet / 100).toFixed(2)} (${totals.count} donations)`);
      processed++;
    } catch (err) {
      console.error(`[Payouts] ✗ Failed transfer to ${org.name}:`, err);
      await supabaseAdmin.from('payouts').insert({
        organisation_id: orgId,
        period_start: periodStartStr,
        period_end: periodEndStr,
        total_gross_cents: totals.totalGross,
        total_admin_fee_cents: totals.totalFees,
        total_net_cents: totals.totalNet,
        donation_count: totals.count,
        status: 'failed',
      });
    }
  }

  console.log(`[Payouts] Complete. ${processed}/${orgTotals.size} payouts succeeded.`);
  return { processed, total: orgTotals.size };
}
