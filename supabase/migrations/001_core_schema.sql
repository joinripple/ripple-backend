-- ===========================================
-- Ripple Backend – Core Schema
-- ===========================================
-- Run via: supabase db push
-- This creates all tables needed for Phase 1

-- ───────────────────────────────────────────
-- USERS
-- Extends Supabase auth.users with profile data
-- ───────────────────────────────────────────
CREATE TABLE public.users (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    suburb          TEXT,           -- e.g. "Surry Hills" for hyper-local matching
    postcode        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- ORGANISATIONS (NFP partners)
-- ───────────────────────────────────────────
CREATE TYPE org_status AS ENUM ('pending', 'active', 'paused', 'offboarded');
CREATE TYPE cause_category AS ENUM (
    'climate',
    'animals',
    'poverty',
    'mental_health',
    'education',
    'housing',
    'legal',
    'health',
    'community',
    'arts_culture'
);

CREATE TABLE public.organisations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,
    description     TEXT,
    long_description TEXT,
    logo_url        TEXT,
    cover_image_url TEXT,
    website_url     TEXT,
    category        cause_category NOT NULL,
    suburb          TEXT,           -- where the org operates
    postcode        TEXT,
    has_dgr         BOOLEAN NOT NULL DEFAULT false,  -- DGR status for tax deductibility
    stripe_account_id TEXT,        -- Stripe Connect account for payouts
    status          org_status NOT NULL DEFAULT 'pending',
    onboarded_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- SUBSCRIPTIONS
-- Links a user to an org with a recurring amount
-- ───────────────────────────────────────────
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled', 'past_due');

CREATE TABLE public.subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organisation_id         UUID NOT NULL REFERENCES public.organisations(id),
    stripe_subscription_id  TEXT NOT NULL UNIQUE,
    stripe_price_id         TEXT NOT NULL,
    amount_cents            INTEGER NOT NULL,          -- e.g. 1000 = $10.00
    status                  subscription_status NOT NULL DEFAULT 'active',
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    cancelled_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- DONATIONS (individual payment records)
-- Created when Stripe invoice.paid webhook fires
-- ───────────────────────────────────────────
CREATE TYPE donation_status AS ENUM ('succeeded', 'failed', 'refunded');

CREATE TABLE public.donations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID NOT NULL REFERENCES public.users(id),
    organisation_id         UUID NOT NULL REFERENCES public.organisations(id),
    subscription_id         UUID REFERENCES public.subscriptions(id),
    stripe_invoice_id       TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    gross_amount_cents      INTEGER NOT NULL,          -- full amount charged
    admin_fee_cents         INTEGER NOT NULL,          -- 10% platform fee
    net_amount_cents        INTEGER NOT NULL,          -- amount going to org
    status                  donation_status NOT NULL DEFAULT 'succeeded',
    donated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- PAYOUTS (monthly batch transfers to orgs)
-- ───────────────────────────────────────────
CREATE TYPE payout_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE public.payouts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id         UUID NOT NULL REFERENCES public.organisations(id),
    stripe_transfer_id      TEXT,
    period_start            DATE NOT NULL,             -- e.g. 2025-03-01
    period_end              DATE NOT NULL,             -- e.g. 2025-03-31
    total_gross_cents       INTEGER NOT NULL,
    total_admin_fee_cents   INTEGER NOT NULL,
    total_net_cents         INTEGER NOT NULL,
    donation_count          INTEGER NOT NULL,
    status                  payout_status NOT NULL DEFAULT 'pending',
    paid_at                 TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- SPOTLIGHT (curated monthly featured cause)
-- ───────────────────────────────────────────
CREATE TABLE public.spotlights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organisation_id     UUID NOT NULL REFERENCES public.organisations(id),
    month               DATE NOT NULL UNIQUE,          -- first of month, e.g. 2025-04-01
    title               TEXT NOT NULL,
    description         TEXT,
    cover_image_url     TEXT,
    is_active           BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ───────────────────────────────────────────
-- INDEXES
-- ───────────────────────────────────────────
CREATE INDEX idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(organisation_id);
CREATE INDEX idx_subscriptions_stripe ON public.subscriptions(stripe_subscription_id);
CREATE INDEX idx_donations_user ON public.donations(user_id);
CREATE INDEX idx_donations_org ON public.donations(organisation_id);
CREATE INDEX idx_donations_period ON public.donations(donated_at);
CREATE INDEX idx_payouts_org ON public.payouts(organisation_id);
CREATE INDEX idx_payouts_period ON public.payouts(period_start, period_end);
CREATE INDEX idx_organisations_slug ON public.organisations(slug);
CREATE INDEX idx_organisations_category ON public.organisations(category);
CREATE INDEX idx_organisations_suburb ON public.organisations(suburb);

-- ───────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ───────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spotlights ENABLE ROW LEVEL SECURITY;

-- Users can read/update their own profile
CREATE POLICY "Users can view own profile"
    ON public.users FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.users FOR UPDATE
    USING (auth.uid() = id);

-- Anyone can browse active organisations
CREATE POLICY "Anyone can view active organisations"
    ON public.organisations FOR SELECT
    USING (status = 'active');

-- Users can view their own subscriptions
CREATE POLICY "Users can view own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

-- Users can view their own donations
CREATE POLICY "Users can view own donations"
    ON public.donations FOR SELECT
    USING (auth.uid() = user_id);

-- Anyone can view active spotlights
CREATE POLICY "Anyone can view active spotlights"
    ON public.spotlights FOR SELECT
    USING (is_active = true);

-- Service role (backend) can do everything via SUPABASE_SERVICE_ROLE_KEY
-- No explicit policy needed — service role bypasses RLS

-- ───────────────────────────────────────────
-- HELPER FUNCTIONS
-- ───────────────────────────────────────────

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER organisations_updated_at
    BEFORE UPDATE ON public.organisations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER subscriptions_updated_at
    BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email)
    VALUES (NEW.id, NEW.email);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
