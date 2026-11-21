-- Chạy SAU rooms.sql (đã gồm tên phòng). Có thể chạy lại.
begin;
create table if not exists chat_private.action_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  hits integer not null,
  primary key(user_id, action)
);
revoke all on chat_private.action_limits from public, anon, authenticated;
create or replace function chat_private.check_rate(action_name text, max_hits integer, seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into chat_private.action_limits as limits(user_id, action, window_start, hits)
  values(auth.uid(), action_name, clock_timestamp(), 1)
  on conflict(user_id, action) do update set
    hits = case when limits.window_start < clock_timestamp() - make_interval(secs => seconds) then 1 else limits.hits + 1 end,
    window_start = case when limits.window_start < clock_timestamp() - make_interval(secs => seconds) then clock_timestamp() else limits.window_start end
  returning hits into n;
  if n > max_hits then raise exception 'RATE_LIMITED'; end if;
end;
$$;
revoke all on function chat_private.check_rate(text,integer,integer) from public, anon, authenticated;

create or replace function chat_private.guard_message()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or new.sender_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.chat_members where room_id = new.room_id and user_id = auth.uid()) then raise exception 'ROOM_UNAVAILABLE'; end if;
  perform chat_private.check_rate('message', 20, 10);
  select left(coalesce(nullif(raw_user_meta_data->>'display_name',''), split_part(email,'@',1), 'Người dùng'), 100)
    into new.sender_name from auth.users where id = auth.uid();
  new.created_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function chat_private.guard_message() from public, anon, authenticated;
drop trigger if exists guard_chat_message on public.chat_messages;
create trigger guard_chat_message before insert on public.chat_messages for each row execute function chat_private.guard_message();
-- Chỉ ghi qua RPC: retry cùng UUID trả lại cùng tin đã lưu.
revoke insert on public.chat_messages from authenticated;
revoke insert(room_id, sender_id, sender_name, content) on public.chat_messages from authenticated;
create or replace function chat_private.send_message(target uuid, message_id uuid, body text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.chat_messages;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  -- Khóa phòng ngăn xóa phòng/rời phòng xen giữa kiểm tra và ghi.
  perform 1 from public.chat_rooms where id = target for key share;
  perform 1 from public.chat_members where room_id = target and user_id = auth.uid() for key share;
  if not found then raise exception 'ROOM_UNAVAILABLE'; end if;
  select * into result from public.chat_messages where id = message_id;
  if found then
    if result.sender_id <> auth.uid() or result.room_id <> target or result.content <> btrim(body) then raise exception 'FORBIDDEN'; end if;
    return to_jsonb(result);
  end if;
  if message_id is null or body is null or char_length(btrim(body)) not between 1 and 2000 then raise exception 'INVALID_MESSAGE'; end if;
  insert into public.chat_messages(id, room_id, sender_id, sender_name, content)
    values(message_id, target, auth.uid(), 'pending', btrim(body)) returning * into result;
  return to_jsonb(result);
end;
$$;
create or replace function public.send_chat_message(target uuid, message_id uuid, body text)
returns jsonb language sql security invoker set search_path = '' as $$ select chat_private.send_message(target, message_id, body); $$;
revoke all on function chat_private.send_message(uuid,uuid,text), public.send_chat_message(uuid,uuid,text) from public, anon;
grant execute on function chat_private.send_message(uuid,uuid,text), public.send_chat_message(uuid,uuid,text) to authenticated;

create or replace function chat_private.leave_room(target uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform 1 from public.chat_rooms where id = target and owner_id = auth.uid();
  if found then raise exception 'OWNER_CANNOT_LEAVE'; end if;
  delete from public.chat_members where room_id = target and user_id = auth.uid();
end;
$$;
create or replace function public.leave_chat_room(target uuid)
returns void language sql security invoker set search_path = '' as $$ select chat_private.leave_room(target); $$;
revoke all on function chat_private.leave_room(uuid), public.leave_chat_room(uuid) from public, anon;
grant execute on function chat_private.leave_room(uuid), public.leave_chat_room(uuid) to authenticated;

create or replace function chat_private.guard_room_action()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if tg_table_name = 'chat_rooms' then
    if new.owner_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
    perform chat_private.check_rate('create_room', 5, 60);
  else
    if new.user_id <> auth.uid() then raise exception 'FORBIDDEN'; end if;
    if not exists(select 1 from public.chat_members where room_id = new.room_id and user_id = new.user_id) then
      perform chat_private.check_rate('join_room', 20, 60);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function chat_private.guard_room_action() from public, anon, authenticated;
drop trigger if exists limit_room_creation on public.chat_rooms;
create trigger limit_room_creation before insert on public.chat_rooms for each row execute function chat_private.guard_room_action();
drop trigger if exists limit_room_join on public.chat_members;
create trigger limit_room_join before insert on public.chat_members for each row execute function chat_private.guard_room_action();
notify pgrst, 'reload schema';
commit;
