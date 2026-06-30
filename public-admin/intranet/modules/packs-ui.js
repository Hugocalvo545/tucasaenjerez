import { setButtonLoading } from "../../shared/utils.js";

export function createPacksUI({ db, storage, serverTimestamp, fetchPacks, savePack, packCalendar, getPropertiesCache }) {
  const events = new AbortController();

  const packsBody = document.getElementById("packsBody");
  const newPackBtn = document.getElementById("newPackBtn");

  const packSidePanel = document.getElementById("packSidePanel");
  const packSummaryCard = document.getElementById("packSummaryCard");
  const packFullFieldsBox = document.getElementById("packFullFieldsBox");
  const packPhotoEditorBox = document.getElementById("packPhotoEditorBox");
  const packFullActionsBox = document.getElementById("packFullActionsBox");
  const packStickyHead = document.getElementById("packStickyHead");
  const packStickyTitle = document.getElementById("packStickyTitle");
  const packStickySub = document.getElementById("packStickySub");
  const packEnableEditBtn = document.getElementById("packEnableEditBtn");
  const packCancelEditBtn = document.getElementById("packCancelEditBtn");

  const packForm = document.getElementById("packForm");
  const packFormTitle = document.getElementById("packFormTitle");
  const resetPackFormBtn = document.getElementById("resetPackFormBtn");
  const packFormMessage = document.getElementById("packFormMessage");
  const deletePackBtn = document.getElementById("deletePackBtn");

  const packIdInput = document.getElementById("packId");
  const packNombreInput = document.getElementById("packNombre");
  const packCiudadInput = document.getElementById("packCiudad");
  const packDireccionInput = document.getElementById("packDireccion");
  const packGroupKeyInput = document.getElementById("packGroupKey");
  const packDescripcionInput = document.getElementById("packDescripcion");
  const packDescripcionLargaInput = document.getElementById("packDescripcionLarga");
  const packCapacidadInput = document.getElementById("packCapacidad");
  const packDormitoriosInput = document.getElementById("packDormitorios");
  const packBanosInput = document.getElementById("packBanos");
  const packTaglineInput = document.getElementById("packTagline");
  const packHighlightsInput = document.getElementById("packHighlights");
  const packNormasInput = document.getElementById("packNormas");
  const packPctInput = document.getElementById("packPct");
  const packCalcPrecioInput = document.getElementById("packCalcPrecio");
  const packActivaInput = document.getElementById("packActiva");
  const packServiciosInput = document.getElementById("packServicios");
  const packSourcePropertiesInput = document.getElementById("packSourceProperties");
  const packMinNightsInput = document.getElementById("packMinNights");

  const packPhotosInput = document.getElementById("packPhotos");
  const packPhotoPreview = document.getElementById("packPhotoPreview");

  let packsCache = [];
  let selectedPack = null;
  let uiMode = "new"; // "new" | "summary" | "full"
  let toastTimer = null;
  let wired = false;

  let baseQuickSnapshot = "";
  let basePhotoSnapshot = "";

  let existingImages = [];
  let newFiles = [];
  let urlsToDelete = [];
  let mainImage = "";

  function computeAutoPrice(pack) {
    const sp = Array.isArray(pack?.sourceProperties) ? pack.sourceProperties : [];
    if (!sp.length) return null;
    const props = getPropertiesCache?.() || [];
    const pct = Number(packPctInput?.value || pack?.packPct || 85) / 100;
    const precio1 = Number(props.find(x => x.id === sp[0])?.precioBase || 0);
    const precio2 = sp[1] ? Number(props.find(x => x.id === sp[1])?.precioBase || 0) : 0;
    return Math.round((precio1 + precio2) * pct);
  }

  function updateCalcPrecio() {
    if (!packCalcPrecioInput) return;
    const calc = computeAutoPrice(selectedPack);
    packCalcPrecioInput.value = calc !== null ? String(calc) : "";
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function showSuccess(msg = "Guardado correctamente.") {
    clearTimeout(toastTimer);
    if (!packFormMessage) return;
    packFormMessage.textContent = msg;
    packFormMessage.className = "info-msg";
    toastTimer = setTimeout(() => {
      if (packFormMessage) packFormMessage.textContent = "";
    }, 2500);
  }

  function showError(msg = "Ha ocurrido un error.") {
    clearTimeout(toastTimer);
    if (!packFormMessage) return;
    packFormMessage.textContent = msg;
    packFormMessage.className = "error-msg";
  }

  function setSelectedRow(id) {
    packsBody?.querySelectorAll("tr.is-selected").forEach((tr) => tr.classList.remove("is-selected"));
    const row = packsBody?.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add("is-selected");
  }

  function setPackSticky(pack) {
    if (!packStickyHead || !packStickyTitle || !packStickySub) return;
    if (!pack?.id) {
      packStickyHead.style.display = "none";
      return;
    }
    packStickyHead.style.display = "flex";
    packStickyTitle.textContent = pack.nombre || pack.id || "Pack";
    packStickySub.textContent = `${pack.ciudad || ""} · ${pack.id || ""}`.trim();
  }

  function setUIMode(mode) {
    uiMode = mode;

    if (packSummaryCard) packSummaryCard.style.display = mode === "summary" ? "block" : "none";
    if (packFullFieldsBox) packFullFieldsBox.style.display = (mode === "full" || mode === "new") ? "block" : "none";
    if (packPhotoEditorBox) packPhotoEditorBox.style.display = (mode === "full" || mode === "new") ? "block" : "none";
    if (packFullActionsBox) packFullActionsBox.style.display = (mode === "full" || mode === "new") ? "block" : "none";

    if (packCancelEditBtn) packCancelEditBtn.style.display = mode === "full" ? "inline-flex" : "none";
    if (deletePackBtn) deletePackBtn.style.display = (selectedPack?.id && mode === "full") ? "inline-flex" : "none";

    updateQuickSaveVisibility();
  }

  function quickSnapshot() {
    return [
      packNombreInput?.value ?? "",
      packCiudadInput?.value ?? "",
      packCapacidadInput?.value ?? "",
      packPctInput?.value ?? "85",
      packMinNightsInput?.value ?? "1",
      packActivaInput?.checked ? "1" : "0",
    ].join("|");
  }

  function photoSnapshot() {
    const urls = getPhotoItems().map((x) => x.url).filter(Boolean);
    return [mainImage || "", urls.join(",")].join("|");
  }

  function isQuickDirty() { return quickSnapshot() !== baseQuickSnapshot; }
  function isPhotoDirty() { return photoSnapshot() !== basePhotoSnapshot; }

  function updateQuickSaveVisibility() {
    const btn = document.getElementById("packQuickSaveBtn");
    if (!btn) return;
    const hasSel = !!selectedPack?.id;
    const hasChanges = isQuickDirty() || isPhotoDirty();
    btn.style.display = (hasSel && uiMode === "summary" && hasChanges) ? "inline-flex" : "none";
  }

  async function saveQuickChanges(triggerBtn) {
    if (!selectedPack?.id) return;
    setButtonLoading(triggerBtn, true, "Guardando");
    try {
      const data = {
        nombre: (packNombreInput?.value ?? "").trim(),
        ciudad: (packCiudadInput?.value ?? "").trim(),
        capacidad: packCapacidadInput?.value ? Number(packCapacidadInput.value) : null,
        packPct: packPctInput?.value ? Number(packPctInput.value) : 85,
        activa: !!packActivaInput?.checked,
        updatedAt: serverTimestamp(),
      };
      await db.collection("packs").doc(selectedPack.id).set(data, { merge: true });

      await loadPacks();
      selectedPack = packsCache.find((x) => x.id === selectedPack.id) || selectedPack;
      await fillFormWithPack(selectedPack);

      baseQuickSnapshot = quickSnapshot();
      basePhotoSnapshot = photoSnapshot();
      showSuccess("Guardado.");
      updateQuickSaveVisibility();
    } catch (err) {
      console.error(err);
      showError(`Error guardando: ${err?.message || err}`);
    } finally {
      setButtonLoading(triggerBtn, false);
    }
  }

  function renderPackSummary() {
    if (!packSummaryCard || !selectedPack?.id) return;

    const p = selectedPack;
    const items = getPhotoItems();
    const urls = items.map((x) => x.url).filter(Boolean);
    const mainOk = mainImage && urls.includes(mainImage) ? mainImage : (urls[0] || "");
    const ordered = mainOk ? [mainOk, ...urls.filter((u) => u !== mainOk)] : urls;
    const thumbs = ordered.slice(0, 6);
    const extra = Math.max(0, ordered.length - 6);
    const sourcePropsArr = Array.isArray(p.sourceProperties) ? p.sourceProperties : [];
    const calcPrecio = computeAutoPrice(p);
    const currentPct = Number(packPctInput?.value || p.packPct || 85);
    const precioDisplay = calcPrecio !== null ? `${calcPrecio}€/noche (${currentPct}% de apts)` : "—";

    packSummaryCard.innerHTML = `
      <div class="prop-summary-head">
        <div class="prop-summary-title">
          <h3>Resumen del pack</h3>
          <div class="muted">${escapeHtml(p.id || "")} · ${escapeHtml(p.ciudad || "")}</div>
        </div>
        <div class="prop-summary-actions">
          <button type="button" class="btn-primary btn-sm" id="packQuickSaveBtn" style="display:none">Guardar</button>
          <button type="button" class="btn-secondary btn-sm pack-edit-all" id="packQuickEditAllBtn">Editar todo</button>
        </div>
      </div>

      <div class="prop-summary-grid">
        <div class="prop-sq" data-q="nombre">
          <div class="k">Nombre</div>
          <input type="text" id="qPackNombre" value="${escapeAttr(packNombreInput?.value ?? p.nombre ?? "")}">
        </div>
        <div class="prop-sq" data-q="ciudad">
          <div class="k">Ciudad</div>
          <input type="text" id="qPackCiudad" value="${escapeAttr(packCiudadInput?.value ?? p.ciudad ?? "")}">
        </div>
        <div class="prop-sq" data-q="capacidad">
          <div class="k">Capacidad</div>
          <input type="number" id="qPackCapacidad" min="1" value="${escapeAttr(packCapacidadInput?.value ?? p.capacidad ?? "")}">
        </div>
        <div class="prop-sq" data-q="packPct">
          <div class="k">% Pack</div>
          <input type="number" id="qPackPct" min="1" max="100" step="1" value="${escapeAttr(String(currentPct))}">
        </div>
        <div class="prop-sq">
          <div class="k">Precio base</div>
          <div class="val" id="qPackCalcPrecioDisplay" style="font-weight:600">${escapeHtml(precioDisplay)}</div>
        </div>
        <div class="prop-sq" data-q="activa">
          <div class="k">Activo</div>
          <label class="checkbox-label">
            <input type="checkbox" id="qPackActiva" ${packActivaInput?.checked ? "checked" : (p.activa ? "checked" : "")}>
            Activo
          </label>
        </div>
      </div>

      <div class="prop-summary-grid2">
        <div class="prop-sq prop-sq-wide is-click" id="qPackFotosBox" title="Editar fotos">
          <div class="k">Fotos</div>
          <div class="val">${escapeHtml(String(ordered.length))} fotos</div>
          <div class="prop-thumbs">
            ${thumbs.map((url, idx) => `
              <div class="prop-thumb ${url === mainOk ? "is-main" : ""}">
                <img src="${escapeAttr(url)}" alt="Foto" loading="lazy" decoding="async">
                ${(idx === 5 && extra > 0) ? `<span class="prop-thumb-more">+${extra}</span>` : ""}
              </div>
            `).join("")}
          </div>
        </div>

        <div class="prop-sq prop-sq-wide">
          <div class="k">Apartamentos incluidos</div>
          <div class="val">${escapeHtml(sourcePropsArr.join(", ") || "—")}</div>
          <div class="val" style="margin-top:6px">
            <button type="button" class="btn-secondary btn-sm pack-edit-all">Editar todo</button>
          </div>
        </div>
      </div>
    `;

    // wire quick-edit inputs
    const qPackNombre = document.getElementById("qPackNombre");
    const qPackCiudad = document.getElementById("qPackCiudad");
    const qPackCapacidad = document.getElementById("qPackCapacidad");
    const qPackPct = document.getElementById("qPackPct");
    const qPackActiva = document.getElementById("qPackActiva");
    const qPackFotosBox = document.getElementById("qPackFotosBox");
    const packQuickSaveBtn = document.getElementById("packQuickSaveBtn");

    const syncQuickToForm = () => {
      if (packNombreInput) packNombreInput.value = qPackNombre?.value ?? "";
      if (packCiudadInput) packCiudadInput.value = qPackCiudad?.value ?? "";
      if (packCapacidadInput) packCapacidadInput.value = qPackCapacidad?.value ?? "";
      if (packPctInput) packPctInput.value = qPackPct?.value ?? "85";
      if (packActivaInput) packActivaInput.checked = !!qPackActiva?.checked;
      const display = document.getElementById("qPackCalcPrecioDisplay");
      if (display) {
        const cp = computeAutoPrice(selectedPack);
        const pct = Number(packPctInput?.value || 85);
        display.textContent = cp !== null ? `${cp}€/noche (${pct}% de apts)` : "—";
      }
      setPackSticky({ ...selectedPack, nombre: packNombreInput?.value, ciudad: packCiudadInput?.value });
    };

    const onQuickChange = () => {
      syncQuickToForm();
      updateQuickSaveVisibility();
    };

    [qPackNombre, qPackCiudad, qPackCapacidad, qPackPct].forEach((el) => {
      el?.addEventListener("input", onQuickChange, { signal: events.signal });
    });
    qPackActiva?.addEventListener("change", onQuickChange, { signal: events.signal });

    qPackFotosBox?.addEventListener("click", () => {
      if (!selectedPack?.id) return;
      if (packFormTitle) packFormTitle.textContent = "Editar pack";
      setUIMode("full");
      packPhotoEditorBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, { signal: events.signal });

    packSummaryCard.querySelectorAll(".pack-edit-all").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!selectedPack?.id) return;
        if (packFormTitle) packFormTitle.textContent = "Editar pack";
        setUIMode("full");
      }, { signal: events.signal });
    });

    packQuickSaveBtn?.addEventListener("click", async () => {
      await saveQuickChanges(packQuickSaveBtn);
    }, { signal: events.signal });

    updateQuickSaveVisibility();
  }

  function readImagesFromPack(pack) {
    const images = Array.isArray(pack?.images) ? pack.images.filter(Boolean) : [];
    const fotos = Array.isArray(pack?.fotos) ? pack.fotos.filter(Boolean) : [];
    const merged = [...images, ...fotos].filter(Boolean);
    const uniq = [];
    const seen = new Set();
    merged.forEach((u) => {
      if (!seen.has(u)) { seen.add(u); uniq.push(u); }
    });
    const main = String(pack?.imageMain || "").trim();
    const mainOk = main && uniq.includes(main) ? main : (uniq[0] || "");
    return { uniq, mainOk };
  }

  const fileUrlMap = new WeakMap();

  function getFilePreviewUrl(file) {
    if (!file) return "";
    if (fileUrlMap.has(file)) return fileUrlMap.get(file);
    const url = URL.createObjectURL(file);
    fileUrlMap.set(file, url);
    return url;
  }

  function revokeFilePreviewUrl(file) {
    if (!file) return;
    const url = fileUrlMap.get(file);
    if (url) URL.revokeObjectURL(url);
    fileUrlMap.delete(file);
  }

  function clearNewFilePreviews() {
    newFiles.forEach((f) => revokeFilePreviewUrl(f));
    newFiles = [];
  }

  function getPhotoItems() {
    return [
      ...existingImages.map((url) => ({ kind: "existing", url })),
      ...newFiles.map((file) => ({ kind: "new", file, url: getFilePreviewUrl(file) })),
    ];
  }

  function setOrderFromItems(items) {
    existingImages = items.filter((x) => x.kind === "existing").map((x) => x.url);
    newFiles = items.filter((x) => x.kind === "new").map((x) => x.file);
  }

  function setMainByIndex(idx) {
    const item = getPhotoItems()[idx];
    if (!item?.url) return;
    mainImage = item.url;
    renderPhotos();
  }

  function removeByIndex(idx) {
    const items = getPhotoItems();
    const item = items[idx];
    if (!item) return;
    if (item.kind === "existing") {
      urlsToDelete.push(item.url);
      existingImages = existingImages.filter((u) => u !== item.url);
    } else {
      revokeFilePreviewUrl(item.file);
      newFiles = newFiles.filter((f) => f !== item.file);
    }
    if (mainImage === item.url) mainImage = getPhotoItems()[0]?.url || "";
    renderPhotos();
  }

  function moveByIndex(idx, dir) {
    const items = getPhotoItems();
    const to = idx + dir;
    if (to < 0 || to >= items.length) return;
    const tmp = items[idx];
    items[idx] = items[to];
    items[to] = tmp;
    setOrderFromItems(items);
    renderPhotos();
  }

  let dragIndex = null;

  function reorderByDrag(fromIdx, toIdx) {
    const items = getPhotoItems();
    if (fromIdx < 0 || toIdx < 0 || fromIdx >= items.length || toIdx >= items.length || fromIdx === toIdx) return;
    const [moved] = items.splice(fromIdx, 1);
    items.splice(toIdx, 0, moved);
    setOrderFromItems(items);
    renderPhotos();
  }

  function renderPhotos() {
    if (!packPhotoPreview) return;
    packPhotoPreview.innerHTML = "";

    const items = getPhotoItems();
    items.forEach((it, idx) => {
      const imgDiv = document.createElement("div");
      imgDiv.className = "photo-item" + (it.url === mainImage ? " main-photo" : "");
      imgDiv.setAttribute("data-idx", String(idx));
      imgDiv.draggable = true;

      imgDiv.addEventListener("dragstart", (e) => {
        dragIndex = idx;
        e.dataTransfer.effectAllowed = "move";
        imgDiv.classList.add("dragging");
      }, { signal: events.signal });

      imgDiv.addEventListener("dragend", () => {
        dragIndex = null;
        imgDiv.classList.remove("dragging");
        packPhotoPreview.querySelectorAll(".photo-item").forEach((x) => x.classList.remove("drag-over"));
      }, { signal: events.signal });

      imgDiv.addEventListener("dragover", (e) => {
        e.preventDefault();
        imgDiv.classList.add("drag-over");
        e.dataTransfer.dropEffect = "move";
      }, { signal: events.signal });

      imgDiv.addEventListener("dragleave", () => {
        imgDiv.classList.remove("drag-over");
      }, { signal: events.signal });

      imgDiv.addEventListener("drop", (e) => {
        e.preventDefault();
        imgDiv.classList.remove("drag-over");
        if (dragIndex == null) return;
        reorderByDrag(dragIndex, idx);
      }, { signal: events.signal });

      const img = document.createElement("img");
      img.src = it.url;
      img.alt = "foto";

      const topBar = document.createElement("div");
      topBar.className = "photo-top";

      const star = document.createElement("button");
      star.type = "button";
      star.className = "star-icon" + (it.url === mainImage ? " is-main" : "");
      star.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path></svg>`;
      star.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        setMainByIndex(idx);
      }, { signal: events.signal });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "photo-delete";
      del.textContent = "✕";
      del.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        removeByIndex(idx);
      }, { signal: events.signal });

      topBar.appendChild(star);
      topBar.appendChild(del);

      const actions = document.createElement("div");
      actions.className = "photo-actions";

      const leftBtn = document.createElement("button");
      leftBtn.type = "button";
      leftBtn.textContent = "←";
      leftBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        moveByIndex(idx, -1);
      }, { signal: events.signal });

      const rightBtn = document.createElement("button");
      rightBtn.type = "button";
      rightBtn.textContent = "→";
      rightBtn.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        moveByIndex(idx, 1);
      }, { signal: events.signal });

      actions.appendChild(leftBtn);
      actions.appendChild(rightBtn);

      imgDiv.appendChild(img);
      imgDiv.appendChild(topBar);
      imgDiv.appendChild(actions);
      packPhotoPreview.appendChild(imgDiv);
    });

    updateQuickSaveVisibility();
    if (selectedPack?.id) renderPackSummary();
  }

  function onFilesPicked(e) {
    const input = e?.currentTarget || packPhotosInput;
    if (!input) return;
    const picked = Array.from(input.files || []);
    if (!picked.length) return;
    clearNewFilePreviews();
    newFiles = picked;
    if (!mainImage) mainImage = getPhotoItems()[0]?.url || "";
    renderPhotos();
    input.value = "";
  }

  async function uploadNewFiles(packId) {
    if (!storage || !newFiles.length) return [];
    const out = [];
    for (const file of newFiles) {
      const safeName = String(file.name || "foto").replaceAll(" ", "_").replaceAll("/", "_");
      const path = `packs/${packId}/${Date.now()}-${safeName}`;
      const ref = storage.ref().child(path);
      await ref.put(file);
      out.push(await ref.getDownloadURL());
    }
    return out;
  }

  async function deleteMarkedUrlsFromStorage() {
    if (!storage || !urlsToDelete.length) return;
    const uniq = Array.from(new Set(urlsToDelete.filter(Boolean)));
    urlsToDelete = [];
    for (const url of uniq) {
      try { await storage.refFromURL(url).delete(); } catch (_) {}
    }
  }

  async function saveImagesToPackDoc(packId, uploadedUrls) {
    const combined = [...existingImages, ...uploadedUrls].filter(Boolean);
    let finalMain = mainImage;

    if (finalMain && finalMain.startsWith("blob:")) {
      const items = getPhotoItems();
      const idx = items.findIndex((x) => x.url === finalMain);
      if (idx >= 0) {
        if (idx < existingImages.length) {
          finalMain = existingImages[idx] || "";
        } else {
          finalMain = uploadedUrls[idx - existingImages.length] || combined[0] || "";
        }
      } else {
        finalMain = combined[0] || "";
      }
    }

    if (!finalMain) finalMain = combined[0] || "";

    await db.collection("packs").doc(packId).set(
      { images: combined, imageMain: finalMain, fotos: [], updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function fillFormWithPack(pack) {
    if (!pack?.id) return;

    if (packIdInput) packIdInput.value = pack.id || "";
    if (packNombreInput) packNombreInput.value = pack.nombre ?? "";
    if (packCiudadInput) packCiudadInput.value = pack.ciudad ?? "";
    if (packDireccionInput) packDireccionInput.value = pack.direccion ?? "";
    if (packGroupKeyInput) packGroupKeyInput.value = pack.groupKey ?? "";
    if (packDescripcionInput) packDescripcionInput.value = pack.descripcion ?? "";
    if (packDescripcionLargaInput) packDescripcionLargaInput.value = pack.descripcionLarga ?? "";
    if (packCapacidadInput) packCapacidadInput.value = pack.capacidad ?? "";
    if (packDormitoriosInput) packDormitoriosInput.value = pack.dormitorios ?? "";
    if (packBanosInput) packBanosInput.value = pack.banos ?? "";
    if (packTaglineInput) packTaglineInput.value = pack.tagline ?? "";
    if (packHighlightsInput) {
      packHighlightsInput.value = Array.isArray(pack.highlights)
        ? pack.highlights.join("\n") : (pack.highlights ?? "");
    }
    if (packNormasInput) packNormasInput.value = pack.normas ?? "";
    if (packPctInput) packPctInput.value = pack.packPct ?? 85;
    updateCalcPrecio();
    if (packMinNightsInput) packMinNightsInput.value = pack.minNights ?? 1;
    if (packActivaInput) packActivaInput.checked = !!pack.activa;
    if (packServiciosInput) {
      packServiciosInput.value = Array.isArray(pack.servicios)
        ? pack.servicios.join(", ") : (pack.servicios ?? "");
    }
    if (packSourcePropertiesInput) {
      packSourcePropertiesInput.value = Array.isArray(pack.sourceProperties)
        ? pack.sourceProperties.join(", ") : (pack.sourceProperties ?? "");
    }

    urlsToDelete = [];
    clearNewFilePreviews();
    if (packPhotosInput) packPhotosInput.value = "";

    const { uniq, mainOk } = readImagesFromPack(pack);
    existingImages = uniq;
    mainImage = mainOk;
    renderPhotos();

    try {
      const ctx = {
        packId: pack.id,
        packName: pack.nombre || pack.id,
        sourceProperties: pack.sourceProperties || [],
      };
      if (typeof packCalendar?.ensureCalendarForPack === "function") {
        await packCalendar.ensureCalendarForPack(ctx);
      }
    } catch (_) {}

    baseQuickSnapshot = quickSnapshot();
    basePhotoSnapshot = photoSnapshot();
  }

  async function selectPack(pack) {
    selectedPack = pack;
    setSelectedRow(pack.id);
    setPackSticky(pack);
    if (packFormTitle) packFormTitle.textContent = "Pack seleccionado";
    await fillFormWithPack(pack);
    setUIMode("summary");
    renderPackSummary();
  }

  function showPackInlineEditor(pack, clickedTr) {
    packsBody?.querySelectorAll('.edit-inline-row').forEach((r) => r.remove());

    const row = document.createElement('tr');
    row.className = 'edit-inline-row';

    const cell = document.createElement('td');
    cell.colSpan = 8;
    cell.style.cssText = 'padding:0;border:none;background:transparent';

    const currentPct = Number(pack.packPct || 85);
    const div = document.createElement('div');
    div.className = 'edit-inline';
    div.innerHTML = `
      <h3>${escapeHtml(pack.nombre || pack.id || 'Pack')}</h3>
      <div class="row">
        <label>Nombre<input type="text" class="ei-nombre" value="${escapeHtml(String(pack.nombre ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
        <label>Ciudad<input type="text" class="ei-ciudad" value="${escapeHtml(String(pack.ciudad ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
      </div>
      <div class="row" style="margin-top:10px">
        <label>Capacidad<input type="number" class="ei-capacidad" min="1" value="${escapeHtml(String(pack.capacidad ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
        <label>% Pack<input type="number" class="ei-pct" min="1" max="100" step="1" value="${escapeHtml(String(currentPct))}" style="font-size:16px;margin-top:4px;width:100%"></label>
      </div>
      <label class="checkbox-label" style="margin-top:10px">
        <input type="checkbox" class="ei-activa" ${pack.activa ? 'checked' : ''}> Activo
      </label>
      <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn-primary btn-sm ei-save">Guardar</button>
        <button type="button" class="btn-secondary btn-sm ei-full">Editar todo</button>
        <button type="button" class="btn-secondary btn-sm ei-close">✕ Cerrar</button>
      </div>
      <p class="ei-msg" style="margin-top:8px;font-size:13px;font-weight:600"></p>
    `;

    const msg = div.querySelector('.ei-msg');

    div.querySelector('.ei-save')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Guardando…';
      msg.textContent = '';
      try {
        const payload = {
          nombre: (div.querySelector('.ei-nombre')?.value || '').trim(),
          ciudad: (div.querySelector('.ei-ciudad')?.value || '').trim(),
          activa: !!div.querySelector('.ei-activa')?.checked,
          updatedAt: serverTimestamp(),
        };
        const capVal = div.querySelector('.ei-capacidad')?.value;
        if (capVal !== '' && capVal != null) payload.capacidad = Number(capVal);
        const pctVal = div.querySelector('.ei-pct')?.value;
        if (pctVal !== '' && pctVal != null) payload.packPct = Math.min(100, Math.max(1, Number(pctVal)));
        await db.collection('packs').doc(pack.id).set(payload, { merge: true });
        msg.style.color = '#027a48';
        msg.textContent = '✅ Guardado';
        await loadPacks();
        setTimeout(() => row.remove(), 900);
      } catch (err) {
        msg.style.color = '#d92d20';
        msg.textContent = `❌ ${err?.message || 'Error guardando'}`;
        btn.disabled = false;
        btn.textContent = orig;
      }
    });

    div.querySelector('.ei-full')?.addEventListener('click', async () => {
      row.remove();
      await selectPack(pack);
      if (packSidePanel) packSidePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setUIMode('full');
    });

    div.querySelector('.ei-close')?.addEventListener('click', () => row.remove());

    cell.appendChild(div);
    row.appendChild(cell);
    clickedTr.insertAdjacentElement('afterend', row);
    setTimeout(() => div.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function renderPacksTable() {
    if (!packsBody) return;

    if (!packsCache.length) {
      packsBody.innerHTML = `<tr><td colspan="8">No hay packs todavía.</td></tr>`;
      return;
    }

    packsBody.innerHTML = packsCache.map((p) => {
      const _props = getPropertiesCache?.() || [];
      const _sp = p.sourceProperties || [];
      const _pct = (p.packPct ?? 85) / 100;
      const _p1 = Number(_props.find(x => x.id === _sp[0])?.precioBase || 0);
      const _p2 = _sp[1] ? Number(_props.find(x => x.id === _sp[1])?.precioBase || 0) : 0;
      const precio = _sp.length ? `${Math.round((_p1 + _p2) * _pct)}€` : "—";
      const isSel = selectedPack?.id && p.id === selectedPack.id;
      return `
        <tr data-row-id="${escapeHtml(p.id)}" class="${isSel ? "is-selected" : ""}">
          <td>${escapeHtml(p.orden ?? "")}</td>
          <td>${escapeHtml(p.nombre ?? "")}</td>
          <td>${escapeHtml(p.groupKey ?? "")}</td>
          <td>${escapeHtml((p.sourceProperties || []).join(" + ") || "—")}</td>
          <td>${escapeHtml(p.capacidad ?? "")}</td>
          <td>${escapeHtml(precio)}</td>
          <td>${p.activa ? "Sí" : "No"}</td>
          <td><button class="btn-secondary" data-edit-pack-id="${escapeHtml(p.id)}">Editar</button></td>
        </tr>
      `;
    }).join("");

    packsBody.querySelectorAll("tr[data-row-id]").forEach((tr) => {
      tr.addEventListener("click", async (ev) => {
        if (ev.target.closest("button, a, input, select, textarea, label")) return;
        const id = tr.getAttribute("data-row-id");
        const pack = packsCache.find((x) => x.id === id);
        if (!pack) return;
        if (window.innerWidth <= 768) {
          showPackInlineEditor(pack, tr);
        } else {
          await selectPack(pack);
        }
      }, { signal: events.signal });
    });

    packsBody.querySelectorAll("[data-edit-pack-id]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute("data-edit-pack-id");
        const pack = packsCache.find((x) => x.id === id);
        if (!pack) return;
        if (window.innerWidth <= 768) {
          const tr = btn.closest('tr');
          if (tr) showPackInlineEditor(pack, tr);
        } else {
          await selectPack(pack);
        }
      }, { signal: events.signal });
    });
  }

  async function loadPacks() {
    try {
      packsCache = (await fetchPacks()) || [];
      renderPacksTable();
      packCalendar?.resetCalendarUI?.();
      return packsCache;
    } catch (err) {
      console.error("Error cargando packs:", err);
      if (packsBody) packsBody.innerHTML = `<tr><td colspan="8">Error cargando packs.</td></tr>`;
      showError("Error cargando packs.");
      return [];
    }
  }

  function resetForm() {
    selectedPack = null;
    setPackSticky(null);
    setSelectedRow("__none__");

    if (packFormTitle) packFormTitle.textContent = "Nuevo pack";
    packForm?.reset();
    if (packIdInput) packIdInput.value = "";

    existingImages = [];
    urlsToDelete = [];
    mainImage = "";
    clearNewFilePreviews();
    if (packPhotosInput) packPhotosInput.value = "";
    if (packPhotoPreview) packPhotoPreview.innerHTML = "";

    baseQuickSnapshot = quickSnapshot();
    basePhotoSnapshot = photoSnapshot();

    if (packSummaryCard) packSummaryCard.style.display = "none";
    setUIMode("new");
    if (packFormMessage) packFormMessage.textContent = "";
  }

  async function onSubmit(e) {
    e.preventDefault();

    const hasSel = !!selectedPack?.id;
    if (hasSel && uiMode !== "full") {
      showError(`Para guardar cambios rápidos usa el botón "Guardar" del resumen.`);
      return;
    }

    const submitBtn = packForm?.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Guardando…");

    try {
      const id = (packIdInput?.value || "").trim();

      const sourcePropsParsed = (packSourcePropertiesInput?.value || "").trim()
        ? packSourcePropertiesInput.value.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

      const dataToSave = {
        nombre: (packNombreInput?.value || "").trim(),
        ciudad: (packCiudadInput?.value || "").trim(),
        direccion: (packDireccionInput?.value || "").trim(),
        groupKey: (packGroupKeyInput?.value || "").trim(),
        descripcion: (packDescripcionInput?.value || "").trim(),
        descripcionLarga: (packDescripcionLargaInput?.value || "").trim(),
        capacidad: packCapacidadInput?.value ? Number(packCapacidadInput.value) : null,
        dormitorios: packDormitoriosInput?.value ? Number(packDormitoriosInput.value) : null,
        banos: packBanosInput?.value ? Number(packBanosInput.value) : null,
        tagline: (packTaglineInput?.value || "").trim(),
        highlights: packHighlightsInput?.value?.trim()
          ? packHighlightsInput.value.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
        normas: (packNormasInput?.value || "").trim(),
        packPct: packPctInput?.value ? Math.min(100, Math.max(1, Number(packPctInput.value))) : 85,
        minNights: packMinNightsInput?.value ? Math.max(1, Number(packMinNightsInput.value)) : 1,
        activa: !!packActivaInput?.checked,
        servicios: (packServiciosInput?.value || "").trim()
          ? packServiciosInput.value.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        sourceProperties: sourcePropsParsed,
        updatedAt: serverTimestamp(),
      };

      let orden = null;
      if (id) {
        orden = packsCache.find((p) => p.id === id)?.orden ?? null;
      } else {
        const ordenes = packsCache.map((p) => (typeof p.orden === "number" ? p.orden : 0));
        orden = (ordenes.length ? Math.max(...ordenes) : 0) + 1;
      }
      dataToSave.orden = orden;

      const savedId = await savePack(id || null, dataToSave);

      const uploadedUrls = await uploadNewFiles(savedId);
      await saveImagesToPackDoc(savedId, uploadedUrls);
      await deleteMarkedUrlsFromStorage();

      clearNewFilePreviews();
      if (packPhotosInput) packPhotosInput.value = "";

      await loadPacks();

      selectedPack = packsCache.find((p) => p.id === savedId) || selectedPack;
      if (selectedPack) {
        setPackSticky(selectedPack);
        setSelectedRow(selectedPack.id);
        await fillFormWithPack(selectedPack);
      }

      showSuccess("Pack guardado.");
      if (packFormTitle) packFormTitle.textContent = "Pack seleccionado";
      setUIMode("summary");
      renderPackSummary();
    } catch (err) {
      console.error(err);
      showError(`Error guardando: ${err?.message || err}`);
    } finally {
      setButtonLoading(packForm?.querySelector('button[type="submit"]'), false);
    }
  }

  async function onDelete() {
    if (!selectedPack?.id) return;
    const nombre = selectedPack.nombre || selectedPack.id;
    if (!confirm(`¿Eliminar el pack "${nombre}"? Esta acción no se puede deshacer.`)) return;

    setButtonLoading(deletePackBtn, true, "Eliminando…");
    try {
      await db.collection("packs").doc(selectedPack.id).delete();
      showSuccess("Pack eliminado.");
      resetForm();
      await loadPacks();
    } catch (err) {
      console.error(err);
      showError(`Error eliminando: ${err?.message || err}`);
    } finally {
      setButtonLoading(deletePackBtn, false);
    }
  }

  function wireOnce() {
    if (wired) return;
    wired = true;

    packPctInput?.addEventListener("input", updateCalcPrecio, { signal: events.signal });
    packPhotosInput?.addEventListener("change", onFilesPicked, { signal: events.signal });
    packForm?.addEventListener("submit", onSubmit, { signal: events.signal });
    newPackBtn?.addEventListener("click", resetForm, { signal: events.signal });
    resetPackFormBtn?.addEventListener("click", resetForm, { signal: events.signal });
    deletePackBtn?.addEventListener("click", onDelete, { signal: events.signal });

    packEnableEditBtn?.addEventListener("click", () => {
      if (!selectedPack?.id) return;
      if (packFormTitle) packFormTitle.textContent = "Editar pack";
      setUIMode("full");
    }, { signal: events.signal });

    packCancelEditBtn?.addEventListener("click", async () => {
      if (!selectedPack?.id) return;
      await fillFormWithPack(selectedPack);
      if (packFormTitle) packFormTitle.textContent = "Pack seleccionado";
      setUIMode("summary");
      renderPackSummary();
    }, { signal: events.signal });
  }

  async function start() {
    wireOnce();
    if (packSidePanel) packSidePanel.style.overflow = "visible";
    setUIMode("new");
    if (!packsCache.length) {
      await loadPacks();
    } else {
      renderPacksTable();
    }
  }

  function stop() {
    packCalendar?.resetCalendarUI?.();
    packCalendar?.stop?.();
    resetForm();
  }

  function destroy() {
    events.abort();
    clearNewFilePreviews();
    if (packPhotoPreview) packPhotoPreview.innerHTML = "";
    if (packsBody) packsBody.innerHTML = "";
  }

  return {
    loadPacks,
    getPacksCache: () => packsCache,
    start,
    stop,
    destroy,
  };
}
