/*
# Etappe 3b/4/5a: Räume, Finanzen, Listen

## Etappe 3b — Raumreservierung
1. New Tables
- `rooms`: Räume, die von Admins angelegt werden (name, description, capacity, created_by, created_at)
- `room_reservations`: Reservierungen (room_id, user_id, start_time, end_time, title, notes, created_at)
2. Security
- RLS auf rooms: alle authentifizierten Nutzer können Räume sehen; nur Admins können Räume anlegen/bearbeiten/löschen
- RLS auf room_reservations: alle authentifizierten Nutzer sehen alle Reservierungen (Transparenz); können eigene anlegen/löschen; Admins können alle löschen
- Überschneidungs-Prüfung über Exclusion Constraint (GiST mit tstzrange)

## Etappe 4 — Finanzen
1. New Tables
- `transactions`: Buchungen (amount, description, transaction_date, creditor_type, creditor_id, creditor_name, debtor_type, debtor_id, debtor_name, group_id, status, created_by, created_at)
  - creditor/debtor können Person (profile) oder Amt (office) sein — polymorph über type+id
- `transaction_splits`: Aufteilung auf mehrere Personen (transaction_id, user_id, share_amount, is_settled, settled_at, created_at)
2. Security
- RLS auf transactions: sichtbar für Ersteller, Gläubiger, Schuldner, Gruppenmitglieder, Admins
- RLS auf transaction_splits: sichtbar für den Split-Nutzer + alle, die die Parent-Transaktion sehen können

## Etappe 5a — Listen
1. New Tables
- `lists`: To-do- und Einkaufslisten (title, type='todo'|'shopping', group_id null=privat, created_by, created_at)
- `list_items`: Einträge (list_id, text, completed, completed_by, completed_at, created_by, sort_order, created_at)
2. Security
- RLS auf lists: private Listen nur für Ersteller, Gruppen-Listen für Gruppenmitglieder
- RLS auf list_items: entsprechend parent-list-Sichtbarkeit
*/

-- =====================
-- Etappe 3b: Räume
-- =====================

CREATE TABLE IF NOT EXISTS public.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  capacity integer,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rooms_select_all" ON public.rooms;
CREATE POLICY "rooms_select_all" ON public.rooms FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "rooms_insert_admin" ON public.rooms;
CREATE POLICY "rooms_insert_admin" ON public.rooms FOR INSERT
  TO authenticated WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "rooms_update_admin" ON public.rooms;
CREATE POLICY "rooms_update_admin" ON public.rooms FOR UPDATE
  TO authenticated USING (public.is_current_admin())
  WITH CHECK (public.is_current_admin());

DROP POLICY IF EXISTS "rooms_delete_admin" ON public.rooms;
CREATE POLICY "rooms_delete_admin" ON public.rooms FOR DELETE
  TO authenticated USING (public.is_current_admin());

CREATE TABLE IF NOT EXISTS public.room_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.room_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_select_all" ON public.room_reservations;
CREATE POLICY "reservations_select_all" ON public.room_reservations FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "reservations_insert_self" ON public.room_reservations;
CREATE POLICY "reservations_insert_self" ON public.room_reservations FOR INSERT
  TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "reservations_update_self" ON public.room_reservations;
CREATE POLICY "reservations_update_self" ON public.room_reservations FOR UPDATE
  TO authenticated USING (user_id = auth.uid() OR public.is_current_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "reservations_delete_self" ON public.room_reservations;
CREATE POLICY "reservations_delete_self" ON public.room_reservations FOR DELETE
  TO authenticated USING (user_id = auth.uid() OR public.is_current_admin());

-- Überschneidungs-Prüfung: Exclusion Constraint (braucht btree_gist für uuid)
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE public.room_reservations
  DROP CONSTRAINT IF EXISTS no_overlapping_reservations;
ALTER TABLE public.room_reservations
  ADD CONSTRAINT no_overlapping_reservations
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  );

CREATE INDEX IF NOT EXISTS idx_reservations_room_time ON public.room_reservations (room_id, start_time, end_time);

ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.room_reservations;

-- =====================
-- Etappe 4: Finanzen
-- =====================

CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amount numeric(10,2) NOT NULL,
  description text NOT NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  creditor_type text NOT NULL CHECK (creditor_type IN ('person', 'office')),
  creditor_id uuid NOT NULL,
  creditor_name text NOT NULL,
  debtor_type text NOT NULL CHECK (debtor_type IN ('person', 'office')),
  debtor_id uuid NOT NULL,
  debtor_name text NOT NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_select_visible" ON public.transactions;
CREATE POLICY "transactions_select_visible" ON public.transactions FOR SELECT
  TO authenticated USING (
    created_by = auth.uid()
    OR creditor_id = auth.uid()
    OR debtor_id = auth.uid()
    OR (group_id IS NOT NULL AND public.is_group_member(group_id))
    OR public.is_current_admin()
  );

DROP POLICY IF EXISTS "transactions_insert_self" ON public.transactions;
CREATE POLICY "transactions_insert_self" ON public.transactions FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (
      group_id IS NULL
      OR public.is_group_member(group_id)
      OR public.is_current_admin()
    )
  );

