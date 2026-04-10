-- bid_opening_settings: allow all signed-in users to read closing date / portal settings.
-- Existing admin-only policies can remain for INSERT/UPDATE/DELETE; this adds a permissive
-- SELECT so /api/bidding-portal/closing-date and bid submission flows can read the row.
--
-- Apply in Supabase: SQL Editor run this file, or `supabase db push` / migration deploy.

ALTER TABLE public.bid_opening_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "bid_opening_settings_select_authenticated" ON public.bid_opening_settings;

CREATE POLICY "bid_opening_settings_select_authenticated"
ON public.bid_opening_settings
FOR SELECT
TO authenticated
USING (true);

COMMENT ON POLICY "bid_opening_settings_select_authenticated" ON public.bid_opening_settings IS
  'Any logged-in user may read bid opening settings (e.g. bid_submission_closing_date). Writes stay restricted by other policies.';
