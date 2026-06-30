export function createGananciasUI({ db, escapeHtml, getPropertiesCache, resolveReservasId }) {
  const root = document.getElementById("gananciasRoot");
  if (!root) return {};

  let reservasAll = [];
  let bloqueosAll = [];

  function getProps() {
    return (getPropertiesCache?.() || []).filter(Boolean);
  }

  function propIdList() {
    return getProps().map(p => p.slug || p.id).filter(Boolean);
  }

  function nightsBetween(startISO, endISO) {
    // nights: startISO inclusive, endISO exclusive
    const out = [];
    const start = new Date(startISO + "T00:00:00");
    const end = new Date(endISO + "T00:00:00");
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }

  function overlapNights(checkInISO, checkOutISO, rangeStartISO, rangeEndISO) {
    // Reserva ocupa noches [checkIn, checkOut)
    const start = checkInISO > rangeStartISO ? checkInISO : rangeStartISO;
    const end = checkOutISO < rangeEndISO ? checkOutISO : rangeEndISO;
    if (!start || !end || end <= start) return [];
    return nightsBetween(start, end);
  }

  function render() {
    root.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Ganancias estratégicas</h2>
        </div>

        <div class="filters">
          <label>
            Periodo
            <select id="gPeriod">
              <option value="30">Últimos 30 días</option>
              <option value="90">Últimos 90 días</option>
              <option value="365">Últimos 365 días</option>
              <option value="month">Mes actual</option>
              <option value="prev-month">Mes anterior</option>
              <option value="custom">Personalizado</option>
            </select>
          </label>

          <label>
            Desde
            <input id="gFrom" type="date" />
          </label>

          <label>
            Hasta
            <input id="gTo" type="date" />
          </label>

          <label>
            Alojamiento
            <select id="gProp">
              <option value="">Todos</option>
              ${getProps().map(p => {
                const id = p.slug || p.id;
                return `<option value="${escapeHtml(id)}">${escapeHtml(p.nombre || id)}</option>`;
              }).join("")}
            </select>
          </label>

          <label class="checkbox-label">
            <input type="checkbox" id="gIncludeBlocks" checked />
            Contar bloqueos como no-disponible
          </label>

          <button class="btn-primary" id="gRefresh">Actualizar</button>
        </div>

        <p class="muted" id="gMeta">Cargando…</p>

        <div class="kpi-grid" id="gKpis"></div>

        <div class="table-wrap" style="margin-top:12px">
          <table class="data-table ganancias-detalle-table">
            <thead>
              <tr>
                <th>Detalle</th>
                <th class="num">Valor</th>
              </tr>
            </thead>
            <tbody id="gDetails"></tbody>
          </table>
        </div>
      </div>
    `;

    wire();
    presetDates();
  }

  function presetDates() {
    const period = root.querySelector("#gPeriod").value;
    const from = root.querySelector("#gFrom");
    const to = root.querySelector("#gTo");
    const today = new Date();

    function iso(d) { return d.toISOString().slice(0, 10); }

    if (period === "custom") return;

    if (period === "month" || period === "prev-month") {
      const d = new Date(today.getFullYear(), today.getMonth(), 1);
      let start = d;
      let end = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      if (period === "prev-month") {
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 1);
      }

      from.value = iso(start);
      to.value = iso(new Date(end.getTime() - 86400000)); // inclusive in UI
      return;
    }

    const days = Number(period);
    const start = new Date(today);
    start.setDate(start.getDate() - (days - 1));
    from.value = iso(start);
    to.value = iso(today);
  }

  function getRangeISO() {
    const from = root.querySelector("#gFrom").value;
    const to = root.querySelector("#gTo").value;
    if (!from || !to) return null;
    if (to < from) return null;
    // rangeEndExclusive = to + 1 día
    const end = new Date(to + "T00:00:00");
    end.setDate(end.getDate() + 1);
    return { startISO: from, endISO: end.toISOString().slice(0, 10) };
  }

  function compute() {
    const meta = root.querySelector("#gMeta");
    const kpis = root.querySelector("#gKpis");
    const details = root.querySelector("#gDetails");

    const range = getRangeISO();
    if (!range) {
      meta.textContent = "Selecciona un rango válido.";
      kpis.innerHTML = "";
      details.innerHTML = "";
      return;
    }

    const propertyFilter = root.querySelector("#gProp").value || "";
    const includeBlocks = !!root.querySelector("#gIncludeBlocks").checked;

    const props = propIdList();
    const propsUsed = propertyFilter ? [propertyFilter] : props;

    const allPeriodNights = nightsBetween(range.startISO, range.endISO);
    const totalAvailableNights = allPeriodNights.length * propsUsed.length;

    const occ = new Map(); // propId -> Set(nights)
    const blocked = new Map();

    propsUsed.forEach(pid => {
      occ.set(pid, new Set());
      blocked.set(pid, new Set());
    });

    // Reservas: pro-rate ingresos por noche
    let revenue = 0;
    let soldNights = 0;

    const reservas = reservasAll.filter(r => {
      const pid = resolveReservasId?.(r.propertyId) || r.propertyId;
      if (!pid) return false;
      if (propertyFilter && pid !== propertyFilter) return false;
      if (!r.checkInISO || !r.checkOutISO) return false;
      return !(r.checkOutISO <= range.startISO || r.checkInISO >= range.endISO);
    });

    reservas.forEach(r => {
      const pid = resolveReservasId?.(r.propertyId) || r.propertyId;
      if (!occ.has(pid)) return;

      const overlap = overlapNights(r.checkInISO, r.checkOutISO, range.startISO, range.endISO);
      overlap.forEach(n => occ.get(pid).add(n));

      const nightsTotal = Number(r.nights || 0) || (nightsBetween(r.checkInISO, r.checkOutISO).length);
      const perNight = nightsTotal > 0 ? (Number(r.totalPrice || 0) / nightsTotal) : 0;

      soldNights += overlap.length;
      revenue += perNight * overlap.length;
    });

    const blqs = bloqueosAll.filter(b => {
      if (!b.checkIn || !b.checkOut) return false;
      // overlap
      return !(b.checkOut <= range.startISO || b.checkIn >= range.endISO);
    });

    blqs.forEach(b => {
      const ids = Array.isArray(b.apartamentoIds) ? b.apartamentoIds : [];
      const overlap = overlapNights(b.checkIn, b.checkOut, range.startISO, range.endISO);

      ids.forEach(raw => {
        const pid = resolveReservasId?.(raw) || raw;
        if (!blocked.has(pid)) return;
        overlap.forEach(n => blocked.get(pid).add(n));
      });
    });

    let occupiedNights = 0;
    let blockedNights = 0;

    propsUsed.forEach(pid => {
      occupiedNights += occ.get(pid).size;
      blockedNights += blocked.get(pid).size;
    });

    const unavailable = includeBlocks ? (occupiedNights + blockedNights) : occupiedNights;
    const occupancy = totalAvailableNights > 0 ? (unavailable / totalAvailableNights) : 0;

    const adr = soldNights > 0 ? (revenue / soldNights) : 0;
    const revpar = totalAvailableNights > 0 ? (revenue / totalAvailableNights) : 0;

    meta.textContent =
      `Periodo ${range.startISO} → ${new Date(range.endISO + "T00:00:00").toISOString().slice(0,10)} (fin excl.) · `
      + `${propsUsed.length} alojamiento(s) · ${reservas.length} reserva(s) consideradas · ${blqs.length} bloqueo(s) considerados`;

    const euro = (n) => new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(n || 0);
    const pct = (n) => `${Math.round((n || 0) * 1000) / 10}%`;

    kpis.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Ingresos (prorrateado)</div>
        <div class="kpi-value">${euro(revenue)}</div>
        <div class="kpi-sub">En el periodo</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Noches vendidas</div>
        <div class="kpi-value">${soldNights}</div>
        <div class="kpi-sub">Solo reservas</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">ADR</div>
        <div class="kpi-value">${euro(adr)}</div>
        <div class="kpi-sub">Ingreso / noche vendida</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">Ocupación</div>
        <div class="kpi-value">${pct(occupancy)}</div>
        <div class="kpi-sub">${includeBlocks ? "Reservas + bloqueos" : "Solo reservas"}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-label">RevPAR</div>
        <div class="kpi-value">${euro(revpar)}</div>
        <div class="kpi-sub">Ingreso / noche disponible</div>
      </div>
    `;

    details.innerHTML = `
      <tr><td data-label="Detalle">Noches disponibles</td><td class="num" data-label="Valor">${totalAvailableNights}</td></tr>
      <tr><td data-label="Detalle">Noches ocupadas (reservas)</td><td class="num" data-label="Valor">${occupiedNights}</td></tr>
      <tr><td data-label="Detalle">Noches bloqueadas</td><td class="num" data-label="Valor">${blockedNights}</td></tr>
      <tr><td data-label="Detalle">Noches no disponibles (según checkbox)</td><td class="num" data-label="Valor">${unavailable}</td></tr>
    `;
  }

  function wire() {
    root.querySelector("#gPeriod")?.addEventListener("change", () => {
      presetDates();
      compute();
    });

    ["gFrom", "gTo", "gProp", "gIncludeBlocks"].forEach(id => {
      root.querySelector(`#${id}`)?.addEventListener("change", compute);
      root.querySelector(`#${id}`)?.addEventListener("input", compute);
    });

    root.querySelector("#gRefresh")?.addEventListener("click", compute);
  }

  function subscribeData() {
    db.collection("reservas")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .onSnapshot((snap) => {
        reservasAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        compute();
      }, (e) => {
        console.error(e);
        root.querySelector("#gMeta").textContent = `❌ Error cargando reservas: ${e?.message || e}`;
      });

    db.collection("bloqueos")
      .orderBy("createdAt", "desc")
      .limit(1000)
      .onSnapshot((snap) => {
        bloqueosAll = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        compute();
      }, (e) => {
        console.error(e);
        root.querySelector("#gMeta").textContent = `❌ Error cargando bloqueos: ${e?.message || e}`;
      });
  }

  function mount() {
    render();
    subscribeData();
  }

  return { mount };
}