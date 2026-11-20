'use client';
// /uppfoljning = master-vyn. Menyn bor i ramens aside (UppfoljningRam); den här
// sidan är BARA höger pane på stor skärm: ett lugnt "välj ett objekt" tills man
// trycker på ett objekt i menyn. På smal skärm göms den här (ramen visar menyn
// i full bredd) och man navigerar till /uppfoljning/<id>.
import { AVSTAND, FARG, ROT_MIN_HOJD, TYP } from '@/lib/design/tokens';

export default function UppfoljningPage() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: ROT_MIN_HOJD, padding: AVSTAND.xl, background: FARG.bg }}>
      <div style={{ textAlign: 'center', maxWidth: 320 }}>
        <div style={{ ...TYP.rubrik, color: FARG.text2 }}>Välj ett objekt</div>
        <div style={{ ...TYP.meta, color: FARG.text3, marginTop: AVSTAND.s }}>Tryck på ett objekt i listan för att se hur det gick.</div>
      </div>
    </div>
  );
}
