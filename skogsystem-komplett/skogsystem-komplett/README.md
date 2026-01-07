# Kompersmåla Skog - Skogsystem

Komplett skogsystem med beställningar och objekt-hantering.

## Moduler

- **📦 Beställningar** - Hantera beställningar från bolagen
- **📍 Objekt** - Trakter och avverkningsobjekt
- **🗺️ Karta** - Kommer snart...

## Installation

```bash
npm install
```

## Starta utvecklingsserver

```bash
npm run dev
```

Öppna [http://localhost:3000](http://localhost:3000)

## Funktioner

### Beställningar
- Skapa beställningar per månad
- Koppla till bolag (Vida, Södra, ATA, etc.)
- Slutavverkning / Gallring
- Spårbarhet (vem skapade, ändringshistorik)

### Objekt
- VO-nummer (unikt ID för matchning)
- Åtgärdstyper (Rp, Lrk, Au, Gallring, etc.)
- Flera maskiner per objekt
- Status: Planerad → Skördning → Skotning → Klar
- Koppling till beställningar (progress bar)

## Nästa steg

- [ ] Karta med koordinater
- [ ] Import från maskinfiler
- [ ] Automatisk statusuppdatering
