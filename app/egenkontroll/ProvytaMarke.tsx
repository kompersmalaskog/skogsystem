'use client';

// Provytans prick i listan: samma tre former som pa kartan, ur samma specifikation
// (lib/provytaIkon.ts). Formen bar beskedet - texten bredvid sager det i ord, och
// pricken ar aldrig ensam informationsbarare.

import {
  BOCK_BREDD, BOCK_PUNKTER, IKON_RADIE, IKON_RUTA, PROVYTA_IKON, STRECK_PUNKTER,
} from '@/lib/provytaIkon';
import type { ProvytaStatus } from '@/lib/provytor';

export default function ProvytaMarke({ status, storlek = 22 }: { status: ProvytaStatus; storlek?: number }) {
  const s = PROVYTA_IKON[status];
  const m = IKON_RUTA / 2;
  return (
    <svg
      aria-hidden="true"
      width={storlek}
      height={storlek}
      viewBox={`0 0 ${IKON_RUTA} ${IKON_RUTA}`}
      style={{ flexShrink: 0 }}
      data-provyta-status={status}
    >
      <circle
        cx={m} cy={m} r={IKON_RADIE}
        fill={s.fyllning} stroke={s.linje} strokeWidth={s.linjeBredd} opacity={s.opacitet}
      />
      {s.bock && (
        <polyline
          points={BOCK_PUNKTER.map(([dx, dy]) => `${m + dx},${m + dy}`).join(' ')}
          fill="none" stroke="#FFFFFF" strokeWidth={BOCK_BREDD}
          strokeLinecap="round" strokeLinejoin="round"
        />
      )}
      {s.streck && (
        <line
          x1={m + STRECK_PUNKTER[0][0]} y1={m + STRECK_PUNKTER[0][1]}
          x2={m + STRECK_PUNKTER[1][0]} y2={m + STRECK_PUNKTER[1][1]}
          stroke={s.linje} strokeWidth={s.linjeBredd} strokeLinecap="round" opacity={s.streckOpacitet}
        />
      )}
    </svg>
  );
}
