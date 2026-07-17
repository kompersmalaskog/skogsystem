'use client';

import React, { useEffect } from 'react';
import { ff } from './tema';

/** Feltoast — fixed överst, försvinner efter 5 s. */
export default function Toast({ text, onDold }: { text: string | null; onDold: () => void }) {
  useEffect(() => {
    if (!text) return;
    const t = setTimeout(onDold, 5000);
    return () => clearTimeout(t);
  }, [text, onDold]);

  if (!text) return null;
  return (
    <div style={{
      position: 'fixed', top: 'calc(16px + env(safe-area-inset-top))', left: '50%', transform: 'translateX(-50%)',
      background: '#991b1b', color: '#fff', padding: '12px 20px',
      borderRadius: 12, fontSize: 13, fontWeight: 500, fontFamily: ff,
      zIndex: 9999, maxWidth: 400, textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      {text}
    </div>
  );
}
