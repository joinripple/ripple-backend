import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Admin client – bypasses RLS, used by backend services
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// Public client – respects RLS, used for user-scoped queries
export function createUserClient(accessToken: string) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
