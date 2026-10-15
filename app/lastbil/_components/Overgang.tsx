'use client';

import Link from 'next/link';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TYP } from '@/lib/design/tokens';

/**
 * Plats för en flik som byggs i ett senare steg (omtaget av lastbilsflödet, steg 2 och 3).
 * Inga siffror och ingen påhittad tomhet: texten säger var innehållet finns tills det flyttat hit,
 * och länken går dit. Tas bort när fliken är byggd.
 */
export default function Overgang({ rubrik, text }: { rubrik: string; text: string }) {
  return (
    <section style={KORT} aria-label={rubrik}>
      <h2 style={{ margin: 0, ...TYP.rubrik, color: FARG.text }}>{rubrik}</h2>
      <p style={{ ...TYP.text, color: FARG.text2, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>{text}</p>
      <Link href="/maskinflytt/sammanstallning" style={{ ...KNAPP.lank, textDecoration: 'none' }}>
        Öppna Flyttloggen
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.text }}>chevron_right</span>
      </Link>
    </section>
  );
}
