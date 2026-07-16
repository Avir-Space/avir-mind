-- 0105: task-attachments storage bucket + org-scoped RLS.
-- Objects are stored under `<org_id>/<task_id>/<filename>`, so the first path
-- segment is the org id — policies gate on is_org_member() of that segment.

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;

create policy "task attachments readable by org members"
  on storage.objects for select
  using (
    bucket_id = 'task-attachments'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "task attachments insertable by org members"
  on storage.objects for insert
  with check (
    bucket_id = 'task-attachments'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

create policy "task attachments deletable by org members"
  on storage.objects for delete
  using (
    bucket_id = 'task-attachments'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );
