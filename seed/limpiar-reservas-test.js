/**
 * limpiar-reservas-test.js  —  script de UN SOLO USO
 * ─────────────────────────────────────────────────────────────
 * Detecta y (opcionalmente) borra en cascada las reservas de PRUEBA
 * en Firestore, y resetea a 0 los points de las cuentas de prueba.
 *
 * USO:
 *   node limpiar-reservas-test.js              -> DRY-RUN (solo lista, NO borra)
 *   node limpiar-reservas-test.js --delete     -> BORRA reservas "test" + resetea points
 *   node limpiar-reservas-test.js --delete --include=ID1,ID2   -> incluye esas dudosas
 *   node limpiar-reservas-test.js --delete --exclude=ID3       -> excluye esas del borrado
 *
 * Detección de una reserva de PRUEBA (nivel "test", se borra):
 *   - hackTest === true
 *   - nombre (guestName / name / guests[].name) === "HACKER TEST"
 *   - stripeSessionId === "FAKE_NO_STRIPE"
 *   - stripeSessionId empieza por "cs_test_"  (Stripe modo test / tarjeta 4242)
 * Nivel "dudosa" (solo se LISTA, NO se borra salvo --include):
 *   - algún nombre contiene "test" / "prueba"
 *
 * Cascade por cada reserva principal {id} (SCOPED por id, nunca por patrón __ global):
 *   /reservas/{id}                         (principal)
 *   /reservas/{id}__{unidad}               (sombra de pack — solo los de ESTE id)
 *   /reservas_public/{id}                  (bloqueo calendario)
 *   /reservas_public/{id}__{unidad}        (bloqueo calendario sombra — solo los de ESTE id)
 *   /registro_viajeros/{id}
 *   /chats/{id}  +  /chats/{id}/mensajes/*
 *
 * Reset de points: cuentas de prueba en RESET_POINTS_UIDS -> points = 0.
 */

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const { FieldPath } = admin.firestore;

const HI = String.fromCharCode(0xf8ff); // sentinela alto para rangos por prefijo de documentId

// Cuentas de prueba cuyos points se ponen a 0 (atacante + principal del pentest)
const RESET_POINTS_UIDS = [
  "kwH21Y0VSoUQV8JYKp9x7dL7wAC3", // atacante (hugocgarciat)
  "dE0RaLY03mMvgSZKKa7b3149ble2", // principal (hugocalvogarcia123)
];

