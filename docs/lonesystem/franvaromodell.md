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

**Steg 2 — en skrivare, en läsare (2026-09-18).**

1. `TYPINFO` i `app/ledighet/_components/tema.ts` täcker alla nio typer och
   `STATUSINFO` har `registrerad` — vidgat FÖRST, annars kraschar
   ansökningslistan på en rad den inte känner igen. Vad som går att ansöka om
   i vyn är fortfarande semester/ATK (`ANSOKBARA_TYPER`).
2. Morgonkortet skriver sjuk/VAB/föräldraledig som en rad med
   `status = 'registrerad'`, `kalla = 'morgonkort'` (`registreraFranvaro` i
   `lib/franvaro`). Ingen `arbetsdag`-rad skapas. En registrerad rad kan
   föraren inte själv ta bort (RLS: egen delete kräver `väntar`) — "arbete
   vinner" om dagen ändå blir arbetad, annars tar godkännare bort den.
3. Backfill (migration `20260918110000_franvaro_backfill_dagtyp.sql`): de två
   dagtyp-raderna (Martin 2026-05-10, Joacim 2026-08-19, båda sjuk) blir rader
   med `kalla = 'backfill'`. `arbetsdag` rörs inte.
4. Alla läsare går via `hamtaFranvaro`/`franvaroPerDatum` (godkänd +
   registrerad): lönen (`loneunderlag` → `loneberakning`), Arbetsrapportens
   kalender, Kontroll-steg, dagvy och Redigera (`franvaroDagar`), schemavyn
   (`useSchemaData`). `arbetsdag.dagtyp` läses inte längre som frånvarokälla;
   `DAGTYP_FRANVARO_LEGACY` finns bara så att de två gamla raderna (0 min,
   ingen tid) inte räknas som kortpass.
5. Inget raderat. `dagtyp` behåller sina värden.

**Bytesdag (inarbetad, §5 mom 4) — byggt 2026-09-21.**

- **Huvudvägen är Arbetsrapporten** (Martin: "jag jobbar onsdagen som är
  röd och är ledig fredagen i stället"). När föraren bekräftar en dag som är
  en röd vardag enligt `lib/roda-dagar` och som inte redan är bytt kommer
  frågan "Du jobbade Kristi himmelsfärd — vill du ta ledigt en annan dag i
  stället?" i samma sheet som rast- och passfrågorna. Ja → välj vardag (före
  eller efter, inom ett halvår) → samma inarbetad-rad, status väntar, Martin
  godkänner. Nej → inget händer. Frågan kommer EFTER skrivningen och
  blockerar aldrig bekräftelsen. Dagssammanfattningen visar sedan "Bytt mot
  ledig fredag 16 maj — väntar på godkännande". Fråga bara där svaret
  varierar: röda vardagar man jobbar är några om året.
- **Även i efterhand** (Martin: Kristi himmelsfärd 14 maj var redan
  bekräftad — de flesta bekräftar samma kväll). Dag-vyns väntar-kort visar
  en rad per arbetad röd vardag som inte fått något svar: "Kristi
  himmelsfärd 14 maj arbetad — byt mot ledig dag?", och Redigera har länken
  "Byt mot ledig dag" under röd dag-raden. Samma sheet. Villkor
  (`bytbaraRodaDagar`): röd vardag, arbetad, inget byte, inte avböjd, inom
  ett halvår bakåt — och **aldrig före skarp start** (2026-08-01). Martin
  2026-09-24: "det är kört, det är betalt och färdigt, det får vara nu och
  framåt" — gamla röda dagar är redan utbetalda. Samma golv i
  ledighetsvyns röda-dag-lista och i `bytesdagFel`; halvårsgränsen framåt
  för den lediga dagen står kvar. **Nej** sparas i `arbetsdag.bytesdag_avbojd_at`
  (migration `20260924100000`) så raden försvinner — samma mönster som
  brandriskfrågans svar; ett svar som ska gälla föraren och inte enheten
  hör hemma i databasen, inte i localStorage.
- **Reserv i Ledighet-vyn** för den som vill planera i förväg: typ
  *Inarbetad dag*, EN ledig vardag, och vilken röd vardag den ersätter —
  listan kommer ur `lib/roda-dagar` (samma källa som kalendern och
  helglönen), inom ett halvår, minus röda dagar personen redan bytt bort.
  Samma regler i båda vägarna (`bytesdagFel`). Migration `20260921100000`:
  en vardag mot en vardag, unik per person och röd dag (nekade räknas inte);
  olika personer kan byta samma dag.
- Kalendern: den lediga dagen visar ordet *Inarbetad*; Redigera säger vilken
  röd dag den ersätter. Den röda dagen visas som arbetad (prick) och Redigera
  säger "Röd dag (namn) — arbetad, byts mot ledig …. Ingen helglön."
