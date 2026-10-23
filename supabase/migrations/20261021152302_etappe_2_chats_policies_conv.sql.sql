DROP POLICY IF EXISTS "conversations_select_member" ON public.conversations;
CREATE POLICY "conversations_select_member" ON public.conversations FOR SELECT
TO authenticated USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS "conversations_insert_member" ON public.conversations;
CREATE POLICY "conversations_insert_member" ON public.conversations FOR INSERT
TO authenticated WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "conversations_update_member" ON public.conversations;
CREATE POLICY "conversations_update_member" ON public.conversations FOR UPDATE
TO authenticated USING (public.is_conversation_member(id)) WITH CHECK (public.is_conversation_member(id));

DROP POLICY IF EXISTS "conversations_delete_member" ON public.conversations;
CREATE POLICY "conversations_delete_member" ON public.conversations FOR DELETE
TO authenticated USING (public.is_conversation_member(id));
