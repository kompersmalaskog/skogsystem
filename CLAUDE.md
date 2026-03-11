# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Skogsystem is a Progressive Web App (PWA) for forestry operations management at Kompersmåla Skog AB. Built with Next.js 14 and TypeScript, it handles orders (beställningar), work object tracking (objekt), planning, and field operations.

## Commands

```bash
npm run dev    # Development server at localhost:3000
npm run build  # Production build
npm start      # Start production server
```

Note: ESLint and TypeScript errors are ignored during builds (configured in next.config.js).

## Architecture

### Tech Stack
- **Framework:** Next.js 14 with App Router (all pages use `'use client'` directive)
- **Database:** Supabase (PostgreSQL)
- **Styling:** Inline CSS with dark theme (#000 background, #fff text)
- **Dependencies:** jszip, pdf-parse (for ZIP/PDF import)

### Environment Variables
Stored in `.env.local` (git-ignored):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### Module Structure (app/)
| Module | Purpose |
|--------|---------|
| `page.tsx` (root) | Dashboard placeholder |
| `redigering/` | Object metadata editing (dim_objekt CRUD) |
| `objekt/` | Monthly planning view with volume tracking, ZIP import |
| `planering/` | Planning placeholder |
| `components/Navigation.tsx` | Bottom navigation bar |
| `api/import-trakt/route.ts` | API route for traktdirektiv ZIP import |

### Database Tables

**dim_objekt** - Master data for forest objects:
- objekt_id, object_name, vo_nummer, maskin_id
- skogsagare, bolag, inkopare, huvudtyp, atgard
- latitude, longitude, areal_ha
- Boolean flags: exkludera, grot_anpassad, egen_skotning, klippning, risskotning, stubbbehandling, extra_vagn

**objekt** - Planning data (monthly scheduling):
- id (uuid), vo_nummer, namn, markagare, bolag
- lat, lng, typ, status, ar, manad
- volym, maskiner (array), ordning
- dim_objekt_id (FK to dim_objekt)

**bestallningar** - Monthly orders per company:
- id, ar, manad, bolag, typ, volym

**dim_maskin** - Machines:
- maskin_id, modell

### Key Data Types
```typescript
// typ: 'slutavverkning' or 'gallring'
// status: 'importerad' → 'planerad' → 'pagaende' → 'klar'
// Coordinates: SWEREF99 TM (converted to WGS84 on import)
```

### State Management
- React hooks only (`useState`, `useEffect`)
- No global state library
- Optimistic UI updates with Supabase sync

## Conventions

- **Language:** All UI text, variable names, and comments are in Swedish
- **Animations:** CSS keyframes with cubic-bezier easing
- **Modal Pattern:** Bottom sheet modals with semi-transparent overlays
- **Colors:**
  - Yellow (#eab308) for slutavverkning
  - Green (#22c55e) for gallring
  - Purple (#8b5cf6) for imported status
  - Blue (#3b82f6) for planned status

## API Routes

### POST /api/import-trakt
Imports traktdirektiv from ZIP files containing PDF documents.
- Extracts PDF from ZIP
- Parses fields: namn, vo_nummer, markägare, koordinater, volym, etc.
- Converts SWEREF99 TM coordinates to WGS84
- Creates records in both dim_objekt and objekt tables

## Navigation

Fixed bottom navigation with 4 items:
- Hem (/) - Dashboard
- Redigering (/redigering) - Object metadata editing
- Objekt (/objekt) - Monthly planning with volume charts
- Planering (/planering) - Planning (placeholder)

## PWA Configuration

- Standalone display mode
- Start URL: `/planner`
- iOS: Apple web app capable with black status bar
- Viewport: No pinch zoom (user-scalable=no)

## Machine Data Import (Stanford2010)

### Overview
`skogsmaskin_import_version_6.py` imports Stanford2010 files (MOM, HPR, HQC, FPR) from Ponsse and Rottne forestry machines into Supabase. MOM files are session-based: each file contains all entries from session start, so consecutive files have overlapping entries at boundaries.

### File Types
| Type | Content |
|------|---------|
| MOM | Machine Operation Monitoring — time, fuel, production, GPS |
| HPR | Harvester Production Report — detailed stem/log data |
| HQC | Harvester Quality Control — bucking quality |
| FPR | Forwarding Production Report — loads and assortments |

### Key Import Concepts

**Entry-level deduplication:** Entries are keyed by `(MonitoringStartTime, maskin_id, objekt_id)`. When the same entry appears in consecutive MOM files (with updated duration), the latest file's version overwrites the earlier one via `_GLOBAL_TID_ENTRIES`.

**MOM runtime durations are G15-inclusive:** The `MonitoringTimeLength` for runtime categories (Processing, Terrain travel, Other work) INCLUDES short stop time. This is critical for correct G0/G15 calculation.

**ID resolution:**
- `maskin_id`: Uses `BaseMachineManufacturerID` + `normalize_maskin_id()` (adds 'R' prefix for Rottne numeric IDs)
- `objekt_id`: Uses `ContractNumber` via `make_objekt_id()`. Falls back to `maskin_id_ObjectKey` if no contract number.

### fakt_tid Field Mapping

| DB Field | Stanford2010 Source | Notes |
|----------|-------------------|-------|
| processing_sek | IndividualMachineWorkTime where RunTimeCategory = 'Processing' | G15-inclusive (includes short stops) |
| terrain_sek | RunTimeCategory = 'Terrain travel' | G15-inclusive |
| other_work_sek | RunTimeCategory = other values | G15-inclusive |
| kort_stopp_sek | IndividualShortDownTime | Stops ≤ 15 min, already included in runtime fields above |
| maintenance_sek | IndividualMachineDownTime/Maintenance | Planned maintenance |
| disturbance_sek | IndividualMachineDownTime/Disturbance | Unplanned disturbance |
| avbrott_sek | IndividualMachineDownTime (no sub-element) | Other downtime |
| rast_sek | IndividualUnutilizedTimeCategory | Breaks/rest |
| bransle_liter | OtherMachineData/FuelConsumption | Fuel in liters |
| engine_time_sek | OtherMachineData/EngineTime | Total engine running time |
| korstracka_m | OtherMachineData/DrivenDistance | Total driven distance |
| terrain_korstracka_m | DrivenDistance (only for Terrain travel entries) | Distance during terrain travel |
| terrain_bransle_liter | FuelConsumption (only for Terrain travel entries) | Fuel during terrain travel |
| tomgang_sek | Calculated: max(0, engine_time - G0) | Idle time |

### Time Calculations (Ponsse / Rottne equivalents)

```
G0 (Grundtid utan stopp) = processing_sek + terrain_sek + other_work_sek - kort_stopp_sek
G15 (Grundtid med stopp)  = processing_sek + terrain_sek + other_work_sek
Arbetstid                 = G15 + maintenance_sek + disturbance_sek + avbrott_sek
Totaltid                  = Arbetstid + rast_sek
```

**Ponsse terms:** G0, G15, Arbetstid, Totaltid
**Rottne terms:** Grundtid G(0), Grundtid G(t), Total tid

### fakt_produktion Field Mapping

| DB Field | Source |
|----------|--------|
| stammar | OtherMachineData/HarvesterData/NumberOfHarvestedStems |
| volym_m3sob | TotalVolumeOfHarvestedLogs (sob category, not estimated for Single) |
| volym_m3sub | TotalVolumeOfHarvestedLogs (sub category, not estimated for Single) |
| processtyp | 'Single' or 'MTH' (multi-tree handling) |

### Reimport
`reimport_fakt_tid.py` clears and reimports all fakt_tid data from all MOM files in Behandlade. Uses global entry dedup for correct cross-file handling.
