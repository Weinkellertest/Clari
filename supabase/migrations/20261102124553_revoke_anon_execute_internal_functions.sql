/*
# Anonyme Ausführung interner Funktionen entziehen

1. Hintergrund
- Mehrere Hilfsfunktionen mit erhöhten Rechten waren über die Schnittstelle für nicht angemeldete Besucher aufrufbar.
- Keine Regel in der Datenbank richtet sich an anonyme Nutzer. Die Funktionen werden nur innerhalb der Regeln für angemeldete Nutzer und in Auslöser-Funktionen benötigt.

2. Änderungen
- Ausführungsrecht für anon und PUBLIC auf diese Funktionen entzogen: can_manage_group, can_manage_group_or_office, has_office_permission, is_conversation_member, is_group_member, is_current_admin, enforce_max_three_offices, guard_sensitive_fields, handle_new_user.
- Angemeldete Nutzer behalten das Recht, damit bestehende Regeln weiter funktionieren.

3. Erweiterung btree_gist
- Die Erweiterung wird aus dem öffentlich sichtbaren Schema in das Schema "extensions" verschoben. Bestehende Einschränkungen bleiben unverändert.
*/

REVOKE EXECUTE ON FUNCTION public.can_manage_group(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_manage_group_or_office(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_office_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_group_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_current_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.enforce_max_three_offices() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.guard_sensitive_fields() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;

CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
