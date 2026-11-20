# Flyttas till Uppföljning — borttaget ur Affärsuppföljning

När `/affarsuppfoljning` blev köparvänd (sortimentsutfall för Vida, PR #443)
togs internt innehåll bort. **Det ska inte tillbaka dit.** Listan finns för att
kunna flyttas till `/uppfoljning` som eget jobb.

Referens: `app/affarsuppfoljning/page.tsx` på commit `894a3ff` (origin/main före
PR #443). Hämta den med `git show 894a3ff:app/affarsuppfoljning/page.tsx`.

| Det som försvann | Vad det gjorde | Läste |
|---|---|---|
| **Bolagsnivå** | Volym + andel per bolag, hopfällbar, andelsstapel. Kollapsar till en gren när bolaget är låst till Vida. | `dim_objekt.bolag` + `fakt_produktion` |
| **Inköparnivå** | Per inköpare: volym, stammar, antal objekt, initialer. Internt — inte köparens sak. | `dim_objekt.inkopare` |
| **Trädslagsfördelning** | Staplad andelsstapel Gran / Tall / Björk / Övr. löv per inköpare. | `fakt_produktion.tradslag_id` + `dim_tradslag` |
| **Åtgärdsfördelning** | Volym per åtgärd inom en inköpare, med stapel och procent. | `dim_objekt.atgard` |
| **Medelstam** | Per objekt, m³ per stam. Uttryckligen undantagen från köparvyn. | `fakt_produktion` volym / stammar |
| **Certifiering** | Cert-märkning per objekt + GROT-badge. | `dim_objekt.certifiering`, `grot_anpassad` |
| **Markägaruppgifter** | Markägarens namn, kontaktnamn och telefonnummer per objekt. **Personuppgifter — får aldrig till en köpare.** | `dim_objekt.skogsagare`, `kontakt_namn`, `kontakt_telefon` |

## Att tänka på vid flytten

**Byt datakälla samtidigt.** Den gamla vyn läste volym ur `fakt_produktion` och
sortimentandelar ur `fakt_sortiment`. `fakt_sortiment` underrapporterar — den
upsertas med `merge-duplicates`, så en kapad HPR-export skriver ner en redan
komplett dag. Läs `vy_skordarmatt_stock` istället. Se
`supabase/migrations/20260822_vy_skordarmatt_stock.sql`.

**Medelstam behöver stamräkning**, som inte finns i `vy_skordarmatt_stock` (den
är per stock). Räkna `COUNT(DISTINCT stem_key)` eller gå mot `detalj_stam`.

**Trädslag finns inte i `detalj_stock`.** Det sitter på `detalj_stam.tradslag_id`.
Joinen finns redan i vyn — lägg till kolumnen där om flera vyer behöver den.

**Vyn är inte åtkomstbegränsad.** Alla tabeller har select-policy med
`qual = true` för `authenticated` — permissivt, inte bolagsscopat. Det spelar
ingen roll för `/uppfoljning` (internt), men anta inte att det finns en gräns.
