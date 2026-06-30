// Registro de viajeros — Orden INT/1922/2003 / SES.HOSPEDAJES (Ministerio del Interior)

import { db } from "../../shared/firebase.js";

// Código de establecimiento asignado por el Ministerio del Interior para SES.HOSPEDAJES.
// PRODUCCIÓN: sustituir "PENDIENTE_ASIGNAR_POR_MINISTERIO" por el código real.
// Cómo obtenerlo: contactar con la Comisaría de Policía local o en
// https://sede.policia.gob.es/portalCiudadano/hospedajes/
// El XML generado NO será válido hasta que se rellene este valor.
const CODIGO_ESTABLECIMIENTO = "PENDIENTE_ASIGNAR_POR_MINISTERIO";

let initialized    = false;
let currentRegistros = [];
let currentQuarter = null;
let currentYear    = null;

function getCurrentQuarter() {
  return Math.ceil((new Date().getMonth() + 1) / 3);
}

function quarterRange(q, year) {
  const starts = ["01-01", "04-01", "07-01", "10-01"];
  const ends   = ["03-31", "06-30", "09-30", "12-31"];
  return {
    start: `${year}-${starts[q - 1]}`,
    end:   `${year}-${ends[q - 1]}`,
  };
}

function isoToES(isoDate) {
  if (!isoDate || isoDate.length < 10) return isoDate || "";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

function escHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function download(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement("a"), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function setExportBtns(enabled) {
  ["rvCsvBtn", "rvPdfBtn", "rvXmlBtn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

function renderTable(registros) {
  const body = document.getElementById("rvTableBody");
  if (!body) return;

  if (!registros.length) {
    body.innerHTML = '<tr><td colspan="6" class="muted" style="padding:1rem;">Sin registros para el período seleccionado.</td></tr>';
    return;
  }

  body.innerHTML = registros.map(r => {
    const enviado = r.estado === "enviado";
    const estadoClass = enviado ? "color:#1e7e34;font-weight:600;" : "color:#856404;font-weight:600;";
    return `
      <tr>
        <td>${escHtml(r.checkIn || r.checkInISO)}</td>
        <td>${escHtml(r.checkOut || r.checkOutISO)}</td>
        <td>${escHtml(r.propertyName || r.propertyId)}</td>
        <td>${(r.viajeros || []).length}</td>
        <td><span style="${estadoClass}">${enviado ? "Enviado" : "Pendiente"}</span></td>
        <td>
          <button class="btn-secondary btn-sm rv-detail-btn" data-id="${escHtml(r.id || r.reservaId)}">Ver viajeros</button>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll(".rv-detail-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const reg = currentRegistros.find(r => (r.id || r.reservaId) === btn.dataset.id);
      if (reg) showDetail(reg);
    });
  });
}

function showDetail(reg) {
  const existing = document.getElementById("rvDetailModal");
  if (existing) existing.remove();

  const viajeros = (reg.viajeros || []);
  const rows = viajeros.map(v => `
    <tr>
      <td>${escHtml(v.kind === "child" ? "Niño" : "Adulto")}</td>
      <td>${escHtml(v.nombre)}</td>
      <td>${escHtml(v.apellidos)}</td>
      <td>${escHtml(v.tipoDoc)} — ${escHtml(v.numDoc)}</td>
      <td>${escHtml(isoToES(v.fechaNacimiento))}</td>
      <td>${escHtml(v.nacionalidad)}</td>
      <td>${escHtml(v.localidad)}</td>
    </tr>`).join("");

  const modal = document.createElement("div");
  modal.id = "rvDetailModal";
  modal.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;";
  modal.innerHTML = `
    <div style="background:#fff;border-radius:8px;max-width:860px;width:100%;max-height:85vh;overflow:auto;padding:1.5rem;box-shadow:0 8px 32px rgba(0,0,0,.2);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3 style="margin:0;">Viajeros — Reserva ${escHtml(reg.reservaId || reg.id)}</h3>
        <button id="rvModalClose" class="btn-secondary btn-sm">Cerrar</button>
      </div>
      <p class="muted" style="margin-bottom:.75rem;">
        ${escHtml(reg.propertyName || reg.propertyId)} ·
        Entrada: ${escHtml(reg.checkIn || reg.checkInISO)} ·
        Salida: ${escHtml(reg.checkOut || reg.checkOutISO)}
      </p>
      <div style="overflow-x:auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Tipo</th><th>Nombre</th><th>Apellidos</th>
              <th>Documento</th><th>F. nacimiento</th>
              <th>Nacionalidad</th><th>Localidad</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector("#rvModalClose").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", e => { if (e.target === modal) modal.remove(); });
}

async function loadRegistros() {
  const q    = Number(document.getElementById("rvQuarter").value);
  const year = Number(document.getElementById("rvYear").value);
  const prop = document.getElementById("rvProperty").value;

  currentQuarter = q;
  currentYear    = year;

  const { start: startDate, end: endDate } = quarterRange(q, year);
  const statusEl = document.getElementById("rvStatus");
  const loadBtn  = document.getElementById("rvLoadBtn");

  if (statusEl) statusEl.textContent = "Cargando…";
  if (loadBtn)  loadBtn.disabled = true;

  try {
    const snap = await db.collection("registro_viajeros")
      .where("checkInISO", ">=", startDate)
      .where("checkInISO", "<=", endDate)
      .orderBy("checkInISO")
      .get();

    let registros = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (prop) registros = registros.filter(r => r.propertyId === prop);

    currentRegistros = registros;
    renderTable(registros);

    const n = registros.length;
    if (statusEl) statusEl.textContent = n ? `${n} registro${n !== 1 ? "s" : ""} encontrado${n !== 1 ? "s" : ""}.` : "Sin registros para el período seleccionado.";
    setExportBtns(n > 0);
  } catch (err) {
    console.error("Error cargando registro_viajeros:", err);
    if (statusEl) statusEl.textContent = "Error al cargar. Revisa que el índice de Firestore esté creado.";
    const body = document.getElementById("rvTableBody");
    if (body) body.innerHTML = '<tr><td colspan="6" class="muted">Error al cargar registros.</td></tr>';
    setExportBtns(false);
  } finally {
    if (loadBtn) loadBtn.disabled = false;
  }
}

export async function start() {
  if (initialized) return;
  initialized = true;

  const tab = document.getElementById("tab-registroViajeros");
  if (!tab) return;

  const year = new Date().getFullYear();
  const q    = getCurrentQuarter();

  const qOpts = [
    ["1", "T1 · Ene–Mar"],
    ["2", "T2 · Abr–Jun"],
    ["3", "T3 · Jul–Sep"],
    ["4", "T4 · Oct–Dic"],
  ].map(([v, l]) => `<option value="${v}" ${Number(v) === q ? "selected" : ""}>${l}</option>`).join("");

  tab.innerHTML = `
    <div class="card">
      <div class="card-header" style="flex-wrap:wrap;gap:.5rem;">
        <div>
          <h2 style="margin:0;">Registro de viajeros</h2>
          <p class="muted" style="font-size:.82rem;margin:.2rem 0 0;">Orden INT/1922/2003 · SES.HOSPEDAJES</p>
        </div>
      </div>

      <div style="display:flex;gap:1rem;flex-wrap:wrap;align-items:flex-end;margin:1rem 0 .5rem;">
        <label style="display:flex;flex-direction:column;gap:3px;font-size:.9rem;">
          Trimestre
          <select id="rvQuarter" style="min-width:150px;">${qOpts}</select>
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:.9rem;">
          Año
          <input type="number" id="rvYear" value="${year}" min="2020" max="2099" style="width:88px;" />
        </label>
        <label style="display:flex;flex-direction:column;gap:3px;font-size:.9rem;">
          Propiedad
          <select id="rvProperty" style="min-width:180px;">
            <option value="">Todas</option>
          </select>
        </label>
        <button id="rvLoadBtn" class="btn-primary">Cargar registros</button>
      </div>

      <p id="rvStatus" class="muted" style="font-size:.85rem;margin:.25rem 0 .75rem;"></p>

      <div style="overflow-x:auto;">
        <table class="table">
          <thead>
            <tr>
              <th>Fecha entrada</th>
              <th>Fecha salida</th>
              <th>Propiedad</th>
              <th>Nº viajeros</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody id="rvTableBody">
            <tr><td colspan="6" class="muted" style="padding:1rem;">Selecciona un período y pulsa "Cargar registros".</td></tr>
          </tbody>
        </table>
      </div>

      <div style="display:flex;gap:.75rem;flex-wrap:wrap;margin-top:1.25rem;padding-top:1rem;border-top:1px solid #e0e0e0;">
        <button id="rvCsvBtn" class="btn-secondary" disabled>Exportar CSV</button>
        <button id="rvPdfBtn" class="btn-secondary" disabled>Exportar PDF</button>
        <button id="rvXmlBtn" class="btn-secondary" disabled>Exportar XML (SES.HOSPEDAJES)</button>
      </div>
      <p style="margin-top:.75rem;font-size:.82rem;color:#b05b00;background:#fff8e1;border:1px solid #ffe082;border-radius:6px;padding:8px 12px;">
        ⚠️ <strong>Código de establecimiento pendiente.</strong>
        El XML generado no será válido hasta que se obtenga el código del Ministerio del Interior
        y se configure en el sistema. Tramitar antes del primer envío a SES.HOSPEDAJES.
      </p>
    </div>`;

  // Poblar selector de propiedades
  try {
    const snap = await db.collection("apartamentos").orderBy("nombre").get();
    const sel  = document.getElementById("rvProperty");
    if (sel) {
      snap.forEach(doc => {
        const opt = document.createElement("option");
        opt.value       = doc.id;
        opt.textContent = doc.data().nombre || doc.id;
        sel.appendChild(opt);
      });
    }
  } catch (_) {}

  document.getElementById("rvLoadBtn")?.addEventListener("click", loadRegistros);
  document.getElementById("rvCsvBtn")?.addEventListener("click", () => exportCSV(currentRegistros));
  document.getElementById("rvPdfBtn")?.addEventListener("click", () => exportPDF(currentRegistros));
  document.getElementById("rvXmlBtn")?.addEventListener("click", () => exportXML(currentRegistros));
}

export function exportCSV(registros) {
  if (!registros?.length) return;

  const q    = currentQuarter || getCurrentQuarter();
  const year = currentYear    || new Date().getFullYear();

  const header = [
    "Reserva ID", "Propiedad", "Fecha entrada", "Fecha salida",
    "Tipo viajero", "Nombre", "Apellidos", "Tipo doc", "Nº doc",
    "Fecha nacimiento", "Nacionalidad", "País residencia",
    "Domicilio", "Localidad", "CP", "Provincia",
  ];

  const rows = [header];
  for (const reg of registros) {
    for (const v of (reg.viajeros || [])) {
      rows.push([
        reg.reservaId || reg.id,
        reg.propertyName || reg.propertyId,
        reg.checkIn  || reg.checkInISO,
        reg.checkOut || reg.checkOutISO,
        v.kind === "child" ? "Niño" : "Adulto",
        v.nombre,
        v.apellidos,
        v.tipoDoc,
        v.numDoc,
        v.fechaNacimiento ? isoToES(v.fechaNacimiento) : "",
        v.nacionalidad,
        v.paisResidencia,
        v.domicilio,
        v.localidad,
        v.cp,
        v.provincia,
      ]);
    }
  }

  const csv = rows
    .map(r => r.map(c => `"${String(c ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\r\n");

  // BOM UTF-8 para que Excel lo abra correctamente
  download(`registro_viajeros_T${q}_${year}.csv`, "﻿" + csv, "text/csv;charset=utf-8;");
}

export async function exportPDF(registros) {
  if (!registros?.length) return;

  const q    = currentQuarter || getCurrentQuarter();
  const year = currentYear    || new Date().getFullYear();

  // Carga dinámica de jsPDF desde CDN
  if (!window.jspdf) {
    await new Promise((resolve, reject) => {
      const s  = document.createElement("script");
      s.src    = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload  = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const doc    = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW  = doc.internal.pageSize.getWidth();   // 297mm
  const pageH  = doc.internal.pageSize.getHeight();  // 210mm
  const margin = 14;
  const contentW = pageW - 2 * margin;               // 269mm
  const today  = isoToES(new Date().toISOString().slice(0, 10));

  const quarterLabel = ["T1 Ene–Mar", "T2 Abr–Jun", "T3 Jul–Sep", "T4 Oct–Dic"][q - 1];
  let pageNum = 1;

  // Anchos de columna (suma = 269mm)
  const cols      = [28, 32, 35, 12, 25, 18, 22, 25, 15, 25, 32];
  const colLabels = [
    "Nombre", "Apellidos", "Nº documento", "Tipo",
    "F. nacimiento", "Tipo viajero", "Nacionalidad",
    "Localidad", "CP", "Provincia", "País residencia",
  ];
  const lineH   = 6;
  const cellPad = 2;

  function addPageChrome() {
    // Cabecera
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 53, 128);
    doc.text("LIBRO DE REGISTRO DE VIAJEROS", margin, 13);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Período: ${quarterLabel} ${year}`, margin, 19);
    doc.text(`Generado: ${today}`, pageW - margin, 19, { align: "right" });
    doc.setDrawColor(0, 53, 128);
    doc.setLineWidth(0.5);
    doc.line(margin, 22, pageW - margin, 22);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.2);
    doc.setTextColor(0, 0, 0);
    // Pie
    doc.setFontSize(7.5);
    doc.setTextColor(120, 120, 120);
    doc.text(`Página ${pageNum}`, pageW / 2, pageH - 5, { align: "center" });
    doc.text("Conforme Orden INT/1922/2003", margin, pageH - 5);
    doc.setTextColor(0, 0, 0);
  }

  addPageChrome();
  let y = 27;

  for (const reg of registros) {
    const rowCount   = (reg.viajeros || []).length;
    const blockH     = lineH + lineH + rowCount * lineH + 5;

    if (y + blockH > pageH - 12) {
      doc.addPage();
      pageNum++;
      addPageChrome();
      y = 27;
    }

    // Barra de reserva
    doc.setFillColor(0, 53, 128);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.rect(margin, y, contentW, lineH, "F");
    const headerText = `Reserva: ${reg.reservaId || reg.id}   ·   Entrada: ${reg.checkIn || reg.checkInISO}   ·   Salida: ${reg.checkOut || reg.checkOutISO}   ·   ${reg.propertyName || reg.propertyId}`;
    doc.text(doc.splitTextToSize(headerText, contentW - cellPad * 2)[0], margin + cellPad, y + lineH - 1.8);
    doc.setTextColor(0, 0, 0);
    y += lineH;

    // Cabecera de columnas
    doc.setFillColor(220, 228, 245);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.rect(margin, y, contentW, lineH, "F");
    let x = margin;
    colLabels.forEach((label, i) => {
      doc.text(label, x + cellPad, y + lineH - 1.8);
      x += cols[i];
    });
    y += lineH;

    // Filas de viajeros
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    (reg.viajeros || []).forEach((v, vi) => {
      if (vi % 2 === 0) {
        doc.setFillColor(248, 249, 252);
        doc.rect(margin, y, contentW, lineH, "F");
      }
      x = margin;
      const cells = [
        v.nombre, v.apellidos, v.numDoc, v.tipoDoc,
        v.fechaNacimiento ? isoToES(v.fechaNacimiento) : "",
        v.kind === "child" ? "Niño" : "Adulto",
        v.nacionalidad, v.localidad, v.cp, v.provincia, v.paisResidencia,
      ];
      cells.forEach((cell, i) => {
        const text = doc.splitTextToSize(String(cell ?? ""), cols[i] - cellPad * 2)[0] || "";
        doc.text(text, x + cellPad, y + lineH - 1.8);
        x += cols[i];
      });
      y += lineH;
    });

    y += 5;
  }

  doc.save(`libro_registro_T${q}_${year}.pdf`);
}

export function exportXML(registros) {
  if (!registros?.length) return;

  const q    = currentQuarter || getCurrentQuarter();
  const year = currentYear    || new Date().getFullYear();
  const today = isoToES(new Date().toISOString().slice(0, 10));

  function x(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  function splitApellidos(apellidos) {
    const parts = String(apellidos || "").trim().split(/\s+/);
    return { ap1: parts[0] || "", ap2: parts.slice(1).join(" ") };
  }

  const partes = registros.map(reg => {
    // Solo adultos en XML SES.HOSPEDAJES (niños excluidos)
    const adultos = (reg.viajeros || []).filter(v => v.kind !== "child");

    const viajerosTags = adultos.map(v => {
      const { ap1, ap2 } = splitApellidos(v.apellidos);
      return `        <viajero>
          <tipoDocumento>${x(v.tipoDoc)}</tipoDocumento>
          <numeroDocumento>${x(v.numDoc)}</numeroDocumento>
          <soporteDocumento></soporteDocumento>
          <nombre>${x(v.nombre)}</nombre>
          <apellido1>${x(ap1)}</apellido1>
          <apellido2>${x(ap2)}</apellido2>
          <sexo></sexo>
          <fechaNacimiento>${x(v.fechaNacimiento ? isoToES(v.fechaNacimiento) : "")}</fechaNacimiento>
          <paisNacionalidad>${x(v.nacionalidad)}</paisNacionalidad>
          <paisResidencia>${x(v.paisResidencia)}</paisResidencia>
          <municipioResidencia>${x(v.localidad)}</municipioResidencia>
        </viajero>`;
    }).join("\n");

    return `    <parte>
      <referencia>${x(reg.reservaId || reg.id)}</referencia>
      <fechaEntrada>${x(reg.checkIn || isoToES(reg.checkInISO))}</fechaEntrada>
      <fechaSalida>${x(reg.checkOut || isoToES(reg.checkOutISO))}</fechaSalida>
      <viajeros>
${viajerosTags}
      </viajeros>
    </parte>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<peticion>
  <cabecera>
    <codigoEstablecimiento>${x(CODIGO_ESTABLECIMIENTO)}</codigoEstablecimiento>
    <fechaGeneracion>${today}</fechaGeneracion>
  </cabecera>
  <partes>
${partes}
  </partes>
</peticion>`;

  download(`ses_hospedajes_T${q}_${year}.xml`, xml, "application/xml;charset=utf-8;");
}
