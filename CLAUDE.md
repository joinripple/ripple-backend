# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm start            # Run compiled output

npm run db:migrate   # Push schema changes to Supabase (supabase db push)
npm run db:reset     # Reset local Supabase DB

npm run stripe:listen  # Forward Stripe webhooks to localhost:3000 (run in separate terminal)
```

There is no test suite yet.

## Architecture

**Flow:** iOS App → Express API → Supabase (Postgres + Auth) + Stripe Billing/Connect

**Stack:** TypeScript · Express · Supabase · Stripe · Railway (deploy)

### Key design decisions

- **Stripe Checkout hosted page** is used for subscriptions (not in-app payments) to avoid Apple's 30% IAP fee. The iOS app opens a web URL returned from `POST /api/subscriptions`.
- **Supabase service role key** is used for all backend DB operations (`supabaseAdmin` in `src/utils/supabase.ts`), which bypasses Row Level Security. RLS policies exist for direct client access only.
- **Stripe webhook raw body**: `/api/webhooks/stripe` must use `express.raw()` — this is wired in `src/index.ts` _before_ the JSON parser. Do not move or reorder this middleware.
- **Subscription state is webhook-driven**: the DB subscription record is created in `checkout.session.completed`, not when the checkout is initiated. Donations are recorded in `invoice.paid`.
- **Monthly payouts** (`src/services/payout.ts`) run via cron on the 2nd of each month (production only — cron is not started in development). They aggregate the previous month's donations per org and transfer net amounts via Stripe Connect transfers.
- **Admin fee**: 10% platform fee is applied to every donation. Defined in `src/types/index.ts` as `ADMIN_FEE_PERCENT` and calculated in `calculateFeeSplit()`.

### Data model

```
users (extends Supabase auth.users)
  └── subscriptions (user ↔ organisation, backed by Stripe subscription)
        └── donations (created per invoice.paid webhook)

organisations (NFPs, need stripe_account_id for payouts)
  └── payouts (monthly batch, one per org per period)
  └── spotlights (curated monthly featured cause)
```

Monetary values are stored as integer cents (e.g. `1000` = $10.00 AUD).

### Required environment variables

```
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET     # from `stripe listen` output during dev
STRIPE_PUBLISHABLE_KEY    # optional
PORT                      # defaults to 3000
NODE_ENV                  # defaults to development
```
