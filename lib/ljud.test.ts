import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ljudSokvag, ljudSpelbarKalla, LJUD_LANK_SEKUNDER } from "./ljud";

const SUPA = "https://mxydghzfacbenbgpodex.supabase.co";
const SOKVAG = "9e1a40dc-925e-429e-9bef-3545542a0c9b/1772282860793/note-note-1772307595589-1772307664320.webm";

describe("ljudSokvag: sökvägen i bucketen ur det som ligger sparat", () => {
  it("gammal publik URL (så som de tre befintliga ljuden, feedback och markeringar sparades)", () => {
    expect(ljudSokvag(`${SUPA}/storage/v1/object/public/audio/${SOKVAG}`)).toBe(SOKVAG);
  });
  it("redan signerad URL (med token) och authenticated-URL", () => {
    expect(ljudSokvag(`${SUPA}/storage/v1/object/sign/audio/${SOKVAG}?token=abc`)).toBe(SOKVAG);
    expect(ljudSokvag(`${SUPA}/storage/v1/object/authenticated/audio/${SOKVAG}`)).toBe(SOKVAG);
  });
  it("URL-kodade tecken avkodas, frågetecken och fragment klipps", () => {
    expect(ljudSokvag(`${SUPA}/storage/v1/object/public/audio/obj/mark%C3%B6r/1.webm?t=1#x`)).toBe("obj/markör/1.webm");
  });
  it("en ren sökväg är sig själv (leading slash bort)", () => {
    expect(ljudSokvag(SOKVAG)).toBe(SOKVAG);
    expect(ljudSokvag(`/${SOKVAG}`)).toBe(SOKVAG);
  });
  it("lokala och främmande källor ligger inte i bucketen → null (spelas som de är)", () => {
    expect(ljudSokvag("blob:https://app.example.se/1234")).toBeNull();
    expect(ljudSokvag("data:audio/webm;base64,AAAA")).toBeNull();
    expect(ljudSokvag("https://annan.example.se/ljud.mp3")).toBeNull();
    expect(ljudSokvag("")).toBeNull();
    expect(ljudSokvag(null)).toBeNull();
    expect(ljudSokvag(undefined)).toBeNull();
  });
});

const fakeStorage = (svar: { data?: any; error?: any } | (() => never)) => {
  const createSignedUrl = vi.fn(async () => (typeof svar === "function" ? svar() : (svar as any)));
  const from = vi.fn(() => ({ createSignedUrl }));
  return { client: { storage: { from } } as any, createSignedUrl, from };
};

describe("ljudSpelbarKalla", () => {
  it("bucket-källa → en signerad länk, 10 minuter, ur bucketen 'audio'", async () => {
    const f = fakeStorage({ data: { signedUrl: "https://signerad/x?token=1" }, error: null });
    const r = await ljudSpelbarKalla(f.client, `${SUPA}/storage/v1/object/public/audio/${SOKVAG}`);
    expect(r).toEqual({ ok: true, url: "https://signerad/x?token=1" });
    expect(f.from).toHaveBeenCalledWith("audio");
    expect(f.createSignedUrl).toHaveBeenCalledWith(SOKVAG, LJUD_LANK_SEKUNDER);
    expect(LJUD_LANK_SEKUNDER).toBeLessThanOrEqual(900);
  });
  it("blob/data skickas aldrig till storage", async () => {
    const f = fakeStorage({ data: null, error: null });
    expect(await ljudSpelbarKalla(f.client, "blob:x")).toEqual({ ok: true, url: "blob:x" });
    expect(f.createSignedUrl).not.toHaveBeenCalled();
  });
  it("storage nekar (ingen medarbetare) eller kastar → ok:false, kastar aldrig", async () => {
    expect(await ljudSpelbarKalla(fakeStorage({ data: null, error: { message: "not allowed" } }).client, SOKVAG)).toEqual({ ok: false });
    expect(await ljudSpelbarKalla(fakeStorage(() => { throw new Error("nät"); }).client, SOKVAG)).toEqual({ ok: false });
    expect(await ljudSpelbarKalla(fakeStorage({ data: {}, error: null }).client, SOKVAG)).toEqual({ ok: false });
    expect(await ljudSpelbarKalla(fakeStorage({ data: null, error: null }).client, "")).toEqual({ ok: false });
  });
});

describe("ingen spelar ljud direkt från en adress", () => {
  const ROT = join(__dirname, "..");
  function filer(dir: string, ut: string[] = []): string[] {
    for (const n of readdirSync(dir)) {
      if (["node_modules", ".next", ".git"].includes(n)) continue;
      const p = join(dir, n);
      if (statSync(p).isDirectory()) filer(p, ut);
      else if (/\.tsx$/.test(n) && !/\.test\.tsx$/.test(n)) ut.push(p);
    }
    return ut;
  }
  it("<audio …> finns bara i components/LjudSpelare.tsx (allt annat går via den)", () => {
    const traffar = ["app", "components"].flatMap(d => filer(join(ROT, d)))
      .filter(p => /<audio[\s>]/.test(readFileSync(p, "utf8"))).map(p => relative(ROT, p).replace(/\\/g, "/"));
    expect(traffar).toEqual(["components/LjudSpelare.tsx"]);
  });
  it("bucketen 'audio' läses aldrig via getPublicUrl för uppspelning (appen sparar texten men spelar via LjudSpelare)", () => {
    const sp = readFileSync(join(ROT, "components/LjudSpelare.tsx"), "utf8");
    expect(sp).not.toMatch(/getPublicUrl/);
  });
});
