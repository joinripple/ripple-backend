import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/user/profile
 * Get the authenticated user's profile.
 */
router.get('/profile', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', req.userId!)
      .single();

    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

/**
 * PATCH /api/user/profile
 * Update the authenticated user's profile.
 */
router.patch('/profile', async (req: Request, res: Response) => {
  try {
    const allowedFields = ['display_name', 'suburb', 'postcode', 'avatar_url'];
    const updates: Record<string, any> = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    const { data, error } = await supabaseAdmin
      .from('users')
      .update(updates)
      .eq('id', req.userId!)
      .select()
      .single();

    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

/**
 * GET /api/user/impact
 * Get the user's donation impact summary – powers the impact tracking UI.
 */
router.get('/impact', async (req: Request, res: Response) => {
  try {
    // Total donated
    const { data: donations } = await supabaseAdmin
      .from('donations')
      .select('gross_amount_cents, net_amount_cents, organisation_id, donated_at')
      .eq('user_id', req.userId!)
      .eq('status', 'succeeded');

    if (!donations || donations.length === 0) {
      return res.json({
        data: {
          total_donated_cents: 0,
          total_impact_cents: 0,
          donation_count: 0,
          categories: {},
          monthly_history: [],
        },
        error: null,
      });
    }

    const totalDonated = donations.reduce((sum, d) => sum + d.gross_amount_cents, 0);
    const totalImpact = donations.reduce((sum, d) => sum + d.net_amount_cents, 0);

    // Get category breakdown by looking up each org
    const orgIds = [...new Set(donations.map(d => d.organisation_id))];
    const { data: orgs } = await supabaseAdmin
      .from('organisations')
      .select('id, category')
      .in('id', orgIds);

    const orgCategoryMap = new Map(orgs?.map(o => [o.id, o.category]) || []);
    const categories: Record<string, number> = {};

    for (const d of donations) {
      const cat = orgCategoryMap.get(d.organisation_id) || 'other';
      categories[cat] = (categories[cat] || 0) + d.net_amount_cents;
    }

    // Monthly history (last 12 months)
    const monthlyMap = new Map<string, number>();
    for (const d of donations) {
      const month = d.donated_at.substring(0, 7); // "2025-03"
      monthlyMap.set(month, (monthlyMap.get(month) || 0) + d.gross_amount_cents);
    }
    const monthlyHistory = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([month, amount]) => ({ month, amount_cents: amount }));

    res.json({
      data: {
        total_donated_cents: totalDonated,
        total_impact_cents: totalImpact,
        donation_count: donations.length,
        categories,
        monthly_history: monthlyHistory,
      },
      error: null,
    });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

export default router;
