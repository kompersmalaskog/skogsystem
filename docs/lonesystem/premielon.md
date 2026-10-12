# Premielön (lönearter 1354 skotare / 1355 skördare)

**Premielönen är företagets egen konstruktion. Den står inte i Skogsavtalet.**
Avtalstexten som finns återgiven i `skogsavtalet-arbetstid.md` nämner ingen
premielön, och Martin bekräftade 2026-09-29 att den inte finns i avtalet —
lönearterna 1354/1355 finns bara i Fortnox hos oss. Leta inte efter en
paragraf; det finns ingen. Regeln nedan är ett **arbetsgivarbeslut**, och
ändras den är det Martin som ändrar den.

## Regeln (Martins beslut 2026-09-29)

> Premielön ska vara samma på alla timmar. Annars blir det ett levande, och
> det är svårt att få dem att ställa upp på t.ex. att flytta en bil åt en
> kollega. Ingen ska tappa pengar på att göra något annat än att sitta i
> maskinen.

Alltså premie på **alla arbeten**: maskintid, planering, manuellt arbete,
service, möten, flyttar. Ingen aktivitet är undantagen.

Så räknas den (`lib/lonesystem/loneberakning.ts`):

| | |
|---|---|
| **Premietimmar** | = timlönetimmarna (ordinarie 8 tim × arbetsdagar + kortpass, som mest hela arbetstiden). **Övertid ger ingen premie**, som förr. |
| **Fördelning skördare/skotare** | efter månadens andel maskintid på dagar med typad maskin. 120 tim skördare + 40 tim skotare → 75 % av premietimmarna på 1355, 25 % på 1354. |
| **Ingen maskintid i månaden** | typen på förarens maskin på medarbetarraden (`medarbetare.maskin_id` → `maskiner.typ`). |
| **Ingen maskin där heller** | ingen premie, och en varning i granskningen och i förarens spec: "Sätt förarens maskin i admin." |

Summan av 1354 + 1355 är alltid exakt lika med timlönetimmarna (den ena
avrundas, den andra tar resten).

## Varför regeln byttes

Fram till 2026-09-29 räknades premien bara på maskintid, som mest ordinarie,
fördelad på maskintidens andel per typ. Två saker gick fel tyst:

- **En dag utan `maskin_id`** räknades i basen men hörde till ingen typ, så
  dess timmar tappade premien. Martin september 2026: fyra dagar, 19,96 tim.
  Max Karlsson samma månad: en dag, 7 tim.
- **Extra tid** (arbete när maskinen var av) gav aldrig premie.

Koden bar en kommentar om att premien var "fryst till maskintid tills
premie-vs-extra-tid-avtalet är utrett". Det var aldrig en avtalsfråga —
frågan var arbetsgivarens, och den är nu beslutad.

## Konsekvenser att känna till

- **Joacim** (planering, kör sällan) får premie på sina planeringstimmar —
  det är Martins uttryckliga beslut. Men han saknar maskin på sin
  medarbetarrad: en månad utan en enda maskindag ger honom då *ingen* premie
  och varningen ovan. Martin sätter en maskin på hans rad, annars faller
  timmarna bort.
- En förare som kör två maskintyper får premien blandad efter månadens
  faktiska fördelning, även på timmarna utanför maskinen.
- Kortpass (under 60 min maskintid) ger premie eftersom de är timlön.
