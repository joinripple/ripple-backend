import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../utils/supabase';
import { resend } from '../utils/resend';
import { config } from '../config';

const router = Router();

const WaitlistSchema = z.object({
  name:   z.string().min(1).max(100),
  email:  z.string().email(),
  suburb: z.string().max(100).nullable().optional(),
});

router.post('/', async (req: Request, res: Response) => {
  const parsed = WaitlistSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      data: null,
      error: { message: 'Invalid input', code: 'VALIDATION_ERROR' },
    });
  }

  const { name, email, suburb } = parsed.data;

  const { error } = await supabaseAdmin
    .from('waitlist')
    .insert({ name, email, suburb: suburb ?? null });

  if (error) {
    if (error.code === '23505') {
      // Unique violation — email already registered
      return res.status(409).json({
        data: null,
        error: { message: "You're already on the list!", code: 'ALREADY_REGISTERED' },
      });
    }
    console.error('[Waitlist] DB insert error:', error);
    return res.status(500).json({
      data: null,
      error: { message: 'Something went wrong', code: 'INTERNAL_ERROR' },
    });
  }

  // Send confirmation email (non-blocking — don't fail the request if email fails)
  resend.emails.send({
    from: config.resend.fromEmail,
    to: email,
    subject: "You're on the Ripple waitlist 🌊",
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:520px;margin:0 auto;padding:40px 24px;color:#0F172A;">
        <h1 style="font-size:1.5rem;font-weight:800;margin-bottom:8px;color:#0EA5E9;">ripple.</h1>
        <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:16px;">You're on the list, ${name}!</h2>
        <p style="color:#64748B;line-height:1.6;margin-bottom:24px;">
          Thanks for signing up. We'll be in touch when Ripple launches in Sydney —
          you'll be among the first to give locally and make a real difference in your community.
        </p>
        <p style="color:#64748B;line-height:1.6;">
          In the meantime, if you have any questions just reply to this email.
        </p>
        <hr style="border:none;border-top:1px solid #E2E8F0;margin:32px 0;" />
        <p style="font-size:0.8rem;color:#94A3B8;">Ripple · Sydney, Australia</p>
      </div>
    `,
  }).catch((err) => {
    console.error('[Waitlist] Failed to send confirmation email:', err);
  });

  return res.status(201).json({ data: { success: true }, error: null });
});

export default router;
