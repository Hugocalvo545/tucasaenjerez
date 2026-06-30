export function createComentariosUI({ db, serverTimestamp, escapeHtml, getPropertiesCache }) {
  const root = document.getElementById("comentariosRoot");
  if (!root) return {};

  let unsub = null;
  let all = [];
  let currentEditorId = null;

  function getProps() {
    return (getPropertiesCache?.() || []).filter(Boolean);
  }

  function propName(id) {
    const p = getProps().find(x => x.slug === id || x.id === id);
    return p?.nombre || p?.name || id || "—";
  }

  function ratingStars(r) {
    const v = Math.max(0, Math.min(5, Number(r) || 0));
    return `<span class="rating">${"★".repeat(Math.round(v))}${"☆".repeat(Math.max(0, 5 - Math.round(v)))}</span>`;
  }

  function dateToISO(v) {
    if (!v) return '';
    if (typeof v === 'string') return v.slice(0, 10);
    if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }

  function render() {
    const propOpts = getProps().map(p => {
      const id = p.slug || p.id;
      return `<option value="${escapeHtml(id)}">${escapeHtml(p.nombre || id)}</option>`;
    }).join("");

    root.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h2>Comentarios</h2>
          <div class="actions">
            <button class="btn-primary" id="revNewBtn">Añadir comentario</button>
          </div>
        </div>

        <div class="filters">
          <label>Alojamiento
            <select id="revProp">
              <option value="">Todos</option>${propOpts}
            </select>
          </label>
          <label>Fuente
            <select id="revSource">
              <option value="">Todas</option>
              <option value="manual">Manual</option>
              <option value="google">Google</option>
              <option value="booking">Booking</option>
              <option value="guest">Huésped</option>
            </select>
          </label>
          <label>Rating mínimo
            <select id="revMin">
              <option value="0">0+</option>
              <option value="3">3+</option>
              <option value="4">4+</option>
              <option value="4.5">4.5+</option>
            </select>
          </label>
          <label class="grow">Buscar texto
            <input id="revQ" type="text" placeholder="wifi, limpieza, ubicación..." />
          </label>
        </div>

        <details class="import-box">
          <summary>Importar reseñas (pegar JSON)</summary>
          <p class="muted" style="margin:8px 0 10px">
            Pega aquí el JSON y pulsa Importar. (No sincroniza con Booking, solo lo crea en tu Firestore)
          </p>
          <textarea id="revImportText" rows="6" placeholder='[{"propertyId":"atico-centro","source":"booking","rating":5,"reviewDateISO":"2025-08-25","authorName":"Nadia","text":"..."}]'></textarea>
          <div class="form-actions" style="margin-top:10px">
            <button class="btn-primary" id="revImportBtn" type="button">Importar</button>
            <button class="btn-secondary" id="revImportClearBtn" type="button">Limpiar</button>
          </div>
          <p class="info-msg" id="revImportMsg"></p>
        </details>

        <p class="muted" id="revMeta">Cargando…</p>

        <div class="table-wrap">
          <table class="data-table comentarios-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Alojamiento</th>
                <th>Fuente</th>
                <th>Rating</th>
                <th>Comentario</th>
                <th>Visible</th>
                <th></th>
              </tr>
            </thead>
            <tbody id="revRows"></tbody>
          </table>
        </div>
      </div>

      <!-- Modal solo para NUEVO comentario -->
      <div class="rev-modal-backdrop" id="revModal" style="display:none">
        <div class="rev-modal">
          <div class="rev-modal-head">
            <h3 id="revModalTitle">Nuevo comentario</h3>
            <button class="icon-btn" id="revCloseBtn">✕</button>
          </div>
          <form id="revForm" class="rev-modal-body">
            <input type="hidden" id="revId" />
            <div class="row">
              <label>Alojamiento
                <select id="revFormProp" required>${propOpts}</select>
              </label>
              <label>Fuente
                <select id="revFormSource" required>
                  <option value="manual">Manual</option>
                  <option value="google">Google</option>
                  <option value="booking">Booking</option>
                </select>
              </label>
              <label>Rating (0–5)
                <input id="revFormRating" type="number" min="0" max="5" step="0.5" value="5" required />
              </label>
            </div>
            <label>Fecha del comentario (opcional)
              <input id="revFormDate" type="date" />
            </label>
            <label>Autor (opcional)
              <input id="revFormAuthor" type="text" placeholder="Nombre" />
            </label>
            <label>Texto
              <textarea id="revFormText" rows="5" required placeholder="Escribe el comentario…"></textarea>
            </label>
            <label>Título (opcional)
              <input id="revFormTitle" type="text" placeholder="Título de la reseña" />
            </label>
            <label>Tipo de viaje (opcional)
              <select id="revFormTripType">
                <option value="">Seleccionar...</option>
                <option value="Pareja">Pareja</option>
                <option value="Familia">Familia</option>
                <option value="Amigos">Amigos</option>
                <option value="Solo">Solo</option>
                <option value="Trabajo">Trabajo</option>
              </select>
            </label>
            <label>Noches
              <input id="revFormNights" type="number" min="1" />
            </label>
            <label>País (opcional)
              <input id="revFormCountry" type="text" placeholder="País del autor" />
            </label>
            <label>Respuesta del alojamiento (opcional)
              <textarea id="revFormResponse" rows="3" placeholder="Respuesta del alojamiento (si aplica)"></textarea>
            </label>
            <div class="form-actions">
              <button type="submit" class="btn-primary" id="revSaveBtn">Guardar</button>
              <button type="button" class="btn-secondary" id="revCancelBtn">Cancelar</button>
            </div>
            <p class="info-msg" id="revMsg"></p>
          </form>
        </div>
      </div>
    `;

    wire();
    paintRows();
  }

  function buildSimpleEditorHtml(doc) {
    const commentText = escapeHtml(doc.comentario || doc.text || '');
    const rating = Math.round(Math.max(0, Math.min(5, Number(doc.rating) || 0)));
    const stars = [1,2,3,4,5].map(i =>
      `<span class="rie-star${i <= rating ? ' active' : ''}" data-val="${i}">★</span>`
    ).join('');
    return `
      <div class="rie-header">
        <strong>Editar reseña</strong>
        <span class="muted rie-meta">${escapeHtml(propName(doc.propertyId))} · ${escapeHtml(doc.userDisplayName || doc.authorName || '—')}</span>
      </div>
      <div class="rie-stars">
        ${stars}
        <input type="hidden" class="rie-rating-val" value="${rating}" />
      </div>
      <textarea class="rie-text" rows="4">${commentText}</textarea>
      <div class="rie-actions">
        <button type="button" class="btn-primary btn-sm rie-save">Guardar</button>
        <button type="button" class="btn-secondary btn-sm rie-expand">Editar todo</button>
        <button type="button" class="btn-secondary btn-sm rie-cancel">Cancelar</button>
      </div>
      <p class="info-msg rie-msg"></p>
    `;
  }

  function buildFullEditorHtml(doc) {
    const commentText = escapeHtml(doc.comentario || doc.text || '');
    const rating = Math.max(0, Math.min(5, Number(doc.rating) || 0));
    const dateval = doc.reviewDateISO || dateToISO(doc.fechaComentario) || dateToISO(doc.createdAt) || '';
    const currentSource = (doc.source || doc.fuente || 'manual').toLowerCase();
    const currentTripType = doc.tripType || doc.tipoViaje || '';

    const propOpts = getProps().map(p => {
      const id = p.slug || p.id;
      return `<option value="${escapeHtml(id)}"${doc.propertyId === id ? ' selected' : ''}>${escapeHtml(p.nombre || id)}</option>`;
    }).join('');

    const sourceOpts = ['manual','google','booking'].map(s =>
      `<option value="${s}"${currentSource === s ? ' selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`
    ).join('');

    const tripOpts = ['','Pareja','Familia','Amigos','Solo','Trabajo'].map(t =>
      `<option value="${t}"${currentTripType === t ? ' selected' : ''}>${t || '—'}</option>`
    ).join('');

    return `
      <div class="rie-header">
        <strong>Editar reseña (completo)</strong>
        <span class="muted rie-meta">${escapeHtml(propName(doc.propertyId))}</span>
      </div>
      <div class="rie-full-grid">
        <label>Alojamiento<select class="rie-prop">${propOpts}</select></label>
        <label>Fuente<select class="rie-source">${sourceOpts}</select></label>
        <label>Rating (0–5)<input type="number" class="rie-rating-num" min="0" max="5" step="0.5" value="${rating}" /></label>
        <label>Fecha del comentario<input type="date" class="rie-date" value="${escapeHtml(dateval)}" /></label>
        <label>Autor<input type="text" class="rie-author" value="${escapeHtml(doc.authorName || doc.userDisplayName || '')}" /></label>
        <label class="rie-span2">Texto<textarea class="rie-text" rows="4">${commentText}</textarea></label>
        <label>Título<input type="text" class="rie-title-field" value="${escapeHtml(doc.title || doc.titulo || '')}" /></label>
        <label>Tipo de viaje<select class="rie-triptype">${tripOpts}</select></label>
        <label>Noches<input type="number" class="rie-nights" min="1" value="${escapeHtml(String(doc.nights || doc.noches || ''))}" /></label>
        <label>País<input type="text" class="rie-country" value="${escapeHtml(doc.country || doc.pais || '')}" /></label>
        <label class="rie-span2">Respuesta del alojamiento
          <textarea class="rie-response" rows="3">${escapeHtml(doc.response || doc.respuestaAlojamiento || '')}</textarea>
        </label>
      </div>
      <div class="rie-actions">
        <button type="button" class="btn-primary btn-sm rie-save">Guardar</button>
        <button type="button" class="btn-secondary btn-sm rie-collapse">Vista simple</button>
        <button type="button" class="btn-secondary btn-sm rie-cancel">Cancelar</button>
      </div>
      <p class="info-msg rie-msg"></p>
    `;
  }

  function openInlineEditor(doc, mode = 'simple', focusResponse = false) {
    if (currentEditorId && currentEditorId !== doc.id) {
      const prevRow = root.querySelector(`[id="rie-row-${currentEditorId}"]`);
      const prevEl  = root.querySelector(`[id="inline-editor-${currentEditorId}"]`);
      if (prevRow) prevRow.style.display = 'none';
      if (prevEl)  prevEl.innerHTML = '';
    }
    if (currentEditorId === doc.id && mode === 'simple') {
      closeInlineEditor();
      return;
    }

    currentEditorId = doc.id;
    const row       = root.querySelector(`[id="rie-row-${doc.id}"]`);
    const container = root.querySelector(`[id="inline-editor-${doc.id}"]`);
    if (!container || !row) return;

    row.style.display = 'table-row';
    container.innerHTML = mode === 'simple'
      ? buildSimpleEditorHtml(doc)
      : buildFullEditorHtml(doc);

    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    wireInlineEditor(doc, mode);

    if (focusResponse) {
      requestAnimationFrame(() => container.querySelector('.rie-response')?.focus());
    }
  }

  function closeInlineEditor() {
    if (!currentEditorId) return;
    const row       = root.querySelector(`[id="rie-row-${currentEditorId}"]`);
    const el        = root.querySelector(`[id="inline-editor-${currentEditorId}"]`);
    const reviewRow = root.querySelector(`[id="revRow-${currentEditorId}"]`);
    if (el)  el.innerHTML = '';
    if (row) row.style.display = 'none';
    if (reviewRow) reviewRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    currentEditorId = null;
  }

  function wireInlineEditor(doc, mode) {
    const container = root.querySelector(`[id="inline-editor-${doc.id}"]`);
    if (!container) return;

    container.querySelectorAll('.rie-star').forEach(star => {
      star.addEventListener('click', () => {
        const val = Number(star.dataset.val);
        const hidden = container.querySelector('.rie-rating-val');
        if (hidden) hidden.value = val;
        container.querySelectorAll('.rie-star').forEach((s, i) => {
          s.classList.toggle('active', i + 1 <= val);
        });
      });
    });

    container.querySelector('.rie-expand')?.addEventListener('click', () => openInlineEditor(doc, 'full'));
    container.querySelector('.rie-collapse')?.addEventListener('click', () => openInlineEditor(doc, 'simple'));
    container.querySelector('.rie-cancel')?.addEventListener('click', closeInlineEditor);
    container.querySelector('.rie-save')?.addEventListener('click', () => saveInlineEditor(doc, mode, container));
  }

  async function saveInlineEditor(doc, mode, container) {
    const msg     = container.querySelector('.rie-msg');
    const saveBtn = container.querySelector('.rie-save');
    let payload   = {};

    if (mode === 'simple') {
      const rating = Number(container.querySelector('.rie-rating-val')?.value || 0);
      const text   = (container.querySelector('.rie-text')?.value || '').trim();
      if (!text) { msg.textContent = 'Escribe el comentario.'; return; }
      payload = { rating, text, comentario: text, updatedAt: serverTimestamp() };
    } else {
      const propertyId   = container.querySelector('.rie-prop')?.value || '';
      const source       = container.querySelector('.rie-source')?.value || 'manual';
      const rating       = Number(container.querySelector('.rie-rating-num')?.value || 0);
      const reviewDateISO = container.querySelector('.rie-date')?.value || '';
      const authorName   = (container.querySelector('.rie-author')?.value || '').trim();
      const text         = (container.querySelector('.rie-text')?.value || '').trim();
      const title        = (container.querySelector('.rie-title-field')?.value || '').trim();
      const tripType     = container.querySelector('.rie-triptype')?.value || '';
      const nightsRaw    = container.querySelector('.rie-nights')?.value;
      const nights       = nightsRaw ? Number(nightsRaw) : null;
      const country      = (container.querySelector('.rie-country')?.value || '').trim();
      const response     = (container.querySelector('.rie-response')?.value || '').trim();

      if (!propertyId) { msg.textContent = 'Selecciona un alojamiento.'; return; }
      if (!text) { msg.textContent = 'Escribe el comentario.'; return; }
      if (!Number.isFinite(rating)) { msg.textContent = 'Rating inválido.'; return; }

      payload = {
        propertyId, source, rating, reviewDateISO,
        authorName, text, comentario: text,
        title, titulo: title,
        tripType, tipoViaje: tripType,
        nights, noches: nights,
        country, pais: country,
        response, respuestaAlojamiento: response,
        updatedAt: serverTimestamp(),
      };
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando…';
      msg.textContent = '';
      await db.collection('reviews').doc(doc.id).set(payload, { merge: true });
      msg.textContent = '✅ Guardado';
      setTimeout(() => closeInlineEditor(), 800);
    } catch (err) {
      console.error(err);
      msg.textContent = `❌ ${err?.message || 'Error guardando.'}`;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar';
    }
  }

  function getFilters() {
    const prop   = root.querySelector("#revProp")?.value || "";
    const source = root.querySelector("#revSource")?.value || "";
    const min    = Number(root.querySelector("#revMin")?.value || 0);
    const q      = (root.querySelector("#revQ")?.value || "").trim().toLowerCase();
    return { prop, source, min, q };
  }

  function applyFilters(list) {
    const { prop, source, min, q } = getFilters();
    return list.filter(r => {
      if (prop   && r.propertyId !== prop)   return false;
      if (source && r.source !== source)     return false;
      if ((Number(r.rating) || 0) < min)     return false;
      if (q) {
        const hay = `${r.text || ""} ${r.comentario || ""} ${r.authorName || ""} ${r.userDisplayName || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function fmtDate(v) {
    if (!v) return "—";
    if (typeof v === "string") return v;
    if (v?.toDate) return v.toDate().toISOString().slice(0, 10);
    return "—";
  }

  function paintRows() {
    currentEditorId = null;
    const rows = root.querySelector("#revRows");
    const meta = root.querySelector("#revMeta");
    if (!rows || !meta) return;

    const filtered = applyFilters(all);
    meta.textContent = `${filtered.length} comentario(s) (total cargados: ${all.length})`;

    rows.innerHTML = filtered.map(r => {
      const id          = r.id;
      const source      = r.source || "manual";
      const visibleVal  = r.visible !== false;
      const commentText = r.comentario || r.text || "";
      const isGuest     = source === "guest";
      const hasResponse = !!(r.respuestaAlojamiento || r.response);
      const responseCell = hasResponse
        ? `<span class="badge badge-responded">✓ Respondida</span>`
        : `<button class="btn-link" data-reply="${escapeHtml(id)}">Responder</button>`;
      return `
        <tr id="revRow-${escapeHtml(id)}"${isGuest && !visibleVal ? ' style="opacity:0.55;"' : ''}>
          <td>${escapeHtml(r.reviewDateISO || fmtDate(r.createdAt))}</td>
          <td>
            ${escapeHtml(propName(r.propertyId))}
            ${isGuest ? `<br><small class="muted">${escapeHtml(r.userEmail || r.userDisplayName || "")}</small>` : ""}
          </td>
          <td><span class="badge badge-${escapeHtml(source)}">${escapeHtml(source)}</span></td>
          <td>${ratingStars(r.rating)}</td>
          <td class="cell-text">${escapeHtml(commentText)}</td>
          <td class="cell-actions">
            <button class="btn-link${visibleVal ? "" : " danger"}"
              data-vis="${escapeHtml(id)}" data-visval="${visibleVal ? "true" : "false"}">
              ${visibleVal ? "👁 Visible" : "🚫 Oculta"}
            </button>
          </td>
          <td class="cell-actions">
            ${responseCell}
            ${isGuest ? "" : `<button class="btn-link" data-edit="${escapeHtml(id)}">Editar</button>`}
            <button class="btn-link danger" data-del="${escapeHtml(id)}">Borrar</button>
          </td>
        </tr>
        <tr class="rie-row" id="rie-row-${escapeHtml(id)}" style="display:none">
          <td colspan="7" style="padding:0">
            <div class="review-inline-editor" id="inline-editor-${escapeHtml(id)}"></div>
          </td>
        </tr>
      `;
    }).join("");
  }

  function openModal() {
    const modal = root.querySelector("#revModal");
    if (!modal) return;
    modal.style.display = "flex";
    root.querySelector("#revMsg").textContent = "";
    root.querySelector("#revId").value          = "";
    root.querySelector("#revFormProp").value    = "";
    root.querySelector("#revFormSource").value  = "manual";
    root.querySelector("#revFormRating").value  = "5";
    root.querySelector("#revFormDate").value    = "";
    root.querySelector("#revFormAuthor").value  = "";
    root.querySelector("#revFormText").value    = "";
    root.querySelector("#revFormTitle").value   = "";
    root.querySelector("#revFormTripType").value = "";
    root.querySelector("#revFormNights").value  = "";
    root.querySelector("#revFormCountry").value = "";
    root.querySelector("#revFormResponse").value = "";
    const title = root.querySelector("#revModalTitle");
    if (title) title.textContent = "Nuevo comentario";
  }

  function closeModal() {
    const modal = root.querySelector("#revModal");
    if (modal) modal.style.display = "none";
  }

  async function upsertFromForm(e) {
    e.preventDefault();
    const msg     = root.querySelector("#revMsg");
    const saveBtn = root.querySelector("#revSaveBtn");
    const id          = root.querySelector("#revId").value || "";
    const propertyId  = root.querySelector("#revFormProp").value;
    const source      = root.querySelector("#revFormSource").value;
    const rating      = Number(root.querySelector("#revFormRating").value);
    const reviewDateISO = root.querySelector("#revFormDate").value || "";
    const authorName  = (root.querySelector("#revFormAuthor").value || "").trim();
    const text        = (root.querySelector("#revFormText").value || "").trim();
    const title       = (root.querySelector("#revFormTitle")?.value || "").trim();
    const tripType    = (root.querySelector("#revFormTripType")?.value || "").trim();
    const nightsRaw   = root.querySelector("#revFormNights").value;
    const nights      = nightsRaw === "" || nightsRaw == null ? null : Number(nightsRaw);
    const country     = (root.querySelector("#revFormCountry")?.value || "").trim();
    const response    = (root.querySelector("#revFormResponse")?.value || "").trim();

    if (!propertyId) return (msg.textContent = "Selecciona un alojamiento.");
    if (!text) return (msg.textContent = "Escribe el comentario.");
    if (!Number.isFinite(rating)) return (msg.textContent = "Rating inválido.");
    if (nights != null && (!Number.isFinite(nights) || nights < 1)) {
      return (msg.textContent = "Noches inválidas (mínimo 1).");
    }

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = "Guardando…";
      msg.textContent = "";
      const payload = {
        propertyId, source, rating, reviewDateISO, authorName,
        text, comentario: text,
        title, titulo: title,
        tripType, tipoViaje: tripType,
        nights, noches: nights,
        country, pais: country,
        response, respuestaAlojamiento: response,
        updatedAt: serverTimestamp(),
      };
      if (id) {
        await db.collection("reviews").doc(id).set(payload, { merge: true });
      } else {
        await db.collection("reviews").add({ ...payload, createdAt: serverTimestamp() });
      }
      msg.textContent = "✅ Guardado";
      closeModal();
    } catch (err) {
      console.error(err);
      msg.textContent = `❌ ${err?.message || "Error guardando."}`;
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "Guardar";
    }
  }

  async function deleteDoc(id) {
    if (!id) return;
    if (!confirm("¿Seguro que quieres borrar este comentario?")) return;
    try {
      await db.collection("reviews").doc(id).delete();
    } catch (e) {
      console.error(e);
      alert(`❌ ${e?.message || "Error borrando"}`);
    }
  }

  function normalizeOne(obj) {
    const propertyId    = String(obj?.propertyId || "").trim();
    const source        = String(obj?.source || "manual").trim();
    const rating        = Number(obj?.rating);
    const reviewDateISO = String(obj?.reviewDateISO || "").trim();
    const authorName    = String(obj?.authorName || "").trim();
    const text          = String(obj?.text || "").trim();
    const title         = obj?.title || null;
    const tripType      = obj?.tripType || null;
    const nights        = obj?.nights || null;
    const country       = obj?.country || null;
    const response      = obj?.response || null;
    if (!propertyId) throw new Error("Falta propertyId");
    if (!text) throw new Error("Falta text");
    if (!Number.isFinite(rating)) throw new Error("Rating inválido");
    if (rating < 0 || rating > 5) throw new Error("Rating debe ser 0–5");
    if (reviewDateISO && !/^\d{4}-\d{2}-\d{2}$/.test(reviewDateISO)) {
      throw new Error("reviewDateISO debe ser YYYY-MM-DD");
    }
    return { propertyId, source, rating, reviewDateISO, authorName, text, title, tripType, nights, country, response };
  }

  async function importReviewsFromTextarea() {
    const txt = root.querySelector("#revImportText")?.value || "";
    const msg = root.querySelector("#revImportMsg");
    const btn = root.querySelector("#revImportBtn");
    if (!msg || !btn) return;
    msg.textContent = "";
    let parsed;
    try { parsed = JSON.parse(txt); }
    catch { msg.textContent = "❌ JSON inválido. Pega un array tipo: [{...}, {...}]"; return; }
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    if (!arr.length) { msg.textContent = "❌ No hay elementos para importar."; return; }
    try {
      btn.disabled = true;
      btn.textContent = "Importando…";
      let ok = 0;
      for (const item of arr) {
        const r = normalizeOne(item);
        await db.collection("reviews").add({ ...r, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        ok++;
      }
      msg.textContent = `✅ Importadas ${ok} reseña(s).`;
    } catch (e) {
      console.error(e);
      msg.textContent = `❌ ${e?.message || "Error importando."}`;
    } finally {
      btn.disabled = false;
      btn.textContent = "Importar";
    }
  }

  function wire() {
    root.querySelector("#revNewBtn")?.addEventListener("click", openModal);
    root.querySelector("#revCloseBtn")?.addEventListener("click", closeModal);
    root.querySelector("#revCancelBtn")?.addEventListener("click", closeModal);
    root.querySelector("#revForm")?.addEventListener("submit", upsertFromForm);

    ["revProp", "revSource", "revMin", "revQ"].forEach(id => {
      root.querySelector(`#${id}`)?.addEventListener("input", paintRows);
      root.querySelector(`#${id}`)?.addEventListener("change", paintRows);
    });

    root.querySelector("#revRows")?.addEventListener("click", async (e) => {
      const editId  = e.target?.dataset?.edit;
      const delId   = e.target?.dataset?.del;
      const visId   = e.target?.dataset?.vis;
      const visVal  = e.target?.dataset?.visval;
      const replyId = e.target?.dataset?.reply;

      if (replyId) {
        const doc = all.find(x => x.id === replyId);
        if (doc) openInlineEditor(doc, 'full', true);
      } else if (editId) {
        const doc = all.find(x => x.id === editId);
        if (doc) openInlineEditor(doc);
      } else if (delId) {
        deleteDoc(delId);
      } else if (visId) {
        const newVisible = visVal !== "true";
        try {
          await db.collection("reviews").doc(visId).update({ visible: newVisible });
        } catch (err) {
          console.error(err);
          alert(`❌ ${err?.message || "Error actualizando visibilidad"}`);
        }
      }
    });

    root.querySelector("#revImportBtn")?.addEventListener("click", importReviewsFromTextarea);
    root.querySelector("#revImportClearBtn")?.addEventListener("click", () => {
      const t = root.querySelector("#revImportText");
      const m = root.querySelector("#revImportMsg");
      if (t) t.value = "";
      if (m) m.textContent = "";
    });

    root.querySelector("#revModal")?.addEventListener("click", (e) => {
      if (e.target?.id === "revModal") closeModal();
    });
  }

  function subscribe() {
    if (unsub) unsub();
    unsub = db.collection("reviews")
      .orderBy("createdAt", "desc")
      .limit(500)
      .onSnapshot((snap) => {
        all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        paintRows();
      }, (err) => {
        console.error(err);
        const meta = root.querySelector("#revMeta");
        if (meta) meta.textContent = `❌ Error cargando reviews: ${err?.message || err}`;
      });
  }

  function mount() {
    render();
    subscribe();
  }

  return { mount };
}
