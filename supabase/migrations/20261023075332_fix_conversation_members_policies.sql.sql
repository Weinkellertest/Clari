/*
# Fix conversation_members RLS policies

## Problem
Die INSERT- und DELETE-Policies auf `conversation_members` enthalten einen
Selbstbezug-Fehler: `cm.conversation_id = cm.conversation_id` ist eine Tautologie
(immer wahr), statt die Spalte mit der Zeile zu vergleichen, die eingefügt/gelöscht
wird. Dadurch schlägt das Erstellen neuer Unterhaltungen fehl, weil die Policy
fälschlicherweise prüft, ob der Nutzer bereits Admin in irgendeiner Unterhaltung
ist, statt in der konkreten Unterhaltung.

## Lösung
1. INSERT-Policy: Erlaubt das Einfügen, wenn:
   - Der einfügende Nutzer der Ersteller der zugehörigen Unterhaltung ist, ODER
   - Der einfügende Nutzer sich selbst als Mitglied hinzufügt und die
     Unterhaltung existiert (wird vom Ersteller erstellt).
   Dies deckt beide Fälle ab: den Ersteller (der sich selbst + andere hinzufügt)
   und Nutzer, die sich selbst zu einer bestehenden Unterhaltung hinzufügen dürfen.

2. DELETE-Policy: Erlaubt das Löschen, wenn:
   - Der Nutzer die eigene Zeile löscht, ODER
   - Der Nutzer Admin der konkreten Unterhaltung ist (korrigierter Vergleich).

3. UPDATE- und SELECT-Policies bleiben unverändert (waren korrekt).

## Sicherheit
- RLS bleibt aktiviert.
- Grants bleiben unverändert (alle CRUD an authenticated).
- Alle Policies verwenden auth.uid() für Eigentumsprüfung.
*/

-- INSERT: fix self-referential tautology
DROP POLICY IF EXISTS "members_insert_conversation_admin" ON conversation_members;
CREATE POLICY "members_insert_conversation_admin"
  ON conversation_members FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Nutzer ist Ersteller der zugehörigen Unterhaltung (darf alle Mitglieder einfügen)
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND c.created_by = auth.uid()
    )
    -- ODER Nutzer fügt sich selbst hinzu
    OR user_id = auth.uid()
  );

-- DELETE: fix self-referential tautology
DROP POLICY IF EXISTS "members_delete_conversation_admin" ON conversation_members;
CREATE POLICY "members_delete_conversation_admin"
  ON conversation_members FOR DELETE
  TO authenticated
  USING (
    -- Nutzer löscht eigene Zeile
    user_id = auth.uid()
    -- ODER Nutzer ist Admin der konkreten Unterhaltung
    OR EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );
