import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';

export const dynamic = 'force-dynamic';

// Listan bor i layouten (FakturaRam). Här står bara det som syns i traktytan på
// stor skärm innan något är valt; under 1100 px är traktytan dold på den här
// adressen och listan fyller skärmen. Spärren ligger i layouten.
export default function Page() {
  return (
    <div className="fa-bara-bred" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: AVSTAND.xl }}>
      <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Välj en trakt till vänster</p>
    </div>
  );
}
