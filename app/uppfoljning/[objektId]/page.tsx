'use client';

import { useRouter, useParams } from 'next/navigation';
import { useUppfoljningList, urlIdFor } from '../hooks/useUppfoljningList';
import ObjektDetalj from '../ObjektDetalj';
import { AVSTAND, FARG, TRAFFYTA, TYP } from '@/lib/design/tokens';

/* ── Design tokens (matchar ObjektDetalj/page.tsx för fallback-vyer) ── */
const V6_GREY = '#8e8e93';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

export default function UppfoljningDetaljPage() {
  const router = useRouter();
  const params = useParams<{ objektId: string }>();
  const decodedId = decodeURIComponent(params.objektId);

  const { objekt, loading, error, forsokIgen } = useUppfoljningList();

  const handleBack = () => router.push('/uppfoljning');

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: V6_FF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: V6_GREY, fontSize: 14 }}>Laddar...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: V6_FF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Kunde inte ladda uppföljningsdata.</div>
          <button onClick={forsokIgen} style={{ marginTop: AVSTAND.s, minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit', ...TYP.meta, color: FARG.bla }}>Försök igen</button>
        </div>
      </div>
    );
  }

  const obj = objekt.find(o => urlIdFor(o) === decodedId);

  if (!obj) {
    return (
      <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: V6_FF, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: V6_GREY, fontSize: 14 }}>Objektet hittades inte. Det kan ha tagits bort eller flyttats.</div>
      </div>
    );
  }

  return <ObjektDetalj obj={obj} onBack={handleBack} />;
}
