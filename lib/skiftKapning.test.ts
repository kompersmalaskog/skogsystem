import { describe, it, expect } from "vitest";
import { kapaSyntetiskaSkift, arSyntetisktSkift } from "./skiftKapning";

// R64428 2026-10-07 som den låg i prod: Rottne utan OperatorShiftDefinition, syntetiska skift (SYN_), och parsern fyllde
// BÅDA förarnas utloggning till filens ReportEndTime (20:50:51.132817).
const oskar = { maskin_id: "R64428", datum: "2026-10-07", operator_id: "R64428_8", shift_key: "SYN_2026-10-07_R64428_8", inloggning_tid: "2026-10-07T06:59:48.738105+00:00", utloggning_tid: "2026-10-07T20:50:51.132817+00:00", langd_sek: 49862 };
const martin = { maskin_id: "R64428", datum: "2026-10-07", operator_id: "R64428_9", shift_key: "SYN_2026-10-07_R64428_9", inloggning_tid: "2026-10-07T16:50:48.275589+00:00", utloggning_tid: "2026-10-07T20:50:51.132817+00:00", langd_sek: 14402 };

describe("kapaSyntetiskaSkift: ett syntetiskt pass slutar när nästa förare loggar in på samma maskin", () => {
  it("Oskar/Martin 2026-10-07: Oskars pass slutar 16:50:48 (Martins inloggning), Martins rörs inte", () => {
    const ut = kapaSyntetiskaSkift([oskar, martin]);
    expect(ut[0].utloggning_tid).toBe(martin.inloggning_tid);
    // Spännet 06:59:48.738105 → 16:50:48.275589 = 35459,54 s. Importern trunkerar (int()), prod har 49862 resp. 14402 för
    // Oskars och Martins hela pass — kapningen följer samma regel.
    expect(ut[0].langd_sek).toBe(35459);
    expect(ut[1]).toEqual(martin);
  });

  it("ordningen i listan spelar ingen roll", () => {
    const ut = kapaSyntetiskaSkift([martin, oskar]);
    expect(ut.find(r => r.operator_id === "R64428_8")!.utloggning_tid).toBe(martin.inloggning_tid);
    expect(ut.find(r => r.operator_id === "R64428_9")).toEqual(martin);
  });

  it("indatan ändras inte (ren funktion)", () => {
    const kopia = JSON.parse(JSON.stringify([oskar, martin]));
    kapaSyntetiskaSkift([oskar, martin]);
    expect([oskar, martin]).toEqual(kopia);
  });

  it("idempotent: ett redan kapat pass kapas inte igen", () => {
    const en = kapaSyntetiskaSkift([oskar, martin]);
    expect(kapaSyntetiskaSkift(en)).toEqual(en);
  });

  it("Ponsse (äkta ShifKey, inte SYN_) rörs INTE: maskinens egen utloggning är en uppgift, inte en gissning", () => {
    const a = { maskin_id: "A030353", datum: "2026-08-18", operator_id: "A030353_2", shift_key: "649", inloggning_tid: "2026-08-18T04:07:00+00:00", utloggning_tid: "2026-08-18T07:42:00+00:00", langd_sek: 12900 };
    const b = { maskin_id: "A030353", datum: "2026-08-18", operator_id: "A030353_1", shift_key: "650", inloggning_tid: "2026-08-18T07:20:00+00:00", utloggning_tid: "2026-08-18T17:18:00+00:00", langd_sek: 35880 };
    expect(kapaSyntetiskaSkift([a, b])).toEqual([a, b]);
  });

  it("ett syntetiskt pass kapas även mot en förare med äkta skift-nyckel", () => {
    const syn = { ...oskar };
    const aktt = { ...martin, shift_key: "9001" };
    expect(kapaSyntetiskaSkift([syn, aktt])[0].utloggning_tid).toBe(martin.inloggning_tid);
  });

  it("ingen överlappning: inget ändras", () => {
    const tidig = { ...oskar, utloggning_tid: "2026-10-07T16:50:00+00:00", langd_sek: 35412 };
    expect(kapaSyntetiskaSkift([tidig, martin])).toEqual([tidig, martin]);
  });

  it("kedja A → B → C: varje pass slutar där nästa förare loggar in", () => {
    const a = { ...oskar, utloggning_tid: "2026-10-07T20:00:00+00:00" };
    const b = { ...martin, utloggning_tid: "2026-10-07T20:00:00+00:00" };
    const c = { ...martin, operator_id: "R64428_10", shift_key: "SYN_2026-10-07_R64428_10", inloggning_tid: "2026-10-07T18:30:00+00:00", utloggning_tid: "2026-10-07T20:00:00+00:00" };
    const ut = kapaSyntetiskaSkift([a, b, c]);
    expect(ut[0].utloggning_tid).toBe(b.inloggning_tid);   // A slutar när B loggar in
    expect(ut[1].utloggning_tid).toBe(c.inloggning_tid);   // B slutar när C loggar in
    expect(ut[2].utloggning_tid).toBe(c.utloggning_tid);   // C sist: oförändrad
  });

  it("samma förare med flera pass samma dag räknas inte som 'en annan förare'", () => {
    const f1 = { ...oskar, shift_key: "SYN_2026-10-07_R64428_8" };
    const f2 = { ...oskar, shift_key: "SYN_2026-10-07_R64428_8b", inloggning_tid: "2026-10-07T12:00:00+00:00" };
    expect(kapaSyntetiskaSkift([f1, f2])).toEqual([f1, f2]);
  });

  it("olika maskiner eller dagar påverkar inte varandra", () => {
    const annanMaskin = { ...martin, maskin_id: "R64101", shift_key: "SYN_2026-10-07_R64101_9" };
    const annanDag = { ...martin, datum: "2026-10-08" };
    expect(kapaSyntetiskaSkift([oskar, annanMaskin, annanDag])[0]).toEqual(oskar);
  });

  it("samma inloggningstid (5b-fallet) ger ingen nolllång kapning", () => {
    const a = { ...oskar, inloggning_tid: "2026-10-07T06:49:00+00:00" };
    const b = { ...martin, inloggning_tid: "2026-10-07T06:49:00+00:00" };
    expect(kapaSyntetiskaSkift([a, b])).toEqual([a, b]);
  });

  it("arSyntetisktSkift: bara nycklar som börjar på SYN_", () => {
    expect(arSyntetisktSkift({ shift_key: "SYN_2026-10-07_R64428_8" })).toBe(true);
    expect(arSyntetisktSkift({ shift_key: "649" })).toBe(false);
    expect(arSyntetisktSkift({ shift_key: null })).toBe(false);
    expect(arSyntetisktSkift({})).toBe(false);
  });
});
