# Skogsavtalet — arbetstid, övertid, komp, helglön (ordagrant)

Kollektivavtal arbetare skog, GS-facket / Gröna arbetsgivare, avtalsperiod
2023-04-01 – 2026-03-31. Källa: GS-fackets avtalsbok, 102 sidor:

<https://www.gsfacket.se/globalassets/dokument/avtalsbocker/avtalsbocker-2023-2026/1252065-kollektivavtal-arbetare-skog-102s.pdf>

Textutdrag gjort 2026-09-17 med pdf-parse. Sidnummer = bokens tryckta
sidor. 2025–2027-avtalet (medlemslåst) höjde beloppen; texten i §5, §8 och
§10 antas oförändrad tills någon läst den nya boken. Beloppen nedan står
kvar bara för att citaten ska vara kompletta — **appen räknar aldrig kronor**
(Fortnox sätter beloppen).

Vad appen gör av varje paragraf står under **Konsekvens för appen**.
Det som fortfarande är öppet står under **Öppet** längst ned.

---

## § 5 Arbetstid

### Mom 2 — Ordinarie arbetstid (s. 16)

> Den ordinarie arbetstiden är för heltidsarbetande 40 timmar per hel arbets-
> vecka och 38 timmar vid tvåskiftsarbete bestående av två på varandra
> följande skift, detta sett som ett genomsnitt för en sammanhängande
> beräkningsperiod av högst 16 veckor.
>
> För deltidsarbetande fastställs normalarbetstiden genom överenskommelse
> mellan arbetsgivare och arbetstagare.
>
> Anmärkning
> Arbetsgivare och lokal facklig organisation kan överenskomma om längre
> beräkningsperiod än 16 veckor.

**Konsekvens för appen.** Övertid uppstår inte per dag och inte per vecka,
utan när genomsnittet över en beräkningsperiod (≤ 16 veckor) överstiger
40 tim/vecka. Ingen av appens tre tidigare modeller (vardagar × 8, arbetade
dagar × 8, > 40 per ISO-vecka) är avtalets. Modellen `genomsnitt` i
`lib/lonesystem/arsovertid.ts` räknar per 16-veckorsblock från vecka 1 —
**antagen** period; vilken som gäller är Martins beslut (och ska vara
överenskommen).

### Mom 3 — Förläggning av ordinarie arbetstid (s. 16)

> Arbetstiden skall normalt förläggas på femdagarsvecka (måndag-fredag) i
> regel med början tidigast kl. 06.30 och med slut senast kl. 17.00. Helgdagar,
> samt påsk-, pingst-, midsommar-, jul- och nyårsafton ingår inte i ordinarie
> arbetstid.

**Konsekvens för appen.** Röda dagar och helgaftnar är inte ordinarie tid.
Arbete på dem är beordrat arbete med söndagstillägg (§ 8 mom 1), aldrig
"vanliga timmar".

### Mom 4 — Skoftning (s. 17)

> Om arbetstagaren på eget initiativ önskar ändra sin arbetstid i förhållande till
> fastställt arbetsschema utbetalas lön enligt det ordinarie schemat under förut-
> sättning att den arbetade tiden totalt uppgår till samma antal arbetade timmar
> som i det ordinarie schemat. Överenskommelse mellan arbetstagaren och
> arbetsgivaren om både ledighet och inarbetning görs lämpligen vid ett och
> samma tillfälle.
>
> Anmärkning
> Detta innebär inte någon inskränkning i den enskilde arbetstagarens rätt till
> annan ledighet i enlighet med lag och/eller avtal.

**Konsekvens för appen.** "Byte av röd dag" (jobba onsdagens röda dag,
ledig fredag) är skoftning: en ledig dag med `ersatter_datum`, lön enligt
schemat. Ingen helglön flyttas — onsdagens timmar lönas med söndagstillägg,
fredagen är inarbetad. Byggs i frånvaromodellen (typ `inarbetad`).

### Mom 5 — Övertid och obekväm arbetstid (s. 17)

