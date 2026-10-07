// Löneartskoderna så som produktionens lonesystem_artikelmappning ser ut (2026-10): bara för tester.
// Exporten har inga egna koder längre — de läses ur tabellen. Ett test som ska se Fortnox-raderna skickar in dessa.
import type { Loneartskoder } from "./loneart";

export const PROD_KODER: Loneartskoder = {
  timlon: "11",
  premielon_skordare: "1355",
  premielon_skotare: "1354",
  overtid_skordare: "1435",
  overtid_skotare: "1436",
  valtlappar: "136",
  korersattning: "821",
};
