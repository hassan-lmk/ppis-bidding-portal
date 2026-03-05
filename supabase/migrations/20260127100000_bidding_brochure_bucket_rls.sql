-- Bidding Brochure bucket: public read-only; only service role can upload/delete.
-- Bucket id must be 'bidding-brochure' so app URLs work (e.g. /storage/v1/object/public/bidding-brochure/...).
--
-- If you get 404 "Bucket not found": ensure in Supabase Dashboard > Storage the bucket id is
-- exactly 'bidding-brochure' (lowercase). If you created it as 'BIDDING-BROCHURE', either
-- create a new bucket with id 'bidding-brochure' and move files, or rename the bucket id to
-- 'bidding-brochure' if your Supabase version allows it.

-- 1. Ensure bucket exists (id = 'bidding-brochure', public so direct URLs work)
INSERT INTO storage.buckets (id, name, public)
VALUES ('bidding-brochure', 'Bidding Brochure', true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true;

-- 2. Drop existing policies on this bucket so we can start fresh (avoid duplicates)
DROP POLICY IF EXISTS "bidding_brochure_public_read" ON storage.objects;
DROP POLICY IF EXISTS "bidding_brochure_admin_delete" ON storage.objects;
DROP POLICY IF EXISTS "bidding_brochure_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "bidding_brochure_admin_upload" ON storage.objects;
DROP POLICY IF EXISTS "Give anon users access to JPG images in folder c8wugm_0" ON storage.objects;
DROP POLICY IF EXISTS "Give anon users access to JPG images in folder c8wugm_1" ON storage.objects;
DROP POLICY IF EXISTS "Give anon users access to JPG images in folder c8wugm_2" ON storage.objects;
DROP POLICY IF EXISTS "Give anon users access to JPG images in folder c8wugm_3" ON storage.objects;

-- 3. Public read-only: anyone can view/download (SELECT)
CREATE POLICY "bidding_brochure_public_read"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'bidding-brochure');

-- 4. No INSERT/UPDATE/DELETE for public or authenticated.
--    Only service role (used by your backend for admin upload/delete) can write;
--    service role bypasses RLS, so no policy needed for it.

COMMENT ON POLICY "bidding_brochure_public_read" ON storage.objects IS
  'Bidding Brochure: anyone can download; upload/delete only via backend with service role key.';
