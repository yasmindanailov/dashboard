/**
 * Sprint 15D Fase 15D.F.3 — helper canónico de normalización de FQDN.
 *
 * El linkage Domain↔Hosting es por string `services.domain` (DH-INV-4), pero
 * distintos orígenes lo guardan con distinto case / trailing dot (p.ej. el
 * checkout persiste `item.domain` del hosting sin normalizar). Para comparar de
 * forma fiable "¿este hosting es del mismo dominio que este registro?" (F.3:
 * selección de NS al registrar + listener de switch de NS) se normaliza ambos
 * lados con este helper único.
 */

/** Normaliza un FQDN para comparación: lowercase + trim + sin trailing dot. */
export function normalizeFqdn(fqdn: string): string {
  return fqdn.trim().toLowerCase().replace(/\.$/, '');
}
