/**
 * seed-apartamentos-reales.js
 * ─────────────────────────────────────────────────────────────
 * Sube las fotos reales a Firebase Storage y crea los documentos
 * en Firestore para Plaza Quemada 8 y el pack Rendona 17 (con sus
 * 2 unidades). El Portil lo añadirá el propietario directamente
 * desde la intranet.
 *
 * PRIVACIDAD DE LA UBICACIÓN:
 * El campo público "direccion" de cada alojamiento NO contiene la
 * dirección exacta (solo la zona/barrio), siguiendo el mismo criterio
 * que ya usa el mapa público (desplazamiento de 90-190m hasta que se
 * confirma la reserva). La dirección exacta, el WiFi y las
 * instrucciones de llegada se guardan en una colección aparte
 * (/instrucciones_llegada) bloqueada por Firestore rules: nadie puede
 * leerla desde el cliente, solo el backend (Cloud Functions) cuando
 * se confirma un pago, para enviarla por email al huésped.
 *
 * ANTES DE EJECUTAR:
 * 1. Crea la carpeta seed/ en tu proyecto tucasaenjerez-prod si no existe
 * 2. Coloca este archivo dentro de seed/
 * 3. Pon tu serviceAccountKey.json del proyecto tucasaenjerez-3362a
 *    también dentro de seed/
 * 4. Extrae el contenido de apartamentos-reales-imagenes.zip dentro
 *    de seed/, de forma que quede así:
 *      seed/
 *        seed-apartamentos-reales.js   (este archivo)
 *        serviceAccountKey.json
 *        output_images/
 *          plaza-quemada-8/01.webp ... manifest.json
 *          rendona-17-a/...
 *          rendona-17-b/...
 * 5. Revisa el bloque CONFIG (precios — tu tío los ajustará luego
 *    a mano desde la intranet, así que pueden quedar en 0)
 * 6. npm install firebase-admin
 * 7. node seed-apartamentos-reales.js
 * 8. IMPORTANTE: después de ejecutar este script, añade la regla de
 *    Firestore para /instrucciones_llegada (ver bloque al final de
 *    este archivo) y despliega: firebase deploy --only firestore:rules
 *
 * ⚠️  REVISAR ANTES DE PUBLICAR (ver README adjunto para más detalle):
 *   - Hora de check-in de Plaza Quemada: la documentación original
 *     es CONTRADICTORIA (un doc dice 17:00, otro dice 14:00)
 *   - Coordenadas GPS: aproximadas al centro de la calle,
 *     afina la posición exacta en Google Maps
 *   - El envío de email con estas instrucciones requiere extender
 *     stripeWebhook en functions/index.js (ver README)
 */

const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "tucasaenjerez-3362a.firebasestorage.app", // ajusta si tu bucket es distinto
});

const db = admin.firestore();
const bucket = admin.storage().bucket();

/* ═══════════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════════ */

const CONFIG = {
  "plaza-quemada-8": { precioBase: 0 }, // tu tío lo ajustará a mano en la intranet
  "rendona-17-a": { precioBase: 0 },
  "rendona-17-b": { precioBase: 0 },
  rendonaPack: { packPct: 85 },
};

/* ═══════════════════════════════════════════════════════════
   DATOS PÚBLICOS — Visibles para cualquier visitante
   La "direccion" es deliberadamente vaga (solo zona/barrio).
   ═══════════════════════════════════════════════════════════ */

