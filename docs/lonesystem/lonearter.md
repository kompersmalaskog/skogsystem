# Lönearter → Fortnox

Appen skickar bara **antal** (timmar, veckor, mil) till Fortnox, aldrig kronor. Belopp, satser och löneökningar ligger i Fortnox lönearter.
Det här dokumentet beskriver vilken löneart i appen som blir vilken löneart i Fortnox, och vad som händer när kopplingen saknas.

## En sanning

| Vad | Var det bor |
|---|---|
| Vilka lönearter appen kan skicka, deras namn, enhet och förklaring | `lib/lonesystem/loneart.ts` (`LONEARTER`). Hör till lönearten, aldrig till en kod. |
| Vilken **kod** och vilket **namn i Fortnox** varje löneart har | Databasen: `lonesystem_artikelmappning` (`intern_typ` = löneartens nyckel, `extern_kod`, `beskrivning` = namnet i Fortnox). Redigeras under **Lön → Lönearter**. |

Koder står ingenstans i koden utom i `lib/lonesystem/testKoder.ts` (bara för tester) och i testfixturerna. Byter bolaget kod ändras
bara databasen. Inte multi-tenant än: en koppling (`lonesystem_koppling`, `system_typ = 'fortnox'`).

## Lönearterna

| Nyckel | Heter | Enhet | Frivillig | Vad den är |
|---|---|---|---|---|
| `timlon` | Timlön | tim | nej | Arbetade dagar × 8 (plus kortpass). |
| `premielon_skordare` | Premielön skördare | tim | **ja** | Premie på timlönetimmarna, för tid på skördare (`docs/lonesystem/premielon.md`). |
| `premielon_skotare` | Premielön skotare | tim | **ja** | Samma, för skotare. |
| `overtid_skordare` | Övertid skördare | tim | nej | Timmar utöver arbetade dagar × 8, när månaden mest var skördare. |
| `overtid_skotare` | Övertid skotare | tim | nej | Samma, för skotare. |
| `valtlappar` | Vältlappar | veckor | nej | Veckor med minst en arbetsdag. |
| `korersattning` | Reseersättning | mil | nej | Körning med företagets bil: påbörjade mil över gränsen per dag (`gs_avtal.km_grans_per_dag`). Inte egen bil. |
| `helglon_skordare` | Helglön skördare | tim | nej | 8 tim per röd vardag, för förare som mest kör skördare (månadens dominerande maskintyp, som övertiden; annars typen på medarbetarraden). Se "Helglön" nedan. |
| `helglon_skotare` | Helglön skotare | tim | nej | Samma, för skotare. |
| `brandrisk_ob` | Brandrisk – OB | tim | nej | Alla beordrade timmar vid brandrisk, vardagsmorgon: start → 06:30. EN rad (företagets praxis, över avtalets minimum); Martin kopplar den till Fortnox 147. **Tom kod som standard.** |

### Dagens koppling i prod (data, 2026-10-15; ändras under Lön → Lönearter)

`timlon` = 11, `premielon_skordare` = 1355, `premielon_skotare` = 1354, `overtid_skordare` = 1435, `overtid_skotare` = 1436, `valtlappar` = 136,
`korersattning` = 821. `helglon_skordare` och `helglon_skotare` har **ingen** rad (Ej kopplad). Fortnox har dem som 1461 "Helglön, timmar"
(skördare) och 1462 "Helglön, timmar 2" (skotare); koden fylls i under Lön → Lönearter när Martin bestämt. Den gamla nyckeln `helglon` finns inte längre.

## OB: bara brandrisk, EN rad (beslut Martin 2026-10-15)

Enkelskift på alla maskiner → en tidig start är förarens eget val. **OB betalas bara vid beordrad brandrisk, vardagsmorgon**; kväll, lördag,
söndag och helgdag byggs inte, varken nu eller senare (står i CLAUDE.md så ingen bygger det). **Brandrisk-OB betalas som en rad på alla beordrade timmar
(företagets praxis, över avtalets minimum) — dela inte upp i nattillägg.** Räkningen ligger i `lib/ob.ts` (`brandriskSumma`) och läser
`arbetsdag.start_tid` + `arbetsdag.brandrisk_beordrad`; `beräknaExport` lägger raden `brandrisk_ob` när timmarna är > 0. Exakta minuter, två decimaler först i
slutsumman. Facit augusti 2026: Stefan **10,30** tim (618 min, 12–14 aug start 03:05/03:00/03:07), Oskar 14,42, Max 7,08, Daniel 1,27, Martin 7,00.
Lönehanterarens handinlagda 147 (Stefan 10,20, Oskar 14,00, Max 7,00, Daniel 1,50) var avrundat för hand, åt båda hållen.

