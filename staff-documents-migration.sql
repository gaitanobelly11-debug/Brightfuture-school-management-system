-- Staff document attachments: Admin / Head Teacher / Deputy attach PDFs for
-- one staff member, all teachers, or all staff. Files live in a PRIVATE
-- storage bucket; only the addressed people (and admins) can read them.
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  file_path text not null unique,
  file_name text not null,
  audience text not null default 'person',   -- 'person' | 'all_teachers' | 'all_staff'
  recipient_id uuid references public.staff_profiles(id) on delete cascade,
  uploaded_by uuid references public.staff_profiles(id),
  created_at timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS staff_documents_recipient_idx ON public.staff_documents (recipient_id);
ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_school_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Admin','Head Teacher','Deputy Head Teacher']));
$$;

CREATE OR REPLACE FUNCTION public.can_view_staff_document(p_audience text, p_recipient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select p_recipient = auth.uid()
      or p_audience = 'all_staff'
      or (p_audience = 'all_teachers' and exists (select 1 from staff_profiles sp where sp.id = auth.uid() and sp.role = any (array['Head Teacher','Deputy Head Teacher','Class Teacher','Subject Teacher'])));
$$;

CREATE OR REPLACE FUNCTION public.can_view_staff_document_file(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  select exists (select 1 from staff_documents d where d.file_path = p_path and public.can_view_staff_document(d.audience, d.recipient_id));
$$;

CREATE POLICY "staff_documents_admin_all" ON public.staff_documents FOR ALL
  USING (public.is_school_admin()) WITH CHECK (public.is_school_admin());
CREATE POLICY "staff_documents_read_own" ON public.staff_documents FOR SELECT
  USING (public.can_view_staff_document(audience, recipient_id));

-- Private bucket for the PDFs (10 MB limit, PDF only).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('staff-documents', 'staff-documents', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "staff_docs_admin_insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'staff-documents' and public.is_school_admin());
CREATE POLICY "staff_docs_admin_delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'staff-documents' and public.is_school_admin());
CREATE POLICY "staff_docs_read" ON storage.objects FOR SELECT
  USING (bucket_id = 'staff-documents' and (public.is_school_admin() or public.can_view_staff_document_file(name)));