const APARTAMENTOS = [
  {
    id: "plaza-quemada-8",
    orden: 1,
    nombre: "Ático Dúplex Plaza Quemada",
    ciudad: "Jerez de la Frontera",
    direccion: "Casco histórico de Jerez de la Frontera", // ⚠️ vago a propósito, ver dirección exacta más abajo
    lat: 36.6850, // ⚠️ aproximado, afinar en Google Maps
    lng: -6.1370, // ⚠️ aproximado, afinar en Google Maps
    capacidad: 4,
    dormitorios: 1,
    banos: 2,
    camas: "1 cama de matrimonio + sofá cama doble",
    tagline: "Ático con azotea privada en el centro de Jerez",
    descripcion:
      "Acogedor ático dúplex en pleno centro de Jerez, con una azotea privada de uso exclusivo con vistas a la ciudad. Ideal para parejas o pequeños grupos.",
    descripcionLarga:
      "Este encantador ático dúplex se encuentra en una casa de vecinos tradicional jerezana, en pleno centro histórico de la ciudad. La vivienda se distribuye en dos plantas: en la planta baja encontrarás la cocina totalmente equipada, el salón con sofá cama doble y un baño completo; subiendo por la escalera de caracol interior llegarás al dormitorio principal con cama de matrimonio y un segundo baño. Lo más especial del alojamiento es su azotea privada con césped artificial, mesa exterior y vistas abiertas sobre los tejados de Jerez — el lugar perfecto para disfrutar de un atardecer con una copa de vino. La dirección exacta y las instrucciones de acceso se enviarán por email tras confirmar el pago.",
    checkInTime: "17:00", // ⚠️ revisar: un documento dice 14:00
    checkOutTime: "11:00",
    normas:
      "No se permiten fiestas ni ruidos excesivos que puedan molestar a los vecinos. Por favor, cerrad siempre la puerta con llave al salir. Aire acondicionado disponible: usadlo con cuidado y apagadlo al salir.",
    servicios: ["Wi-Fi", "Aire acondicionado", "Cocina equipada", "Terraza privada", "Lavadora"],
    badges: ["Azotea privada", "Centro histórico"],
    highlights: ["Azotea privada con vistas", "A pie de calle, casco histórico", "Dúplex con escalera de caracol"],
    style: "rustic_modern",
    activa: true,
  },
  {
    id: "rendona-17-a",
    orden: 2,
    nombre: "Rendona 17 — Apartamento A",
    ciudad: "Jerez de la Frontera",
    direccion: "Centro de Jerez, zona Plaza del Mamelón", // ⚠️ vago a propósito
    lat: 36.6868,
    lng: -6.1375,
    capacidad: 4,
    dormitorios: 1,
    banos: 1,
    camas: "1 cama de matrimonio + sofá cama doble",
    tagline: "Apartamento renovado junto a la Plaza del Mamelón",
    descripcion:
      "Apartamento totalmente renovado en 2025, en una casa de vecinos típica jerezana junto a la Plaza del Mamelón. Check-in autónomo con caja de llaves.",
    descripcionLarga:
      "Apartamento recién reformado con el mayor gusto y materiales nuevos, situado en el centro de Jerez de la Frontera, muy cerca de la Plaza del Mamelón, el Museo de Relojes y las bodegas y tabancos tradicionales de la ciudad. Cuenta con un dormitorio con cama de matrimonio, salón con cocina americana totalmente equipada y sofá cama doble adicional, y un baño completo. El check-in es totalmente autónomo mediante caja de seguridad con código. La dirección exacta y el código de acceso se enviarán por email tras confirmar el pago. Forma pareja con el Apartamento B de la misma finca — ambos se pueden reservar juntos para grupos de hasta 8 personas.",
    checkInTime: "17:00",
    checkOutTime: "11:00",
    normas:
      "No se permiten fiestas ni ruidos excesivos. El apartamento no dispone de lavadora — hay lavandería de autoservicio a 15 min andando. Cerrad siempre la puerta con llave al salir.",
    servicios: ["Wi-Fi", "Aire acondicionado", "TV", "Check-in autónomo", "Cocina equipada"],
    badges: ["Renovado 2025", "Check-in autónomo"],
    highlights: ["Reformado por completo en 2025", "Junto a la Plaza del Mamelón", "Combinable con el Apartamento B"],
    style: "modern_minimal",
    activa: true,
  },
  {
    id: "rendona-17-b",
    orden: 3,
    nombre: "Rendona 17 — Apartamento B",
    ciudad: "Jerez de la Frontera",
    direccion: "Centro de Jerez, zona Plaza del Mamelón", // ⚠️ vago a propósito
    lat: 36.6868,
    lng: -6.1375,
    capacidad: 4,
    dormitorios: 1,
    banos: 1,
    camas: "1 cama de matrimonio + sofá cama doble",
    tagline: "Apartamento renovado junto a la Plaza del Mamelón",
    descripcion:
      "Apartamento totalmente renovado en 2025, en una casa de vecinos típica jerezana junto a la Plaza del Mamelón. Dormitorio con ventana en tono turquesa.",
    descripcionLarga:
      "Apartamento recién reformado con el mayor gusto y materiales nuevos, situado en el centro de Jerez de la Frontera, muy cerca de la Plaza del Mamelón, el Museo de Relojes y las bodegas y tabancos tradicionales de la ciudad. Cuenta con un dormitorio con cama de matrimonio y ventana en tono turquesa característico, salón con cocina americana totalmente equipada y sofá cama doble adicional, y un baño completo. El check-in es totalmente autónomo mediante caja de seguridad con código. La dirección exacta y el código de acceso se enviarán por email tras confirmar el pago. Forma pareja con el Apartamento A de la misma finca — ambos se pueden reservar juntos para grupos de hasta 8 personas.",
    checkInTime: "17:00",
    checkOutTime: "11:00",
    normas:
      "No se permiten fiestas ni ruidos excesivos. El apartamento no dispone de lavadora — hay lavandería de autoservicio a 15 min andando. Cerrad siempre la puerta con llave al salir.",
    servicios: ["Wi-Fi", "Aire acondicionado", "TV", "Check-in autónomo", "Cocina equipada"],
    badges: ["Renovado 2025", "Check-in autónomo"],
    highlights: ["Reformado por completo en 2025", "Junto a la Plaza del Mamelón", "Combinable con el Apartamento A"],
    style: "modern_minimal",
    activa: true,
  },
];

