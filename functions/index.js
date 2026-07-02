"use strict";

const { onRequest }                      = require("firebase-functions/v2/https");
const { onDocumentCreated,
        onDocumentUpdated }              = require("firebase-functions/v2/firestore");
const { defineSecret }      = require("firebase-functions/params");
const admin                 = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ⚠️ DINERO: el secreto STRIPE_SECRET_KEY debe apuntar a la clave de TEST (sk_test_...) mientras
// se prueba. AL PASAR A PRODUCCIÓN hay que cambiarlo a la clave LIVE (sk_live_...) con:
//   firebase functions:secrets:set STRIPE_SECRET_KEY   (y re-desplegar functions)
// Comprobar antes de lanzar: firebase functions:secrets:access STRIPE_SECRET_KEY
const STRIPE_SECRET_KEY     = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");
const EMAIL_USER            = defineSecret("EMAIL_USER");
const EMAIL_PASS            = defineSecret("EMAIL_PASS");

const OWNER_EMAIL = "hugocalvogarcia123@gmail.com";
// PRODUCCIÓN: cambiar al dominio real de la intranet (ej: "https://admin.jlaapartments.com")
const INTRANET_URL = "https://admin.tucasaenjerez.com";

// PRODUCCIÓN: orígenes permitidos para CORS.
// El front se sirve actualmente desde Firebase Hosting (tucasaenjerez-app.web.app /
// .firebaseapp.com); los dominios de marca se mantienen para cuando apunten al mismo sitio.
const ALLOWED_ORIGINS = [
  "https://tucasaenjerez-app.web.app",
  "https://tucasaenjerez-app.firebaseapp.com",
  "https://tucasaenjerez.com",
  "https://www.tucasaenjerez.com",
  "https://app.tucasaenjerez.com",
  "https://admin.tucasaenjerez.com"
];

const { buildEmailHTML, escapeHtml } = require("./email-templates");

function firestoreIncrement(n) {
  return admin.firestore.FieldValue.increment(n);
}

function mapDocType(docType) {
  switch (String(docType || "").toUpperCase().trim()) {
    case "DNI":       return "D";
    case "NIE":       return "N";
    case "PASAPORTE": return "P";
    default:          return "X";
  }
}

/**
 * Sends an email via Gmail SMTP using Nodemailer.
 * Errors are caught and logged to avoid breaking the calling function.
 */
async function sendEmail(to, subject, html) {
  try {
    const nodemailer = require("nodemailer");
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: EMAIL_USER.value(),
        pass: EMAIL_PASS.value(),
      },
    });

    await transporter.sendMail({
      from: `"JLA Apartments" <${EMAIL_USER.value()}>`,
      to,
      subject,
      html,
    });

    console.log(`📧 Email enviado → ${to} | ${subject}`);
  } catch (err) {
    console.error(`❌ Error enviando email a ${to}:`, err.message);
  }
}

