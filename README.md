# Ripple Backend API

Charitable giving subscription platform — connecting inner-city Sydney communities with local not-for-profits.

## Architecture

```
iOS App → Ripple API (Express/TS) → Stripe Billing
               ↓                        ↓
          Supabase (DB/Auth)      Stripe Connect (Payouts)
```

**Stack:** TypeScript · Express · Supabase (Postgres + Auth) · Stripe Billing/Connect · Railway

## Quick Start

### 1. Prerequisites

- Node.js 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- [Stripe CLI](https://stripe.com/docs/stripe-cli) (`brew install stripe/stripe-cli/stripe`)

### 2. Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in your keys
cp .env.example .env

# Push database schema to Supabase
supabase db push

# Start Stripe webhook forwarding (separate terminal)
npm run stripe:listen

# Start dev server
npm run dev
```

### 3. Stripe Webhook Forwarding

During development, Stripe events are forwarded to your local server:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the webhook signing secret (`whsec_...`) into your `.env` file.

## API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/organisations` | No | List active NFPs (filter by category, suburb) |
| GET | `/api/organisations/:slug` | No | NFP detail page |
| GET | `/api/spotlight` | No | Current month's featured cause |
| GET | `/api/user/profile` | Yes | User profile |
| PATCH | `/api/user/profile` | Yes | Update profile |
| GET | `/api/user/impact` | Yes | Donation impact stats |
| GET | `/api/subscriptions` | Yes | User's active subscriptions |
| POST | `/api/subscriptions` | Yes | Create subscription (returns Stripe Checkout URL) |
| POST | `/api/subscriptions/:id/cancel` | Yes | Cancel at period end |
| POST | `/api/webhooks/stripe` | — | Stripe webhook handler |
| GET | `/health` | No | Health check |

## Money Flow

```
User pays $10/month
  → Stripe collects $10
  → Webhook fires (invoice.paid)
  → Donation recorded: $10 gross, $1 admin fee, $9 net
  → Monthly cron job (2nd of month)
  → $9 transferred to NFP's Stripe Connect account
```

## Project Structure

```
src/
├── index.ts              # Express app entry point
├── config.ts             # Environment config
├── types/index.ts        # TypeScript types (mirrors DB schema)
├── middleware/auth.ts     # Supabase JWT auth middleware
├── utils/
│   ├── supabase.ts       # Supabase client (admin + user)
│   └── stripe.ts         # Stripe client
├── services/
│   ├── subscription.ts   # Stripe subscription/checkout logic
│   └── payout.ts         # Monthly batch payout processing
├── routes/
│   ├── organisations.ts  # NFP listing + detail
│   ├── subscriptions.ts  # User subscription management
│   ├── user.ts           # Profile + impact stats
│   ├── spotlight.ts      # Monthly featured cause
│   └── webhooks.ts       # Stripe event handler
├── jobs/
│   └── scheduler.ts      # Cron jobs (monthly payouts)
supabase/
└── migrations/
    └── 001_core_schema.sql  # Full database schema
```

## Deploy to Railway

1. Push to GitHub
2. Connect repo in Railway dashboard
3. Add environment variables
4. Railway auto-deploys on push

## Next Steps

- [ ] Set up Supabase project and run migration
- [ ] Configure Stripe products and test with CLI
- [ ] Connect iOS app auth to Supabase
- [ ] Wire iOS subscription flow to checkout endpoint
- [ ] Onboard first NFP partner with Stripe Connect
- [ ] Set up Railway deployment