- Lönen: den röda dagens timmar är ordinarie tid (vanlig arbetsdag i
  exporten) + söndagstillägg om beordrat (löneart OB öppen); den lediga dagen
  är ledighet utan avdrag och listas INTE under "Frånvaro (löneart ej
  fastställd)" utan som egen upplysningsrad; helglönen flyttas inte (den röda
  dagen är arbetad → ingen helglön, som förut). `byten` i
  `ExportSammanfattning`.
- Över månadsskifte: bytet syns i båda månadernas granskning. Den röda
  dagens arbetstid hämtas även utanför arbetsperioden.
- Om den lediga dagen ändå har arbete: "arbete vinner", raden flaggas som
  ledighetskollision + "bytet togs inte ut". Om den röda dagen saknar
  arbetstid: flaggas "inarbetningen saknas" — ingen automatisk omtypning,
  godkännare byter typ.

**Deldag (sjuk mitt på dagen) — byggt 2026-09-25.**

- Lagras som **klockslag** på ledighetsraden: `fran_tid`/`till_tid`
  (migration `20260925100000`), EN dag, bara typer som kan vara del av dag
  (sjuk, vab, foraldraledig, atk, komp, permission, tjanstledig — semester
  är hela dagar enligt semesterlagen, inarbetad alltid hel). Klockslaget är
  det föraren vet; timmarna **härleds** (`deldagTimmar` = schematimmar per
  dag − arbetade) och lagras aldrig.
- **Regeln "arbete vinner" gäller bara heldagsrader.** En heldagsfrånvaro
  på en arbetad dag är arbete, som förut. En deldagsrad betyder arbete PLUS
  frånvaro. Sagt i `lib/franvaro` där kartan byggs; `franvaroPerDatum` tar
  bara heldagar, `deldagarPerDatum` deldagar.
- **Registrering**: Dag-vyns frånvarokort blir "Åker hem" medan passet
  pågår och registrerar från nu. Reserv i Redigera ("Åkte hem sjuk, VAB
  eller föräldraledig?" med typ + klockslag, förvalt passets slut). Ingen
  fråga vid Bekräfta: 14 av 166 dagar sedan skarp start slutar före 13, och
  de är tidiga nattpass eller medvetna halvdagar — nej-andelen hade varit
  för hög.
- **Lönen** (§12 mom 3): dagen förblir arbetsdag; `deldagar` i
  `ExportSammanfattning` med härledda timmar mot `ordinarie_vecka_h / 5`,
  sagt som ANTAGANDE i granskningen tills schema beslutats (anm 2 = samma
  beslut som beräkningsperioden). Ingen lönerad. Ingen ledighetskollision
  för deldagar. Tredje frågan till löneansvarig: levereras sjukfrånvaro i
  timmar, och räknar Fortnox karens och 80 % själv?
- Kalendern: dagen visar arbete (prick); månadskortet och Kontroll-steget
  räknar "Sjukdag (del av dag)". Ledighetsvyn visar "Del av dag — från 11:30".

**Steg 3 — städning (2026-09-25).** Inget ställe läser `arbetsdag.dagtyp`
för frånvaro längre (kontrollerat: lön, årsövertid, kalender, Kontroll,
Min tid, granskningsvyn, ledighetsvyn — allt via `lib/franvaro`; dagtyp
förekommer bara som visningsetikett i granskningens dagrader och
tidsspecens PDF). `DAGTYP_FRANVARO_LEGACY` borttagen; en rad utan någon tid
räknas varken som arbetsdag eller kortpass. Det döda skärmparet
`bekräftaFrånvaro`/`klarFrånvaro` i Arbetsrapporten (skrev dagtyp, även atk
och semester, nåddes aldrig) borttaget. Migration `20260925110000`: de två
gamla raderna → `'normal'`, och `dagtyp` får sin första CHECK: bara
`Produktion` och `normal`. `arbetsdag.dagtyp` betyder bara "sorts
maskindag" igen.

Först efter steg 3: helglönens närvarokrav (§10 mom 4), frånvaro-avdrag i
årsövertidens bas, komp-avdrag, skoftning i lönen (inarbetad dag =
ordinarie, ingen övertid).

## Läsare (alla via lib/franvaro sedan steg 2)

- `lib/lonesystem/loneunderlag.ts` — `hamtaFranvaro` för arbetsperioden
- `components/arbetsrapport/Arbetsrapport.tsx` — `franvaroDagar` (år + kalendermånad)
- `app/ledighet/_components/useSchemaData.ts` — schemavyn (`FRANVARO_STATUS_GALLER`)
- `app/ledighet/_components/useLedighetData.ts` — ansökningslistan (alla rader, alla statusar)
- `app/components/Navigation.tsx` — räknar väntande (oförändrad)