const PACK_RENDONA = {
  id: "rendona-17",
  orden: 1,
  nombre: "Rendona 17 — Pack Completo",
  ciudad: "Jerez de la Frontera",
  direccion: "Centro de Jerez, zona Plaza del Mamelón", // ⚠️ vago a propósito
  lat: 36.6868,
  lng: -6.1375,
  capacidadTotal: 8,
  descripcion:
    "Los dos apartamentos de Rendona 17 reservados juntos: hasta 8 personas en la misma finca, renovados por completo en 2025, junto a la Plaza del Mamelón.",
  descripcionLarga:
    "Reserva los dos apartamentos de la finca de Rendona 17 a la vez y disfruta de todo el edificio para tu grupo. Ambos apartamentos están recién renovados (2025), cuentan con check-in autónomo independiente y comparten ubicación privilegiada en el centro histórico de Jerez de la Frontera, junto a la Plaza del Mamelón. La dirección exacta y los códigos de acceso se enviarán por email tras confirmar el pago.",
  sourceProperties: ["rendona-17-a", "rendona-17-b"],
  packPct: CONFIG.rendonaPack.packPct,
  activa: true,
  grupo: "rendona-17",
};

/* ═══════════════════════════════════════════════════════════
   DATOS PRIVADOS — Dirección exacta + instrucciones de llegada
   Van a /instrucciones_llegada, colección con lectura bloqueada
   (allow read: if false). Solo las lee el backend cuando se
   confirma el pago, para mandarlas por email al huésped.
   ═══════════════════════════════════════════════════════════ */

