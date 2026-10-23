/*
# Etappe 1b Teil 2: RLS und Funktionen für Gruppen/Ämter

- Aktiviert RLS auf allen Tabellen.
- can_manage_group: prüft globalen Admin oder Gruppen-Admin-Status.
- enforce_max_three_offices: Trigger, max. 3 Ämter pro Person.
- Policies: Lesen für alle authentifizierten Nutzer, Verwaltung für Admins/Gruppen-Admins.
*/

-- RLS aktivieren
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_holders ENABLE ROW LEVEL SECURITY;

-- Funktion: can_manage_group
CREATE OR REPLACE FUNCTION public.can_manage_group(g_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_current_admin(), false)
  OR EXISTS (
    SELECT 1 FROM public.group_memberships gm
    WHERE gm.group_id = g_id
      AND gm.user_id = auth.uid()
      AND gm.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_group(uuid) TO authenticated;

-- Trigger-Funktion: max. 3 Ämter
CREATE OR REPLACE FUNCTION public.enforce_max_three_offices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  held_count int;
BEGIN
  SELECT COUNT(*) INTO held_count
  FROM public.office_holders
  WHERE user_id = NEW.user_id;

  IF held_count >= 3 THEN
    RAISE EXCEPTION 'Eine Person kann maximal 3 Ämter gleichzeitig innehaben.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_office_holder_insert ON public.office_holders;
CREATE TRIGGER before_office_holder_insert
  BEFORE INSERT ON public.office_holders
  FOR EACH ROW EXECUTE FUNCTION public.enforce_max_three_offices();

-- Policies: groups
DROP POLICY IF EXISTS "groups_select_all" ON public.groups;
CREATE POLICY "groups_select_all" ON public.groups FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "groups_insert_admin" ON public.groups;
CREATE POLICY "groups_insert_admin" ON public.groups FOR INSERT TO authenticated WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "groups_update_admin" ON public.groups;
CREATE POLICY "groups_update_admin" ON public.groups FOR UPDATE TO authenticated USING (public.can_manage_group(id)) WITH CHECK (public.can_manage_group(id));

DROP POLICY IF EXISTS "groups_delete_admin" ON public.groups;
CREATE POLICY "groups_delete_admin" ON public.groups FOR DELETE TO authenticated USING (public.can_manage_group(id));

-- Policies: group_memberships
DROP POLICY IF EXISTS "memberships_select_all" ON public.group_memberships;
CREATE POLICY "memberships_select_all" ON public.group_memberships FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "memberships_insert_manager" ON public.group_memberships;
CREATE POLICY "memberships_insert_manager" ON public.group_memberships FOR INSERT TO authenticated WITH CHECK (public.can_manage_group(group_id));

DROP POLICY IF EXISTS "memberships_update_manager" ON public.group_memberships;
CREATE POLICY "memberships_update_manager" ON public.group_memberships FOR UPDATE TO authenticated USING (public.can_manage_group(group_id)) WITH CHECK (public.can_manage_group(group_id));

DROP POLICY IF EXISTS "memberships_delete_manager" ON public.group_memberships;
CREATE POLICY "memberships_delete_manager" ON public.group_memberships FOR DELETE TO authenticated USING (public.can_manage_group(group_id));

-- Policies: offices
DROP POLICY IF EXISTS "offices_select_all" ON public.offices;
CREATE POLICY "offices_select_all" ON public.offices FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "offices_insert_manager" ON public.offices;
CREATE POLICY "offices_insert_manager" ON public.offices FOR INSERT TO authenticated WITH CHECK (public.can_manage_group(group_id));

DROP POLICY IF EXISTS "offices_update_manager" ON public.offices;
CREATE POLICY "offices_update_manager" ON public.offices FOR UPDATE TO authenticated USING (public.can_manage_group(group_id)) WITH CHECK (public.can_manage_group(group_id));

DROP POLICY IF EXISTS "offices_delete_manager" ON public.offices;
CREATE POLICY "offices_delete_manager" ON public.offices FOR DELETE TO authenticated USING (public.can_manage_group(group_id));

-- Policies: office_holders
DROP POLICY IF EXISTS "holders_select_all" ON public.office_holders;
CREATE POLICY "holders_select_all" ON public.office_holders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "holders_insert_manager" ON public.office_holders;
CREATE POLICY "holders_insert_manager" ON public.office_holders FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.offices o WHERE o.id = office_id AND public.can_manage_group(o.group_id)));

DROP POLICY IF EXISTS "holders_delete_manager" ON public.office_holders;
CREATE POLICY "holders_delete_manager" ON public.office_holders FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM public.offices o WHERE o.id = office_id AND public.can_manage_group(o.group_id)));
