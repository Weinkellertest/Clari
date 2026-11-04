/*
# Freigegebene Profile für angemeldete, freigegebene Nutzer lesbar machen

1. Hintergrund
- Nutzer konnten bisher nur ihr eigenes Profil lesen. Dadurch zeigten Chats die Namen der Gegenüber als "Unbekannt" und die Empfängerliste für neue Unterhaltungen war leer.

2. Neue Funktion
- `is_current_user_approved()` prüft, ob der angemeldete Nutzer freigegeben ist. Sie läuft mit erhöhten Rechten, damit die Regel nicht rekursiv auf die Profiltabelle zugreift.
- Ausführung nur für angemeldete Nutzer.

3. Neue Regel
- `profiles_select_approved_directory`: Angemeldete, freigegebene Nutzer können Profile freigegebener Nutzer lesen. Die bestehende Regel für das eigene Profil und für Admins bleibt unverändert.
- Schreibrechte ändern sich nicht.
*/

CREATE OR REPLACE FUNCTION public.is_current_user_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.is_approved FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_current_user_approved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_current_user_approved() TO authenticated;

DROP POLICY IF EXISTS profiles_select_approved_directory ON public.profiles;
CREATE POLICY profiles_select_approved_directory ON public.profiles
FOR SELECT
TO authenticated
USING (is_approved = true AND public.is_current_user_approved());