DROP POLICY IF EXISTS "transactions_update_owner" ON public.transactions;
CREATE POLICY "transactions_update_owner" ON public.transactions FOR UPDATE
  TO authenticated USING (created_by = auth.uid() OR public.is_current_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "transactions_delete_owner" ON public.transactions;
CREATE POLICY "transactions_delete_owner" ON public.transactions FOR DELETE
  TO authenticated USING (created_by = auth.uid() OR public.is_current_admin());

CREATE TABLE IF NOT EXISTS public.transaction_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount numeric(10,2) NOT NULL,
  is_settled boolean NOT NULL DEFAULT false,
  settled_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.transaction_splits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "splits_select_visible" ON public.transaction_splits;
CREATE POLICY "splits_select_visible" ON public.transaction_splits FOR SELECT
  TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id
      AND (t.created_by = auth.uid() OR t.creditor_id = auth.uid() OR t.debtor_id = auth.uid()
           OR (t.group_id IS NOT NULL AND public.is_group_member(t.group_id))
           OR public.is_current_admin())
    )
  );

DROP POLICY IF EXISTS "splits_insert_with_transaction" ON public.transaction_splits;
CREATE POLICY "splits_insert_with_transaction" ON public.transaction_splits FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id
      AND (t.created_by = auth.uid() OR public.is_current_admin())
    )
  );

DROP POLICY IF EXISTS "splits_update_settle" ON public.transaction_splits;
CREATE POLICY "splits_update_settle" ON public.transaction_splits FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR public.is_current_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "splits_delete_owner" ON public.transaction_splits;
CREATE POLICY "splits_delete_owner" ON public.transaction_splits FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.transactions t
      WHERE t.id = transaction_id
      AND (t.created_by = auth.uid() OR public.is_current_admin())
    )
  );

CREATE INDEX IF NOT EXISTS idx_transactions_group ON public.transactions (group_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_splits_transaction ON public.transaction_splits (transaction_id);
CREATE INDEX IF NOT EXISTS idx_splits_user ON public.transaction_splits (user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaction_splits;

-- =====================
-- Etappe 5a: Listen
-- =====================

CREATE TABLE IF NOT EXISTS public.lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  type text NOT NULL DEFAULT 'todo' CHECK (type IN ('todo', 'shopping')),
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lists_select_visible" ON public.lists;
CREATE POLICY "lists_select_visible" ON public.lists FOR SELECT
  TO authenticated USING (
    created_by = auth.uid()
    OR (group_id IS NOT NULL AND public.is_group_member(group_id))
    OR public.is_current_admin()
  );

DROP POLICY IF EXISTS "lists_insert_self" ON public.lists;
CREATE POLICY "lists_insert_self" ON public.lists FOR INSERT
  TO authenticated WITH CHECK (
    created_by = auth.uid()
    AND (group_id IS NULL OR public.is_group_member(group_id) OR public.is_current_admin())
  );

DROP POLICY IF EXISTS "lists_update_owner" ON public.lists;
CREATE POLICY "lists_update_owner" ON public.lists FOR UPDATE
  TO authenticated USING (created_by = auth.uid() OR public.is_current_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_current_admin());

DROP POLICY IF EXISTS "lists_delete_owner" ON public.lists;
CREATE POLICY "lists_delete_owner" ON public.lists FOR DELETE
  TO authenticated USING (created_by = auth.uid() OR public.is_current_admin());

CREATE TABLE IF NOT EXISTS public.list_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES public.lists(id) ON DELETE CASCADE,
  text text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.list_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "items_select_via_list" ON public.list_items;
CREATE POLICY "items_select_via_list" ON public.list_items FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_id
      AND (l.created_by = auth.uid()
           OR (l.group_id IS NOT NULL AND public.is_group_member(l.group_id))
           OR public.is_current_admin())
    )
  );

DROP POLICY IF EXISTS "items_insert_via_list" ON public.list_items;
CREATE POLICY "items_insert_via_list" ON public.list_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_id
      AND (l.created_by = auth.uid()
           OR (l.group_id IS NOT NULL AND public.is_group_member(l.group_id))
           OR public.is_current_admin())
    )
  );

DROP POLICY IF EXISTS "items_update_via_list" ON public.list_items;
CREATE POLICY "items_update_via_list" ON public.list_items FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_id
      AND (l.created_by = auth.uid()
           OR (l.group_id IS NOT NULL AND public.is_group_member(l.group_id))
           OR public.is_current_admin())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_id
      AND (l.created_by = auth.uid()
           OR (l.group_id IS NOT NULL AND public.is_group_member(l.group_id))
           OR public.is_current_admin())
    )
  );

DROP POLICY IF EXISTS "items_delete_via_list" ON public.list_items;
CREATE POLICY "items_delete_via_list" ON public.list_items FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.lists l
      WHERE l.id = list_id
      AND (l.created_by = auth.uid()
           OR (l.group_id IS NOT NULL AND public.is_group_member(l.group_id))
           OR public.is_current_admin())
    )
  );

CREATE INDEX IF NOT EXISTS idx_items_list ON public.list_items (list_id, sort_order);

ALTER PUBLICATION supabase_realtime ADD TABLE public.lists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.list_items;
