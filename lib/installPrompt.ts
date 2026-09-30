// PWA-installation på skrivbordet (Chrome/Edge). `beforeinstallprompt` fångas och
// sparas; en rad i Inställningar låter användaren trigga webbläsarens install-dialog.
//
// Synlighetsregeln är ren och testbar: raden visas BARA när prompten faktiskt fångats
// (webbläsaren erbjuder installation) OCH appen inte redan körs installerad (standalone).
// Placeringen i UI:t (inne i GPS-källa-kortet, som bara finns på maskindatorn via
// Web Serial-stöd) sköter desktop-avgränsningen → ingen ändring på telefon.

export function skaVisaInstallera(promptFangad: boolean, arStandalone: boolean): boolean {
  return promptFangad && !arStandalone;
}

// Körs appen som installerad PWA? display-mode: standalone (desktop + Android) eller
// navigator.standalone (iOS). Defensivt: allt bakom try, false vid SSR/avsaknad.
export function erStandalone(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const mm = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return !!mm || (typeof navigator !== 'undefined' && (navigator as any).standalone === true);
  } catch {
    return false;
  }
}
