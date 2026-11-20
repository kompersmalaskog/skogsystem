// Push-notisens enhet i ord. push_subscriptions.device_name är webbläsarens tekniska text
// ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 …"); Inställningar visar vad det ÄR, aldrig strängen.

export function enhetText(ua: string | null | undefined): string {
  const s = (ua || "").toLowerCase();
  if (!s) return "den här enheten";
  if (s.includes("iphone")) return "iPhone";
  if (s.includes("ipad")) return "iPad";
  if (s.includes("android")) return s.includes("mobile") ? "Android-telefon" : "Android-platta";
  if (s.includes("macintosh") || s.includes("mac os")) return "Mac";
  if (s.includes("windows")) return "Windows-dator";
  if (s.includes("linux")) return "dator";
  // En kort text som inte är en webbläsarsträng (t.ex. "Denna enhet") visas som den är.
  return ua!.length <= 30 && !ua!.includes("/") ? ua! : "den här enheten";
}
