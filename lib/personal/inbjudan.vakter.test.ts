/**
 * Konton skapas bara av admin via servern (Martin stängde "Allow new users to sign up" i Supabase). Källvakter:
 *  1. Ingen kod i appen anropar signUp — varken i klienten eller på servern.
 *  2. Service-nyckeln och admin-klienten används bara av serverkod, aldrig av en klientfil.
 *  3. Routen som bjuder in börjar med kravRoll(ADMIN_ROLLER).
 *  4. Klienten skapar inte längre medarbetare-rader själv: Ny medarbetare går via routen.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROT = join(__dirname, "..", "..");
const SKIPPA = new Set(["node_modules", ".next", ".git", "supabase", "docs", "public", "scripts"]);

function filer(dir: string, ut: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    if (SKIPPA.has(n)) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) filer(p, ut);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) ut.push(p);
  }
  return ut;
}
const alla = filer(ROT).map(p => ({ rel: relative(ROT, p).replace(/\\/g, "/"), src: readFileSync(p, "utf8") }));
const kodUtanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const arKlientfil = (f: { rel: string; src: string }) =>
  /^\s*['"]use client['"]/m.test(f.src.slice(0, 200)) || f.rel.startsWith("components/");

describe("inbjudan: konton skapas bara av servern", () => {
  it("inget signUp-anrop någonstans i appens kod", () => {
    const traffar = alla.filter(f => /\.signUp\s*\(/.test(kodUtanKommentarer(f.src))).map(f => f.rel);
    expect(traffar).toEqual([]);
  });

  it("service-nyckeln nämns bara i serverkod (inte i 'use client' eller components/)", () => {
    const traffar = alla.filter(f => arKlientfil(f) && /SERVICE_ROLE|adminSupabase|lib\/auth\/admin/.test(kodUtanKommentarer(f.src))).map(f => f.rel);
    expect(traffar).toEqual([]);
  });

  it("ingen NEXT_PUBLIC-variabel bär service-nyckeln", () => {
    const traffar = alla.filter(f => /NEXT_PUBLIC_[A-Z_]*SERVICE/.test(f.src)).map(f => f.rel);
    expect(traffar).toEqual([]);
  });

  it("auth.admin.* anropas bara från routen som bjuder in", () => {
    const traffar = alla.filter(f => /auth\.admin\./.test(kodUtanKommentarer(f.src))).map(f => f.rel);
    expect(traffar).toEqual(["app/api/personal/bjud-in/route.ts"]);
  });

  it("routen kräver admin FÖRE allt annat (kravRoll är första satsen i POST)", () => {
    const src = readFileSync(join(ROT, "app/api/personal/bjud-in/route.ts"), "utf8");
    const post = src.slice(src.indexOf("export async function POST"));
    expect(post).toMatch(/^export async function POST\(request: Request\) \{\s*const vakt = await kravRoll\(ADMIN_ROLLER\);\s*if \(!vakt\.ok\) return vakt\.res;/);
    expect(post.indexOf("kravRoll")).toBeLessThan(post.indexOf("adminSupabase()"));
  });

  it("Ny medarbetare skapar inte längre raden från webbläsaren — ingen insert i medarbetare, personen skapas via routen", () => {
    const src = kodUtanKommentarer(readFileSync(join(ROT, "components/admin/NyMedarbetare.tsx"), "utf8"));
    expect(src).not.toMatch(/from\("medarbetare"\)\.insert/);
    expect(src).toContain("/api/personal/bjud-in");
  });

  it("/valkommen är öppen utan session i middleware (den inbjudna har ingen ännu), och bara den sidan utöver /login", () => {
    const src = readFileSync(join(ROT, "middleware.ts"), "utf8");
    expect(src).toMatch(/arOppenSida = isLoginPage \|\| pathname === '\/valkommen'/);
    expect(src.match(/pathname === '\/[a-z]+'/g)).toEqual(["pathname === '/login'", "pathname === '/valkommen'"]);
  });
});
