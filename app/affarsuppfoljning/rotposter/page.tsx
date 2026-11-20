'use client';

// ROTPOSTER — flyttade 2026-10-25: listan är växeln "Rotposter" under fliken Trakter, och en rotpost är en traktsida som alla andra
// (/affarsuppfoljning/objekt/<id>, där stämplingen står). Gamla länkar leder dit.

import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SIDA } from '@/components/Ytform';

function Vidare() {
  const sp = useSearchParams();
  const router = useRouter();
  const id = sp.get('id');
  useEffect(() => {
    router.replace(id ? `/affarsuppfoljning/objekt/${encodeURIComponent(id)}` : '/affarsuppfoljning/trakter?visa=rot');
  }, [id, router]);
  return <div style={SIDA} />;
}

export default function Rotposter() {
  return (
    <Suspense fallback={<div style={SIDA} />}>
      <Vidare />
    </Suspense>
  );
}
