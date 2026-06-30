# tucasaenjerez-prod — Estado y pasos pendientes

Proyecto duplicado desde la demo (JLA Apartments) y configurado para producción en
**tucasaenjerez.com** (Firebase project `tucasaenjerez-3362a`).

## Ya hecho (automático)
- Copia limpia del proyecto (sin `node_modules`, `.firebase`, `.git`, `seed/serviceAccountKey*`, `.claude`).
- `public/shared/env.js` y `public-admin/shared/env.js` con la config Firebase de producción.
- Reemplazo global de URLs/IDs: `app.tucasaenjerez.com`, `admin.tucasaenjerez.com`, `tucasaenjerez-3362a`, `tucasaenjerez.com`.
- Config Firebase completa corregida (apiKey/senderId/appId) en `public/firebase-messaging-sw.js` y `public/auth-bridge.html` — esto NO estaba en la tabla original pero era necesario; si no, auth y push quedaban rotos.
- `firebase.json` (targets main/admin), `.firebaserc`, `ALLOWED_ORIGINS` (functions), `ALLOWED_ORIGIN` (auth-bridge).
- Limpieza de `seed/` y `docs/`.
- `npm install` en `functions/` (OK).
- Verificado: 0 referencias a `jla-demo`, `portfolio-hugo-calvo`, `proyectohugo.ncayasociados.com`, ni a la apiKey/senderId antiguos.

## PASO 10 — Primer deploy (ejecutar tú, desde esta carpeta)
```bash
firebase login                 # si no estás logueado
firebase use tucasaenjerez-3362a
firebase target:apply hosting main  tucasaenjerez-app
firebase target:apply hosting admin tucasaenjerez-admin
firebase deploy --only hosting,firestore:rules,storage
```
> Los sites `tucasaenjerez-app` y `tucasaenjerez-admin` deben existir ya en Firebase Hosting
> (Console → Hosting → Add another site). NO desplegar functions todavía.

## Pasos manuales pendientes
1. **Stripe**: configurar secrets en el nuevo proyecto:
   `firebase functions:secrets:set STRIPE_SECRET_KEY` (y `STRIPE_WEBHOOK_SECRET`, `EMAIL_USER`, `EMAIL_PASS`).
2. **Admin**: crear la cuenta admin en Firebase Auth del proyecto `tucasaenjerez-3362a`.
3. **DNS (Hostinger)**: añadir los registros CNAME que indique Firebase para
   `app.tucasaenjerez.com` y `admin.tucasaenjerez.com` (y dominio raíz / www según corresponda).
4. **Deploy de functions** (cuando los secrets estén puestos):
   `firebase deploy --only functions`

## Revisar antes de producción
- `.env` en la raíz sigue apuntando a otro proyecto (`booking-viajeros`) — revisa si se usa o se elimina.
- `VITE_GOOGLE_SHEETS_URL` en `.env`: confirmar que el endpoint es el correcto para producción.