Avtalet (bucket-PDF:en `f5b40c12-….pdf` är Arbetsgivarnytt april 2025, bara ändrade paragrafer + bilagor): § 5 mom 5 definierar obekväm tid; § 8 mom 1 /
bilaga 4 har fyra OB-slag (mån–fre 00–06:30 och 17–24, lördag, söndag, nattarbete vid brandrisk 00–05). Att OB kräver *beordrat* arbete, att OB utgår
dessutom vid övertid och att brandrisk-OB utges utöver ordinarie OB står i 2023–2026-boken (`skogsavtalet-arbetstid.md`), inte i bucket-PDF:en. Avtalets
nattillägg 00:00–05:00 betalas inte som egen rad hos oss (EN rad, praxis).

## Tom kod

Tom kod = ingen rad skickas. Det syns alltid; appen gissar aldrig en löneart.

- **Vanlig löneart utan kod, och ett antal finns:** raden är **röd** i förhandsvisningen ("Saknar löneart — raden skickas inte"). En skarp sändning
  **stoppas** (HTTP 409, `kod: "LONEART_SAKNAS"`, `blockerande`) innan en enda rad gått iväg.
- **Admin kan uttryckligen välja "Skicka utan dessa rader"** (ett andra steg i bekräftelsen som listar vad som uteblir; begäran bär
  `skicka_utan_saknade: true`, och bara det booleska `true` räknas). Svaret säger vilka rader som uteblev (`utelamnade`). De läggs inte på
  av sig själva efteråt, och en förare som är skickad skickas inte om.
- **Frivillig löneart (premielönen) utan kod:** raden hoppas över med en varning ("Hoppas över") och stoppar ingenting.
- **Inget antal:** ingen rad, ingen varning. Helglön i en månad utan röda vardagar blockerar alltså inte.

Samma lista (`blockerandeLonearter` i `lib/lonesystem/loneartSaknas.ts`) används av exportroutens stopp och av förhandsvisningen, så de kan
inte säga olika.

## Förhandsvisningen

**Lön → Löneunderlag** visar per förare, rad för rad: vad, löneart (kod + namn i Fortnox), antal, enhet. Det är `dry_run` i
`POST /api/fortnox/salary-export` — samma kodväg som den skarpa sändningen.