exports.createCheckoutSession = onRequest(
  { secrets: [STRIPE_SECRET_KEY], invoker: "public" },
  async (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.set("Access-Control-Allow-Origin", origin);
      res.set("Vary", "Origin");
    }
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "Method Not Allowed" }); return; }

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      res.status(401).json({ error: "Unauthenticated" }); return;
    }
    let uid;
    try {
      const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
      uid = decoded.uid;
    } catch (_) {
      res.status(401).json({ error: "Invalid or expired token" }); return;
    }

    const {
      reservaId, propertyId, propertyName,
      checkInISO, checkOutISO, checkIn, checkOut,
      nights, numAdults, numChildren,
      totalPrice, pointsEarned,
      name, email, phone, notes,
      guests, guestsForExport,
      holdIds, propertyTipo,
      sourceProperties,
      successUrl, cancelUrl,
    } = req.body || {};

    if (!checkInISO || !checkOutISO || !totalPrice || !reservaId) {
      res.status(400).json({ error: "Datos de reserva incompletos." }); return;
    }
    if (Number(totalPrice) <= 0) {
      res.status(400).json({ error: "El precio debe ser mayor que 0." }); return;
    }

    const ids = Array.isArray(holdIds)
      ? holdIds
      : String(holdIds || "").split(",").map(s => s.trim()).filter(Boolean);

    if (!ids.length) {
      res.status(400).json({ error: "No hay hold activo. Selecciona fechas de nuevo." }); return;
    }

    try {
      const now = new Date();
      for (const holdId of ids) {
        const holdDoc = await db.collection("holds").doc(holdId).get();
        if (!holdDoc.exists) {
          res.status(400).json({ error: "El bloqueo de fechas ha caducado. Vuelve a intentarlo." }); return;
        }
        const hd  = holdDoc.data();
        const exp = hd.expiresAt?.toDate?.() ?? hd.expiresAt;
        if (exp && exp < now) {
          res.status(400).json({ error: "El bloqueo de fechas ha caducado. Vuelve a intentarlo." }); return;
        }
        if (hd.userId !== uid) {
          res.status(403).json({ error: "Hold inválido." }); return;
        }
      }

      await db.collection("pending_bookings").doc(reservaId).set({
        reservaId,
        userId:          uid,
        propertyId,
        propertyName,
        checkInISO,
        checkOutISO,
        checkIn,
        checkOut,
        nights:          Number(nights),
        numAdults:       Number(numAdults),
        numChildren:     Number(numChildren),
        totalPrice:      Number(totalPrice),
        pointsEarned:    Number(pointsEarned),
        name,
        email,
        phone,
        notes:           notes || "",
        guests:          guests || [],
        guestsForExport: guestsForExport || [],
        holdIds:          ids,
        propertyTipo:     propertyTipo || "apto",
        sourceProperties: Array.isArray(sourceProperties) ? sourceProperties : [],
        status:           "pending",
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });

      const stripe  = require("stripe")(STRIPE_SECRET_KEY.value());
      const session = await stripe.checkout.sessions.create({
        mode:           "payment",
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency:     "eur",
            unit_amount:  Math.round(Number(totalPrice) * 100),
            product_data: {
              name:        `${propertyName} — ${nights} noche${nights !== 1 ? "s" : ""}`,
              description: `Check-in: ${checkIn} · Check-out: ${checkOut} · ${numAdults} adulto${numAdults !== 1 ? "s" : ""}${numChildren ? ` · ${numChildren} niño${numChildren !== 1 ? "s" : ""}` : ""}`,
            },
          },
        }],
        metadata:    { reservaId, userId: uid },
        success_url: successUrl,
        cancel_url:  cancelUrl,
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      console.error("Error en createCheckoutSession:", err);
      if (!res.headersSent) res.status(500).json({ error: "Error interno. Inténtalo de nuevo." });
    }
  }
);


