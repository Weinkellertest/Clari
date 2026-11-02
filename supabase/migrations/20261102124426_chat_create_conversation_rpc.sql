/*
# Atomare Erstellung von Unterhaltungen und strengere Mitgliedschafts-Regeln

1. Neue Funktion
- `create_conversation(p_type, p_title, p_group_id, p_member_ids)` legt eine Unterhaltung samt aller Mitglieder in einem Schritt an.
- Direktchats: existiert bereits ein Direktchat zwischen beiden Personen, wird dieser zurückgegeben.
- Gruppenchats aus einer Gruppe: alle Mitglieder der Gruppe werden übernommen; der Ersteller muss Mitglied der Gruppe sein.
- Ad-hoc-Gruppenchats: die ausgewählten, freigegebenen Personen werden Mitglieder.

2. Geänderte Regeln
- `conversation_members`: Das Einfügen von Mitgliedern ist nur noch dem Ersteller der Unterhaltung oder einem Admin der Unterhaltung erlaubt. Die bisherige Regel, die jedem Nutzer das Eintragen in beliebige Unterhaltungen erlaubte, entfällt.

3. Sicherheit
- Die Funktion läuft mit Rechten des Eigentümers, prüft aber intern den angemeldeten Nutzer.
- Ausführung nur für angemeldete Nutzer (anon und PUBLIC entzogen).
- Ein Hilfsfunktion `is_conversation_admin` vermeidet rekursive Prüfungen in den Regeln.
*/

CREATE OR REPLACE FUNCTION public.is_conversation_admin(c_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = c_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(uuid) TO authenticated;

DROP POLICY IF EXISTS members_insert_conversation_admin ON public.conversation_members;
CREATE POLICY members_insert_conversation_admin ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_conversation_admin(conversation_id)
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id
      AND c.created_by = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.create_conversation(
  p_type text,
  p_title text,
  p_group_id uuid,
  p_member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  conv_id uuid;
  other_id uuid;
  invalid_count int;
  ids uuid[];
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'Nicht angemeldet';
  END IF;

  IF p_type = 'direct' THEN
    IF p_member_ids IS NULL OR cardinality(p_member_ids) <> 1 OR p_member_ids[1] = me THEN
      RAISE EXCEPTION 'Ein Einzelchat braucht genau eine andere Person';
    END IF;
    other_id := p_member_ids[1];

    SELECT c.id INTO conv_id
    FROM public.conversations c
    WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM public.conversation_members a WHERE a.conversation_id = c.id AND a.user_id = me)
      AND EXISTS (SELECT 1 FROM public.conversation_members b WHERE b.conversation_id = c.id AND b.user_id = other_id)
    LIMIT 1;
    IF conv_id IS NOT NULL THEN
      RETURN conv_id;
    END IF;

    SELECT count(*) INTO invalid_count FROM public.profiles WHERE id = other_id AND is_approved = true;
    IF invalid_count = 0 THEN
      RAISE EXCEPTION 'Diese Person kann nicht angeschrieben werden';
    END IF;

    INSERT INTO public.conversations (type, created_by)
    VALUES ('direct', me)
    RETURNING id INTO conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, me, 'admin'), (conv_id, other_id, 'member');

    RETURN conv_id;
  END IF;

  IF p_type <> 'group' THEN
    RAISE EXCEPTION 'Unbekannter Unterhaltungstyp';
  END IF;

  IF p_group_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.group_memberships gm WHERE gm.group_id = p_group_id AND gm.user_id = me) THEN
      RAISE EXCEPTION 'Du bist kein Mitglied dieser Gruppe';
    END IF;

    INSERT INTO public.conversations (type, group_id, title, created_by)
    VALUES ('group', p_group_id, NULLIF(trim(coalesce(p_title, '')), ''), me)
    RETURNING id INTO conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    SELECT conv_id, gm.user_id, CASE WHEN gm.role = 'admin' THEN 'admin' ELSE 'member' END
    FROM public.group_memberships gm
    WHERE gm.group_id = p_group_id
    ON CONFLICT DO NOTHING;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (conv_id, me, 'admin')
    ON CONFLICT DO NOTHING;

    RETURN conv_id;
  END IF;

  ids := ARRAY(SELECT DISTINCT unnest(coalesce(p_member_ids, ARRAY[]::uuid[])) UNION SELECT me);
  IF cardinality(ids) < 2 THEN
    RAISE EXCEPTION 'Ein Gruppenchat braucht mindestens eine weitere Person';
  END IF;

  SELECT count(*) INTO invalid_count
  FROM unnest(ids) AS u(id)
  WHERE u.id <> me
    AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id AND p.is_approved = true);
  IF invalid_count > 0 THEN
    RAISE EXCEPTION 'Mindestens eine Person kann nicht angeschrieben werden';
  END IF;

  INSERT INTO public.conversations (type, title, created_by)
  VALUES ('group', NULLIF(trim(coalesce(p_title, '')), ''), me)
  RETURNING id INTO conv_id;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  SELECT conv_id, u.id, CASE WHEN u.id = me THEN 'admin' ELSE 'member' END
  FROM unnest(ids) AS u(id);

  RETURN conv_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_conversation(text, text, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation(text, text, uuid, uuid[]) TO authenticated;
