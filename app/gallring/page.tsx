import { AVSTAND, FARG, TYP } from '@/lib/design/tokens';

// /gallring: listan ritas av ramen (app/gallring/layout.tsx). Det här är högersidan på en bred skärm,
// innan en trakt är vald — under 1100 px syns den inte alls.
export default function GallringPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', padding: AVSTAND.xl }}>
      <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Välj en trakt i listan</p>
    </div>
  );
}
