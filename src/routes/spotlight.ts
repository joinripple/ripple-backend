import { Router, Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabase';

const router = Router();

/**
 * GET /api/spotlight
 * Returns the current month's featured organisation with full details.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('spotlights')
      .select(`
        id, title, description, cover_image_url, month,
        organisations ( id, name, slug, description, logo_url, category, suburb, has_dgr )
      `)
      .eq('is_active', true)
      .order('month', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return res.status(404).json({
        data: null,
        error: { message: 'No active spotlight', code: 'NOT_FOUND' },
      });
    }

    res.json({ data, error: null });
  } catch (err: any) {
    res.status(500).json({ data: null, error: { message: err.message, code: 'INTERNAL_ERROR' } });
  }
});

export default router;
