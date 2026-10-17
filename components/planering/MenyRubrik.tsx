'use client';

// Rubrikraden i meny-arket i planeringsvyn (samma stil som förut, flyttad ur page.tsx så den går att rendera i test). Texten kommer ur lib/menyRubrik.

import React from 'react';
import { menyRubrik } from '@/lib/menyRubrik';

export default function MenyRubrik({ subMenu, activeCategory }: { subMenu: string | null; activeCategory: string | null }) {
  return (
    <div data-testid="meny-rubrik" style={{
      fontSize: '17px',
      fontWeight: '600',
      flex: 1,
      textAlign: 'center',
      color: '#fff',
      letterSpacing: '-0.2px',
    }}>
      {menyRubrik(subMenu, activeCategory)}
    </div>
  );
}
