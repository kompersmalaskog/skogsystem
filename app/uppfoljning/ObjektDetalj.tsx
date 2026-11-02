'use client';

import UppfoljningVy from './UppfoljningVy';
import { type UppfoljningObjekt } from './lib/transform';
import { useObjektUppfoljning } from './hooks/useObjektUppfoljning';

/* ── Design tokens (matchar page.tsx) ── */
const V6_GREY = '#8e8e93';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";
const bg = '#000';
const text = '#fff';
const muted = V6_GREY;
const ff = V6_FF;

export default function ObjektDetalj({ obj, onBack }: { obj: UppfoljningObjekt; onBack: () => void }) {
  const { data, loading, error } = useObjektUppfoljning(obj);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: muted, fontSize: 14 }}>Laddar...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={{ minHeight: '100vh', background: bg, color: text, fontFamily: ff, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: muted, fontSize: 14 }}>Kunde inte ladda uppföljningsdata. Försök igen.</div>
      </div>
    );
  }

  return (
    // Ingen max-w-app här: UppfoljningVy är ombyggd för att fylla panelen (egen
    // .uf-objekt med max-width 1152 + margin auto, container queries). Den gamla
    // 440px-kolumnen klämde ihop hero/maskiner/"Hur gick det?" till en smal remsa
    // på stor skärm medan viewport-media-queryn ändå tvingade sida-vid-sida/rutnät
    // → allt krympt och avklippt. Telefon är oförändrad (.uf-objekt fyller ändå).
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: '#000' }}>
      <div style={{ minHeight: '100%' }}>
        <UppfoljningVy data={data} onBack={onBack} />
      </div>
    </div>
  );
}
