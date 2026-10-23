/*
# Etappe 5b + 6a: Dienste, Infoseiten und Dateien

## 5b — Dienste
- Tabelle `duties`: Einträge für Dienste, die von Ämtern an Personen vergeben werden.
  - `id`, `title`, `description`, `assigned_office_id` (FK offices), `assigned_user_id` (FK profiles),
    `due_date` (Datum/Zeit Fälligkeit), `recurrence` ('none' | 'daily' | 'weekly' | 'monthly'),
    `status` ('open' | 'done' | 'checked' | 'overdue'), `completed_at`, `checked_at`, `checked_by`,
    `created_by`, `created_at`.
- RLS: Assignee sieht eigene Dienste (SELECT/UPDATE status). Amt-Inhaber mit Berechtigung 'duties'
  sehen und verwalten alle Dienste ihres Amtes. Admins sehen alles.

## 6a — Infoseiten
- Tabelle `info_pages`: Statische Informationsseiten (Kontakte, WLAN, Hausregeln, Müllplan etc.).
  - `id`, `title`, `slug`, `content` (text), `icon` (text, Lucide-Icon-Name), `group_id` (optional, null = alle),
    `sort_order`, `updated_by`, `updated_at`, `created_at`.
- RLS: Lesbar für Gruppenmitglieder oder alle (wenn group_id null). Editierbar von Admins oder
  Ämtern mit Berechtigung 'infos' der entsprechenden Gruppe.

## 6a — Dateien
- Storage-Bucket `files` für Uploads.
- Tabelle `file_folders`: Ordner-Struktur, gruppenbezogen.
  - `id`, `name`, `group_id` (optional), `parent_id` (self-ref, optional), `created_by`, `created_at`.
- Tabelle `file_entries`: Metadaten für hochgeladene Dateien.
  - `id`, `folder_id` (optional), `group_id` (optional), `file_name`, `storage_path`, `mime_type`,
    `file_size`, `uploaded_by`, `created_at`.
- RLS: Lesbar für Gruppenmitglieder oder alle. Upload/Löschen von Admins oder Ämtern mit Berechtigung 'files'.

## Security
- Alle Tabellen: RLS aktiviert, GRANT nur an authenticated.
- 4 Policies pro Tabelle (SELECT/INSERT/UPDATE/DELETE).
- Helper-Funktion `has_office_permission(office_id, permission)` prüft ob aktueller Nutzer
  Inhaber des Amtes ist und das Amt die Berechtigung hat.
- Helper-Funktion `can_manage_group_or_office(group_id, permission)` kombiniert Admin-Check,
  Gruppen-Admin-Check und Amt-Berechtigungs-Check.
*/

-- =====================
-- Helper functions
-- =====================

CREATE OR REPLACE FUNCTION public.has_office_permission(o_id uuid, perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT EXISTS (
  SELECT 1 FROM public.office_holders oh
  JOIN public.offices o ON o.id = oh.office_id
  WHERE oh.user_id = auth.uid()
  AND oh.office_id = o_id
  AND perm = ANY(o.permissions)
);
$$;

CREATE OR REPLACE FUNCTION public.can_manage_group_or_office(g_id uuid, perm text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
SELECT COALESCE(public.is_current_admin(), false)
OR EXISTS (
  SELECT 1 FROM public.group_memberships gm
  WHERE gm.group_id = g_id AND gm.user_id = auth.uid() AND gm.role = 'admin'
)
OR EXISTS (
  SELECT 1 FROM public.office_holders oh
  JOIN public.offices o ON o.id = oh.office_id
  WHERE oh.user_id = auth.uid()
  AND o.group_id = g_id
  AND perm = ANY(o.permissions)
);
$$;

-- =====================
-- 5b: duties
-- =====================

CREATE TABLE IF NOT EXISTS public.duties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  assigned_office_id uuid REFERENCES public.offices(id) ON DELETE SET NULL,
  assigned_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  due_date timestamptz,
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'checked', 'overdue')),
  completed_at timestamptz,
  checked_at timestamptz,
  checked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.duties ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.duties TO authenticated;

-- SELECT: assignee, office holder with 'duties' perm, admin
DROP POLICY IF EXISTS "duties_select" ON public.duties;
CREATE POLICY "duties_select" ON public.duties
FOR SELECT TO authenticated
USING (
  assigned_user_id = auth.uid()
  OR public.is_current_admin()
  OR (assigned_office_id IS NOT NULL AND public.has_office_permission(assigned_office_id, 'duties'))
);

-- INSERT: office holder with 'duties' perm, admin
DROP POLICY IF EXISTS "duties_insert" ON public.duties;
CREATE POLICY "duties_insert" ON public.duties
FOR INSERT TO authenticated
WITH CHECK (
  public.is_current_admin()
  OR (assigned_office_id IS NOT NULL AND public.has_office_permission(assigned_office_id, 'duties'))
);

-- UPDATE: assignee can mark done; office holder can mark checked; admin all
DROP POLICY IF EXISTS "duties_update" ON public.duties;
CREATE POLICY "duties_update" ON public.duties
FOR UPDATE TO authenticated
USING (
  assigned_user_id = auth.uid()
  OR public.is_current_admin()
  OR (assigned_office_id IS NOT NULL AND public.has_office_permission(assigned_office_id, 'duties'))
) WITH CHECK (
  assigned_user_id = auth.uid()
  OR public.is_current_admin()
  OR (assigned_office_id IS NOT NULL AND public.has_office_permission(assigned_office_id, 'duties'))
);

