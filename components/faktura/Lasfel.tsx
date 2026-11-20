'use client';
// Ett läsfel är ett FEL med en väg vidare — aldrig en tom lista och aldrig 0.
// Felmeddelandet säger vad användaren ska göra (skillen, "Text").
import { useRouter } from 'next/navigation';
import { AVSTAND, FARG, KNAPP, KORT, TYP } from '@/lib/design/tokens';

export default function Lasfel({ titel, text }: { titel: string; text: string }) {
  const router = useRouter();
  return (
    <div style={{ ...KORT }}>
      <p style={{ margin: 0, ...TYP.listtitel, color: FARG.orange }}>{titel}</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.meta, color: FARG.text2 }}>{text}</p>
      <button type="button" onClick={() => router.refresh()} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>
        Försök igen
      </button>
    </div>
  );
}
