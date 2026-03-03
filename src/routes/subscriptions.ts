import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { createCheckoutSession, cancelSubscription } from '../services/subscription';
import { z } from 'zod';

const router = Router();

// All subscription routes require authentication
router.use(requireAuth);

// Validation schema for creating a subscription
const createSubscriptionSchema = z.object({
  organisation_id: z.string().uuid(),
  amount_cents: z.number().int().min(500).max(100000), // $5 – $1000
  success_url: z.string().url(),
  cancel_url: z.string().url(),
});

/**
 * GET /api/subscriptions
 * List the authenticated user's active subscriptions with org details.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('subscriptions')
      .select(`
        id, amount_cents, status, current_period_end, created_at,
        organisations ( id, name, slug, logo_url, category )
      `)
      .eq('user_id', req.userId!)
      .in('status', ['active', 'paused'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

/**
 * POST /api/subscriptions
 * Create a Stripe Checkout session for a new subscription.
 * Returns the checkout URL – client redirects user there.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const body = createSubscriptionSchema.parse(req.body);

    const session = await createCheckoutSession({
      userId: req.userId!,
      email: req.userEmail!,
      organisationId: body.organisation_id,
      amountCents: body.amount_cents,
      successUrl: body.success_url,
      cancelUrl: body.cancel_url,
    });

    res.json({ data: { checkout_url: session.url }, error: null });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({
        data: null,
        error: { message: err.errors[0].message, code: 'VALIDATION_ERROR' },
      });
    }
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

/**
 * POST /api/subscriptions/:id/cancel
 * Cancel a subscription at end of current period.
 */
router.post('/:id/cancel', async (req: Request, res: Response) => {
  try {
    // Verify the subscription belongs to this user
    const { data: sub, error } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_subscription_id')
      .eq('id', req.params.id)
      .eq('user_id', req.userId!)
      .single();

    if (error || !sub) {
      return res.status(404).json({
        data: null,
        error: { message: 'Subscription not found', code: 'NOT_FOUND' },
      });
    }

    await cancelSubscription(sub.stripe_subscription_id);
    res.json({ data: { message: 'Subscription will cancel at end of billing period' }, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

export default router;
