/*
# Fix: Profile SELECT-Richtlinie vereinfacht (Rekursion behoben)

## Problem
Die bisherige SELECT-Richtlinie enthielt einen Subquery auf dieselbe `profiles`-Tabelle:
`EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_admin = true)`.
Das verursacht eine Endlosrekursion in PostgreSQLs Row-Level-Security, weil der Subquery
wiederum der eigenen Richtlinie unterliegt. Das Profil konnte dadurch nicht geladen werden
und die App blieb im Ladezustand hängen.

## Lösung
- SELECT-Richtlinie auf `auth.uid() = id` vereinfacht (keine Selbstreferenz mehr).
- Admin-Zugriff auf alle Profile erfolgt über eine neue SECURITY DEFINER-Funktion
  `is_current_admin()`, die außerhalb der RLS-Schranke läuft.
- Die Richtlinie nutzt diese Funktion statt eines Subqueries auf `profiles`.

## Sicherheit
- Normale Nutzer lesen nur ihr eigenes Profil.
- Admins lesen alle Profile (über `is_current_admin()`).
- Keine Rechteänderung an INSERT/UPDATE/DELETE.
*/

-- Funktion: prüft ob der aktuelle Nutzer Admin ist (SECURITY DEFINER, umgeht RLS)
CREATE OR REPLACE FUNCTION public.is_current_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT p.is_admin FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_current_admin() TO authenticated;

-- SELECT-Richtlinie ersetzen (rekursionsfrei)
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON profiles;
CREATE POLICY "profiles_select_self_or_admin"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id OR public.is_current_admin()
);

-- UPDATE-Richtlinien ebenfalls auf is_current_admin() umstellen (konsistent, rekursionsfrei)
DROP POLICY IF EXISTS "profiles_update_self" ON profiles;
CREATE POLICY "profiles_update_self"
ON profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
CREATE POLICY "profiles_update_admin"
ON profiles FOR UPDATE
TO authenticated
USING (public.is_current_admin())
WITH CHECK (public.is_current_admin());
