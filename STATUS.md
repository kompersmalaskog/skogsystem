# Skogsystem — Status

## Klart
- Timer-flöde för extra tid (logga tid)
- Frånvaro: Sjuk/VAB med direkt registrering
- Sammanfattningskort med extra tid-rader
- Morgon/Kväll-labels på extra tid
- Persisterad frånvarotyp i databas
- Anpassat sammanfattningskort per dagtyp
- Körning alltid synlig
- Bekräftad dag med re-bekräftelse

## Kända buggar
- Kalenderdagar inte klickbara (regression)
- Bottomnav ändrad: "Min tid" borta,
  "Löneunderlag" istället — verifiera

## Nästa
- Fixa kalenderklick
- Timer-banner testad med fliknavigation
- Sjuk/VAB hela flödet verifierat
- Push-notiser vid obekräftad dag
- Vila-fliken (11h dygnsvila, 250h övertidstak)
- Löneunderlag → Fortnox

## Avtalsvärden (gs_avtal)
- OB, övertid, helglön — ej implementerat
- Två rader i gs_avtal — rätt val behöver
  verifieras

## Fortnox-integration
- OAuth klart, tokens i Supabase
- Semester: 500→5 fix pushat, ej verifierat
- ATK: kronbelopp OK, timmar kräver timlön

Uppdatera denna fil vid varje commit.