const INSTRUCCIONES_LLEGADA = {
  "plaza-quemada-8": {
    direccionExacta: "Plaza Quemada, 8, Jerez de la Frontera",
    telefonoContacto: "606353684",
    contactoLlaves: "Encarna (617914684) o David (657282400) — viven en la 1ª planta",
    wifiRed: "MIWIFI_zYAb",
    wifiPassword: "QYdYh237",
    instrucciones:
      "Llegada a partir de las 17:00. Id a la puerta de Plaza Quemada nº8 — es una casa de vecinos sin ascensor. " +
      "Para las llaves preguntad por Encarna (617914684) o David (657282400), viven en la 1ª planta. " +
      "La llave redonda abre la puerta de la calle. La llave redonda azul abre el patio (ojo: la cerradura está puesta al revés, gira en sentido contrario). " +
      "Cruzando el patio, subid los 2-3 escalones del fondo, girad a la derecha y subid el tramo de escaleras; tras girar a la izquierda según subís encontraréis la puerta de la casa. " +
      "Para entrar (puerta blanca con cristales) usad la llave cuadrada y empujad un poco hacia dentro. " +
      "A la planta de arriba se puede subir por dentro (escalera de caracol) o por fuera — recomendamos subir las maletas por fuera, es más cómodo. " +
      "Cerrad siempre con llave al salir de casa. Salida antes de las 11:00, dejad las llaves en la encimera de la cocina. " +
      "Parking gratuito recomendado: Calle Pintor Muñoz Cebrián (Calle Arcos y Calle Don Juan son zona azul). " +
      "Sofá cama: quitad los cojines de los reposabrazos, retirad los dos asientos y tirad hacia vosotros de la estructura metálica superior del respaldo — no hace falta quitar el respaldo. " +
      "Las sábanas están en las cajas del mueble del salón.",
  },
  "rendona-17-a": {
    direccionExacta: "Calle Rendona, 17, Jerez de la Frontera (apartamento de la puerta blanca, cama con fondo de ladrillos)",
    telefonoContacto: "606353684",
    contactoLlaves: "Check-in autónomo — caja de llaves en el patio",
    wifiRed: "MIWIFI_GPmT",
    wifiPassword: "X7nchdGD",
    instrucciones:
      "Check-in automático: las llaves están en un cajetín nada más pasar la puerta de la calle, a la derecha. " +
      "Este es el apartamento de la cama con fondo de ladrillos: la caja es la de la IZQUIERDA, código 1103. " +
      "Recomendamos parar el coche en la puerta para descargar el equipaje (calle de poco tránsito). " +
      "Al entrar al patio hay una escalera a la derecha — cuidado con el canalón, sobresale un poco. " +
      "Arriba, el apartamento de la puerta blanca es este (cama con fondo de ladrillos); al fondo está el de la puerta turquesa (el otro apartamento). " +
      "Cerrad siempre con llave al salir. No hay lavadora — lavandería más cercana: Open Wash, Calle Medina (15 min andando). " +
      "Sofá cama: girad el sofá 90° para abrirlo a lo largo del salón, sacad la parte de abajo de las tiras, empujad el respaldo hacia delante hasta oír un clack y deslizadlo hacia atrás. " +
      "Cualquier duda: 606353684.",
  },
  "rendona-17-b": {
    direccionExacta: "Calle Rendona, 17, Jerez de la Frontera (apartamento de la puerta turquesa, ventana turquesa en el dormitorio)",
    telefonoContacto: "606353684",
    contactoLlaves: "Check-in autónomo — caja de llaves en el patio",
    wifiRed: "MIWIFI_GPmT_EXT",
    wifiPassword: "X7nchdGD",
    instrucciones:
      "Check-in automático: las llaves están en un cajetín nada más pasar la puerta de la calle, a la derecha. " +
      "Este es el apartamento con la ventana turquesa en el dormitorio: la caja es la de la DERECHA, código 1001. " +
      "Recomendamos parar el coche en la puerta para descargar el equipaje (calle de poco tránsito). " +
      "Al entrar al patio hay una escalera a la derecha — cuidado con el canalón, sobresale un poco. " +
      "Arriba, al fondo está el apartamento de la puerta turquesa (este); el de la puerta blanca es el otro apartamento. " +
      "Cerrad siempre con llave al salir. No hay lavadora — lavandería más cercana: Open Wash, Calle Medina (15 min andando). " +
      "Sofá cama: separadlo un poco de la pared, empujad el respaldo hacia delante hasta oír un clack y bajadlo del todo hacia atrás; el resto sale tirando de los asideros. " +
      "Cualquier duda: 606353684.",
  },
  "rendona-17": {
    direccionExacta: "Calle Rendona, 17, Jerez de la Frontera (los dos apartamentos de la finca: puerta blanca y puerta turquesa)",
    telefonoContacto: "606353684",
    contactoLlaves: "Check-in autónomo — cajetín de llaves en el patio (uno para cada apartamento)",
    wifiRed: "Apt. puerta blanca: MIWIFI_GPmT · Apt. puerta turquesa: MIWIFI_GPmT_EXT",
    wifiPassword: "X7nchdGD (mismo password para ambas redes)",
    instrucciones:
      "Habéis reservado los DOS apartamentos de la finca. Check-in automático: las llaves de cada apartamento están en su propio cajetín, nada más pasar la puerta de la calle, a la derecha. " +
      "Apartamento de la puerta blanca (cama con fondo de ladrillos): caja IZQUIERDA, código 1103. " +
      "Apartamento de la puerta turquesa (ventana turquesa en el dormitorio): caja DERECHA, código 1001. " +
      "Recomendamos parar el coche en la puerta para descargar el equipaje. Al entrar al patio, escalera a la derecha (cuidado con el canalón). " +
      "Arriba: el apartamento de la puerta blanca está al llegar, el de la puerta turquesa está al fondo. " +
      "Cerrad siempre con llave al salir. No hay lavadora en ninguno de los dos — lavandería más cercana: Open Wash, Calle Medina. " +
      "Cualquier duda: 606353684.",
  },
};

/* ═══════════════════════════════════════════════════════════
   SUBIDA DE IMÁGENES
   ═══════════════════════════════════════════════════════════ */

