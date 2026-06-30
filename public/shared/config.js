export const PRICE_PER_NIGHT = 68;
export const HOLD_MINUTES = 15;
export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const CANCEL_POLICY_DAYS = 5; // días antes del check-in hasta los que se permite cancelar

// PRODUCCIÓN: actualizar estas tres URLs al dominio real antes del lanzamiento.
// Buscar en el proyecto los comentarios "// PRODUCCIÓN: URL" para localizarlas todas.
export const WORDPRESS_URL = "https://tucasaenjerez.com"; // → dominio WordPress real
export const APP_URL       = "https://app.tucasaenjerez.com";               // → dominio app real
export const ADMIN_URL     = "https://admin.tucasaenjerez.com";         // → dominio admin real

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

export const GOOGLE_SHEETS_URL =
  readViteEnv("VITE_GOOGLE_SHEETS_URL") ||
  readWindowEnv()?.GOOGLE_SHEETS_URL ||
  "https://script.google.com/macros/s/AKfycbyl4auWVmsJX5ReQKzdpDNxD51DKM1cOLftTJ-Q10vtuK_UJ19_rFTBM08Av94Q_8TK/exec";

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

export const LEVELS = Object.freeze([
  Object.freeze({ level: 1, name: "Viajero",          min: 0,     max: 499,      discount: 0  }),
  Object.freeze({ level: 2, name: "Explorador",        min: 500,   max: 1499,     discount: 5  }),
  Object.freeze({ level: 3, name: "Viajero Frecuente", min: 1500,  max: 2999,     discount: 8  }),
  Object.freeze({ level: 4, name: "Viajero Premium",   min: 3000,  max: 4999,     discount: 10 }),
  Object.freeze({ level: 5, name: "Élite",             min: 5000,  max: 9999,     discount: 12 }),
  Object.freeze({ level: 6, name: "Leyenda",           min: 10000, max: Infinity, discount: 15 }),
]);

export function calculateLevel(points) {
  const p = Number(points) || 0;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (p >= LEVELS[i].min) return LEVELS[i];
  }
  return LEVELS[0];
}
