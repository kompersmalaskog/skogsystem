# Samlad frånvaromodell — plan i tre steg

Beslut 2026-09-17. Avtalstexten som ligger bakom står i
[skogsavtalet-arbetstid.md](skogsavtalet-arbetstid.md).

## Varför

Frånvaro bor på två ställen och två saker verksamheten gör saknar begrepp:

| Vad | Var det bor i dag | Problem |
|---|---|---|
| Sjuk, VAB, föräldraledig (morgonkortet) | `arbetsdag.dagtyp` | Kolumnen betyder också "sorts maskindag"; ingen CHECK; lönen läste den inte förrän #546 |
| Semester, ATK (ansökan) | `ledighet_ansokningar` | Bara två typer i CHECK |
| Kompensationsledighet (§8 mom 3, 1,4×) | ingenstans | 250-taket räknar komp som övertid fast avtalet säger nej (§5 mom 5 anm 3) |
| Utjämnad ordinarie tid (§5 mom 2; Gävle: 72–80 tim varannan vecka, tom vecka emellan, lön enligt schema) | `utjamningsperiod` (från 2026-09-18) | Utan markering ser tomma veckor ut som "ingen rapport" och beräkningsperioden blir en gissning |
| Byte av dag / skoftning (§5 mom 4) | ingenstans | Ledig fredag mot arbetad röd onsdag går inte att uttrycka |

Lön, kalender och Min tid måste i dag läsa båda källorna och slå ihop.

## Modellen

`ledighet_ansokningar` blir den enda frånvarotabellen. En rad = en period
(startdatum–slutdatum) för en medarbetare.

| Kolumn | Värden |
|---|---|
| `typ` | semester · atk · komp · sjuk · vab · foraldraledig · inarbetad · tjanstledig · permission |
| `status` | väntar · godkänd · nekad (ansökt) · registrerad (anmäld: sjuk/vab/föräldraledig) |
| `ersatter_datum` | bara för `inarbetad`: den arbetade dagen som den lediga byts mot |
| `kalla` | ansokan · morgonkort · admin · backfill |

Regler i CHECK: `inarbetad` kräver `ersatter_datum` och ingen annan typ får
ha det; bara sjuk/vab/foraldraledig får vara `registrerad`.

Komp är ett **saldo i timmar** (intjäning 1,4 × övertid, uttag som rader med
typ `komp`). Var saldot bor — Fortnox eller appen — är Martins beslut och
ligger utanför steg 1–3. Appen räknar aldrig kronor; ett saldo i timmar är en
mängd.

## Stegen

**Steg 1 — schemat (migration `20260917100000_franvaro_samlad_steg1.sql`).**
Vidgar CHECK på `typ` och `status`, lägger till `ersatter_datum` och `kalla`,
vidgar RLS så egen insert får vara `registrerad` för anmälningstyperna.
Ingen läsare ändras, ingen rad skrivs. Alla fem läsare filtrerar
`status = 'godkänd'` och får samma rader som förut. Martin kör migrationen.

**Steg 1 — delta.** Martin körde steg 1 i prod 2026-09-17 med egen SQL ur
rapporten. Jämfört mot migrationsfilen: typ, status, `ersatter_datum` och
båda spärrarna lika (spärrnamnen i filen rättade till prods). Två saker
återstår att köra i prod:

```sql
-- kalla: filen har NOT NULL DEFAULT 'ansokan' + CHECK; prod har nullable utan spärr
UPDATE ledighet_ansokningar SET kalla = 'ansokan' WHERE kalla IS NULL;
ALTER TABLE ledighet_ansokningar ALTER COLUMN kalla SET DEFAULT 'ansokan';
ALTER TABLE ledighet_ansokningar ALTER COLUMN kalla SET NOT NULL;
ALTER TABLE ledighet_ansokningar DROP CONSTRAINT IF EXISTS ledighet_ansokningar_kalla_check;
ALTER TABLE ledighet_ansokningar
  ADD CONSTRAINT ledighet_ansokningar_kalla_check CHECK (kalla IN ('ansokan', 'morgonkort', 'admin', 'backfill'));

-- RLS: morgonkortet (steg 2) ska få skriva egen rad som 'registrerad'
DROP POLICY IF EXISTS ledighet_insert_egen ON ledighet_ansokningar;
CREATE POLICY ledighet_insert_egen ON ledighet_ansokningar
  FOR INSERT TO authenticated
  WITH CHECK (
    medarbetare_id = aktuell_medarbetare_id()
    AND (status = 'väntar' OR (status = 'registrerad' AND typ IN ('sjuk', 'vab', 'foraldraledig')))
  );
```

Prods kolumnkommentar på `kalla` nämner värdena "forare, ansokan, admin,
fortnox"; koden använder `morgonkort` för förarens anmälan och har inget
`fortnox`-värde. Lägg till det i CHECK:en den dag något importeras därifrån.

**Steg 2 — morgonkortet skriver hit.** Sjuk/VAB/föräldraledig blir en rad
med `status = 'registrerad'`, `kalla = 'morgonkort'` i stället för
`arbetsdag.dagtyp`. Backfill av de rader som finns (två sjuk-rader
2026-09-17) med `kalla = 'backfill'`. Ledighetsvyn (`app/ledighet`) måste
tåla de nya typerna innan de dyker upp där: `TYPINFO` i `tema.ts` täcker bara
semester/atk och `useLedighetData` läser alla rader.

**Steg 3 — en läsare.** `lib/franvaro` får en funktion som läser EN källa
(godkänd + registrerad) och ger frånvaro per datum. Lön
(`loneunderlag`/`loneberakning`), Kalender, Min tid, Arbetsrapportens
`ledighetDagar` och ledighetsvyn byter till den. `FRANVARO_DAGTYPER_ALLA`
och dagtyp-läsningen tas bort. `arbetsdag.dagtyp` behåller sin andra
betydelse (sorts maskindag) tills den delas.

Först efter steg 3: helglönens närvarokrav (§10 mom 4), komp-avdrag i
årsövertiden, skoftning i lönen (inarbetad dag = ordinarie, ingen övertid).

## Läsare i dag (ändras i steg 3)

- `lib/lonesystem/loneunderlag.ts` — godkänd ledighet i arbetsperioden
- `components/arbetsrapport/Arbetsrapport.tsx` — `ledighetDagar` för kalendern
- `app/ledighet/_components/useSchemaData.ts` — schemavyn
- `app/ledighet/_components/useLedighetData.ts` — ansökningslistan (alla rader)
- `app/components/Navigation.tsx` — räknar väntande