exports.stripeWebhook = onRequest(
  {
    secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, EMAIL_USER, EMAIL_PASS],
    invoker: "public",
  },
  async (req, res) => {
    if (req.method !== "POST") { res.status(405).send("Method Not Allowed"); return; }

    const stripe = require("stripe")(STRIPE_SECRET_KEY.value());
    const sig    = req.headers["stripe-signature"];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error("Stripe signature error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type !== "checkout.session.completed") { res.status(200).send("OK"); return; }

    const session               = event.data.object;
    const { reservaId, userId } = session.metadata || {};
    if (!reservaId || !userId) { res.status(200).send("OK"); return; }

    try {
      const pendingRef  = db.collection("pending_bookings").doc(reservaId);
      const pendingSnap = await pendingRef.get();

      if (!pendingSnap.exists) { res.status(200).send("OK"); return; }

      const p = pendingSnap.data();
      if (p.status === "confirmed") { res.status(200).send("OK"); return; }

      // payment_intent: imprescindible para poder reembolsar al cancelar. En el evento
      // checkout.session.completed suele venir como string; si faltara, lo recuperamos con la API.
      let paymentIntentId = typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id || null);
      if (!paymentIntentId) {
        try {
          const fullSession = await stripe.checkout.sessions.retrieve(session.id);
          paymentIntentId = typeof fullSession.payment_intent === "string"
            ? fullSession.payment_intent
            : (fullSession.payment_intent?.id || null);
        } catch (e) {
          console.error(`No se pudo recuperar payment_intent de la sesión ${session.id}:`, e.message);
        }
      }

      const batch = db.batch();

      batch.set(db.collection("reservas").doc(reservaId), {
        reservaId:       p.reservaId,
        userId:          p.userId,
        propertyId:      p.propertyId,
        propertyName:    p.propertyName,
        name:            p.name,
        email:           p.email,
        phone:           p.phone,
        notes:           p.notes,
        checkIn:         p.checkIn,
        checkOut:        p.checkOut,
        checkInISO:      p.checkInISO,
        checkOutISO:     p.checkOutISO,
        nights:          p.nights,
        numAdults:       p.numAdults,
        numChildren:     p.numChildren,
        totalPrice:      p.totalPrice,
        pointsEarned:    p.pointsEarned,
        guests:          p.guests,
        guestsForExport: p.guestsForExport,
        // Persistimos el tipo y las unidades del pack en el doc PRINCIPAL para que
        // onReservaCancelled sepa qué reservas_public sombra liberar al cancelar.
        propertyTipo:     p.propertyTipo || "apto",
        sourceProperties: Array.isArray(p.sourceProperties) ? p.sourceProperties : [],
        stripeSessionId:     session.id,
        stripePaymentIntent: paymentIntentId,
        paymentStatus:   "paid",
        createdAt:       admin.firestore.FieldValue.serverTimestamp(),
      });

      batch.set(db.collection("reservas_public").doc(reservaId), {
        reservaId:   p.reservaId,
        propertyId:  p.propertyId,
        checkInISO:  p.checkInISO,
        checkOutISO: p.checkOutISO,
        createdAt:   admin.firestore.FieldValue.serverTimestamp(),
        createdBy:   p.userId,
      });

      const sourceProps = Array.isArray(p.sourceProperties) ? p.sourceProperties : [];
      if (p.propertyTipo === "pack" && sourceProps.length) {
        sourceProps.forEach((pid) => {
          const shadowId = `${reservaId}__${pid}`;
          batch.set(db.collection("reservas").doc(shadowId), {
            ...p,
            propertyId:      pid,
            propertyName:    pid,
            packId:          p.propertyId,
            packName:        p.propertyName,
            reservaId:       shadowId,
            stripeSessionId: session.id,
            paymentStatus:   "paid",
            createdAt:       admin.firestore.FieldValue.serverTimestamp(),
          });
          batch.set(db.collection("reservas_public").doc(shadowId), {
            reservaId: shadowId, propertyId: pid,
            checkInISO: p.checkInISO, checkOutISO: p.checkOutISO,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: p.userId, packId: p.propertyId,
          });
        });
      }

      batch.set(db.collection("usuarios").doc(p.userId),
        { points: firestoreIncrement(p.pointsEarned) }, { merge: true });

      batch.update(pendingRef, {
        status: "confirmed",
        confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      (p.holdIds || []).forEach(holdId => batch.delete(db.collection("holds").doc(holdId)));

      await batch.commit();

      // Registro de viajeros (Orden INT/1922/2003 / SES.HOSPEDAJES)
      const gfx = p.guestsForExport || [];
      await db.collection("registro_viajeros").doc(reservaId).set({
        reservaId:     p.reservaId,
        propertyId:    p.propertyId,
        propertyName:  p.propertyName,
        checkInISO:    p.checkInISO,
        checkOutISO:   p.checkOutISO,
        checkIn:       p.checkIn,
        checkOut:      p.checkOut,
        fechaRegistro: admin.firestore.FieldValue.serverTimestamp(),
        estado:        "pendiente",
        viajeros:      gfx.map(g => ({
          index:           g.index,
          kind:            g.kind,
          nombre:          g.name        || "",
          apellidos:       g.surname     || "",
          tipoDoc:         mapDocType(g.docType),
          numDoc:          g.docNumber   || "",
          fechaNacimiento: g.birthDate   || "",
          nacionalidad:    g.nationality || "",
          paisResidencia:  g.country     || "",
          domicilio:       g.address     || "",
          localidad:       g.city        || "",
          cp:              g.postalCode  || "",
          provincia:       g.province    || "",
        })),
      });

      console.log(`✅ Reserva confirmada: ${reservaId}`);

      if (p.email) {
        let llegadaHtml = "";
        try {
          const llegadaSnap = await db.collection("instrucciones_llegada").doc(p.propertyId).get();
          if (llegadaSnap.exists) {
            const ll = llegadaSnap.data();
            const nl2br = (s) => escapeHtml(s || "").replace(/\n/g, "<br>");
            llegadaHtml = `
              <div style="background:#f5f5f0;border-left:4px solid #c9a96e;padding:16px;margin:20px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;">
                <h3 style="margin:0 0 12px;font-size:16px;color:#1a1a1a;">&#128205; Instrucciones de llegada</h3>
                <p style="margin:0 0 8px;"><strong>Dirección exacta:</strong> ${escapeHtml(ll.direccionExacta || "")}</p>
                <p style="margin:0 0 8px;">${nl2br(ll.instrucciones || "")}</p>
                <p style="margin:0 0 8px;"><strong>WiFi:</strong> ${escapeHtml(ll.wifiRed || "")} / ${escapeHtml(ll.wifiPassword || "")}</p>
                <p style="margin:0;"><strong>Contacto:</strong> ${escapeHtml(ll.telefonoContacto || "")}</p>
              </div>`;
          }
        } catch (err) {
          console.error("Error leyendo instrucciones_llegada:", err.message);
        }

        const guestHtml = buildEmailHTML({
          title: "¡Tu reserva está confirmada!",
          subtitle: `Hola ${p.name || ""}`,
          items: [
            { label: "Referencia",   value: escapeHtml(reservaId) },
            { label: "Alojamiento",  value: escapeHtml(p.propertyName || p.propertyId) },
            { label: "Check-in",     value: escapeHtml(p.checkIn || p.checkInISO) },
            { label: "Check-out",    value: escapeHtml(p.checkOut || p.checkOutISO) },
            { label: "Noches",       value: escapeHtml(String(p.nights)) },
            { label: "Huéspedes",    value: escapeHtml(
                `${p.numAdults} adulto${p.numAdults !== 1 ? "s" : ""}` +
                (p.numChildren ? `, ${p.numChildren} niño${p.numChildren !== 1 ? "s" : ""}` : "")
              )
            },
            { label: "Total pagado", value: `<strong>${Number(p.totalPrice).toFixed(2)} €</strong>` },
          ],
          extra: llegadaHtml,
          footer: "Para cualquier consulta, responde a este email o escríbenos desde la reserva.",
        });

        await sendEmail(
          p.email,
          `✅ Reserva confirmada — ${p.propertyName || p.propertyId}`,
          guestHtml
        );
      }

      const ownerHtml = buildEmailHTML({
        title: "Nueva reserva recibida",
        subtitle: p.propertyName || p.propertyId,
        items: [
          { label: "Huésped",      value: escapeHtml(p.name || "-") },
          { label: "Email",        value: escapeHtml(p.email || "-") },
          { label: "Alojamiento",  value: escapeHtml(p.propertyName || p.propertyId) },
          { label: "Check-in",     value: escapeHtml(p.checkIn || p.checkInISO) },
          { label: "Check-out",    value: escapeHtml(p.checkOut || p.checkOutISO) },
          { label: "Noches",       value: escapeHtml(String(p.nights)) },
          { label: "Huéspedes",    value: escapeHtml(
              `${p.numAdults} adultos` +
              (p.numChildren ? `, ${p.numChildren} niños` : "")
            )
          },
          { label: "Total cobrado", value: `<strong>${Number(p.totalPrice).toFixed(2)} €</strong>` },
          { label: "Referencia",    value: escapeHtml(reservaId) },
        ],
        footer: `<a href="${INTRANET_URL}" style="color:#a07d3b;text-decoration:none;font-weight:bold;">Ir a la intranet →</a>`,
      });

      await sendEmail(
        OWNER_EMAIL,
        `🏠 Nueva reserva — ${p.propertyName || p.propertyId}`,
        ownerHtml
      );

    } catch (err) {
      console.error("Error procesando webhook:", err);
      res.status(500).send("Internal Error");
      return;
    }

    res.status(200).send("OK");
  }
);


// Triggered when a guest writes a message in /chats/{chatId}/mensajes/{msgId}
exports.onChatMessageCreated = onDocumentCreated(
  {
    document: "chats/{chatId}/mensajes/{mensajeId}",
    secrets:  [EMAIL_USER, EMAIL_PASS],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const msg     = snap.data();
    const chatId  = event.params.chatId;

    // Solo notificar mensajes del huésped (no del propietario)
    if (!msg || msg.sender === "propietario") return;

    const texto         = msg.text || msg.contenido || msg.mensaje || "(sin texto)";
    const nombreRemite  = msg.senderName || msg.nombreRemitente || msg.nombre || null;

    let guestName    = nombreRemite || "Huésped";
    let propertyName = "";

    try {
      const reservaSnap = await db.collection("reservas").doc(chatId).get();
      if (reservaSnap.exists) {
        const r  = reservaSnap.data();
        guestName    = nombreRemite || r.name || "Huésped";
        propertyName = r.propertyName || r.propertyId || "";
      }
    } catch (_) {}

    const html = buildEmailHTML({
      title:    `💬 Nuevo mensaje de ${guestName}`,
      subtitle: propertyName ? `Alojamiento: ${propertyName}` : "",
      items: [
        { label: "De",       value: escapeHtml(guestName) },
        { label: "Reserva",  value: escapeHtml(chatId) },
        { label: "Mensaje",  value: `<em>${escapeHtml(texto)}</em>` },
      ],
      footer: `<a href="${INTRANET_URL}" style="color:#a07d3b;text-decoration:none;font-weight:bold;">Ver conversación en la intranet →</a>`,
    });

    await sendEmail(
      OWNER_EMAIL,
      `💬 Nuevo mensaje de ${guestName}`,
      html
    );
  }
);


exports.onReservaCancelled = onDocumentUpdated(
  {
    document: "reservas/{reservaId}",
    secrets:  [EMAIL_USER, EMAIL_PASS, STRIPE_SECRET_KEY],
  },
  async (event) => {
    const reservaId = event.params.reservaId;

    // Los docs-sombra de unidades de un pack tienen id "<reservaId>__<unidad>".
    // Se gestionan desde la cancelación del doc PRINCIPAL; si el evento viene de un sombra
    // (lo marcamos cancelled más abajo) salimos para no re-entrar ni reenviar emails.
    if (reservaId.includes("__")) return;

    const before = event.data.before.data();
    const after  = event.data.after.data();

    if (before.status === "cancelled" || after.status !== "cancelled") return;

    const sourceProps = Array.isArray(after.sourceProperties) ? after.sourceProperties : [];

    // Liberación de fechas (fuente de verdad = este trigger; el front solo marca cancelled).
    // Siempre se borra el doc público de la propia reserva (pack o alojamiento normal) y,
    // para packs, también el sombra de cada unidad + se marca cancelled su doc-sombra.
    const batch = db.batch();
    batch.delete(db.collection("reservas_public").doc(reservaId));
    sourceProps.forEach((pid) => {
      const shadowId = `${reservaId}__${pid}`;
      batch.delete(db.collection("reservas_public").doc(shadowId));
      batch.set(
        db.collection("reservas").doc(shadowId),
        {
          status:      "cancelled",
          cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });
    await batch.commit();

    // ─── Refund en Stripe (solo doc PRINCIPAL; los sombra ya salen por la guarda "__") ───
    // Para un PACK el cobro fue único, así que se hace UN solo refund del pago (no uno por unidad).
    const reservaRef      = db.collection("reservas").doc(reservaId);
    const paymentIntentId = after.stripePaymentIntent || null;

    if (after.refundId) {
      // Idempotencia: ya reembolsada, no repetir.
      console.log(`↩️  Reserva ${reservaId} ya tiene refund ${after.refundId} (${after.refundStatus || "?"}); se omite.`);
    } else if (!paymentIntentId) {
      // Reserva antigua anterior a guardar payment_intent: no rompemos, solo avisamos.
      console.warn(`⚠️  Reserva ${reservaId} sin stripePaymentIntent (reserva antigua); se omite el refund. Reembolsar manualmente si procede.`);
      await reservaRef.set({ refundStatus: "skipped_no_payment_intent" }, { merge: true }).catch(() => {});
    } else {
      try {
        const stripe = require("stripe")(STRIPE_SECRET_KEY.value());

        // DINERO: reembolsar solo si el pago está realmente cobrado. Si el PaymentIntent no está
        // "succeeded" (p.ej. requires_payment_method, processing, canceled), NO llamamos a refunds.create.
        const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (pi.status !== "succeeded") {
          console.warn(`⚠️  PaymentIntent ${paymentIntentId} en estado "${pi.status}" (no succeeded); no se reembolsa la reserva ${reservaId}.`);
          await reservaRef.set({ refundStatus: `skipped_pi_${pi.status}` }, { merge: true }).catch(() => {});
        } else {
          const refund = await stripe.refunds.create(
            { payment_intent: paymentIntentId },
            { idempotencyKey: `refund_${reservaId}` }   // evita doble reembolso ante reintentos
          );
          await reservaRef.set({
            refundId:     refund.id,
            refundStatus: refund.status || "pending",
            refundedAt:   admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`💸 Refund creado para ${reservaId}: ${refund.id} (${refund.status})`);
        }
      } catch (err) {
        // No tragamos el error: se registra y se marca la reserva para verlo en la intranet.
        console.error(`❌ Error creando refund para ${reservaId}:`, err.message);
        await reservaRef.set({
          refundStatus: "failed",
          refundError:  String(err.message || err),
        }, { merge: true }).catch(() => {});
      }
    }

    const propertyName = after.propertyName || after.propertyId || "Alojamiento";
    const guestName    = after.name  || after.email || "Huésped";

    const html = buildEmailHTML({
      title:    "Reserva cancelada por el huésped",
      subtitle: propertyName,
      items: [
        { label: "Huésped",     value: escapeHtml(guestName) },
        { label: "Email",       value: escapeHtml(after.email || "-") },
        { label: "Alojamiento", value: escapeHtml(propertyName) },
        { label: "Check-in",    value: escapeHtml(after.checkIn  || after.checkInISO  || "-") },
        { label: "Check-out",   value: escapeHtml(after.checkOut || after.checkOutISO || "-") },
        { label: "Noches",      value: escapeHtml(String(after.nights || "-")) },
        { label: "Total",       value: escapeHtml(`${Number(after.totalPrice || 0).toFixed(2)} €`) },
        { label: "Referencia",  value: escapeHtml(reservaId) },
      ],
      footer: `<a href="${INTRANET_URL}" style="color:#a07d3b;text-decoration:none;font-weight:bold;">Ir a la intranet →</a>`,
    });

    await sendEmail(
      OWNER_EMAIL,
      `❌ Reserva cancelada — ${propertyName}`,
      html
    );
  }
);
