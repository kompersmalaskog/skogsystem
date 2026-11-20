// CSV för svensk Excel: BOM + semikolon (som Flyttloggen). Fält med semikolon, citattecken eller radbrytning
// citeras — ett objektnamn med ';' får aldrig förskjuta kolumnerna.

export function csvText(rader: readonly (string | number)[][]): string {
  const falt = (v: string | number) => {
    const s = String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rader.map(r => r.map(falt).join(';')).join('\r\n');
}

export function laddaNerCsv(rader: readonly (string | number)[][], filnamn: string): void {
  const blob = new Blob([csvText(rader)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filnamn;
  a.click();
  URL.revokeObjectURL(a.href);
}
