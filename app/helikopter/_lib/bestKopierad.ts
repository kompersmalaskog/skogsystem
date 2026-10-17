// Minns att månadens beställning lades in med "Samma som förra månaden" — då är den inte bekräftad av Vida än, och Månadsplanen (A4)
// tar upp "Vida: beställning bekräftad?" under ATT GÖRA. Per enhet (localStorage), inget som måste överleva: utan det saknas bara den raden.
const nyckel = (ar: number, manad: number) => `helikopter_best_kopierad_${ar}-${manad}`

export function markeraBestallningKopierad(ar: number, manad: number): void {
  try { window.localStorage.setItem(nyckel(ar, manad), '1') } catch { /* privat läge — raden uteblir */ }
}

export function arBestallningKopierad(ar: number, manad: number): boolean {
  try { return window.localStorage.getItem(nyckel(ar, manad)) === '1' } catch { return false }
}
