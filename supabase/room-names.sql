-- Chạy file này trong Supabase > SQL Editor để thêm tên phòng.
begin;
alter table public.chat_rooms add column if not exists name text not null default 'Phòng chat';
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'chat_rooms_name_length' and conrelid = 'public.chat_rooms'::regclass) then
    alter table public.chat_rooms add constraint chat_rooms_name_length check (char_length(btrim(name)) between 1 and 100);
  end if;
end $$;
create or replace function chat_private.create_named_room(room_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if room_name is null or char_length(btrim(room_name)) not between 1 and 100 then
    raise exception 'INVALID_ROOM_NAME';
  end if;
  insert into public.chat_rooms(owner_id, name) values(auth.uid(), btrim(room_name)) returning id into target;
  insert into public.chat_members(room_id, user_id) values(target, auth.uid());
  return target;
end;
$$;
revoke all on function chat_private.create_named_room(text) from public, anon;
grant execute on function chat_private.create_named_room(text) to authenticated;
create or replace function public.create_chat_room(room_name text)
returns uuid language sql security invoker set search_path = '' as $$
  select chat_private.create_named_room(room_name);
$$;
revoke all on function public.create_chat_room(text) from public, anon;
grant execute on function public.create_chat_room(text) to authenticated;
notify pgrst, 'reload schema';
commit;
