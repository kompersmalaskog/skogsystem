-- RLS-granskning steg 3: objekt. Policyerna (insert/read/update för inloggade, objekt_admin ALL via ar_admin()) fanns redan men var verkningslösa eftersom RLS var av.
alter table public.objekt enable row level security;
revoke all on public.objekt from anon;