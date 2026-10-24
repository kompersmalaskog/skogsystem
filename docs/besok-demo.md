# Besök på trakten – demo för Vida måndag 26/10

**Inget skarpt SMS skickas av appen.** Knappen öppnar bara Meddelanden med text och mottagare ifyllda. Tryck inte på skicka på en riktig markägares nummer.

## Före demon (Martin, en gång)

1. **Kör migrationen i prod:** `supabase/migrations/20261022170000_besok_pa_trakten.sql`. Previewn skriver mot prod, så utan den finns inga tabeller (besökssidan svarar då "Länken går inte att läsa just nu"). Säg sedan till mig vilken version prod stämplade så döper jag om filen (CLAUDE.md-regeln).
2. **Fyll i ditt telefonnummer** i Admin › Medarbetare (`medarbetare.telefon` är tomt för alla sju). Utan det saknas raden "Det är <namn>, <nummer>" i SMS:et.
3. **Välj trakt.** Använd **Skälviken RP J-Hus -25** (planerad, ~26 % skördat, Giant tilldelad, hyttspår 21–22 okt). *Hålabäck au 2025 passar inte:* den är avslutad (28 sep) och skulle visa "Arbetet är klart", och den saknar markägarnummer.
   - Skälvikens markägarnummer i datan (070-666 52 57) är **ett riktigt nummer**. Tryck inte skicka i Meddelanden – eller byt numret till ditt eget före demon:
     `update objekt set markagare_tel = '<ditt nummer>' where id = '84fa6474-0806-4f23-a017-df84e6e851e2';`
   - För texten "i morgon": `update objekt set planerad_start = current_date + 1 where id = '84fa6474-0806-4f23-a017-df84e6e851e2';` (utan datum står "snart").
4. **Demomaskiner på kartan** (så att besökssidan visar skördare och skotare nu; positionerna får inte vara äldre än 4 timmar, så kör detta strax före demon):
   ```sql
   insert into hyttspar (objekt_id, maskin_id, roll, datum, points, uppdaterad_at)
   select '84fa6474-0806-4f23-a017-df84e6e851e2', 'DEMO-BESOK', r.roll, current_date,
          jsonb_build_array(jsonb_build_object('lat', 56.2845443 + r.dlat, 'lng', 15.3769196 + r.dlng, 'tid', now())),
          now()
   from (values ('skordare', 0.0004, 0.0003), ('skotare', -0.0003, -0.0004)) as r(roll, dlat, dlng)
   on conflict do nothing;
   ```
   Raden är unik per (objekt, roll, datum): finns redan ett riktigt spår för idag på Skälviken läggs ingen demopunkt till (`on conflict do nothing`) och den riktiga maskinens senaste punkt visas i stället.
   Städning efteråt: `delete from hyttspar where maskin_id = 'DEMO-BESOK';`
5. Vercel-previewn kan ligga bakom Vercels inloggning. **Demo på dina egna enheter**; en riktig besökslänk når utomstående först efter release.

## Demon, i ordning

1. **Planeraren (du, inloggad admin, /planering):** öppna Skälviken → ⓘ. Överst under faror syns kortet **Besök på trakten**.
2. Tryck **Skicka till markägaren** → Meddelanden öppnas med mottagare och texten ifylld (förnamn, fastighet, i morgon, länken). *Skicka inte.* Gå tillbaka.
3. Tryck **Visa som markägaren** → besökssidan:
   - huvudregeln överst ("Gå aldrig fram till en maskin"),
   - högst tre rader under **Här just nu** (skördare, skotare – inga fler regler),
   - tryck på **Skotare** → ritad bild uppifrån med döda vinkeln,
   - kartan med flygfoto och ringarna (skördare 70 m, skotare 20 m),
   - framsteg i procent och "klart ca …".
4. Tryck **Jag kommer på besök**, välj **Nu / Om 1 h / Välj tid**, skriv namn och telefon → **Skickat · väntar på föraren**.
5. **Hytten:** öppna `/maskin?som=PONS20SDJAA270231` (testläge, bara admin). Inom ~4 s: en ton och ett orange kort högst upp "Besök: <namn> kommer ca …" med telefonnummer och stor knapp **Uppfattat**. En röd streckad 70 m-ring ritas runt maskinen.
6. Tryck **Uppfattat** → på besökssidan (uppdaterar var 15:e s) står "✓ Skördaren har sett det". Kortet i hytten försvinner; ringen ligger kvar medan besöket är aktivt.
7. **Tillbaka hos planeraren:** ⓘ → **Besök (1)** visar namn, telefon, tid, vilken maskin som tryckte Uppfattat och när (märkt `· test`).
8. (Valfritt) Länken **På/Av** stänger besökssidan direkt – ladda om den så står "Länken gäller inte längre".

## Påminnelsen (valfritt)

Pushen "<Trakt> startar i morgon – Skicka till markägaren?" köas av `/api/notis/flush`. Cron körs bara på production; för att prova: öppna `/api/notis/flush` som inloggad admin efter att `planerad_start` satts till i morgon. Tryck på pushen → `/planering?objekt=…&besok=sms` = ⓘ-kortet med SMS-raden i fokus (ett tryck till öppnar Meddelanden).

## Städa efter demon

```sql
delete from hyttspar where maskin_id = 'DEMO-BESOK';
-- valfritt: ta bort demobesöken
with d as (delete from objekt_besok where objekt_id = '84fa6474-0806-4f23-a017-df84e6e851e2' returning 1) select count(*) from d;
-- återställ ev. ändrade värden på objektet (planerad_start, markagare_tel)
```
(Kvittenser och SMS-rader följer med besöket via främmande nyckel.)

## Vad som inte är provat

Skisserna (tavla 1–3 och 5) gick inte att öppna – Figma-anslutningen nekades – så designen följer beställningstexten. Inte provat: mot prod-databasen (migrationen ej körd), riktig iPhone/PWA, riktig `sms:`-öppning, riktigt ljud i hytten, pushen i drift, Lantmäteriets flygfoto genom proxyn live.
