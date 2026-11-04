ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS show_email boolean NOT NULL DEFAULT false;

REVOKE ALL ON public.profiles FROM anon, authenticated;
GRANT SELECT (id, full_name, display_name, avatar_path, is_admin, is_approved, show_email, created_at)
  ON public.profiles TO authenticated;
GRANT UPDATE (full_name, display_name, avatar_path, show_email, is_admin, is_approved)
  ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_email(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.email
  FROM public.profiles p
  WHERE p.id = p_id
    AND auth.uid() IS NOT NULL
    AND (
      p.id = auth.uid()
      OR public.is_current_admin()
      OR (p.show_email = true AND p.is_approved = true AND public.is_current_user_approved())
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_profile_email(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_email(uuid) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS avatars_select_approved ON storage.objects;
CREATE POLICY avatars_select_approved ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND public.is_current_user_approved());

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
