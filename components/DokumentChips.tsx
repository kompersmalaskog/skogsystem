'use client';
import React from 'react';
import { signeraKartfil } from '@/lib/kartfiler';

// Delad dokument-chip-rendering (bruten ut ur /objekt) så planeringsvyn och /objekt visar SAMMA chips
// utan parallell PDF-länkning. Signeringen (privat bucket → signerad läs-URL, TTL) sker HÄR på ETT
// ställe; ÖPPNAREN injiceras per vy via onOppna(signeradUrl, titel):
//   /objekt   → window.open(url, '_blank')      (ny flik, som idag)
//   planering → setPdfDok({url, titel})          (in-app PdfLasare — aldrig window.open i PWA:n)

export interface DokumentChipsProps {
  traktdirektivUrl?: string | null;
  traktkartaUrl?: string | null;
  stamplingslangdUrl?: string | null;
  valtlappUrl?: string | null;
  ovrigaDokument?: { namn: string; path: string }[] | null;
  typ?: string | null; // 'slut'/'slutavverkning' → orange, annars grön (samma dämpade typtoner som /objekt)
  onOppna: (signeradUrl: string, titel: string) => void;
}

// Finns någon dokument alls? (används för att gate:a sektionen så tom = ingen rad.)
export function harDokument(p: Pick<DokumentChipsProps, 'traktdirektivUrl' | 'traktkartaUrl' | 'stamplingslangdUrl' | 'valtlappUrl' | 'ovrigaDokument'>): boolean {
  return !!(p.traktdirektivUrl || p.traktkartaUrl || p.stamplingslangdUrl || p.valtlappUrl || (p.ovrigaDokument && p.ovrigaDokument.length > 0));
}

const ikonStil = { width: 14, height: 14, flexShrink: 0 } as React.CSSProperties;
const fileTextIcon = (
  <svg style={ikonStil} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><line x1="10" y1="9" x2="8" y2="9" />
  </svg>
);
const clipboardIcon = (
  <svg style={ikonStil} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" />
  </svg>
);
const mapIcon = (
  <svg style={ikonStil} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
  </svg>
);

export default function DokumentChips(props: DokumentChipsProps) {
  const slut = typeof props.typ === 'string' && props.typ.startsWith('slut');
  const dokFarg = slut ? '#BA7515' : '#3f9457';

  const pill = (url: string, etikett: string, ikon: React.ReactNode, key?: string) => (
    <button
      type="button" key={key} className="btn-press"
      onClick={async () => { const s = await signeraKartfil(url); if (s) props.onOppna(s, etikett); }}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, padding: '9px 12px', borderRadius: 9,
        border: `1px solid ${dokFarg}40`, background: `${dokFarg}18`, color: dokFarg,
        fontSize: 13, fontWeight: 500, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit',
      }}
    >{ikon}{etikett}</button>
  );

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {props.traktdirektivUrl && pill(props.traktdirektivUrl, 'Traktdirektiv', fileTextIcon)}
      {props.traktkartaUrl && pill(props.traktkartaUrl, 'Traktkarta', mapIcon)}
      {props.stamplingslangdUrl && pill(props.stamplingslangdUrl, 'Stämplingslängd', clipboardIcon)}
      {props.valtlappUrl && pill(props.valtlappUrl, 'Vältlappar', clipboardIcon)}
      {(props.ovrigaDokument || []).map((d, i) => pill(d.path, d.namn, fileTextIcon, `ov${i}`))}
    </div>
  );
}