> Arbetstagaren är, om arbetsgivaren så begär, skyldig utföra arbete på övertid i
> den omfattning som anges i Arbetstidslagen. Med övertid avses beordrad
> arbetstid utöver den i mom 2 angivna eller lokalt överenskomna ordinarie
> arbetstiden för heltidsarbete. Undantag enligt anmärkning 2 nedan.
>
> Med arbete på obekväm tid avses arbete på andra tider än mellan kl. 06.30-
> 17.00, måndag-fredag samt under denna tidsperiod infallande helgdagar och i
> mom. 3 nämnda helgdagsaftnar.
>
> Anmärkning
> 1. Ersättning för arbete på övertid och obekväm tid regleras i § 8.
> 2. Arbetstidslagens bestämmelser om mertid vid deltidsanställning (10 §) äger ej
>    tillämpning.
> 3. Sådan arbetstid som kompenseras med ledighet enligt reglerna i § 8 skall inte
>    betraktas som övertid enligt Arbetstidslagen.
> 4. Arbetsgivaren skall föra anteckningar om övertid i enlighet med Arbetstids-
>    lagen och Arbetsmiljöverkets kungörelse härom. Därvid beaktas avvikelserna
>    från lagen enligt anm. 2 ovan.

**Konsekvens för appen.** Anm 3 avgör 250-taket: tid som tas ut som
kompensationsledighet räknas **inte** mot taket. Så länge komp-uttag inte
finns i data är alla övertidstal i admin-kortet sannolikt för höga, och
inget rött "passerat taket" får visas.

### Mom 6 — Raster (s. 17)

> Vid fastställande av arbetstidsschema skall rasternas längd begränsas till
> högst 75 minuter per skift.

**Konsekvens för appen.** `RAST_AVTAL_MAX_MIN = 75` i
`lib/arbetsdagRegler.ts`. Rastfrågan i Bekräfta (över 60 min) och
granskningsraden nämner gränsen. Stefans 98–110-minutersraster (aug 2026)
var stillestånd bokfört som Meal break, inte rast.

---

## § 6 Arbetstidsförkortning (ATK) — kort

Avsättning 3,62 % av lönen; vid 40 tim/vecka motsvarar det 65,2 timmar per
år. Uttag som ledighet. ATK är **intjänad** ledighet (se § 10 mom 4).

---

## § 8 Diverse lönetillägg

### Mom 1 — Ersättningar för arbete på obekväm arbetstid (s. 38)

> Med arbete på obekväm tid avses arbete på andra tider än mellan kl. 06:30
> och 17:00 måndag till fredag. Beordrat arbete på obekväm tid ersätts enligt
> nedanstående tabell:
>
> | Kronor per timme fr.o.m. | 1/4 2023 | 1/4 2024 |
> |---|---|---|
> | Måndag till fredag 00:00-06:30 samt 17:00-24:00 | 41,10 | 42,45 |
> | Lördag 00:00-24:00 | 64,74 | 66,88 |
> | Söndag 00:00-24:00 | 97,06 | 100,27 |
> | Nattarbete vid brandrisk 00:00-05:00, enligt § 5 mom 7 | 55,00 | 56,82 |
>
> Vid beordrat arbete på helgdag eller arbetsfria helgaftnar utgår söndags-
> tillägg.
>
> Överenskommelse får träffas mellan arbetsgivare och arbetstagare om
> genomsnitt för längre tidsperioder. Lokalt kollektivavtal får även träffas om
> andra ob-ersättningar än vad som framgår ovan.
>
> Anmärkning
> Ersättning för nattarbete vid brandrisk enligt § 5 mom 7 utges utöver ordinarie
> ob-tillägg.

**Konsekvens för appen.** Arbetad röd dag → söndagstillägg på timmarna.
Appen räknar i dag bara brandrisk-OB (`lib/ob`); kvälls-, lördags-,
söndags- och helgdags-OB räknas inte alls än. Löneart för OB är fortfarande
en öppen fråga till löneansvarig.

### Mom 3 — Ersättningar för övertidsarbete (s. 39)

> Med övertidsarbete menas beordrat arbete utöver ordinarie arbetstid för
> heltidsarbetande.
>
> Beordrat övertidsarbete ersätts
> Fr.o.m. 2023-04-01 med 51,59 kronor per timme
> Fr.o.m. 2024-04-01 med 53,29 kronor per timme
>
> Vid beordrat övertidsarbete på obekväm tid utgår ersättning dessutom enligt
> mom 1 ovan.
>
> Efter överenskommelse mellan arbetsgivare och arbetstagare kan övertid
> istället kompenseras med ledig tid (kompensationsledighet). Kompensations-
> ledighet för övertidsarbete utgår med 1,40 timmar för varje övertidstimme.
> Då överenskommelse om kompensationsledighet träffas bör även tidpunkten
> för utläggningen av densamma fastställas.
>
> Ob-ersättning utgår dessutom i förekommande fall.

