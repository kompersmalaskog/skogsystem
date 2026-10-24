// Notiser i hytten — rapporten i Inställningar: vad appen KAN se om maskinen och vad bara föraren kan kontrollera.
// Appen ser tre saker själv (installerad, tillstånd, service worker). Chrome-inställningen "Fortsätt köra bakgrundsappar" och Windows Fokusassistent
// går inte att läsa från en webbsida — de står som "Kontrollera själv" med exakt var man gör det. Ingen rad påstår något appen inte vet.

import type { TestResultat } from './notisInstallning';

export type RapportStatus = 'ok' | 'fixa' | 'kolla';

export type RapportRad = { id: string; rubrik: string; status: RapportStatus; text: string };

export type RapportIndata = {
  /** Webbläsaren har Notification + serviceWorker. */
  stods: boolean;
  /** Appen körs som installerad app (eget fönster). */
  installerad: boolean;
  behorighet: NotificationPermission | 'saknas';
  /** En service worker är registrerad och aktiv. */
  swAktiv: boolean;
};

export function byggRapport(i: RapportIndata): RapportRad[] {
  const rader: RapportRad[] = [];

  rader.push(i.stods
    ? { id: 'stod', rubrik: 'Webbläsaren klarar notiser', status: 'ok', text: 'Ja' }
    : { id: 'stod', rubrik: 'Webbläsaren klarar notiser', status: 'fixa', text: 'Nej – öppna appen i Chrome eller Edge på maskindatorn' });

  rader.push(i.installerad
    ? { id: 'installerad', rubrik: 'Appen körs som eget fönster', status: 'ok', text: 'Ja' }
    : { id: 'installerad', rubrik: 'Appen körs som eget fönster', status: 'fixa', text: 'Nej – installera appen: Chrome ⋮ › Spara och dela › Installera sida som app' });

  rader.push(i.behorighet === 'granted'
    ? { id: 'tillstand', rubrik: 'Notiser tillåtna', status: 'ok', text: 'Tillåtna' }
    : i.behorighet === 'denied'
      ? { id: 'tillstand', rubrik: 'Notiser tillåtna', status: 'fixa', text: 'Blockerade – Chrome: lås-symbolen vid adressen › Notiser › Tillåt' }
      : i.behorighet === 'default'
        ? { id: 'tillstand', rubrik: 'Notiser tillåtna', status: 'fixa', text: 'Inte valt än – tryck Tillåt notiser nedan' }
        : { id: 'tillstand', rubrik: 'Notiser tillåtna', status: 'fixa', text: 'Går inte att läsa här' });

  rader.push(i.swAktiv
    ? { id: 'sw', rubrik: 'Bakgrundstjänsten är igång', status: 'ok', text: 'Ja' }
    : { id: 'sw', rubrik: 'Bakgrundstjänsten är igång', status: 'fixa', text: 'Nej – ladda om appen (Ctrl+R)' });

  // Det här kan en webbsida inte läsa — föraren/Martin kontrollerar dem en gång på maskinen.
  rader.push({
    id: 'chrome-bakgrund', rubrik: 'Chrome kör i bakgrunden', status: 'kolla',
    text: 'Chrome › Inställningar › System › "Fortsätt köra bakgrundsappar när Google Chrome är stängt" ska vara PÅ',
  });
  rader.push({
    id: 'fokus', rubrik: 'Windows stör inte', status: 'kolla',
    text: 'Windows › Inställningar › System › Aviseringar: "Stör ej" (Windows 10: Fokusassistent) ska vara AV – annars göms notiserna',
  });

  return rader;
}

/** Appen ser inget fel: det som appen kan avgöra är ok. De två "kolla"-raderna räknas inte (de går inte att se). */
export function antalAttFixa(rader: RapportRad[]): number {
  return rader.filter((r) => r.status === 'fixa').length;
}

export function svarsrubrik(rader: RapportRad[]): { rubrik: string; avvikelse: boolean } {
  const n = antalAttFixa(rader);
  return n === 0 ? { rubrik: 'Redo för testnotis', avvikelse: false } : { rubrik: n === 1 ? '1 sak att fixa' : `${n} saker att fixa`, avvikelse: true };
}

/** Testresultatet i klartext: vad som hänt sedan testnotisen skickades. Ingen rad om inget skickats. */
export function testRader(r: TestResultat): string[] {
  if (r.skickad == null) return [];
  const klock = (ms: number) => new Date(ms).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const ut = [`Skickad ${klock(r.skickad)}${r.lage === 'framme' ? ' (appen var framme)' : r.lage === 'borta' ? ' (appen var inte framme)' : ''}`];
  ut.push(r.uppfattat != null ? `Uppfattat tryckt ${klock(r.uppfattat)}` : 'Uppfattat ej tryckt än');
  if (r.oppnad != null) ut.push(`Öppna kartan tryckt ${klock(r.oppnad)}`);
  return ut;
}

/** Brytaren för STEG 2 går att slå på när en testnotis skickats OCH Uppfattat tryckts på den (då vet vi att notis + knapp når fram). */
export function brytarenKanSlasPa(r: TestResultat): boolean {
  return r.skickad != null && r.uppfattat != null;
}
