-- Chạy trong Supabase > SQL Editor để thêm quyền xóa phòng.
begin;
grant delete on public.chat_rooms to authenticated;
drop policy if exists rooms_delete_owner on public.chat_rooms;
create policy rooms_delete_owner on public.chat_rooms
  for delete to authenticated
  using (owner_id = (select auth.uid()));
commit;
