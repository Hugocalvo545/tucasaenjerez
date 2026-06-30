// shared/firebase.js
import { firebaseConfig } from "./config.js";

const firebase = window.firebase;

if (!firebase) {
  throw new Error(
    'Firebase compat no está cargado. Incluye firebase-app-compat.js y los módulos necesarios antes del script type="module".'
  );
}

// App
const firebaseApp =
  firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

// Core
const auth = firebase.auth();

// Persistencia de sesion: LOCAL. Es el valor por defecto del SDK compat;
// se fija explicito para que el propietario siga logueado al reabrir la PWA.
// (No se fuerza session/inMemory ni signOut al cerrar en ningun sitio.)
try {
  auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
} catch (_) {}

const db = firebase.firestore();
const storage = firebase.storage();

// Firestore helpers
const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const increment = firebase.firestore.FieldValue.increment;

// Messaging (solo si existe el módulo)
let messaging = null;
try {
  if (firebase.messaging) messaging = firebase.messaging();
} catch (_) {
  messaging = null;
}

export {
  firebase,
  firebaseApp,
  auth,
  db,
  storage,
  serverTimestamp,
  increment,
  messaging,
};