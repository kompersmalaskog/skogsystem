-- Riskbedömning per maskintyp: vilka risker är MINDRE allvarliga (AFS 2023:1 11 §: dokumentationen ska säga om riskerna är allvarliga).
-- Allt som inte står här är allvarligt. Nycklarna är katalogens (t.ex. 'skak') och 'egen:<id>' för egna risker (lib/arbetsmiljo/maskinRisk.ts).
-- Additiv: befintliga rader får en tom lista, och appen klarar sig utan kolumnen (allt läses som allvarligt, valet sparas inte).
alter table public.am_riskbedomning add column if not exists mindre text[] not null default '{}'::text[];