-- DELETE: office holder with 'duties' perm, admin
DROP POLICY IF EXISTS "duties_delete" ON public.duties;
CREATE POLICY "duties_delete" ON public.duties
FOR DELETE TO authenticated
USING (
  public.is_current_admin()
  OR (assigned_office_id IS NOT NULL AND public.has_office_permission(assigned_office_id, 'duties'))
);

CREATE INDEX IF NOT EXISTS idx_duties_assigned_user ON public.duties(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_duties_office ON public.duties(assigned_office_id);
CREATE INDEX IF NOT EXISTS idx_duties_due_date ON public.duties(due_date);
CREATE INDEX IF NOT EXISTS idx_duties_status ON public.duties(status);

-- =====================
-- 6a: info_pages
-- =====================

CREATE TABLE IF NOT EXISTS public.info_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  content text NOT NULL DEFAULT '',
  icon text NOT NULL DEFAULT 'Info',
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.info_pages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.info_pages TO authenticated;

-- SELECT: group members or all (group_id null)
DROP POLICY IF EXISTS "info_pages_select" ON public.info_pages;
CREATE POLICY "info_pages_select" ON public.info_pages
FOR SELECT TO authenticated
USING (
  group_id IS NULL
  OR public.is_group_member(group_id)
  OR public.is_current_admin()
);

-- INSERT: admin or office with 'infos' perm
DROP POLICY IF EXISTS "info_pages_insert" ON public.info_pages;
CREATE POLICY "info_pages_insert" ON public.info_pages
FOR INSERT TO authenticated
WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'infos'))
);

-- UPDATE: same as insert
DROP POLICY IF EXISTS "info_pages_update" ON public.info_pages;
CREATE POLICY "info_pages_update" ON public.info_pages
FOR UPDATE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'infos'))
) WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'infos'))
);

-- DELETE: same as insert
DROP POLICY IF EXISTS "info_pages_delete" ON public.info_pages;
CREATE POLICY "info_pages_delete" ON public.info_pages
FOR DELETE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'infos'))
);

-- =====================
-- 6a: file_folders
-- =====================

CREATE TABLE IF NOT EXISTS public.file_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.file_folders(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_folders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_folders TO authenticated;

-- SELECT: group members or all
DROP POLICY IF EXISTS "file_folders_select" ON public.file_folders;
CREATE POLICY "file_folders_select" ON public.file_folders
FOR SELECT TO authenticated
USING (
  group_id IS NULL
  OR public.is_group_member(group_id)
  OR public.is_current_admin()
);

-- INSERT: admin or office with 'files' perm
DROP POLICY IF EXISTS "file_folders_insert" ON public.file_folders;
CREATE POLICY "file_folders_insert" ON public.file_folders
FOR INSERT TO authenticated
WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

-- UPDATE: same
DROP POLICY IF EXISTS "file_folders_update" ON public.file_folders;
CREATE POLICY "file_folders_update" ON public.file_folders
FOR UPDATE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
) WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

-- DELETE: same
DROP POLICY IF EXISTS "file_folders_delete" ON public.file_folders;
CREATE POLICY "file_folders_delete" ON public.file_folders
FOR DELETE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

-- =====================
-- 6a: file_entries
-- =====================

CREATE TABLE IF NOT EXISTS public.file_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid REFERENCES public.file_folders(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text,
  file_size bigint,
  uploaded_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.file_entries ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.file_entries TO authenticated;

-- SELECT: group members or all
DROP POLICY IF EXISTS "file_entries_select" ON public.file_entries;
CREATE POLICY "file_entries_select" ON public.file_entries
FOR SELECT TO authenticated
USING (
  group_id IS NULL
  OR public.is_group_member(group_id)
  OR public.is_current_admin()
);

-- INSERT: admin or office with 'files' perm
DROP POLICY IF EXISTS "file_entries_insert" ON public.file_entries;
CREATE POLICY "file_entries_insert" ON public.file_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

-- UPDATE: same
DROP POLICY IF EXISTS "file_entries_update" ON public.file_entries;
CREATE POLICY "file_entries_update" ON public.file_entries
FOR UPDATE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
) WITH CHECK (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

-- DELETE: same
DROP POLICY IF EXISTS "file_entries_delete" ON public.file_entries;
CREATE POLICY "file_entries_delete" ON public.file_entries
FOR DELETE TO authenticated
USING (
  public.is_current_admin()
  OR (group_id IS NOT NULL AND public.can_manage_group_or_office(group_id, 'files'))
);

CREATE INDEX IF NOT EXISTS idx_file_entries_folder ON public.file_entries(folder_id);
CREATE INDEX IF NOT EXISTS idx_file_entries_group ON public.file_entries(group_id);

-- =====================
-- Storage bucket for files
-- =====================

INSERT INTO storage.buckets (id, name, public)
VALUES ('files', 'files', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: allow authenticated users to upload, and read is public
DROP POLICY IF EXISTS "files_bucket_read" ON storage.objects;
CREATE POLICY "files_bucket_read" ON storage.objects
FOR SELECT TO authenticated, anon
USING (bucket_id = 'files');

DROP POLICY IF EXISTS "files_bucket_upload" ON storage.objects;
CREATE POLICY "files_bucket_upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'files');

DROP POLICY IF EXISTS "files_bucket_update" ON storage.objects;
CREATE POLICY "files_bucket_update" ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'files')
WITH CHECK (bucket_id = 'files');

DROP POLICY IF EXISTS "files_bucket_delete" ON storage.objects;
CREATE POLICY "files_bucket_delete" ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'files');
