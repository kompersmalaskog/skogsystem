/**
 * VAPID-nycklarna för web-push. EN källa för den publika nyckeln (klienten prenumererar med den, servern signerar med paret).
 *
 * Den PRIVATA nyckeln finns bara i miljön (VAPID_PRIVATE_KEY i Vercel) — aldrig i koden. Saknas den skickas ingen push,
 * och anroparen säger det i klartext i stället för att tyst använda en nyckel som ligger i git.
 */
export const VAPID_PUBLIC_KEY =
  "BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34";
export const VAPID_SUBJECT = "mailto:info@kompersmalskog.se";

export const VAPID_SAKNAS = "VAPID_PRIVATE_KEY saknas i miljön — ingen push kan skickas.";

/** Den privata nyckeln ur miljön, eller null. */
export function vapidPrivatNyckel(): string | null {
  const v = process.env.VAPID_PRIVATE_KEY;
  return v && v.trim() ? v.trim() : null;
}

/** Publik nyckel som Uint8Array för pushManager.subscribe. */
export function vapidPublikSomBytes(): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (VAPID_PUBLIC_KEY.length % 4)) % 4);
  const base64 = (VAPID_PUBLIC_KEY + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const ut = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) ut[i] = raw.charCodeAt(i);
  return ut;
}
