-- Phase 3a (applied via MCP as phase3a_ticket_private_storage_leave_trip)
-- (a) allow the ticketPrivate items collection (booking codes + file references; read-only from the app)
alter table public.items drop constraint items_collection_check;
alter table public.items add constraint items_collection_check
  check (collection = any (array['dayItem','checklist','ticket','expense','customSpot','spotState','meta','ticketPrivate']::text[]));

-- (b) private bucket for itinerary PDFs and images; objects live under <trip_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-files', 'trip-files', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

create or replace function private.is_member_of_path(p_name text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
      then private.is_member(split_part(p_name, '/', 1)::uuid)
    else false
  end;
$$;
revoke all on function private.is_member_of_path(text) from public, anon;
grant execute on function private.is_member_of_path(text) to authenticated;

create policy trip_files_select_member on storage.objects for select to authenticated
  using (bucket_id = 'trip-files' and private.is_member_of_path(name));
create policy trip_files_insert_member on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-files' and private.is_member_of_path(name));
create policy trip_files_update_member on storage.objects for update to authenticated
  using (bucket_id = 'trip-files' and private.is_member_of_path(name))
  with check (bucket_id = 'trip-files' and private.is_member_of_path(name));
create policy trip_files_delete_member on storage.objects for delete to authenticated
  using (bucket_id = 'trip-files' and private.is_member_of_path(name));

-- (c) leave_trip(): the caller removes their own member row(s)
create or replace function public.leave_trip(p_trip uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_n int;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  delete from public.members m
   where m.user_id = v_uid and (p_trip is null or m.trip_id = p_trip);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.leave_trip(uuid) from public, anon;
grant execute on function public.leave_trip(uuid) to authenticated;

-- (d) applied separately as phase3a_guard_ticket_private_tombstones:
-- older app builds do not know ticketPrivate and would tombstone it; make that update a silent no-op.
-- Trigger name sorts after items_stamp so updated_at / updated_by stay untouched too.
create or replace function private.items_guard_ticket_private()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.collection = 'ticketPrivate' and new.deleted and not old.deleted then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.items_guard_ticket_private() from public, anon, authenticated;

drop trigger if exists zz_items_guard_ticket_private on public.items;
create trigger zz_items_guard_ticket_private
  before update on public.items
  for each row execute function private.items_guard_ticket_private();
