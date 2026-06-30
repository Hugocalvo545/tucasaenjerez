// public/firebase-messaging-sw.js
// Service worker mínimo para Firebase Messaging.
// Debe estar en la raíz del hosting (/firebase-messaging-sw.js).
// La config es pública (igual que shared/env.js).

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyBV7CFyhCdwd0DIyK81K33VgmU_Nvet52s",
  authDomain: "tucasaenjerez-3362a.firebaseapp.com",
  projectId: "tucasaenjerez-3362a",
  storageBucket: "tucasaenjerez-3362a.firebasestorage.app",
  messagingSenderId: "573723173978",
  appId: "1:573723173978:web:5ba44bd7b77ea741ba2463",
});

const messaging = firebase.messaging();

// Manejo de notificaciones push en segundo plano
messaging.onBackgroundMessage((payload) => {
  const { title = 'Notificación', body = '' } = payload.notification || {};
  self.registration.showNotification(title, { body, icon: '/img/Logo-JLA.jpg' });
});
