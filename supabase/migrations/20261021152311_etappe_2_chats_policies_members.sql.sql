DROP POLICY IF EXISTS "members_select_own_conversations" ON public.conversation_members;
CREATE POLICY "members_select_own_conversations" ON public.conversation_members FOR SELECT
TO authenticated USING (public.is_conversation_member(conversation_id));

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

DROP POLICY IF EXISTS "members_update_self" ON public.conversation_members;
CREATE POLICY "members_update_self" ON public.conversation_members FOR UPDATE
TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

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

DROP POLICY IF EXISTS "messages_select_member" ON public.messages;
CREATE POLICY "messages_select_member" ON public.messages FOR SELECT
TO authenticated USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "messages_insert_member" ON public.messages;
CREATE POLICY "messages_insert_member" ON public.messages FOR INSERT
TO authenticated WITH CHECK (public.is_conversation_member(conversation_id));
