// ─── ESPEJO SOLO-DISPLAY del helper de precio de pack ───────────────────────
// FUENTE DE VERDAD (canónico), usado por el front cliente y por el COBRO:
//   public/shared/pack-pricing.js
// La intranet (public-admin/) es OTRA raíz de hosting y no puede importar de public/shared,
// por eso este espejo. Regla: cualquier cambio de fórmula o del porcentaje por defecto se hace
// PRIMERO en el canónico y se replica aquí para que no diverjan. Aquí es solo para mostrar el
// precio derivado en la intranet; no interviene en el cálculo del importe que se cobra.

export const PACK_PCT_DEFAULT = 85;

function resolvePctNumber(pct) {
  const v = Number(pct);
  return Number.isFinite(v) && v > 0 ? v : PACK_PCT_DEFAULT;
}

export function resolvePackPct(packDoc) {
  return resolvePctNumber(packDoc?.packPct);
}

// Devuelve null si falta el precio de alguna unidad (⇒ noche no reservable en el pack).
export function packNightlyPriceFromUnits(unitPrices, packPct) {
  if (!Array.isArray(unitPrices) || unitPrices.length === 0) return null;
  let sum = 0;
  for (const p of unitPrices) {
    if (!Number.isFinite(p)) return null;
    sum += p;
  }
  return Math.round(sum * resolvePctNumber(packPct) / 100);
}

export function packBasePrice(baseA, baseB, packPct) {
  return packNightlyPriceFromUnits([baseA, baseB], packPct);
}