// ── flags ──────────────────────────────────────────────────────
const argv     = process.argv.slice(2);
const DO_DELETE = argv.includes("--delete");
const getList = (name) => {
  const a = argv.find((x) => x.startsWith("--" + name + "="));
  return a ? a.split("=")[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
};
const INCLUDE = new Set(getList("include")); // dudosas que SÍ borrar
const EXCLUDE = new Set(getList("exclude")); // ids que NO borrar

// ── helpers ────────────────────────────────────────────────────
const isShadow = (id, r) => !!(r && r.packId) || String(id).includes("__");
const parentIdOf = (id) => (String(id).includes("__") ? String(id).split("__")[0] : null);

function collectNames(r) {
  const names = [];
  if (typeof r.guestName === "string") names.push(r.guestName);
  if (typeof r.name === "string") names.push(r.name);
  for (const arr of [r.guests, r.guestsForExport]) {
    if (Array.isArray(arr)) {
      for (const g of arr) {
        if (g && typeof g.name === "string") names.push(g.name);
        if (g && typeof g.nombre === "string") names.push(g.nombre);
      }
    }
  }
  return names;
}

/** Devuelve { level: 'test' | 'dudosa' | null, reasons: [] } */
function classify(id, r) {
  const reasons = [];
  let level = null;

  if (r.hackTest === true) { reasons.push("hackTest === true"); level = "test"; }

  const names = collectNames(r);
  if (names.some((n) => n.trim().toUpperCase() === "HACKER TEST")) {
    reasons.push('nombre === "HACKER TEST"'); level = "test";
  }
  if (r.stripeSessionId === "FAKE_NO_STRIPE") {
    reasons.push('stripeSessionId === "FAKE_NO_STRIPE"'); level = "test";
  }
  if (typeof r.stripeSessionId === "string" && r.stripeSessionId.startsWith("cs_test_")) {
    reasons.push("stripeSessionId cs_test_ (Stripe modo test)"); level = "test";
  }

  const fuzzy = [...new Set(names.filter((n) => /test|prueba/i.test(n)))];
  if (fuzzy.length) {
    reasons.push("nombre contiene test/prueba -> " + JSON.stringify(fuzzy));
    if (!level) level = "dudosa"; // no degrada un 'test' ya marcado
  }
  return { level, reasons };
}

async function docExists(coll, id) {
  return (await db.collection(coll).doc(id).get()).exists;
}

/** ids de una colección cuyo docId empieza EXACTAMENTE por `${R}__` (docs sombra de ESE id) */
async function shadowIdsByPrefix(coll, R) {
  const snap = await db
    .collection(coll)
    .where(FieldPath.documentId(), ">=", R + "__")
    .where(FieldPath.documentId(), "<", R + "__" + HI)
    .get();
  return snap.docs.map((d) => d.id);
}

async function gatherTraces(R) {
  const reservasShadows       = await shadowIdsByPrefix("reservas", R);
  const reservasPublicMain    = await docExists("reservas_public", R);
  const reservasPublicShadows = await shadowIdsByPrefix("reservas_public", R);
  const registroViajeros      = await docExists("registro_viajeros", R);
  const chat                  = await docExists("chats", R);
  const mensajesSnap          = await db.collection("chats").doc(R).collection("mensajes").get();
  return {
    reservasShadows,
    reservasPublicMain,
    reservasPublicShadows,
    registroViajeros,
    chat,
    mensajes: mensajesSnap.size,
    mensajesIds: mensajesSnap.docs.map((d) => d.id),
  };
}

async function deleteTraces(R, t) {
  const report = {};
  // mensajes (subcolección) primero
  let n = 0;
  for (let i = 0; i < t.mensajesIds.length; i += 400) {
    const batch = db.batch();
    for (const mid of t.mensajesIds.slice(i, i + 400)) {
      batch.delete(db.collection("chats").doc(R).collection("mensajes").doc(mid));
      n++;
    }
    await batch.commit();
  }
  report.mensajes = n;

  const batch = db.batch();
  if (t.chat)               batch.delete(db.collection("chats").doc(R));
  if (t.registroViajeros)   batch.delete(db.collection("registro_viajeros").doc(R));
  if (t.reservasPublicMain) batch.delete(db.collection("reservas_public").doc(R));
  for (const sid of t.reservasPublicShadows) batch.delete(db.collection("reservas_public").doc(sid));
  for (const sid of t.reservasShadows)       batch.delete(db.collection("reservas").doc(sid));
  batch.delete(db.collection("reservas").doc(R)); // principal al final
  await batch.commit();

  report.chat = t.chat ? 1 : 0;
  report.registroViajeros = t.registroViajeros ? 1 : 0;
  report.reservasPublic = (t.reservasPublicMain ? 1 : 0) + t.reservasPublicShadows.length;
  report.reservas = 1 + t.reservasShadows.length;
  return report;
}

// ── main ───────────────────────────────────────────────────────
(async () => {
  console.log("\n=== LIMPIEZA RESERVAS TEST — modo: " + (DO_DELETE ? "BORRADO" : "DRY-RUN") + " ===\n");

  const snap = await db.collection("reservas").get();
  const principals = [];
  const shadows = [];
  snap.forEach((d) => {
    const r = d.data();
    (isShadow(d.id, r) ? shadows : principals).push({ id: d.id, r });
  });
  console.log("Total /reservas: " + snap.size + "  (principales: " + principals.length + ", sombra: " + shadows.length + ")\n");

  const detected = [];
  for (const { id, r } of principals) {
    const { level, reasons } = classify(id, r);
    if (level) detected.push({ id, r, level, reasons });
  }

  const detectedIds = new Set(detected.map((d) => d.id));
  const orphanShadows = [];
  for (const { id, r } of shadows) {
    const { level } = classify(id, r);
    const pid = parentIdOf(id);
    if (level && !detectedIds.has(pid)) orphanShadows.push({ id, parent: pid, level });
  }

  const tests   = detected.filter((d) => d.level === "test");
  const dudosas = detected.filter((d) => d.level === "dudosa");

  const withTraces = [];
  for (const d of detected) {
    const traces = await gatherTraces(d.id);
    withTraces.push({ ...d, traces });
  }

  // Conjunto EXACTO de ids objetivo (nunca por patrón __ global)
  const targets = withTraces.filter((d) =>
    (d.level === "test" || INCLUDE.has(d.id)) && !EXCLUDE.has(d.id));
  const targetIds = new Set(targets.map((d) => d.id));

  // Verificación de seguridad: ningún sombra a borrar cuelga de un id fuera de targetIds
  const allShadowDeletes = [];
  for (const d of targets) {
    for (const sid of d.traces.reservasShadows) allShadowDeletes.push(sid);
    for (const sid of d.traces.reservasPublicShadows) allShadowDeletes.push(sid);
  }
  const badShadow = allShadowDeletes.find((sid) => !targetIds.has(parentIdOf(sid)));
  if (badShadow) {
    console.error("ABORTADO: un sombra a borrar (" + badShadow + ") no cuelga de una id objetivo.");
    process.exit(1);
  }

  const fmt = (d) => {
    const r = d.r;
    const nm = r.guestName || r.name || "(sin nombre)";
    const fechas = (r.checkInISO || r.checkIn || "?") + " -> " + (r.checkOutISO || r.checkOut || "?");
    const total = r.totalPrice != null ? r.totalPrice : (r.total != null ? r.total : "?");
    const t = d.traces;
    console.log("  - [" + d.level.toUpperCase() + "] " + d.id + "  (" + (r.propertyName || r.propertyId || "?") + ", " + fechas + ", " + nm + ", total " + total + ")");
    console.log("      motivo: " + d.reasons.join(" | "));
    console.log("      rastros: public " + (t.reservasPublicMain ? "SI" : "no") +
      " | sombra res " + t.reservasShadows.length + " | sombra public " + t.reservasPublicShadows.length +
      " | registro " + (t.registroViajeros ? "SI" : "no") + " | chat " + (t.chat ? "SI" : "no") + " (" + t.mensajes + " msgs)");
    if (t.reservasShadows.length) console.log("        sombra res: " + t.reservasShadows.join(", "));
    if (t.reservasPublicShadows.length) console.log("        sombra public: " + t.reservasPublicShadows.join(", "));
  };

  console.log("─────── RESERVAS \"TEST\" (se borran): " + tests.length + " ───────");
  withTraces.filter((d) => d.level === "test").forEach(fmt);
  console.log("\n─────── RESERVAS \"DUDOSAS\" (NO se borran salvo --include): " + dudosas.length + " ───────");
  withTraces.filter((d) => d.level === "dudosa").forEach(fmt);
  console.log("");

  if (orphanShadows.length) {
    console.log("AVISO — sombra huérfanos (matchean pero su padre no está detectado): " + orphanShadows.length);
    orphanShadows.forEach((o) => console.log("      " + o.id + "  (padre esperado: " + o.parent + ")"));
    console.log("");
  }

  // Totales por colección
  const totals = { reservasPrincipal: 0, reservasSombra: 0, reservas_public: 0, registro_viajeros: 0, chats: 0, mensajes: 0 };
  for (const d of targets) {
    totals.reservasPrincipal += 1;
    totals.reservasSombra += d.traces.reservasShadows.length;
    totals.reservas_public += (d.traces.reservasPublicMain ? 1 : 0) + d.traces.reservasPublicShadows.length;
    totals.registro_viajeros += d.traces.registroViajeros ? 1 : 0;
    totals.chats += d.traces.chat ? 1 : 0;
    totals.mensajes += d.traces.mensajes;
  }

  console.log("═══════════ TOTALES A BORRAR ═══════════");
  console.log("  reservas principales           : " + totals.reservasPrincipal);
  console.log("  reservas sombra ({id}__unidad) : " + totals.reservasSombra);
  console.log("  /reservas TOTAL                : " + (totals.reservasPrincipal + totals.reservasSombra));
  console.log("  /reservas_public (main+sombra) : " + totals.reservas_public);
  console.log("  /registro_viajeros             : " + totals.registro_viajeros);
  console.log("  /chats                         : " + totals.chats);
  console.log("  /chats/*/mensajes              : " + totals.mensajes);
  console.log("════════════════════════════════════════\n");

  // Points a resetear
  console.log("═══════════ POINTS A RESETEAR (-> 0) ═══════════");
  const pointsPlan = [];
  for (const uid of RESET_POINTS_UIDS) {
    const ds = await db.collection("usuarios").doc(uid).get();
    if (!ds.exists) { console.log("  " + uid + " -> (no existe)"); continue; }
    const cur = ds.data().points;
    pointsPlan.push({ uid, cur });
    console.log("  " + uid + "  :  " + cur + "  ->  0" + (cur === 0 ? "  (ya está a 0)" : ""));
  }
  console.log("════════════════════════════════════════\n");

  if (!DO_DELETE) {
    console.log("DRY-RUN: no se ha borrado ni modificado nada. Revisa el listado.");
    console.log("  Para ejecutar:  node limpiar-reservas-test.js --delete");
    process.exit(0);
  }

  // ── BORRADO REAL ──
  console.log("BORRANDO...\n");
  const grand = { reservas: 0, reservas_public: 0, registro_viajeros: 0, chats: 0, mensajes: 0 };
  for (const d of targets) {
    const rep = await deleteTraces(d.id, d.traces);
    grand.reservas += rep.reservas;
    grand.reservas_public += rep.reservasPublic;
    grand.registro_viajeros += rep.registroViajeros;
    grand.chats += rep.chat;
    grand.mensajes += rep.mensajes;
    console.log("  ok " + d.id + " -> reservas:" + rep.reservas + " public:" + rep.reservasPublic + " registro:" + rep.registroViajeros + " chat:" + rep.chat + " msgs:" + rep.mensajes);
  }

  console.log("\nRESETEANDO POINTS...");
  for (const p of pointsPlan) {
    await db.collection("usuarios").doc(p.uid).set({ points: 0 }, { merge: true });
    console.log("  ok " + p.uid + " : " + p.cur + " -> 0");
  }

  console.log("\n═══════════ BORRADO COMPLETO ═══════════");
  console.log(JSON.stringify(grand, null, 2));
  process.exit(0);
})().catch((e) => { console.error("ERROR:", e); process.exit(1); });
