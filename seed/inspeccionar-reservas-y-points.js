/**
 * inspeccionar-reservas-y-points.js  —  SOLO LECTURA (no escribe nada)
 * Lista las reservas principales que NO son hackTest (candidatas a "reservas
 * de prueba con tarjeta 4242") con su cascada, y reporta los points de las
 * cuentas de prueba indicadas.
 */
const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldPath } = admin.firestore;

const HI = String.fromCharCode(0xf8ff); // limite superior para rangos por prefijo de documentId
const isShadow = (id, r) => !!(r && r.packId) || String(id).includes("__");

async function docExists(coll, id) { return (await db.collection(coll).doc(id).get()).exists; }
async function shadowIds(coll, R) {
  const snap = await db.collection(coll)
    .where(FieldPath.documentId(), ">=", R + "__")
    .where(FieldPath.documentId(), "<", R + "__" + HI).get();
  return snap.docs.map((d) => d.id);
}

// Prefijos de las cuentas de prueba a auditar (points)
const USER_PREFIXES = ["kwH21Y0", "dE0RaLY0"];

(async () => {
  const snap = await db.collection("reservas").get();
  const principals = [];
  snap.forEach((d) => { const r = d.data(); if (!isShadow(d.id, r)) principals.push({ id: d.id, r }); });

  const nonHack = principals.filter(({ r }) => r.hackTest !== true);

  console.log("\n=== " + nonHack.length + " RESERVAS PRINCIPALES SIN hackTest (candidatas a revisar) ===\n");
  const userIds = new Set();
  for (const { id, r } of nonHack) {
    const rpMain = await docExists("reservas_public", id);
    const rShadows = await shadowIds("reservas", id);
    const rpShadows = await shadowIds("reservas_public", id);
    const reg = await docExists("registro_viajeros", id);
    const chat = await docExists("chats", id);
    const msgs = (await db.collection("chats").doc(id).collection("mensajes").get()).size;
    if (r.userId) userIds.add(r.userId);

    const nm = r.guestName || r.name || "(sin nombre)";
    const em = r.guestEmail || r.email || "(sin email)";
    const fechas = (r.checkInISO || r.checkIn || "?") + " -> " + (r.checkOutISO || r.checkOut || "?");
    const total = r.totalPrice != null ? r.totalPrice : (r.total != null ? r.total : "?");
    console.log("  - " + id);
    console.log("      guestName   : " + nm);
    console.log("      guestEmail  : " + em);
    console.log("      userId      : " + (r.userId || "?"));
    console.log("      alojamiento : " + (r.propertyName || r.propertyId || "?") + "  (tipo: " + (r.propertyTipo || "apto") + ")");
    console.log("      fechas      : " + fechas);
    console.log("      total       : " + total + "   | stripeSessionId: " + (r.stripeSessionId || "?"));
    console.log("      status/pay  : " + (r.status || "?") + " / " + (r.paymentStatus || "?"));
    console.log("      cascada     : reservas_public " + (rpMain ? "SI" : "no") +
      " | sombra reservas " + rShadows.length + " | sombra public " + rpShadows.length +
      " | registro_viajeros " + (reg ? "SI" : "no") + " | chat " + (chat ? "SI" : "no") + " (" + msgs + " msgs)");
    if (rShadows.length) console.log("        sombra: " + rShadows.join(", "));
    console.log("");
  }

  console.log("=== POINTS DE CUENTAS DE PRUEBA (solo lectura) ===\n");
  for (const pref of USER_PREFIXES) {
    const s = await db.collection("usuarios")
      .where(FieldPath.documentId(), ">=", pref)
      .where(FieldPath.documentId(), "<", pref + HI).get();
    if (s.empty) { console.log("  (prefijo " + pref + "...) -> sin coincidencias"); continue; }
    s.forEach((d) => {
      const u = d.data();
      console.log("  " + d.id + "  ->  points: " + u.points + "  | nivel: " + (u.nivel != null ? u.nivel : (u.level != null ? u.level : "-")) +
        "  | email: " + (u.email || "?") + "  | nombre: " + (u.nombre || u.name || "?"));
    });
  }

  console.log("\n=== POINTS DE LOS userId REFERENCIADOS EN ESAS RESERVAS ===\n");
  for (const uid of userIds) {
    const d = await db.collection("usuarios").doc(uid).get();
    if (!d.exists) { console.log("  " + uid + " -> (no existe doc usuarios)"); continue; }
    const u = d.data();
    console.log("  " + uid + "  ->  points: " + u.points + "  | email: " + (u.email || "?") + "  | nombre: " + (u.nombre || u.name || "?"));
  }
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
