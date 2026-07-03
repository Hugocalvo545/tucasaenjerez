export function createReservasUI({
  db,
  escapeHtml,
  chatUI,
  serverTimestamp,
  calendarAdmin,
  subscribeToReservas,
}) {
  const reservasBody = document.getElementById("reservasBody");
  const reservasBadge = document.getElementById("reservasBadge");
  const reservaDetailBox = document.getElementById("reservaDetail");

  const events = new AbortController();
  let wired = false;

  let reservasCache = [];
  let unsub = null;
  let firstSnapshot = true;

  function showReservasBadge() {
    if (reservasBadge) reservasBadge.style.display = "inline-block";
  }

  function hideReservasBadge() {
    if (reservasBadge) reservasBadge.style.display = "none";
  }

  // Doc-sombra que el webhook crea por cada unidad de un pack (id "<reservaId>__<unidad>", campo packId).
  // Existen solo para bloquear los calendarios de las unidades; NO deben listarse como reservas
  // independientes (evita mostrar 3 filas + 3 chats por un pack). El doc principal no tiene ninguna marca.
  function isPackShadow(r) {
    return !!r?.packId || String(r?.reservaId || r?.id || "").includes("__");
  }

  // Doc principal de un pack: persiste propertyTipo "pack" y sourceProperties (las unidades).
  function isPack(r) {
    return String(r?.propertyTipo || "").toLowerCase() === "pack";
  }

  function packUnits(r) {
    return Array.isArray(r?.sourceProperties) ? r.sourceProperties.filter(Boolean) : [];
  }

  function getStatusLabel(r) {
    const st = String(r?.status || "").toLowerCase();
    if (st === "cancelled" || st === "canceled" || r?.cancelled === true) return "Cancelada";
    if (st === "confirmed") return "Confirmada";
    return "Pendiente";
  }

  function refreshCalendarSafe() {
    calendarAdmin?.refresh?.();
  }

  function renderReservasTable(snapshot) {
    if (!reservasBody) return;

    // Ocultar los docs-sombra del pack: se ve UNA sola fila (el doc principal) con UN chat.
    // No se borran (siguen bloqueando calendarios); es solo presentación.
    const visibleReservas = reservasCache.filter((r) => !isPackShadow(r));

    if (!visibleReservas.length) {
      reservasBody.innerHTML = `<tr><td colspan="6">No hay reservas todavía.</td></tr>`;
      return;
    }

    reservasBody.innerHTML = visibleReservas
      .map((r) => {
        const total =
          r.totalPrice != null ? String(r.totalPrice) : r.total_price != null ? String(r.total_price) : "-";

        const fecha = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleString() : "";
        const fechaDia = fecha ? fecha.split(",")[0] : "";

        const nombre = String(r.name || r.nombre || "").trim();
        const apell = String(r.surname || "").trim();
        const huesped = (nombre || apell) ? `${nombre} ${apell}`.trim() : (r.email || "Huésped");

        const status = getStatusLabel(r);
        const statusPill =
          status === "Cancelada"
            ? `<span class="pill pill-cancel">Cancelada</span>`
            : status === "Confirmada"
              ? `<span class="pill pill-ok">Confirmada</span>`
              : `<span class="pill pill-pending">Pendiente</span>`;

        return `
          <tr class="reserva-row" data-reserva-id="${escapeHtml(r.id)}">
            <td data-label="Fecha" title="${escapeHtml(fecha)}">${escapeHtml(fechaDia)}</td>
            <td data-label="Alojamiento">${escapeHtml(r.propertyName || r.propertyId || "")}<br>${statusPill}</td>
            <td data-label="Huésped">${escapeHtml(huesped)}</td>
            <td data-label="Check-in">${escapeHtml(r.checkIn || "")}</td>
            <td data-label="Check-out">${escapeHtml(r.checkOut || "")}</td>
            <td data-label="Total">${escapeHtml(total)}</td>
          </tr>
        `;
      })
      .join("");

    if (!firstSnapshot && snapshot?.docChanges) {
      const hasNew = snapshot
        .docChanges()
        .some((c) => c.type === "added" && !c.doc.metadata.hasPendingWrites);
      if (hasNew) showReservasBadge();
    }
    firstSnapshot = false;
  }

  async function cancelReserva(reserva) {
    if (!reserva?.id) return;
    const ok = confirm("¿Seguro que quieres cancelar esta reserva? (Solo admin)");
    if (!ok) return;

    try {
      const reservaId = reserva.reservaId || reserva.id;

      await db.collection("reservas").doc(reserva.id).set(
        { status: "cancelled", cancelledAt: serverTimestamp(), cancelledBy: "host" },
        { merge: true }
      );

      db.collection("reservaspublic").doc(reservaId).delete().catch(() => {});
      alert("Reserva cancelada (admin).");
    } catch (e) {
      console.error(e);
      alert("Error cancelando.");
    }
  }

  function selectReserva(r) {
    if (!reservaDetailBox) return;

    const total =
      r.totalPrice != null ? String(r.totalPrice) : r.total_price != null ? String(r.total_price) : "-";

    const status = getStatusLabel(r);
    const cancelBtn =
      status !== "Cancelada"
        ? `<button id="cancelReservaBtn" class="btn-secondary" style="margin-top:10px">Cancelar reserva (admin)</button>`
        : "";

    // Pack: el doc principal lleva el total COMPLETO del pack; sus unidades se muestran como info.
    const units = isPack(r) ? packUnits(r) : [];
    const packInfo = units.length
      ? `<p><strong>Pack — unidades (${units.length}):</strong> ${escapeHtml(units.join(", "))}</p>`
      : "";

    reservaDetailBox.innerHTML = `
      <p><strong>Alojamiento:</strong> ${escapeHtml(r.propertyName || r.propertyId || "")}</p>
      ${packInfo}
      <p><strong>Reserva ID:</strong> ${escapeHtml(r.reservaId || r.id)}</p>
      <p><strong>Estado:</strong> ${escapeHtml(status)}</p>
      <p><strong>Check-in:</strong> ${escapeHtml(r.checkIn || "")}</p>
      <p><strong>Check-out:</strong> ${escapeHtml(r.checkOut || "")}</p>
      <p><strong>Total${units.length ? " (pack completo)" : ""}:</strong> ${escapeHtml(total)}</p>
      ${r.observations ? `<p><strong>Observaciones:</strong> ${escapeHtml(r.observations)}</p>` : ""}
      ${cancelBtn}
    `;

    reservaDetailBox.querySelector("#cancelReservaBtn")?.addEventListener(
      "click",
      () => cancelReserva(r),
      { signal: events.signal }
    );

    chatUI?.openChatForReserva?.(r.reservaId || r.id);
  }

  function showReservaInline(reserva, clickedRow) {
    reservasBody?.querySelectorAll('.reserva-inline-row').forEach((r) => r.remove());

    const total = reserva.totalPrice != null ? String(reserva.totalPrice)
      : reserva.total_price != null ? String(reserva.total_price) : '—';
    const nombre = String(reserva.name || reserva.nombre || '').trim();
    const apell  = String(reserva.surname || '').trim();
    const huesped = (nombre || apell) ? `${nombre} ${apell}`.trim() : (reserva.email || 'Huésped');
    const status  = getStatusLabel(reserva);
    const units = isPack(reserva) ? packUnits(reserva) : [];

    const row = document.createElement('tr');
    row.className = 'reserva-inline-row';

    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.style.cssText = 'padding:0;border:none;background:transparent';

    const div = document.createElement('div');
    div.className = 'edit-inline';
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:10px">
        <strong style="font-size:15px">${escapeHtml(reserva.propertyName || reserva.propertyId || '')}</strong>
        <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:#eef1f7;color:#2a3142">${escapeHtml(status)}</span>
      </div>
      <p style="margin:4px 0;font-size:13px"><strong>Huésped:</strong> ${escapeHtml(huesped)}</p>
      ${units.length ? `<p style="margin:4px 0;font-size:13px"><strong>Pack — unidades (${units.length}):</strong> ${escapeHtml(units.join(', '))}</p>` : ''}
      <p style="margin:4px 0;font-size:13px"><strong>Check-in:</strong> ${escapeHtml(reserva.checkIn || '—')}</p>
      <p style="margin:4px 0;font-size:13px"><strong>Check-out:</strong> ${escapeHtml(reserva.checkOut || '—')}</p>
      <p style="margin:4px 0;font-size:13px"><strong>Total${units.length ? ' (pack completo)' : ''}:</strong> ${escapeHtml(total)}€</p>
      ${reserva.observations ? `<p style="margin:4px 0;font-size:13px;color:#555"><strong>Obs:</strong> ${escapeHtml(reserva.observations)}</p>` : ''}
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn-primary btn-sm ri-chat">💬 Ver chat</button>
        ${status !== 'Cancelada' ? '<button type="button" class="btn-secondary btn-sm ri-cancel">Cancelar</button>' : ''}
        <button type="button" class="btn-secondary btn-sm ri-close">✕ Cerrar</button>
      </div>
    `;

    div.querySelector('.ri-chat')?.addEventListener('click', () => {
      row.remove();
      selectReserva(reserva);
      hideReservasBadge();
      const detailPanel = document.querySelector('#tab-reservas .split .panel:last-child');
      detailPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    div.querySelector('.ri-cancel')?.addEventListener('click', () => {
      row.remove();
      cancelReserva(reserva);
    });

    div.querySelector('.ri-close')?.addEventListener('click', () => row.remove());

    cell.appendChild(div);
    row.appendChild(cell);
    clickedRow.insertAdjacentElement('afterend', row);
    setTimeout(() => div.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    reservasBody?.addEventListener(
      "click",
      (e) => {
        const row = e.target.closest?.(".reserva-row");
        if (!row) return;

        if (e.target.closest("button, a")) return;

        const id = row.getAttribute("data-reserva-id");
        const reserva = reservasCache.find((x) => x.id === id);
        if (!reserva) return;

        if (window.innerWidth <= 768) {
          showReservaInline(reserva, row);
        } else {
          selectReserva(reserva);
        }
        hideReservasBadge();
      },
      { signal: events.signal }
    );
  }

  function start() {
    wireOnce();

    if (!reservasBody) return;

    if (typeof subscribeToReservas !== "function") {
      reservasBody.innerHTML = `<tr><td colspan="6">Error: subscribeToReservas no configurado.</td></tr>`;
      return;
    }

    if (unsub) unsub();
    reservasBody.innerHTML = `<tr><td colspan="6">Cargando reservas...</td></tr>`;
    firstSnapshot = true;

    unsub = subscribeToReservas(
      (reservas, snapshot) => {
        reservasCache = Array.isArray(reservas) ? reservas : [];
        renderReservasTable(snapshot);
        refreshCalendarSafe();
      },
      (err) => {
        console.error("Error cargando reservas:", err);
        reservasBody.innerHTML = `<tr><td colspan="6">Error al cargar reservas.</td></tr>`;
      }
    );
  }

  function stop() {
    if (unsub) {
      unsub();
      unsub = null;
    }
  }

  function destroy() {
    stop();
    events.abort();
  }

  return { start, stop, destroy };
}
