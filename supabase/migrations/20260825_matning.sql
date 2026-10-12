-- Mätvyn steg 1 — relaskopmätning av kvarvarande grundyta efter gallring.
--
-- ETT TRÄD PER RAD, inte jsonb.
--
-- Spridningen mellan punkter är kvalitetsmåttet: den säger om mätningen är
-- att lita på eller om någon punkt är feltagen. Ligger träden i en jsonb-
-- klump går varken spridning eller medel per trädslag att räkna i SQL utan
-- att först plocka isär den i applikationen — och då kan två vyer plocka
-- isär den olika. Tre tabeller kostar några rader mer och gör varje fråga
-- till vanlig SQL.
--
--   grundyta för en punkt  = antal träd × relaskop_faktor
--   spridning i en mätning = stddev över punkternas grundytor
--   fördelning per trädslag = group by tradslag
--
-- ── VAD SOM FRYSES I MÄTNINGEN ────────────────────────────────────────────
-- relaskop_faktor OCH synfalt_grader skrivs in på mätningen, inte bara i en
-- inställning. Kalibreringen kan göras om, telefonen kan bytas — men en
-- mätning måste gå att tolka om tio år med de värden som faktiskt gällde när
-- den gjordes. Utan synfältet är prickarnas bäringar inte rekonstruerbara.

create table if not exists matning (
  id                uuid primary key default gen_random_uuid(),
  objekt_id         text not null,
  datum             date not null default current_date,
  utforare          uuid references medarbetare(id) on delete set null,

  -- Relaskopets faktor. 1 = 1:50. Styr både cirkelns vinkel och grundytan.
  relaskop_faktor   numeric(4,2) not null default 1,

  -- Kamerans kalibrerade horisontella synfält i grader. Utan detta går
  -- prickarnas lägen inte att räkna om i efterhand.
  synfalt_grader    numeric(5,2) not null,

  -- Fritext från kalibreringen: vilken telefon, så avvikelser går att spåra.
  enhet             text,

  avslutad          timestamptz,
  skapad            timestamptz not null default now(),
  uppdaterad        timestamptz not null default now()
);

comment on column matning.synfalt_grader is
  'Kalibrerat horisontellt synfält. Fryst per mätning — kalibreringen kan '
  'göras om, men en gammal mätning ska gå att tolka med de värden som gällde då.';

create table if not exists matning_punkt (
  id                uuid primary key default gen_random_uuid(),
  matning_id        uuid not null references matning(id) on delete cascade,

  -- Punktens nummer i mätningen, 1..n. Lottas en gång av lottaProvytor.
  punkt_nummer      int not null,

  -- Var punkten LOTTADES.
  lat               double precision,
  lng               double precision,

  -- Var Martin FAKTISKT stod när han mätte, och hur säker GPS:en var.
  -- Skilt från det lottade läget: under krontak är GPS 5-15 m, och att
  -- låtsas att han stod exakt på punkten vore en tyst lögn.
  matt_lat          double precision,
  matt_lng          double precision,
  gps_noggrannhet_m double precision,

  -- Hur långt varvet faktiskt gick, i grader. Under ~330 är varvet inte
  -- slutet och grundytan är en underskattning — det ska synas, inte döljas.
  varv_grader       numeric(6,2),

  matt_tid          timestamptz,
  skapad            timestamptz not null default now(),

  unique (matning_id, punkt_nummer)
);

comment on column matning_punkt.varv_grader is
  'Hur långt varvet gick. Under ~330 grader är varvet inte slutet och '
  'grundytan underskattad. Sparas för att en ofullständig punkt ska kunna '
  'kännas igen i efterhand.';

create table if not exists matning_trad (
  id                uuid primary key default gen_random_uuid(),
  punkt_id          uuid not null references matning_punkt(id) on delete cascade,

  -- Normaliserat namn ur lib/tradslag.ts: Tall, Gran, Björk, Övrigt löv.
  tradslag          text not null,

  -- Var trädet står, sett från punkten. Bäring 0 = norr, medurs.
  baring            numeric(6,2) not null,
  hojdvinkel        numeric(6,2) not null,

  -- I vilken ordning trädet trycktes under varvet. Behövs för att kunna
  -- fördela driftkorrigeringen i efterhand om ett varv räknas om.
  ordning           int not null,

  skapad            timestamptz not null default now()
);

create index if not exists matning_objekt_idx on matning (objekt_id, datum desc);
create index if not exists matning_punkt_matning_idx on matning_punkt (matning_id);
create index if not exists matning_trad_punkt_idx on matning_trad (punkt_id);

-- ── RLS ───────────────────────────────────────────────────────────────────
-- Mätningarna är arbetsdata, inte känsliga personuppgifter, men tabellerna
-- ska ändå inte vara öppna för anon. Samma nivå som övriga fakta-tabeller:
-- inloggad läser och skriver.
alter table matning       enable row level security;
alter table matning_punkt enable row level security;
alter table matning_trad  enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'matning' and policyname = 'matning_inloggad') then
    create policy matning_inloggad on matning
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'matning_punkt' and policyname = 'matning_punkt_inloggad') then
    create policy matning_punkt_inloggad on matning_punkt
      for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'matning_trad' and policyname = 'matning_trad_inloggad') then
    create policy matning_trad_inloggad on matning_trad
      for all to authenticated using (true) with check (true);
  end if;
end $$;
