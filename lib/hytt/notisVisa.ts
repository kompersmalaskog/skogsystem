// Notiser i hytten: själva visandet i webbläsaren. Notisen skapas av service workern (registration.showNotification) — bara så får den knappar och bara så kan en tryckning på
// knappen hanteras utan att appen öppnas (public/sw.js). Allt här är tyst vid fel: en notis som inte kunde visas får aldrig fälla larmet, kortet eller sidan.

import type { HyttNotis } from './notiser';

export type NotisStod = { stods: boolean; behorighet: NotificationPermission | 'saknas' };

export function notisStod(): NotisStod {
  const stods = typeof window !== 'undefined' && 'Notification' in window && typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  return { stods, behorighet: stods ? Notification.permission : 'saknas' };
}

/** Är appen installerad som app (eget fönster, inte en flik)? Chrome-appen på maskinen ska vara det. */
export function arInstallerad(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: window-controls-overlay)').matches
      || window.matchMedia('(display-mode: minimal-ui)').matches || (navigator as { standalone?: boolean }).standalone === true;
  } catch { return false; }
}

async function registrering(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!('serviceWorker' in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js').then(() => navigator.serviceWorker.ready));
  } catch { return null; }
}

/** Ber om tillstånd (kräver ett tryck från föraren). Returnerar behörigheten efteråt. */
export async function beOmBehorighet(): Promise<NotificationPermission | 'saknas'> {
  try {
    if (!('Notification' in window)) return 'saknas';
    if (Notification.permission === 'default') return await Notification.requestPermission();
    return Notification.permission;
  } catch { return 'saknas'; }
}

/** Visar en notis. true = Chrome tog emot den. */
export async function visaHyttNotis(n: HyttNotis): Promise<boolean> {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
    const reg = await registrering();
    if (!reg) return false;
    await reg.showNotification(n.titel, {
      body: n.text, icon: n.ikon, badge: n.ikon, tag: n.tag, renotify: n.renotify, requireInteraction: n.kvarTillTryck, silent: false,
      actions: n.knappar, data: n.data,
    } as NotificationOptions);
    return true;
  } catch (e) {
    try { console.warn('[Notiser] kunde inte visa:', e instanceof Error ? e.message : e); } catch { /* */ }
    return false;
  }
}

/** Stänger notiser från hytten: de angivna taggarna, eller alla (appen är framme igen). */
export async function stangHyttNotiser(taggar?: readonly string[]): Promise<void> {
  try {
    const reg = await registrering();
    if (!reg) return;
    const uppe = await reg.getNotifications();
    for (const n of uppe) {
      const d = n.data as { hytt?: boolean } | null;
      if (!d?.hytt) continue;
      if (!taggar || taggar.includes(n.tag)) n.close();
    }
  } catch { /* inget att stänga */ }
}
