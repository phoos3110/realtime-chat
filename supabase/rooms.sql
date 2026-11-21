-- Chạy toàn bộ file trong Supabase > SQL Editor.
begin;
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (room_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members(user_id);
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_name text not null check (char_length(sender_name) between 1 and 100),
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_room_time_idx on public.chat_messages(room_id, created_at);
alter table public.chat_rooms enable row level security;
alter table public.chat_members enable row level security;
alter table public.chat_messages enable row level security;
revoke all on public.chat_rooms, public.chat_members, public.chat_messages from anon, authenticated;
grant select on public.chat_rooms, public.chat_members, public.chat_messages to authenticated;
grant insert (room_id, sender_id, sender_name, content) on public.chat_messages to authenticated;

-- Mã UUID đầy đủ là mã mời; chỉ chia sẻ với người bạn muốn mời.
create schema if not exists chat_private;
revoke all on schema chat_private from public, anon;
grant usage on schema chat_private to authenticated;
create or replace function chat_private.open_room(invite uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if invite is null then
    insert into public.chat_rooms(owner_id) values(auth.uid()) returning id into target;
  else
    select id into target from public.chat_rooms where id = invite;
    if target is null then raise exception 'ROOM_NOT_FOUND'; end if;
  end if;
  insert into public.chat_members(room_id, user_id) values(target, auth.uid()) on conflict do nothing;
  return target;
end;
$$;
revoke all on function chat_private.open_room(uuid) from public, anon;
grant execute on function chat_private.open_room(uuid) to authenticated;
create or replace function public.open_chat_room(invite uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select chat_private.open_room(invite);
$$;
revoke all on function public.open_chat_room(uuid) from public, anon;
grant execute on function public.open_chat_room(uuid) to authenticated;

drop policy if exists members_read_self on public.chat_members;
create policy members_read_self on public.chat_members for select to authenticated using(user_id = (select auth.uid()));
drop policy if exists rooms_read_member on public.chat_rooms;
create policy rooms_read_member on public.chat_rooms for select to authenticated using(exists(select 1 from public.chat_members m where m.room_id = chat_rooms.id and m.user_id = (select auth.uid())));
drop policy if exists messages_read_member on public.chat_messages;
create policy messages_read_member on public.chat_messages for select to authenticated using(exists(select 1 from public.chat_members m where m.room_id = chat_messages.room_id and m.user_id = (select auth.uid())));
drop policy if exists messages_send_member on public.chat_messages;
create policy messages_send_member on public.chat_messages for insert to authenticated with check(sender_id = (select auth.uid()) and exists(select 1 from public.chat_members m where m.room_id = chat_messages.room_id and m.user_id = (select auth.uid())));
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;
commit;
