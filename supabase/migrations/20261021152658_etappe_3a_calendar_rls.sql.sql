ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_group_member(g_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = g_id AND gm.user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_group_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "events_select_visible" ON public.events;
CREATE POLICY "events_select_visible" ON public.events FOR SELECT
TO authenticated USING (
  created_by = auth.uid()
  OR (group_id IS NOT NULL AND public.is_group_member(group_id))
  OR (group_id IS NOT NULL AND public.is_current_admin())
);

DROP POLICY IF EXISTS "events_insert_self" ON public.events;
CREATE POLICY "events_insert_self" ON public.events FOR INSERT
TO authenticated WITH CHECK (
  created_by = auth.uid()
  AND (
    group_id IS NULL
    OR public.is_group_member(group_id)
    OR public.is_current_admin()
  )
);

DROP POLICY IF EXISTS "events_update_owner" ON public.events;
CREATE POLICY "events_update_owner" ON public.events FOR UPDATE
TO authenticated
USING (created_by = auth.uid() OR public.is_current_admin())
WITH CHECK (created_by = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "events_delete_owner" ON public.events;
CREATE POLICY "events_delete_owner" ON public.events FOR DELETE
TO authenticated USING (created_by = auth.uid() OR public.is_current_admin());

ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
