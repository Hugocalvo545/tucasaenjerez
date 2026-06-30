import { firebaseConfig } from "./config.js";

const firebase = window.firebase;

if (!firebase) {
  throw new Error(
    'Firebase compat no está cargado. Incluye firebase-app-compat.js y los módulos necesarios antes del script type="module".'
  );
}

const firebaseApp =
  firebase.apps && firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

const serverTimestamp = firebase.firestore.FieldValue.serverTimestamp;
const increment = firebase.firestore.FieldValue.increment;

// Functions (solo si está cargado firebase-functions-compat.js en la página)
let functions = null;
try {
  if (typeof firebase.functions === 'function') functions = firebase.functions();
} catch (_) {
  functions = null;
}

// Messaging (solo si está cargado firebase-messaging-compat.js en la página)
let messaging = null;
try {
  if (typeof firebase.messaging === 'function') messaging = firebase.messaging();
} catch (_) {
  messaging = null;
}

export {
  firebase,
  firebaseApp,
  auth,
  db,
  storage,
  functions,
  serverTimestamp,
  increment,
  messaging,
};