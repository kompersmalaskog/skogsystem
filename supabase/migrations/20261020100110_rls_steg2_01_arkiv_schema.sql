-- RLS-granskning steg 2a: ett eget schema för backup-/testtabeller utan anon-grants. Inget raderas.
create schema if not exists arkiv;
revoke all on schema arkiv from public, anon, authenticated;