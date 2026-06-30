# Apartamentos reales — Plaza Quemada y Rendona 17

## Privacidad de la ubicación (lo que pidió tu tío)

La app ya protege la ubicación en el **mapa** (desplaza el marcador 90-190m
hasta que se confirma la reserva), pero el script anterior tenía un fallo:
el campo de texto `direccion` mostraba la calle y el número exactos, visible
para cualquiera en la ficha pública. Eso anulaba la protección del mapa.

**Ahora:**
- El campo público `direccion` solo dice la zona ("Casco histórico de Jerez de
  la Frontera", "Centro de Jerez, zona Plaza del Mamelón") — nadie sabe el
  edificio exacto antes de reservar.
- La dirección exacta, el contacto para las llaves, el WiFi y todas las
  instrucciones de llegada están en una colección nueva,
  **`/instrucciones_llegada`**, con esta regla de Firestore:
  ```
  allow read: if false;
  ```
  Es decir: **nadie puede leerla desde el navegador, ni siquiera estando
  logueado**. Solo el backend (Cloud Functions, que usa el Admin SDK y
  no pasa por las rules) puede acceder a ella.
- Cuando se confirma el pago, hay que extender `stripeWebhook` para que
  lea esa colección y mande la info por email al huésped (ver más abajo).

---

## Qué se ha hecho

Se han procesado las fotos de las dos propiedades que vas a subir tú:

| Carpeta original | Alojamiento | Fotos | Tipo |
|---|---|---|---|
| CASA EN PLAZA QUEMADA 8 | Ático Dúplex Plaza Quemada | 38 | Apartamento individual |
| CASA EN RENDONA 17 / APARTAMENTO 1 | Rendona 17 — Apartamento A | 12 | Apartamento individual (parte del pack) |
| CASA EN RENDONA 17 / APARTAMENTO 2 | Rendona 17 — Apartamento B | 15 | Apartamento individual (parte del pack) |

Total: **65 fotos** en WebP, organizadas en orden lógico.

**Rendona 17** se ha modelado como **pack** — los dos apartamentos se pueden
reservar por separado o juntos para 8 personas, con el precio del pack
calculado automáticamente al 85% de la suma de ambos.

El Portil **no está incluido** — lo añadirá tu tío directamente desde la intranet.

---

## ⚠️ Paso obligatorio 1 — Añadir la regla de Firestore

Abre `firestore.rules` de `tucasaenjerez-prod` y añade:

```js
match /instrucciones_llegada/{propertyId} {
  allow read: if false;
  allow write: if isAdmin();
}
```

Despliega:
```powershell
firebase deploy --only firestore:rules
```

---

## ⚠️ Paso obligatorio 2 — Enviar las instrucciones por email al confirmar el pago

Esto requiere extender la Cloud Function `stripeWebhook` en `functions/index.js`.
Pásale este prompt a Claude Code:

```
En functions/index.js, dentro de stripeWebhook, después de confirmar la
reserva y justo antes (o junto a) enviar el email de confirmación al
huésped, añade este paso:

1. Leer el documento /instrucciones_llegada/{propertyId} de Firestore
   usando el propertyId de la reserva confirmada (admin SDK, esto
   bypassa las rules sin problema).

2. Si el documento existe, añadir al email de confirmación que ya se
   envía al huésped una sección adicional con:
   - direccionExacta
   - instrucciones (el texto completo de llegada)
   - wifiRed y wifiPassword
   - telefonoContacto

3. Si la reserva es de un pack (propertyTipo === "pack"), usar el
   propertyId del pack para buscar en /instrucciones_llegada (ya
   contiene instrucciones combinadas para ambos apartamentos).

4. Si el documento de /instrucciones_llegada NO existe para ese
   propertyId (por ejemplo, para alojamientos que tu tío añada él
   mismo sin rellenar esta colección), el email de confirmación debe
   seguir enviándose con normalidad, simplemente sin la sección de
   instrucciones de llegada — no debe fallar el envío del email
   por esto.

5. Formatea la sección de instrucciones en el HTML del email de forma
   clara, por ejemplo con un recuadro destacado:

   <div style="background:#f5f5f0; border-left:4px solid #c9a96e;
   padding:16px; margin:20px 0;">
     <h3>📍 Instrucciones de llegada</h3>
     <p><strong>Dirección exacta:</strong> {direccionExacta}</p>
     <p>{instrucciones}</p>
     <p><strong>WiFi:</strong> {wifiRed} / {wifiPassword}</p>
     <p><strong>Contacto:</strong> {telefonoContacto}</p>
   </div>

No cambies nada más del flujo del webhook.

firebase deploy --only functions
```

---

## Otras cosas que revisar

### Hora de check-in de Plaza Quemada — documentación contradictoria
- `Normas de la Casa Pza Quemada.docx` dice: **17:00**
- `Mensaje a Huéspedes 2 días antes de la llegada.docx` dice: **14:00**

Puesto 17:00 por defecto. Confírmalo con tu tío.

### Coordenadas GPS aproximadas
Las lat/lng son aproximadas al centro de la calle. Afínalas en Google Maps
(clic derecho sobre el edificio exacto → copiar coordenadas) y actualízalas
en el documento de Firestore.

### Precios
El script trae `precioBase` en 0 — tu tío los ajustará a mano desde la
intranet, como comentaste.

---

## Cómo ejecutar

1. Crea la carpeta `seed/` en `tucasaenjerez-prod` si no existe
2. Copia `seed-apartamentos-reales.js` dentro
3. Pon ahí tu `serviceAccountKey.json` del proyecto **tucasaenjerez-3362a**
4. Extrae `apartamentos-reales-imagenes.zip` dentro de `seed/`, quedando:
   ```
   seed/
     seed-apartamentos-reales.js
     serviceAccountKey.json
     output_images/
       plaza-quemada-8/
       rendona-17-a/
       rendona-17-b/
   ```
5. Ejecuta:
   ```powershell
   cd seed
   npm install firebase-admin
   node seed-apartamentos-reales.js
   ```
6. Sigue los dos pasos obligatorios de arriba (regla de Firestore + email)

---

## Después de ejecutar

- Revisa cada alojamiento en `admin.tucasaenjerez.com`
- Confirma que `direccion` (público) NO contiene calle ni número en ningún sitio
- Haz una reserva de prueba en modo test de Stripe y comprueba que el email
  de confirmación incluye las instrucciones de llegada
- Los 2 vídeos de Rendona (`VIDEO APT1.mp4`, `VIDEO APT2.mp4`) no se han
  subido — podrían usarse en redes sociales aparte
- `seed/serviceAccountKey.json` nunca debe subirse a Git
