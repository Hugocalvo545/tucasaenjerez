// shared/utils.js
import { MS_PER_DAY } from "./config.js";

// Fechas
export function normalizeDate(dateLike) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function toISO(dateLike) {
  const d = normalizeDate(dateLike);
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export function addDays(dateLike, n) {
  const d = normalizeDate(dateLike);
  if (!d) return null;
  d.setDate(d.getDate() + n);
  return d;
}

export function parseEsDate(dmy) {
  if (!dmy || typeof dmy !== "string") return null;
  const parts = dmy.split("/");
  if (parts.length !== 3) return null;

  const dd = Number(parts[0]);
  const mm = Number(parts[1]);
  const yy = Number(parts[2]);

  if (!Number.isInteger(dd) || !Number.isInteger(mm) || !Number.isInteger(yy)) return null;
  if (yy < 1900 || yy > 2200) return null;
  if (mm < 1 || mm > 12) return null;
  if (dd < 1 || dd > 31) return null;

  const dt = new Date(yy, mm - 1, dd);
  dt.setHours(0, 0, 0, 0);

  if (dt.getFullYear() !== yy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return dt;
}

export function parseISODateLocal(iso) {
  if (!iso || typeof iso !== "string") return null;

  const parts = iso.split("-");
  if (parts.length !== 3) return null;

  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);

  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const dt = new Date(y, m - 1, d);
  dt.setHours(0, 0, 0, 0);

  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

export function daysBetweenExclusiveEnd(startLike, endExclusiveLike) {
  const start = normalizeDate(startLike);
  const end = normalizeDate(endExclusiveLike);
  if (!start || !end) return [];

  const out = [];
  let d = start;
  while (d < end) {
    out.push(toISO(d));
    d = addDays(d, 1);
    if (!d) break;
  }
  return out;
}

export function nightsBetween(startLike, endLike) {
  const start = normalizeDate(startLike);
  const end = normalizeDate(endLike);
  if (!start || !end) return 0;

  const diff = end.getTime() - start.getTime();
  if (diff <= 0) return 0;

  return Math.floor(diff / MS_PER_DAY);
}

// Firestore
export function sanitizeForFirestore(value) {
  if (value === undefined) return undefined;
  if (value instanceof Date) return value;

  if (Array.isArray(value)) {
    return value.map(v => sanitizeForFirestore(v)).filter(v => v !== undefined);
  }

  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const sv = sanitizeForFirestore(v);
      if (sv !== undefined) out[k] = sv;
    }
    return out;
  }

  return value;
}
// =========================
// Validación (internacional, sin fricción)
// =========================

export function normalizeHumanName(s = "") {
  return String(s).trim().replace(/\s+/g, " ");
}

export function isPlausibleName(s = "") {
  const v = normalizeHumanName(s);
  if (v.length < 2 || v.length > 80) return false;

  // letras (incluye tildes), espacios, guiones, apóstrofes
  if (!/^[\p{L}][\p{L}\s'’-]*$/u.test(v)) return false;

  // evita "aaaaaa"
  if (/(.)\1\1\1/.test(v.toLowerCase())) return false;

  return true;
}

export function isValidEmail(s = "") {
  const v = String(s).trim();
  if (v.length < 6 || v.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
}

export function normalizePhone(s = "") {
  // deja + y dígitos
  return String(s).replace(/[^\d+]/g, "");
}

export function isValidPhone(s = "") {
  const v = normalizePhone(s);
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return false;
  // si empieza por +, que sea razonable
  if (v.startsWith("+")) return /^\+\d{7,15}$/.test(v);
  return /^\d{7,15}$/.test(digits);
}

// DNI/NIE checksum (solo si el usuario elige ese tipo)
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";

export function validateDNI(dniRaw = "") {
  const dni = String(dniRaw).toUpperCase().replace(/\s|-/g, "");
  if (!/^\d{8}[A-Z]$/.test(dni)) return false;
  const num = parseInt(dni.slice(0, 8), 10);
  return DNI_LETTERS[num % 23] === dni[8];
}

export function validateNIE(nieRaw = "") {
  const nie = String(nieRaw).toUpperCase().replace(/\s|-/g, "");
  if (!/^[XYZ]\d{7}[A-Z]$/.test(nie)) return false;
  const map = { X: "0", Y: "1", Z: "2" };
  const num = parseInt(map[nie[0]] + nie.slice(1, 8), 10);
  return DNI_LETTERS[num % 23] === nie[8];
}

// Pasaporte/OTRO: validación suave, internacional
export function validatePassportOrOther(docRaw = "") {
  const d = String(docRaw).trim().replace(/\s+/g, "");
  if (d.length < 6 || d.length > 20) return false;
  return /^[A-Z0-9]+$/i.test(d);
}

export function validateDocByType(docType = "", docNumber = "") {
  const t = String(docType || "").toUpperCase();
  const n = String(docNumber || "").trim();
  if (!n) return false;

  if (t === "DNI") return validateDNI(n);
  if (t === "NIE") return validateNIE(n);

  // PASAPORTE / OTRO: suave
  return validatePassportOrOther(n);
}

export function setButtonLoading(btn, isLoading, labelWhileLoading = "Guardando…") {
  if (!btn) return;

  if (isLoading) {
    btn.classList.add("btn-loading");

    if (btn.dataset._prevText == null) btn.dataset._prevText = btn.textContent;
    if (btn.dataset._prevDisabled == null) btn.dataset._prevDisabled = String(btn.disabled);

    btn.textContent = labelWhileLoading;
    btn.disabled = true;

    btn.setAttribute("aria-busy", "true");
    btn.setAttribute("aria-disabled", "true");
  } else {
    btn.classList.remove("btn-loading");

    if (btn.dataset._prevText != null) btn.textContent = btn.dataset._prevText;

    const wasDisabled = btn.dataset._prevDisabled === "true";
    btn.disabled = wasDisabled;

    btn.removeAttribute("aria-busy");
    btn.setAttribute("aria-disabled", String(btn.disabled));

    delete btn.dataset._prevText;
    delete btn.dataset._prevDisabled;
  }
}