-- Applied directly to the live Supabase project (nravzlpapxolmzgjqwws) via
-- the Supabase MCP connector on this date. Kept here for the repo record.
--
-- Adds an independent "Admin" superuser role, plus Clerk, Receptionist,
-- Librarian, and Subordinate Staff. Narrows Head Teacher / Deputy Head
-- Teacher out of Fees, HR/Payroll, and School Setup (Admin + Clerk /
-- Admin-only respectively), while keeping their access to everything
-- else (Dashboard, Students, Attendance incl. staff attendance, Grades,
-- Exams, Timetable, Notifications, Resources, Communication, Events,
-- Staff). Adds a `designation` column for Subordinate Staff (Cook,
-- Groundsman, Other), and two new feature areas: Front Office (visitors)
-- for Receptionist, and Library (books + issue/return) for Librarian.

alter table public.staff_profiles add column if not exists designation text;

alter policy "head teacher full access attendance" on public.attendance
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher manages class grading assignment" on public.class_grading_assignment
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "class_subject_teachers_admin_write" on public.class_subject_teachers
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "admins can delete events" on public.events
  using (exists (select 1 from staff_profiles s where s.id = auth.uid() and s.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "admins can insert events" on public.events
  with check (exists (select 1 from staff_profiles s where s.id = auth.uid() and s.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "head teacher manages exams" on public.exams
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher full access grades" on public.grades
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher manages grading levels" on public.grading_levels
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher full access marks" on public.marks
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "notifications_admin_delete" on public.notifications
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "head teacher full access report remarks" on public.report_remarks
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher full access staff attendance" on public.staff_attendance
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher can delete staff profile" on public.staff_profiles
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "head teacher can update any staff profile" on public.staff_profiles
  using (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']))
  with check (my_staff_role() = any (array['Head Teacher','Deputy Head Teacher','Admin']));

alter policy "timetable_entries_admin_write" on public.timetable_entries
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "timetable_settings_admin_write" on public.timetable_settings
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "sms_messages_admin_only" on public.sms_messages
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Admin'])));

alter policy "head teacher manages classes" on public.classes
  using (my_staff_role() = any (array['Admin']))
  with check (my_staff_role() = any (array['Admin']));

alter policy "head teacher manages subjects" on public.subjects
  using (my_staff_role() = any (array['Admin']))
  with check (my_staff_role() = any (array['Admin']));

alter policy "head teacher manages settings" on public.school_settings
  using (my_staff_role() = any (array['Admin']))
  with check (my_staff_role() = any (array['Admin']));

alter policy "head teacher manages fee structure" on public.fee_structure
  using (my_staff_role() = any (array['Admin','Clerk']))
  with check (my_staff_role() = any (array['Admin','Clerk']));
create policy "staff can view fee structure" on public.fee_structure for select using (true);

alter policy "head teacher manages payments" on public.payments
  using (my_staff_role() = any (array['Admin','Clerk']))
  with check (my_staff_role() = any (array['Admin','Clerk']));
create policy "staff can view payments" on public.payments for select using (true);

alter policy "expenditures_admin_only" on public.expenditures
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])));

alter policy "payroll_settings_admin_only" on public.payroll_settings
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])));

alter policy "payslips_admin_only" on public.payslips
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])));

alter policy "staff_payroll_admin_only" on public.staff_payroll
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])));

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_name text not null,
  reason text not null,
  visit_date date not null default current_date,
  comments text,
  recorded_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
alter table public.visitors enable row level security;
create policy "front_office_full_access" on public.visitors
  for all
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Receptionist'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Receptionist'])));

create table if not exists public.library_books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text,
  isbn text,
  category text,
  total_copies integer not null default 1,
  available_copies integer not null default 1,
  added_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
alter table public.library_books enable row level security;
create policy "library_full_access_books" on public.library_books
  for all
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Librarian'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Librarian'])));

create table if not exists public.book_issues (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.library_books(id) on delete cascade,
  borrower_name text not null,
  borrower_class text,
  issued_date date not null default current_date,
  due_date date,
  returned_date date,
  status text not null default 'Issued' check (status in ('Issued','Returned','Overdue')),
  issued_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
alter table public.book_issues enable row level security;
create policy "library_full_access_issues" on public.book_issues
  for all
  using (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Librarian'])))
  with check (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Librarian'])));

-- Current term is now editable from School Settings instead of hardcoded.
ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS current_term text DEFAULT 'Term 2';
UPDATE school_settings SET current_term = 'Term 2' WHERE id = 1 AND current_term IS NULL;

-- Multi-item receipts: payments made together (e.g. transport + tuition in
-- one receipt) share a batch_id so they can be reprinted as one receipt.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS batch_id text;
CREATE INDEX IF NOT EXISTS payments_batch_id_idx ON payments (batch_id);

-- Inter-account borrowing: when an expenditure would overdraw an account,
-- Admin/Clerk can borrow the shortfall from another account with funds and
-- repay it later. account_loans tracks each loan and how much of it is
-- still outstanding (amount - repaid_amount).
CREATE TABLE IF NOT EXISTS account_loans (
  id bigint generated always as identity primary key,
  from_account text not null,
  to_account text not null,
  amount numeric not null,
  date date not null default current_date,
  description text,
  repaid_amount numeric not null default 0,
  recorded_by text,
  created_at timestamptz not null default now()
);

ALTER TABLE account_loans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "account_loans_admin_only" ON account_loans
  FOR ALL
  USING (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])))
  WITH CHECK (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Clerk'])));

-- Front Office: follow-up tracking on visitors, plus a separate
-- appointments book (who, when, purpose).
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS follow_up text;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS follow_up_date date;
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS reminder_date date;

CREATE TABLE IF NOT EXISTS appointments (
  id uuid primary key default gen_random_uuid(),
  with_whom text not null,
  purpose text,
  appointment_date date not null default current_date,
  appointment_time time,
  notes text,
  recorded_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "front_office_full_access_appointments" ON appointments
  FOR ALL
  USING (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Receptionist'])))
  WITH CHECK (exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Receptionist'])));

-- Library: book cover photo, a due-date reminder separate from the due date
-- itself, and linking a loan to an actual student or staff record (or just
-- a class name, for a whole-class loan) instead of free-text only.
ALTER TABLE library_books ADD COLUMN IF NOT EXISTS cover_url text;

ALTER TABLE book_issues
  ADD COLUMN IF NOT EXISTS borrower_type text NOT NULL DEFAULT 'Student',
  ADD COLUMN IF NOT EXISTS student_id integer REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES public.staff_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reminder_date date;
