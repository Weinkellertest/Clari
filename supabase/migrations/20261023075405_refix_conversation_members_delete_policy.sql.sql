/*
# Re-fix conversation_members DELETE policy

Die DELETE-Policy wurde im vorherigen Fix nicht korrekt aktualisiert.
Der Selbstbezug `cm.conversation_id = cm.conversation_id` (Tautologie)
wurde durch den korrekten Vergleich `cm.conversation_id = conversation_id`
ersetzt, aber die gespeicherte Expression zeigt noch die alte Version.
Erneutes Drop + Create zur Sicherstellung der korrekten Policy.
*/

DROP POLICY IF EXISTS "members_delete_conversation_admin" ON conversation_members;

CREATE POLICY "members_delete_conversation_admin"
  ON conversation_members FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM conversation_members cm
      WHERE cm.conversation_id = conversation_members.conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );
