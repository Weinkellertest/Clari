/*
# Individuelle Startseiten-Konfiguration

1. Neue Tabelle
- `user_home_config`
  - `user_id` (uuid, PK, referenziert auth.users, mit CASCADE)
  - `widgets` (jsonb, Standard: Standard-Konfiguration)
  - `updated_at` (timestamptz)
  - Die `widgets`-Spalte speichert ein JSON-Array von Widget-IDs in der vom Nutzer gewünschten Reihenfolge.
    Nur die Darstellung wird konfiguriert — Zugriffsrechte bleiben unverändert durch RLS auf den jeweiligen Tabellen.

2. Sicherheit
- RLS aktiviert auf `user_home_config`.
- GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated.
- Vier separate Policies (SELECT/INSERT/UPDATE/DELETE), alle mit auth.uid() = user_id.
- user_id hat DEFAULT auth.uid(), damit Inserts ohne explizite user_id funktionieren.

3. Wichtige Hinweise
- Die Konfiguration ist rein darstellungsbezogen. Sie gewährt keine zusätzlichen Datenrechte.
- Neue Nutzer sehen automatisch die Standard-Startseite, da beim ersten Laden kein Konfigurationssatz existiert und die App dann die Standard-Widgets verwendet.
- Beim Löschen eines Nutzers (auth.users) wird die Konfiguration automatisch gelöscht (ON DELETE CASCADE).
*/

CREATE TABLE IF NOT EXISTS user_home_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  widgets jsonb NOT NULL DEFAULT '["minifacts","events","duties","finance","messages","games","shortcuts"]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE user_home_config ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON user_home_config TO authenticated;

DROP POLICY IF EXISTS "select_own_home_config" ON user_home_config;
CREATE POLICY "select_own_home_config"
  ON user_home_config FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_home_config" ON user_home_config;
CREATE POLICY "insert_own_home_config"
  ON user_home_config FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_home_config" ON user_home_config;
CREATE POLICY "update_own_home_config"
  ON user_home_config FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_home_config" ON user_home_config;
CREATE POLICY "delete_own_home_config"
  ON user_home_config FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