Månaden väljs med pilarna eller i adressen: `/admin?flik=lon&underflik=underlag&period=2026-10`. **Perioden är LÖNEPERIODEN**, en månad efter
arbetstiden: `period=2026-10` är arbetstid **september 2026**, `period=2026-09` är arbetstid augusti 2026. Sidan skriver båda ("Löneperiod oktober
2026 — arbetstid september 2026").

## Lönearter som inte finns än (underlag saknas)

Sjuktimmar, VAB-timmar och semesterdagar är **inte** byggda. Appen har inte underlaget för dem:

- Frånvaron expanderas från start- till slutdatum över **alla kalenderdagar** (`beräknaExport`, "heldagsrader"). Semester fredag–måndag räknas som
  4 dagar inklusive lördag och söndag (provat). En semesterdag i Fortnox är en arbetsdag; helger och röda dagar ska bort. Den räkningen finns inte.
- Sjuk och VAB är **dagar** (heldag) eller en härledd deldag i timmar. Timmarna per dag är ett **antagande** (8 tim/dag mot `ordinarie_vecka_h`)
  tills schemat är beslutat (§12 mom 3 anm 2), och frågan "levereras sjukfrånvaro i timmar och räknar Fortnox karens och 80 % själv?" ligger hos
  löneansvarig (kortet "Att ta med löneansvarig" i förhandsvisningen).

Traktamente byggs inte.

## Helglön (2026-10-17)

**Varje röd vardag ger 8 tim helglön — företagets praxis, över avtalets minimum.** §10 mom 2 ("de arbetstimmar som bortfaller") tillämpas inte.
Arbetad röd dag: vanlig lön för timmarna + helglön, inget söndagstillägg. Facit: Fortnox dec 2025 (32 tim) och jan 2026 (16 tim) för Stefan,
Oskar, Daniel och Max — Oskar arbetade trettondagen och fick ändå 16. `lib/lonesystem/helglon.facit.test.ts` kör hela vägen databas → rader.

| Fråga | Regel |
|---|---|
| Vilka dagar | De tolv i `gs_avtal.helglon_dagar`, bara måndag–fredag (`lib/roda-dagar`). |
| På själva dagen | Sjuk, VAB, föräldraledig eller tjänstledig bryter (mom 4: sjukpenning/föräldrapenning, sjuklön dag 1–14, tjänstledighet). En deldag ("del av dag") bryter också. En heldagsrad på en dag med arbete gör det inte: arbete vinner. |
| Dagen före/efter | Bara **tjänstledig** bryter, på närmaste vardag som inte är röd dag, före eller efter (hoppar över helger och andra röda dagar, även över månadsskiftet). Semester, ATK, komp, permission, sjuk, VAB och föräldraledig bryter inte. |
| Kvalifikationstid (mom 3) | Ingen helglön före anställningsdatum + 3 månader. **Saknas datum betalas helglönen och beräkningen varnar** ("Anställningsdatum saknas"). Aldrig en gissning ur första arbetsdagen (Daniels första dag i appen är 3 dec 2025, men han fick full helglön i dec). |
| Löneart | `helglon_skordare` / `helglon_skotare` efter månadens dominerande maskintyp; lika → skördare; ingen maskintid → typen på medarbetarraden; ingen alls → ingen rad + varning "Ingen helglön skickas". |

Inte byggt (underlag saknas): olovlig frånvaro (ingen frånvarotyp — en dag utan rad är "okänt", inte "olovligt"), återanställning inom fyra
månader (mom 3), ledighet över fyra veckor med tillfälligt arbete (mom 4), fackliga kurser över en vecka (mom 4). Trettiodagarsregeln (mom 4)
ger ingen egen effekt: sjuk, VAB, föräldraledig och tjänstledig stoppar redan helglönen på dagen eller omger den, och semester/ATK/komp är
intjänade och bryter aldrig.

Varje röd dag bär `ger` + `skal` (`betalas`, `betalas_arbetad`, `sjuk`, `vab`, `foraldraledig`, `tjanstledig`, `tjanstledig_omger`,
`kvalifikationstid`). Min månad visar orsaken i förarens ord; Löneunderlag visar den för admin.

## Företagsledare

`medarbetare.foretagsledare = true` (Martin, Joacim): **inga lönerader alls**, varken i exporten eller förhandsvisningen. De står kvar i
listorna med "Företagsledare – lön utanför appen", skickas aldrig, loggas aldrig i `fortnox_export_logg`, saknar inte anställningsnummer
och blockerar ingen sändning. Min månad och PDF:en säger samma sak i stället för lönerader. Arbetsdagar och kontrollinformation finns kvar.

## Öppna frågor till löneansvarig (koden är inte ändrad)

- **821** heter i Fortnox "Milersättning skattefri, enl avtal". Reseersättning i appen är körning med **företagets** bil. Passar 821 för det? I databasen
  står namnet "Körersättning skattefri".
- **Helglön:** besvarad 2026-10-17 — skördare 1461 "Helglön, timmar", skotare 1462 "Helglön, timmar 2" (läst ur Fortnox). Koden är ännu inte ifylld i appen.
- **811** "Traktamente inrikes, skattefri" — traktamente är inte byggt.

## Bevis

- `lib/lonesystem/septemberbytediff.test.ts`: produktionens augusti–september 2026 (pseudonymiserat, `testdata/sep2026.json`) körs genom nya koden och jämförs
  **byte för byte** med utskriften från den gamla koden (`testdata/sep2026.gammal.json`, fryst) med dagens sju koder. Med företagsledarflaggan på
  Förare 2 (Joacim) och Förare 3 (Martin) är alla andra förare oförändrade och exakt 5 respektive 3 rader försvinner (testet räknar upp dem).
- `lib/lonesystem/helglon.facit.test.ts`: Fortnox-facit dec 2025 / jan 2026 (32 / 16 tim) för Stefan, Oskar, Daniel och Max, kvalifikationstid för en
  nyanställd, och 0 rader för Martin och Joacim. `helglon.narvaro.test.ts`: närvarokravet dag för dag.
- Mutationskontroll: `node scripts/mutationskontroll-lonearter.mjs` (beräkning, export, förarens text), `node scripts/mutationskontroll-helglon.mjs`
  (närvarokrav, kvalifikationstid, maskintyp, företagsledare) och `node scripts/mutationskontroll-lonearter-ui.mjs` (Lönearter-sidan och
  förhandsvisningen). EN tung körning åt gången.
- Migration: `supabase/migrations/20261015094150_lonearter_mappning_som_i_prod.sql` beskriver prods schema för `lonesystem_artikelmappning`
  (`lonesystem_id`, `skapad`, unikt `(lonesystem_id, intern_typ)`). Alla satser är no-op i prod; inget data ändras.
