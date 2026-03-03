import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabase';

const router = Router();

/**
 * GET /api/organisations
 * List active organisations, optionally filtered by category or suburb.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    let query = supabaseAdmin
      .from('organisations')
      .select('id, name, slug, description, logo_url, cover_image_url, category, suburb, has_dgr')
      .eq('status', 'active')
      .order('name');

    const { category, suburb } = req.query;
    if (category) query = query.eq('category', category as string);
    if (suburb) query = query.ilike('suburb', `%${suburb}%`);

    const { data, error } = await query;

    if (error) throw error;
    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

/**
 * GET /api/organisations/:slug
 * Get full details for a single organisation.
 */
router.get('/:slug', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('organisations')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('status', 'active')
      .single();

    if (error || !data) {
      return res.status(404).json({
        data: null,
        error: { message: 'Organisation not found', code: 'NOT_FOUND' },
      });
    }

    // Also fetch subscriber count (public social proof)
    const { count } = await supabaseAdmin
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('organisation_id', data.id)
      .eq('status', 'active');

    res.json({ data: { ...data, subscriber_count: count || 0 }, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

export default router;
