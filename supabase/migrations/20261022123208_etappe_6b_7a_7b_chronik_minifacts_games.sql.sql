/*
# Etappe 6b + 7a + 7b: Chronik, Minifacts, Minigames

## 6b — Chronik (Wohnzeiten)
- Tabelle `residences`: Wohnzeiten pro Person und Zimmer.
  - `id`, `user_id` (FK profiles), `room_name` (text, z.B. "Zimmer 1.2"),
    `moved_in` (date), `moved_out` (date, null = aktuell), `notes`.
- RLS: Jeder kann alle Wohnzeiten sehen (Chronik ist gemeinsam). Schreiben/löschen
  durch Admins oder den Bewohner selbst.

## 7a — Minifacts
- Tabelle `minifacts`: Beliebige Key-Value-Fakten pro Nutzer.
  - `id`, `user_id` (FK profiles), `key` (z.B. "Lieblingsgericht"), `value` (z.B. "Lasagne"),
    `icon` (optional, Lucide-Icon-Name).
- RLS: Jeder kann alle Minifacts sehen (für Quiz und "Über mich"). Schreiben nur
  durch den Nutzer selbst (eigenes Profil).

## 7b — Minigames
- Tabelle `game_matches`: Ein Spiel zwischen zwei Spielern.
  - `id`, `game_type` ('tictactoe' | 'connect4' | 'quiz'),
    `player1_id`, `player2_id` (FK profiles),
    `status` ('waiting' | 'active' | 'finished'),
    `current_turn` ('player1' | 'player2'),
    `winner_id` (null = unentschieden oder noch offen),
    `board_state` (jsonb, speichert das Spielfeld),
    `quiz_questions` (jsonb, null für Nicht-Quiz),
    `quiz_answers` (jsonb, null für Nicht-Quiz),
    `quiz_current_index` (int, null),
    `created_by`, `created_at`, `finished_at`.
- Tabelle `game_scores`: Bestenliste.
  - `id`, `user_id` (FK profiles), `game_type`, `wins`, `losses`, `draws`.
- RLS: Alle können matches und scores sehen. Spieler können eigene matches
  aktualisieren. Jeder kann ein match erstellen. Scores: INSERT beim ersten Spiel,
  UPDATE durch Spieler selbst.
*/

-- =====================
-- 6b: residences
-- =====================

CREATE TABLE IF NOT EXISTS public.residences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_name text NOT NULL,
  moved_in date NOT NULL,
  moved_out date,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.residences ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.residences TO authenticated;

DROP POLICY IF EXISTS "residences_select" ON public.residences;
CREATE POLICY "residences_select" ON public.residences
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "residences_insert" ON public.residences;
CREATE POLICY "residences_insert" ON public.residences
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "residences_update" ON public.residences;
CREATE POLICY "residences_update" ON public.residences
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR public.is_current_admin())
WITH CHECK (user_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "residences_delete" ON public.residences;
CREATE POLICY "residences_delete" ON public.residences
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_current_admin());

CREATE INDEX IF NOT EXISTS idx_residences_user ON public.residences(user_id);
CREATE INDEX IF NOT EXISTS idx_residences_room ON public.residences(room_name);

-- =====================
-- 7a: minifacts
-- =====================

CREATE TABLE IF NOT EXISTS public.minifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  fact_key text NOT NULL,
  fact_value text NOT NULL,
  icon text NOT NULL DEFAULT 'Sparkles',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.minifacts ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.minifacts TO authenticated;

-- SELECT: all authenticated can see (for quiz + about-me)
DROP POLICY IF EXISTS "minifacts_select" ON public.minifacts;
CREATE POLICY "minifacts_select" ON public.minifacts
FOR SELECT TO authenticated USING (true);

-- INSERT: only own
DROP POLICY IF EXISTS "minifacts_insert" ON public.minifacts;
CREATE POLICY "minifacts_insert" ON public.minifacts
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- UPDATE: only own
DROP POLICY IF EXISTS "minifacts_update" ON public.minifacts;
CREATE POLICY "minifacts_update" ON public.minifacts
FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- DELETE: only own (or admin via profiles cascade)
DROP POLICY IF EXISTS "minifacts_delete" ON public.minifacts;
CREATE POLICY "minifacts_delete" ON public.minifacts
FOR DELETE TO authenticated
USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_minifacts_user ON public.minifacts(user_id);

-- =====================
-- 7b: game_matches
-- =====================

CREATE TABLE IF NOT EXISTS public.game_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type text NOT NULL CHECK (game_type IN ('tictactoe', 'connect4', 'quiz')),
  player1_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  player2_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
  current_turn text NOT NULL DEFAULT 'player1' CHECK (current_turn IN ('player1', 'player2')),
  winner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  board_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  quiz_questions jsonb,
  quiz_answers jsonb,
  quiz_current_index integer,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE public.game_matches ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_matches TO authenticated;

-- SELECT: all authenticated can see matches
DROP POLICY IF EXISTS "game_matches_select" ON public.game_matches;
CREATE POLICY "game_matches_select" ON public.game_matches
FOR SELECT TO authenticated USING (true);

-- INSERT: player1 must be the creator
DROP POLICY IF EXISTS "game_matches_insert" ON public.game_matches;
CREATE POLICY "game_matches_insert" ON public.game_matches
FOR INSERT TO authenticated
WITH CHECK (player1_id = auth.uid());

-- UPDATE: either player can update the match
DROP POLICY IF EXISTS "game_matches_update" ON public.game_matches;
CREATE POLICY "game_matches_update" ON public.game_matches
FOR UPDATE TO authenticated
USING (player1_id = auth.uid() OR player2_id = auth.uid())
WITH CHECK (player1_id = auth.uid() OR player2_id = auth.uid());

-- DELETE: either player or admin
DROP POLICY IF EXISTS "game_matches_delete" ON public.game_matches;
CREATE POLICY "game_matches_delete" ON public.game_matches
FOR DELETE TO authenticated
USING (player1_id = auth.uid() OR player2_id = auth.uid() OR public.is_current_admin());

CREATE INDEX IF NOT EXISTS idx_game_matches_p1 ON public.game_matches(player1_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_p2 ON public.game_matches(player2_id);
CREATE INDEX IF NOT EXISTS idx_game_matches_status ON public.game_matches(status);

-- =====================
-- 7b: game_scores
-- =====================

CREATE TABLE IF NOT EXISTS public.game_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('tictactoe', 'connect4', 'quiz')),
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  draws integer NOT NULL DEFAULT 0,
  UNIQUE(user_id, game_type)
);

ALTER TABLE public.game_scores ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_scores TO authenticated;

-- SELECT: all can see the leaderboard
DROP POLICY IF EXISTS "game_scores_select" ON public.game_scores;
CREATE POLICY "game_scores_select" ON public.game_scores
FOR SELECT TO authenticated USING (true);

-- INSERT: only own score
DROP POLICY IF EXISTS "game_scores_insert" ON public.game_scores;
CREATE POLICY "game_scores_insert" ON public.game_scores
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

-- UPDATE: only own score
DROP POLICY IF EXISTS "game_scores_update" ON public.game_scores;
CREATE POLICY "game_scores_update" ON public.game_scores
FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- DELETE: only own or admin
DROP POLICY IF EXISTS "game_scores_delete" ON public.game_scores;
CREATE POLICY "game_scores_delete" ON public.game_scores
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR public.is_current_admin());

CREATE INDEX IF NOT EXISTS idx_game_scores_type ON public.game_scores(game_type);
