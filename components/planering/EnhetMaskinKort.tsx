'use client';
// Inställningar › "Den här enheten är maskin" (bara admin, bara enheter utan serial-GPS — maskindatorn har sitt val i GPS-källa-kortet).
// Svaret först, sedan maskinerna, sedan tre förberedelser för iPaden. Valet sparas på enheten; "Starta som maskin" laddar om på /planering så
// att startsekvensen går som på en Ponsse-dator (valt objekt eller öppen körvy från en tidigare session stör då inte).
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Svarsrad from '@/components/design/Svarsrad';
import Ikon from '@/components/design/Ikon';
import { enhetSvar, forberedelser, type MaskinVal, type PlatsStatus } from '@/lib/enhetMaskinKort';

type Props = {
  maskiner: MaskinVal[];
  valdId: string | null;
  registerLaddar: boolean;
  installerad: boolean;
  plats: PlatsStatus;
  /** Valet. Anropas direkt i trycket (iOS vill ha en användargest för platsfrågan). */
  onVal: (maskinId: string | null) => void;
  onStarta: () => void;
};

export default function EnhetMaskinKort({ maskiner, valdId, registerLaddar, installerad, plats, onVal, onStarta }: Props) {
  const vald = maskiner.find((m) => m.maskinId === valdId) ?? null;
  const valdNamn = vald ? vald.namn : valdId; // en vald maskin som inte längre är aktiv visas ändå med id (aldrig tyst borta)
  return (
    <div data-testid="enhet-maskin-kort" style={{ marginBottom: AVSTAND.xl }}>
      <Svarsrad rubrik={enhetSvar(valdId ? valdNamn : null)} rad={valdId ? 'Appen startar i den maskinens körvy varje gång.' : 'Välj maskin en gång — valet sparas på den här enheten.'} />
      <Sektion rubrik="Maskin">
        {registerLaddar && maskiner.length === 0 && <Rad titel="Läser maskinerna …" sista />}
        {maskiner.map((m, i) => (
          <Rad key={m.maskinId} titel={m.namn} under={m.slag}
            hoger={m.maskinId === valdId ? <Ikon namn="check" farg={FARG.text} /> : undefined}
            onTryck={() => { if (m.maskinId !== valdId) onVal(m.maskinId); }}
            attr={{ 'data-testid': `enhet-maskin-${m.maskinId}` }}
            sista={i === maskiner.length - 1 && !valdId} />
        ))}
        {valdId && <Rad titel="Ingen maskin" under="Enheten blir en vanlig enhet igen." onTryck={() => onVal(null)} attr={{ 'data-testid': 'enhet-maskin-ingen' }} sista />}
      </Sektion>
      {valdId && (
        <button type="button" data-testid="enhet-maskin-starta" onClick={onStarta} style={{ ...KNAPP.primar, width: '100%', marginBottom: AVSTAND.xl }}>
          Starta som maskin
        </button>
      )}
      <Sektion rubrik="Innan den sitter i hytten">
        {forberedelser({ installerad, plats }).map((f, i, a) => (
          <Rad key={f.id} titel={f.titel} under={f.under} sista={i === a.length - 1}
            hoger={<span style={{ ...TYP.meta, color: f.ok === false ? FARG.orange : FARG.text2 }}>{f.ok === true ? 'Ok' : f.ok === false ? 'Fixa' : 'Kolla själv'}</span>} />
        ))}
      </Sektion>
    </div>
  );
}
