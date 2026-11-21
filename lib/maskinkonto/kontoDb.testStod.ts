// Testfake för maskinkontots servervägar: en minimal Supabase-klient över arrayer (select/eq/is/insert/update/delete) plus auth.admin.
// Skriver ner varje skrivning så att testerna kan se exakt vad som skapades och vad som städades bort.
import { vi } from 'vitest'

export type Tabeller = Record<string, any[]>

export function kontoDb(t: Tabeller, opt: { epostTaget?: (epost: string) => boolean; createFel?: (epost: string) => string | null; hamtaFel?: boolean; insertFel?: (tabell: string) => boolean } = {}) {
  const skrivningar: { tabell: string; op: string; rad?: any; filter?: Record<string, any> }[] = []
  const auth = { skapade: [] as { id: string; email: string; password: string }[], raderade: [] as string[], lankar: [] as string[] }
  let nastaId = 1
  const from = (tabell: string) => {
    let rader = [...(t[tabell] ?? [])]
    const filter: Record<string, any> = {}
    let kind: 'select' | 'update' | 'delete' = 'select'
    let patch: any = null
    const klar = () => {
      if (kind === 'update') {
        const traff = (t[tabell] ?? []).filter(r => Object.entries(filter).every(([k, v]) => (r[k] ?? null) === v))
        traff.forEach(r => Object.assign(r, patch))
        skrivningar.push({ tabell, op: 'update', rad: patch, filter })
        return traff
      }
      if (kind === 'delete') {
        const kvar = (t[tabell] ?? []).filter(r => !Object.entries(filter).every(([k, v]) => (r[k] ?? null) === v))
        t[tabell] = kvar
        skrivningar.push({ tabell, op: 'delete', filter })
        return []
      }
      return rader
    }
    const b: any = {
      select: () => b,
      eq: (k: string, v: any) => { filter[k] = v; rader = rader.filter(r => r[k] === v); return b },
      is: (k: string, v: any) => { filter[k] = v; rader = rader.filter(r => (r[k] ?? null) === v); return b },
      in: (k: string, v: any[]) => { rader = rader.filter(r => v.includes(r[k])); return b },
      order: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: kind === 'select' ? (rader[0] ?? null) : null, error: null }),
      insert: (rad: any) => {
        if (opt.insertFel?.(tabell)) {
          const f: any = Promise.resolve({ data: null, error: { message: 'insert nekad' } })
          f.select = () => Promise.resolve({ data: null, error: { message: 'insert nekad' } })
          return f
        }
        const ny = { id: rad.id ?? `med-${nastaId++}`, ...rad }
        skrivningar.push({ tabell, op: 'insert', rad: ny });
        (t[tabell] ??= []).push(ny)
        const c: any = Promise.resolve({ data: [ny], error: null })
        c.select = () => Promise.resolve({ data: [ny], error: null })
        return c
      },
      update: (p: any) => { kind = 'update'; patch = p; return b },
      delete: () => { kind = 'delete'; return b },
      then: (ok: any, fel?: any) => { const data = klar(); return Promise.resolve({ data, error: opt.hamtaFel ? { message: 'fel' } : null }).then(ok, fel) },
    }
    return b
  }
  const db = {
    from, skrivningar, auth: { ...auth, admin: {
      createUser: vi.fn(async (a: { email: string; password: string }) => {
        const fel = opt.createFel?.(a.email)
        if (fel) return { data: { user: null }, error: { message: fel } }
        const u = { id: `u-ny-${auth.skapade.length + 1}`, email: a.email, password: a.password }
        auth.skapade.push(u)
        return { data: { user: { id: u.id } }, error: null }
      }),
      deleteUser: vi.fn(async (id: string) => { auth.raderade.push(id); return { error: null } }),
      getUserById: vi.fn(async (id: string) => ({ data: { user: { id, email: `${id}@maskin.invalid`, created_at: '2026-11-21T07:30:00Z' } }, error: null })),
      generateLink: vi.fn(async (a: { email: string }) => { auth.lankar.push(a.email); return { data: { properties: { hashed_token: `tok-${a.email}` } }, error: null } }),
    } },
    spar: auth,
  }
  return db
}
