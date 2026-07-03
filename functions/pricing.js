"use strict";
// Espejo EXACTO de los helpers de precio del front, para que el total del servidor coincida
// al céntimo con el que ve el cliente. Fuente: public/shared/pack-pricing.js y config.js.
// Si cambia la fórmula o los niveles allí, actualizar aquí (no hay import cross-root).

const PACK_PCT_DEFAULT = 85;

function resolvePctNumber(pct) {
  const v = Number(pct);
  return Number.isFinite(v) && v > 0 ? v : PACK_PCT_DEFAULT;
}

function resolvePackPct(packDoc) {
  return resolvePctNumber(packDoc && packDoc.packPct);
}

// null si falta el precio de alguna unidad ⇒ esa noche NO es reservable en el pack.
function packNightlyPriceFromUnits(unitPrices, packPct) {
  if (!Array.isArray(unitPrices) || unitPrices.length === 0) return null;
  let sum = 0;
  for (const p of unitPrices) {
    if (!Number.isFinite(p)) return null;
    sum += p;
  }
  return Math.round(sum * resolvePctNumber(packPct) / 100);
}

// Espejo de LEVELS / calculateLevel de public/shared/config.js.
const LEVELS = [
  { level: 1, min: 0,     discount: 0  },
  { level: 2, min: 500,   discount: 5  },
  { level: 3, min: 1500,  discount: 8  },
  { level: 4, min: 3000,  discount: 10 },
  { level: 5, min: 5000,  discount: 12 },
  { level: 6, min: 10000, discount: 15 },
];

function calculateLevel(points) {
  const p = Number(points) || 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (p >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}

module.exports = {
  PACK_PCT_DEFAULT, resolvePackPct, packNightlyPriceFromUnits, calculateLevel,
};
