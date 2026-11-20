'use client';

// Sortimentets namn i två nivåer, samma ord som maskinen: sortimentet vitt/semibold ("Timmer 195 1-2") och mottagaren grå efter ("Vislanda").
import React from 'react';
import { FARG, TYP } from '@/lib/design/tokens';
import { sortimentDelar } from '@/lib/skotarLass/sortiment';

export function SortimentNamn({ namn }: { namn: string }) {
  const { sortiment, mottagare } = sortimentDelar(namn);
  return (
    <span>
      <span style={{ ...TYP.listtitel, color: FARG.text }}>{sortiment}</span>
      {mottagare && <span style={{ ...TYP.text, color: FARG.text2 }}> {mottagare}</span>}
    </span>
  );
}
