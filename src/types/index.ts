// ===========================================
// Ripple Backend – Type Definitions
// ===========================================

export type CauseCategory =
  | 'climate'
  | 'animals'
  | 'poverty'
  | 'mental_health'
  | 'education'
  | 'housing'
  | 'legal'
  | 'health'
  | 'community'
  | 'arts_culture';

export type OrgStatus = 'pending' | 'active' | 'paused' | 'offboarded';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'past_due';
export type DonationStatus = 'succeeded' | 'failed' | 'refunded';
export type PayoutStatus = 'pending' | 'processing' | 'completed' | 'failed';

// ── Database Row Types ──────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  suburb: string | null;
  postcode: string | null;
  created_at: string;
  updated_at: string;
}

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  long_description: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  website_url: string | null;
  category: CauseCategory;
  suburb: string | null;
  postcode: string | null;
  has_dgr: boolean;
  stripe_account_id: string | null;
  status: OrgStatus;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  organisation_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  amount_cents: number;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Donation {
  id: string;
  user_id: string;
  organisation_id: string;
  subscription_id: string | null;
  stripe_invoice_id: string | null;
  stripe_payment_intent_id: string | null;
  gross_amount_cents: number;
  admin_fee_cents: number;
  net_amount_cents: number;
  status: DonationStatus;
  donated_at: string;
  created_at: string;
}

export interface Payout {
  id: string;
  organisation_id: string;
  stripe_transfer_id: string | null;
  period_start: string;
  period_end: string;
  total_gross_cents: number;
  total_admin_fee_cents: number;
  total_net_cents: number;
  donation_count: number;
  status: PayoutStatus;
  paid_at: string | null;
  created_at: string;
}

export interface Spotlight {
  id: string;
  organisation_id: string;
  month: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_active: boolean;
  created_at: string;
}

// ── API Response Types ──────────────────────

export interface ApiResponse<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    message: string;
    code: string;
  };
}

// ── Subscription Tier Presets ───────────────

export const SUBSCRIPTION_TIERS = {
  small: { amount_cents: 1000, label: '$10/month' },
  medium: { amount_cents: 2000, label: '$20/month' },
  large: { amount_cents: 5000, label: '$50/month' },
} as const;

export const ADMIN_FEE_PERCENT = 10;
