/*
# Profile-Tabelle und Admin-Freischaltung

1. Neue Tabellen
- `profiles`
  - `id` (uuid, Primärschlüssel, verweist auf auth.users)
  - `email` (text, nicht null)
  - `full_name` (text, optional)
  - `display_name` (text, optional — Anzeigename in der App)
  - `is_admin` (boolean, Standard false)
  - `is_approved` (boolean, Standard false — neue Konten bleiben gesperrt, bis ein Admin sie freischaltet)
  - `created_at` (timestamp)

2. Trigger
- `handle_new_user`: Legt automatisch einen Profileintrag an, wenn ein neuer Nutzer in auth.users erstellt wird. `is_approved` bleibt false, das Konto ist also gesperrt, bis ein Admin es freischaltet.
- `guard_sensitive_fields`: Verhindert, dass Nicht-Admins die Felder is_admin oder is_approved ändern. Nur Admins dürfen diese Felder setzen.

3. Bootstrap-Admin
- Markiert den ersten registrierten Nutzer automatisch als Admin und als freigeschaltet, falls noch kein Admin existiert. So gibt es immer mindestens einen Admin.

4. Sicherheit (RLS)
- `profiles` ist per RLS gesperrt.
- SELECT: Authentifizierte Nutzer können das eigene Profil lesen. Admins können alle Profile lesen (für die Freischalt-Verwaltung).
- UPDATE: Authentifizierte Nutzer können das eigene Profil bearbeiten. Admins können alle Profile bearbeiten (Freischaltung / Admin-Entzug). Der Trigger guard_sensitive_fields verhindert, dass Nicht-Admins is_admin / is_approved ändern.
- INSERT/DELETE: Nicht direkt erlaubt — Profile werden ausschließlich über den Trigger angelegt.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  display_name text,
  is_admin boolean NOT NULL DEFAULT false,
  is_approved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- SELECT: selbst lesen oder Admin liest alle
DROP POLICY IF EXISTS "profiles_select_self_or_admin" ON profiles;
CREATE POLICY "profiles_select_self_or_admin"
ON profiles FOR SELECT
TO authenticated
USING (
  auth.uid() = id
  OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  )
);

-- UPDATE: selbst ändern oder Admin ändert alle
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
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid() AND p.is_admin = true
  )
);

-- Trigger: automatisch Profil anlegen beim SignUp
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: verhindert, dass Nicht-Admins is_admin / is_approved ändern
CREATE OR REPLACE FUNCTION public.guard_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_current_admin boolean;
BEGIN
  SELECT p.is_admin INTO is_current_admin
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF is_current_admin IS NOT TRUE THEN
    IF NEW.is_admin IS DISTINCT FROM OLD.is_admin
       OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
      RAISE EXCEPTION 'Nur Administratoren dürfen is_admin oder is_approved ändern';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS before_profiles_update ON profiles;
CREATE TRIGGER before_profiles_update
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_fields();

-- Bootstrap-Admin: ältesten Nutzer zum Admin + freigeschaltet machen,
-- falls noch kein Admin existiert. Idempotent.
DO $$
DECLARE
  oldest_user uuid;
BEGIN
  SELECT id INTO oldest_user
  FROM profiles
  ORDER BY created_at ASC
  LIMIT 1;

  IF oldest_user IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM profiles WHERE is_admin = true
  ) THEN
    UPDATE profiles
    SET is_admin = true, is_approved = true
    WHERE id = oldest_user;
  END IF;
END $$;
