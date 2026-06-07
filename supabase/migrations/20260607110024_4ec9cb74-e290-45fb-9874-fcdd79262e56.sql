DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
REVOKE SELECT ON public.profiles FROM anon;
CREATE POLICY "Users view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);