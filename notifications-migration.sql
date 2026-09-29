-- BrightFuture School Management: notifications
-- Run this migration in Supabase SQL Editor before using the Notifications tab.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  audience text not null default 'individual' check (audience in ('all_teachers','individual')),
  recipient_id uuid null references auth.users(id) on delete cascade,
  sender_name text null,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create index if not exists notifications_recipient_idx on public.notifications(recipient_id);
create index if not exists notifications_created_idx on public.notifications(created_at desc);
create index if not exists notification_reads_user_idx on public.notification_reads(user_id);

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;

-- Helper: only school administrators can create notices.
drop policy if exists notifications_admin_insert on public.notifications;
create policy notifications_admin_insert on public.notifications
for insert to authenticated
with check (exists (
  select 1 from public.staff_profiles sp
  where sp.id = auth.uid() and sp.role in ('Head Teacher','Deputy Head Teacher')
));

-- Administrators can see all notices; teachers see notices addressed to them
-- individually or notices sent to all teachers.
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications
for select to authenticated
using (
  exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.role in ('Head Teacher','Deputy Head Teacher'))
  or recipient_id = auth.uid()
  or (audience='all_teachers' and exists (select 1 from public.staff_profiles sp where sp.id=auth.uid() and sp.role in ('Class Teacher','Subject Teacher')))
);

drop policy if exists notification_reads_select on public.notification_reads;
create policy notification_reads_select on public.notification_reads
for select to authenticated using (user_id = auth.uid());

drop policy if exists notification_reads_insert on public.notification_reads;
create policy notification_reads_insert on public.notification_reads
for insert to authenticated with check (user_id = auth.uid());

drop policy if exists notification_reads_update on public.notification_reads;
create policy notification_reads_update on public.notification_reads
for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
