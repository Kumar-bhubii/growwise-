/**
 * Supabase client helpers — using @supabase/ssr for proper cookie-based
 * session management in Next.js (App Router).
 *
 * - Browser client  → used in Client Components and hooks.
 *   Uses createBrowserClient from @supabase/ssr so cookies are
 *   read/written correctly and sessions survive page refreshes.
 *
 * - Server client   → used in Server Components, Server Actions, and API
 *   routes (requires passing the cookies() helper from next/headers).
 *
 * Both are created lazily so the module is safe to import even when the env
 * vars are absent (demo mode).
 *
 * Note: We use an untyped SupabaseClient here rather than a generated Database
 * type to keep setup simple. Row types are manually defined below.
 *
 * Environment variable note:
 *   The project's .env.local uses NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
 *   (the name Supabase's newer dashboard shows). This file reads that var.
 *   Both names refer to the same public/anon key — only the variable name differs.
 */

import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// ── Row types (manually defined — no code-gen required) ──────────────────────

export type FarmerProfileRow = {
  id: string
  user_id: string
  name: string
  region: string | null
  preferred_language: string | null
  soil_input_preference: string | null
  season: string | null
  water_access: string | null
  budget_preference: string | null
  fertilizer_access: string | null
  created_at: string
  updated_at: string
}

// ── Config ───────────────────────────────────────────────────────────────────

function getConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  // Support both the legacy NEXT_PUBLIC_SUPABASE_ANON_KEY and the newer
  // NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY that Supabase dashboards now show.
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    ''
  return { url, anonKey, configured: Boolean(url && anonKey) }
}

// ── Browser client (singleton) ───────────────────────────────────────────────
// createBrowserClient from @supabase/ssr handles cookies automatically,
// keeping the session alive across page refreshes without needing a middleware
// cookie setter (the client-side refresh is handled by the SDK).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _browserClient: SupabaseClient<any> | null = null

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getSupabaseBrowserClient(): SupabaseClient<any> | null {
  const { url, anonKey, configured } = getConfig()
  if (!configured) return null
  if (!_browserClient) {
    _browserClient = createBrowserClient(url, anonKey)
  }
  return _browserClient
}

// ── Convenience flag ─────────────────────────────────────────────────────────

export function isSupabaseConfigured(): boolean {
  return getConfig().configured
}
