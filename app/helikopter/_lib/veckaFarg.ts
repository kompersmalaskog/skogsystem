// Färgen på en veckostapel i Veckor-diagrammet — och i Månadsfacit, som ska se likadan ut: grön när veckan nått planen, orange under, grå utan plan.
import { FARG } from '@/lib/design/tokens'

export function veckaFarg(varde: number, plan: number | null): string {
  if (plan == null || plan <= 0) return FARG.text2
  return varde >= plan ? FARG.gron : FARG.orange
}
