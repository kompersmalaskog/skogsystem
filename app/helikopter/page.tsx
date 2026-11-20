import { Suspense } from 'react'
import HelikopterVy from './_components/HelikopterVy'

// Tunn sida. Suspense-gräns krävs för useSearchParams (samma mönster som /objekt).
// Allt innehåll: _components/HelikopterVy.tsx. Logik: _lib/berakningar.ts, data: _lib/queries.ts.
export default function HelikopterPage() {
  return (
    <Suspense fallback={null}>
      <HelikopterVy />
    </Suspense>
  )
}
