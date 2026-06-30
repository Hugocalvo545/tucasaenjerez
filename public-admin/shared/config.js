// shared/config.js

// ==============================
// Constantes generales
// ==============================
export const PRICE_PER_NIGHT = 68;
export const HOLD_MINUTES = 15;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;

// ==============================
// Helpers env (Vite o Vanilla env.js)
// ==============================
function readViteEnv(key) {
  try {
    return (typeof import.meta !== "undefined" && import.meta?.env && import.meta.env[key]) || null;
  } catch {
    return null;
  }
}

function readWindowEnv() {
  return (typeof window !== "undefined" && window.__ENV__) ? window.__ENV__ : null;
}

function requireKeys(obj, keys, label) {
  const missing = keys.filter((k) => !obj?.[k]);
  if (missing.length) {
    throw new Error(`Config incompleta (${label}). Faltan: ${missing.join(", ")}`);
  }
}

// ==============================
// Endpoints externos
// ==============================
export const GOOGLE_SHEETS_URL =
  readViteEnv("VITE_GOOGLE_SHEETS_URL") ||
  readWindowEnv()?.GOOGLE_SHEETS_URL ||
  "https://script.google.com/macros/s/AKfycbyl4auWVmsJX5ReQKzdpDNxD51DKM1cOLftTJ-Q10vtuK_UJ19_rFTBM08Av94Q_8TK/exec";

// ==============================
// Firebase
// ==============================
function getFirebaseConfig() {
  const wenv = readWindowEnv();

  // 1) Preferido en tu proyecto (vanilla): shared/env.js
  if (wenv?.FIREBASE) {
    const fb = wenv.FIREBASE;
    requireKeys(
      fb,
      ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"],
      "window.__ENV__.FIREBASE (shared/env.js)"
    );
    return fb;
  }

  // 2) Soporte legacy (por si tenías claves sueltas en window.__ENV__)
  if (wenv?.FIREBASE_API_KEY) {
    const fb = {
      apiKey: wenv.FIREBASE_API_KEY,
      authDomain: wenv.FIREBASE_AUTH_DOMAIN,
      projectId: wenv.FIREBASE_PROJECT_ID,
      storageBucket: wenv.FIREBASE_STORAGE_BUCKET,
      messagingSenderId: wenv.FIREBASE_MESSAGING_SENDER_ID,
      appId: wenv.FIREBASE_APP_ID,
    };
    requireKeys(
      fb,
      ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"],
      "window.__ENV__ (claves sueltas)"
    );
    return fb;
  }

  // 3) Si algún día usas Vite
  const vite = {
    apiKey: readViteEnv("VITE_FIREBASE_API_KEY"),
    authDomain: readViteEnv("VITE_FIREBASE_AUTH_DOMAIN"),
    projectId: readViteEnv("VITE_FIREBASE_PROJECT_ID"),
    storageBucket: readViteEnv("VITE_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: readViteEnv("VITE_FIREBASE_MESSAGING_SENDER_ID"),
    appId: readViteEnv("VITE_FIREBASE_APP_ID"),
  };

  const anyVite = Object.values(vite).some(Boolean);
  if (anyVite) {
    requireKeys(
      vite,
      ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"],
      "import.meta.env (Vite)"
    );
    return vite;
  }

  // Si llega aquí, es que no cargaste env.js antes de los módulos
  throw new Error(
    "No hay configuración Firebase. Carga ../shared/env.js antes de los <script type=\"module\">."
  );
}

export const firebaseConfig = Object.freeze(getFirebaseConfig());

// ==============================
// Niveles de fidelización
// ==============================
export const LEVELS = Object.freeze([
  Object.freeze({
    level: 1,
    name: "Viajero Novato",
    min: 0,
    max: 100,
    reward: "Bienvenida al club",
    description: "Comienza tu aventura",
    discountPercent: 0,
  }),
  Object.freeze({
    level: 2,
    name: "Viajero Plata",
    min: 100,
    max: 300,
    reward: "Descuento 5% permanente",
    description: "¡Ya eres parte de la comunidad!",
    discountPercent: 5,
  }),
  Object.freeze({
    level: 3,
    name: "Viajero Oro",
    min: 300,
    max: 600,
    reward: "Descuento 5% permanente + Bombones",
    description: "Tus viajes son nuestros favoritos",
    discountPercent: 5,
  }),
  Object.freeze({
    level: 4,
    name: "Viajero Platino",
    min: 600,
    max: 1000,
    reward: "Descuento 10% permanente + Bombones",
    description: "Elite de nuestros viajeros",
    discountPercent: 10,
  }),
  Object.freeze({
    level: 5,
    name: "Viajero VIP",
    min: 1000,
    max: 3000,
    reward: "Descuento 10% permanente + Detallito al llegar",
    description: "Eres nuestro cliente especial",
    discountPercent: 10,
  }),
  Object.freeze({
    level: 6,
    name: "Viajero Leyenda",
    min: 3000,
    max: Number.POSITIVE_INFINITY,
    reward: "Descuento 15% permanente + Sorpresa al llegar",
    description: "¡Eres nuestra leyenda viviente!",
    discountPercent: 15,
  }),
]);
