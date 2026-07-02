// ─── Precio del pack: fórmula ÚNICA y canónica ──────────────────────────────
// Decisión de producto: el pack NO tiene precio propio editable. Su precio SIEMPRE se deriva
// de las unidades: packPct × (precio unidad A + precio unidad B). packPct vive en /packs/{id}.packPct.
// Este es el helper canónico; lo usan listado, ficha, checkout y el cobro por-noche (public/multi/*).
// La intranet (public-admin/, otra raíz de hosting que no puede importar de aquí) mantiene un
// espejo SOLO-DISPLAY que debe apuntar a este archivo por comentario para no divergir.

import { PACK_PCT_DEFAULT } from './config.js';

// Normaliza packPct a un número válido; si no lo es, cae al default centralizado.
function resolvePctNumber(pct) {
  const v = Number(pct);
  return Number.isFinite(v) && v > 0 ? v : PACK_PCT_DEFAULT;
}

// packPct efectivo de un doc de pack (/packs/{id}).
export function resolvePackPct(packDoc) {
  return resolvePctNumber(packDoc?.packPct);
}

// Precio derivado de UNA noche a partir de los precios de las unidades esa noche.
// Devuelve null si falta el precio de alguna unidad ⇒ esa noche NO es reservable en el pack.
export function packNightlyPriceFromUnits(unitPrices, packPct) {
  if (!Array.isArray(unitPrices) || unitPrices.length === 0) return null;
  let sum = 0;
  for (const p of unitPrices) {
    if (!Number.isFinite(p)) return null;
    sum += p;
  }
  return Math.round(sum * resolvePctNumber(packPct) / 100);
}

// Azúcar para el caso de 2 unidades (A + B), que es el del producto.
export function packNightlyPrice(priceA, priceB, packPct) {
  return packNightlyPriceFromUnits([priceA, priceB], packPct);
}

// Precio base de display (packPct × suma de precioBase de las unidades). Misma fórmula.
export function packBasePrice(baseA, baseB, packPct) {
  return packNightlyPriceFromUnits([baseA, baseB], packPct);
}
