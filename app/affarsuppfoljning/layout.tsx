// Alla sidor under /affarsuppfoljning delar flikraden längst ner: Översikt, Räkna, Kvalitet.
import type { ReactNode } from 'react';
import AffarBottomNav from './AffarBottomNav';

export default function AffarsuppfoljningLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <AffarBottomNav />
    </>
  );
}
