-- ===========================================
-- Ripple Backend – Waitlist Table
-- ===========================================

CREATE TABLE public.waitlist (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE,
    suburb      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_email ON public.waitlist(email);
CREATE INDEX idx_waitlist_created ON public.waitlist(created_at);

-- No RLS needed — inserts happen via service role key only
