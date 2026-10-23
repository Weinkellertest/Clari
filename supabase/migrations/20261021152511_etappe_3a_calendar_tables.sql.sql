CREATE TABLE IF NOT EXISTS public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  location text,
  created_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
  is_private boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_start ON public.events (start_time);
CREATE INDEX IF NOT EXISTS idx_events_group ON public.events (group_id);
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events (created_by);
