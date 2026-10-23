-- Fix: conversation_members policies had self-referential bug
-- cm.conversation_id = cm.conversation_id was always true (should be = conversation_id)

DROP POLICY IF EXISTS "members_delete_conversation_admin" ON public.conversation_members;
CREATE POLICY "members_delete_conversation_admin" ON public.conversation_members FOR DELETE
TO authenticated USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = conversation_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
);

DROP POLICY IF EXISTS "members_insert_conversation_admin" ON public.conversation_members;
CREATE POLICY "members_insert_conversation_admin" ON public.conversation_members FOR INSERT
TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = conversation_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
  OR NOT public.is_conversation_member(conversation_id)
);
