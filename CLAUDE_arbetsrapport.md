# Arbetsrapport — integration i Next.js

## Vad ska göras

Filen `arbetsrapport.tsx` i projektmappen är ett färdigt UI-utkast för en mobilapp för skogsmaskinförare. Den är byggd som en enda React-komponent med hårdkodad demo-data. Din uppgift är att:

1. Flytta filen till rätt plats i Next.js-strukturen
2. Rensa bort all demo-data och ersätt med riktiga Supabase-anrop
3. Se till att komponenten fungerar i projektet

---

## Steg 1 — Flytta filen

Skapa följande struktur:

```
app/
  arbetsrapport/
    page.tsx          ← ny fil, importerar komponenten
components/
  arbetsrapport/
    Arbetsrapport.tsx ← flytta hit från projektmappen
```

`app/arbetsrapport/page.tsx` ska innehålla:
```tsx
import Arbetsrapport from "@/components/arbetsrapport/Arbetsrapport";
export default function Page() {
  return <Arbetsrapport />;
}
```

---

## Steg 2 — Supabase-miljövariabler

Använd befintliga env-variabler från `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Importera Supabase-klienten från `lib/supabase.ts` eller skapa den om den inte finns:
```ts
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

---

## Steg 3 — Ersätt demo-data med Supabase

### Medarbetare
Demo har hårdkodat "Stefan Karlsson" och maskin "Ponsse Scorpion Giant".
Ersätt med ett anrop mot tabellen `medarbetare` baserat på inloggad användare.
Tills auth är på plats, hämta första raden som matchar maskin_id från MOM.

```ts
// TODO: Ersätt med auth-baserat anrop när inloggning är byggt
const { data: medarbetare } = await supabase
  .from("medarbetare")
  .select("*")
  .eq("maskin_id", "PONS20SDJAA270231") // byts mot dynamiskt maskin-id från MOM
  .single();
```

### GS-avtalet
Demo har hårdkodade värden för körersättning, traktamente osv.
Ersätt med anrop mot `gs_avtal`:

```ts
const { data: avtal } = await supabase
  .from("gs_avtal")
  .select("*")
  .order("giltigt_fran", { ascending: false })
  .limit(1)
  .single();
```

Använd sedan `avtal.km_ersattning_kr`, `avtal.traktamente_hel_kr` osv i komponenten.

### Objekt
Demo har tre hårdkodade objekt (Karatorp, Bäckadalen, Norra Skogen).
Ersätt med anrop mot `dim_objekt` eller motsvarande objekt-tabell i projektet:

```ts
const { data: objekt } = await supabase
  .from("dim_objekt")
  .select("objekt_id, vo_nummer, namn, agare")
  .eq("aktiv", true);
```

### Spara arbetsdag
När Stefan bekräftar kvällsvyn, spara till `arbetsdag`:

```ts
await supabase.from("arbetsdag").upsert({
  medarbetare_id: medarbetare.id,
  datum: new Date().toISOString().split("T")[0],
  start_tid: start,
  slut_tid: slut,
  rast_min: rast,
  km_morgon: kmM?.km ?? 0,
  km_kvall: kmK?.km ?? 0,
  maskin_id: medarbetare.maskin_id,
  traktamente: trak,
  bekraftad: true,
  bekraftad_tid: new Date().toISOString(),
});
```

### Spara extra tid
När Stefan lägger till extra tid, spara till `extra_tid`:

```ts
await supabase.from("extra_tid").insert({
  medarbetare_id: medarbetare.id,
  datum: new Date().toISOString().split("T")[0],
  minuter: extra.min,
  debiterbar: extra.deb,
  objekt_id: extra.obj?.id ?? null,
  objekt_namn: extra.obj?.namn ?? null,
  kommentar: extra.besk,
});
```

### Spara löneunderlag
Löneunderlaget skickas redan mot Supabase i komponenten via fetch.
Byt ut fetch-anropet mot Supabase-klienten:

```ts
await supabase.from("loneunderlag").upsert({
  medarbetare_id: medarbetare.id,
  namn: medarbetare.namn,
  maskin_id: medarbetare.maskin_id,
  period: "2025-01", // dynamiskt: format YYYY-MM
  // ... övriga fält
  status: "inskickat",
  skickat_tidpunkt: new Date().toISOString(),
});
```

### Spara redigerad dag
När Stefan redigerar en historisk dag, spara till `arbetsdag`:

```ts
await supabase.from("arbetsdag").upsert({
  medarbetare_id: medarbetare.id,
  datum: redDag.datum, // konvertera till YYYY-MM-DD
  start_tid: redStart,
  slut_tid: redSlut,
  rast_min: redRast,
  km_totalt: redKm,
  redigerad: true,
  redigerad_anl: redAnl,
  redigerad_tid: new Date().toISOString(),
});
```

---

## Steg 4 — Demo-toggles

De tre demo-knapparna längst ner i morgonvyn (Sista dagen, Avvikelse morgon, Avvikande hemkörning) ska **inte** finnas i produktionsversionen. Ta bort dem men behåll logiken — den triggas på riktigt av GPS och MOM senare.

---

## Steg 5 — Mobilanpassning

Komponenten är byggd för mobil (iOS-design). Lägg till följande i `app/arbetsrapport/page.tsx`:

```tsx
export const metadata = {
  title: "Arbetsrapport",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1",
};
```

---

## Tabeller i Supabase (redan skapade)

- `medarbetare` — förare med maskin_id och hemadress
- `gs_avtal` — avtalsregler (körersättning, övertid, traktamente)
- `arbetsdag` — en rad per dag per medarbetare
- `extra_tid` — debiterbara och interna tillägg
- `franvaro` — sjuk, VAB, semester osv
- `fakt_timmar` — timmar per objekt från MOM
- `loneunderlag` — månadsunderlag per medarbetare

Supabase URL: https://mxydghzfacbenbgpodex.supabase.co

---

## Vad som INTE ska göras nu

- Ingen inloggning/auth — det byggs separat
- Ingen MOM-integration — triggas senare
- Ingen GPS/Bluetooth — triggas senare
- Fakturasidan byggs separat

---

## Sammanfattning

1. Flytta filen till `components/arbetsrapport/Arbetsrapport.tsx`
2. Skapa `app/arbetsrapport/page.tsx`
3. Koppla Supabase för medarbetare, gs_avtal och objekt vid uppstart
4. Spara arbetsdag, extra_tid och loneunderlag vid rätt tillfällen
5. Ta bort demo-toggles
6. Pusha till main
