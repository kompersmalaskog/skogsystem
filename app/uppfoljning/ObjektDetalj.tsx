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
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: '#000' }}>
      <div className="max-w-app mx-auto" style={{ minHeight: '100%' }}>
        <UppfoljningVy data={data} onBack={onBack} />
      </div>
    </div>
  );
}
