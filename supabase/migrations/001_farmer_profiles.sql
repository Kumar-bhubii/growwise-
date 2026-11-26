-- ============================================================
-- GrowWise — Farmer Profiles Migration
-- ============================================================
-- Apply this in your Supabase project:
--   Dashboard → SQL Editor → paste this file → Run
-- Or use the Supabase CLI:
--   supabase db push  (after placing this in supabase/migrations/)
--
-- SAFE TO REVIEW BEFORE RUNNING. Nothing is applied automatically.
-- ============================================================

-- Enable the uuid-ossp extension (usually pre-enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.farmer_profiles (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL DEFAULT '',
  region               TEXT,
  preferred_language   TEXT DEFAULT 'en',
  soil_input_preference TEXT,   -- 'report' | 'visual'
  season               TEXT,
  water_access         TEXT,    -- 'Rainfed' | 'Irrigation'
  budget_preference    TEXT,
  fertilizer_access    TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT farmer_profiles_user_id_key UNIQUE (user_id)
);

-- Keep updated_at current automatically
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_farmer_profiles_updated_at ON public.farmer_profiles;
CREATE TRIGGER trg_farmer_profiles_updated_at
  BEFORE UPDATE ON public.farmer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.farmer_profiles ENABLE ROW LEVEL SECURITY;

-- Users may only see their own row
CREATE POLICY "farmers_select_own"
  ON public.farmer_profiles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users may insert a row for themselves
CREATE POLICY "farmers_insert_own"
  ON public.farmer_profiles
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users may update their own row
CREATE POLICY "farmers_update_own"
  ON public.farmer_profiles
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users may delete their own row
CREATE POLICY "farmers_delete_own"
  ON public.farmer_profiles
  FOR DELETE
  USING (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_farmer_profiles_user_id
  ON public.farmer_profiles (user_id);

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- • Passwords are NEVER stored here. Supabase Auth manages credentials
--   internally in the auth schema which you do not need to touch.
-- • The anon key used by the browser client can only read/write rows where
--   user_id = auth.uid(), enforced by the policies above.
-- • To allow an admin service-role key to bypass RLS (for server-side
--   maintenance only), do NOT expose the service-role key to the browser.