async function uploadImagesForSlug(slug) {
  const localDir = path.join(__dirname, "output_images", slug);
  if (!fs.existsSync(localDir)) {
    console.warn(`⚠️  No existe la carpeta de imágenes para ${slug}, saltando.`);
    return { imageMain: "", images: [] };
  }

  const manifestPath = path.join(localDir, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  const urls = [];
  for (const item of manifest) {
    const localFile = path.join(localDir, item.file);
    const destPath = `apartamentos/${slug}/${item.file}`;

    await bucket.upload(localFile, {
      destination: destPath,
      metadata: { contentType: "image/webp" },
    });

    const file = bucket.file(destPath);
    await file.makePublic();
    const url = `https://storage.googleapis.com/${bucket.name}/${destPath}`;
    urls.push(url);
  }

  console.log(`   ${urls.length} imágenes subidas para ${slug}`);
  return { imageMain: urls[0] || "", images: urls };
}

/* ═══════════════════════════════════════════════════════════
   EJECUCIÓN
   ═══════════════════════════════════════════════════════════ */

async function main() {
  console.log("🏠 Subiendo apartamentos reales a Firestore + Storage\n");

  for (const apto of APARTAMENTOS) {
    console.log(`▶ ${apto.nombre} (${apto.id})`);

    const { imageMain, images } = await uploadImagesForSlug(apto.id);
    const precioBase = CONFIG[apto.id]?.precioBase ?? 0;

    const docData = {
      ...apto,
      precioBase,
      imageMain,
      images,
      fotos: images,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    delete docData.id;

    await db.collection("apartamentos").doc(apto.id).set(docData, { merge: true });
    console.log(`   ✅ Documento PÚBLICO creado en /apartamentos/${apto.id}`);

    // Datos privados — dirección exacta + instrucciones
    const privado = INSTRUCCIONES_LLEGADA[apto.id];
    if (privado) {
      await db.collection("instrucciones_llegada").doc(apto.id).set({
        ...privado,
        propertyName: apto.nombre,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`   🔒 Instrucciones privadas guardadas en /instrucciones_llegada/${apto.id}\n`);
    }
  }

  // Pack Rendona
  console.log(`▶ ${PACK_RENDONA.nombre} (pack)`);

  const aptoA = await db.collection("apartamentos").doc("rendona-17-a").get();
  const aptoB = await db.collection("apartamentos").doc("rendona-17-b").get();

  const precioA = aptoA.data()?.precioBase || 0;
  const precioB = aptoB.data()?.precioBase || 0;
  const precioPack = Math.round((precioA + precioB) * (PACK_RENDONA.packPct / 100));

  const packDocData = {
    ...PACK_RENDONA,
    precioBase: precioPack,
    imageMain: aptoA.data()?.imageMain || "",
    images: [
      ...(aptoA.data()?.images?.slice(0, 4) || []),
      ...(aptoB.data()?.images?.slice(0, 4) || []),
    ],
  };
  delete packDocData.id;

  await db.collection("packs").doc(PACK_RENDONA.id).set(packDocData, { merge: true });
  console.log(`   ✅ Documento PÚBLICO creado en /packs/${PACK_RENDONA.id}`);

  const privadoPack = INSTRUCCIONES_LLEGADA["rendona-17"];
  await db.collection("instrucciones_llegada").doc("rendona-17").set({
    ...privadoPack,
    propertyName: PACK_RENDONA.nombre,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  console.log(`   🔒 Instrucciones privadas guardadas en /instrucciones_llegada/rendona-17`);
  console.log(`   Precio calculado: ${precioA}€ + ${precioB}€ × ${PACK_RENDONA.packPct}% = ${precioPack}€/noche\n`);

  console.log("✅ Proceso completo.\n");
  console.log("⚠️  PASOS PENDIENTES (ver README):");
  console.log("   1. Añadir la regla de Firestore para /instrucciones_llegada (read: false) y desplegarla");
  console.log("   2. Extender stripeWebhook en functions/index.js para leer /instrucciones_llegada");
  console.log("      y enviarlo por email al huésped cuando se confirma el pago");
  console.log("   3. Confirmar hora de check-in real de Plaza Quemada (17:00 vs 14:00)");
  console.log("   4. Afinar coordenadas GPS exactas en Google Maps");
  console.log("   5. Tu tío ajustará los precios reales desde la intranet");
  console.log("\nℹ️  El Portil no se ha incluido — tu tío lo añadirá desde la intranet.");

  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});

/* ═══════════════════════════════════════════════════════════
   REGLA DE FIRESTORE A AÑADIR (firestore.rules)
   ═══════════════════════════════════════════════════════════

   match /instrucciones_llegada/{propertyId} {
     allow read: if false;   // nadie lee esto desde el cliente, nunca
     allow write: if isAdmin();
   }

   ═══════════════════════════════════════════════════════════ */
