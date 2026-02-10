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