**Konsekvens för appen.** Gävle-modellen: en 80-timmarsvecka ger 40 tim
övertid → 56 tim komp = en ledig vecka. Komp är ett saldo i timmar
(intjäning 1,4 × övertid, uttag som ledighet). Var saldot bor — Fortnox
eller appen — är Martins beslut. Frånvaromodellen får typ `komp`.

---

## § 10 Helglön (s. 43–44)

> Mom 1
> Till arbetstagare som är avlönad med månadslön ingår helglön i månads-
> lönen.
>
> Mom 2
> Helglön för heltidsarbetande utgörs av Grundlön i § 7 för de arbetstimmar
> som bortfaller på grund av att helgdagen inträffar.
> Helglönen för deltidsarbetande utgår i proportion till vad som gäller för
> heltidsarbetande.
> Till arbetstagare som är tim- eller ackordsavlönad betalas helglön för följande
> dagar som infaller på måndag-fredag:
> Nyårsdagen, Trettondagen, Långfredagen, Annandag Påsk, 1 maj, Kristi
> Himmelfärdsdag, Nationaldagen, Midsommarafton, Julafton. Juldagen,
> Annandag Jul och Nyårsafton.
>
> Mom 3
> För samtliga anställda utges helglön efter anställningens tre första månader
> d.v.s. kvalifikationstiden.
> Helglön utges även till arbetstagare vars anställning avslutats men arbets-
> tagaren har återanställts inom fyra månader. Detta om den sammanlagda
> anställningstiden är mer än tre månader.
> Kvalifikationstiden gäller inte för plantskolearbetare som arbetat mer än tre
> månader hos samme arbetsgivare föregående kalenderår.
> I lokal- och företagsavtal regleras helglönens storlek av de lokala parterna.
>
> Mom 4
> Helglön utges inte i följande fall:
> - Dag eller del av dag då rätt till sjukpenning eller föräldrapenning enligt
>   Socialförsäkringsbalken föreligger.
> - Dag som infaller dag 1-14 under sjuklöneperioden, (dock utgår sjuklön
>   enligt § 12).
> - Tjänstledighet som omger helgdagen.
> - Efter trettionde dagen av en sammanhängande ledighetsperiod som inte är
>   intjänad, som t ex semester, ATK eller kompensationsledighet.
> - Vid olovlig frånvaro, helt eller delvis, arbetsdagen närmast före eller efter
>   helgdagen.
> - Arbetstagare som under ledighet överstigande fyra veckor tillfälligt återgår
>   i arbete i samband med helg.
> - Fackliga kurser och konferenser som är längre än en vecka.

**Konsekvens för appen** (`lib/lonesystem/helglon.ts`, `loneberakning.ts`):

- De tolv namnen är facit i `gs_avtal.helglon_dagar`; datumen räknas i kod
  (`lib/roda-dagar`, verifierad 2025–2028).
- 8 tim per röd vardag där föraren **inte** arbetat.
- **Arbetad röd dag ger ingen helglön** — inga timmar bortföll. Timmarna
  lönas som vanlig tid + söndagstillägg (§ 8 mom 1). Aldrig båda.
- Närvarokravet (mom 4: sjuklönedag 1–14, olovlig frånvaro dagen före/efter,
  tjänstledighet som omger dagen, > 30 dagar ej intjänad ledighet) är **inte**
  byggt — kräver frånvaromodellen som källa. Semester, ATK och komp är
  intjänad ledighet och bryter inte helglön.
- Kvalifikationstid tre månader (mom 3) kontrolleras inte (anställningsdatum
  saknas i modellen).

---

## Öppet (Martin tar med löneansvarig / beslutar själv)

Rena frågor till löneansvarig:

1. Löneart för brandrisk-OB (och övrig OB när den räknas).
2. Löneart för sjuklön.

Bekräftelser av avtalstexten ovan (ja/nej):

3. Ordinarie tid är 40 tim/vecka i genomsnitt över ≤ 16 veckor (§ 5 mom 2).
4. Komp-tid räknas inte mot 250-taket (§ 5 mom 5 anm 3, § 8 mom 3).
5. Arbetad röd dag ger lön + söndagstillägg, ingen helglön (§ 10 mom 2, § 8 mom 1).
6. Bytesdag är skoftning med ersätter-datum (§ 5 mom 4).

Martins egna beslut som arbetsgivare:

7. Beräkningsperiod (vilka 16-veckorsblock) och om förarna ska ha fastställt
   schema.
8. Var komp-saldot bor: Fortnox eller appen.
