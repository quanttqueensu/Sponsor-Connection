-- Cap new objects at the same sizes the app already enforces, and refuse
-- MIME types the hub never stores.
--
-- App-layer magic-byte checks in lib/files.ts are the real control: storage
-- only sees the Content-Type header, which the client can still spoof as
-- application/pdf while uploading HTML. This still blocks a direct Storage
-- API upload that claims text/html, image/svg+xml, application/javascript,
-- etc. Existing objects are not re-validated on read, so historical files
-- keep serving.
--
-- Idempotent: safe to re-run.

update storage.buckets
set
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf']
where id = 'resumes';

update storage.buckets
set
  file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'photos';
