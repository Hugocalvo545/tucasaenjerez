import { setButtonLoading } from "../../shared/utils.js";

export function createPropertiesUI({
  auth,
  db,
  storage,
  serverTimestamp,
  fetchProperties,
  escapeHtml,
  calendarAdmin,
  priceCalendar,
  resolveReservasId,
  onPropertiesLoaded,
}) {
  const events = new AbortController();

  const propertiesBody = document.getElementById("propertiesBody");
  const newPropertyBtn = document.getElementById("newPropertyBtn");

  const deletePropertyBtn = document.getElementById("deletePropertyBtn");
  const propertyForm = document.getElementById("propertyForm");
  const formTitle = document.getElementById("formTitle");
  const resetFormBtn = document.getElementById("resetFormBtn");
  const formMessage = document.getElementById("formMessage");

  const propertyPhotosInput = document.getElementById("propertyPhotos");
  const photoPreview = document.getElementById("photoPreview");

  const propertyIdInput = document.getElementById("propertyId");
  const nombreInput = document.getElementById("nombre");
  const direccionInput = document.getElementById("direccion");
  const ciudadInput = document.getElementById("ciudad");
  const capacidadInput = document.getElementById("capacidad");
  const dormitoriosInput = document.getElementById("dormitorios");
  const banosInput = document.getElementById("banos");
  const descripcionInput = document.getElementById("descripcion");
  const descripcionLargaInput = document.getElementById("descripcionLarga");
  const precioBaseInput = document.getElementById("precioBase");
  const activaInput = document.getElementById("activa");
  const serviciosInput = document.getElementById("servicios");
  const latInput = document.getElementById("lat");
  const lngInput = document.getElementById("lng");
  const taglineInput = document.getElementById("tagline");
  const highlightsInput = document.getElementById("highlights");
  const checkInTimeInput = document.getElementById("checkInTime");
  const checkOutTimeInput = document.getElementById("checkOutTime");
  const normasInput = document.getElementById("normas");
  const minNightsInput = document.getElementById("minNights");

  const propStickyHead = document.getElementById("propStickyHead");
  const propStickyTitle = document.getElementById("propStickyTitle");
  const propStickySub = document.getElementById("propStickySub");
  const propEnableEditBtn = document.getElementById("propEnableEditBtn"); // "Editar todo"
  const propCancelEditBtn = document.getElementById("propCancelEditBtn");

  const propertySidePanel = document.getElementById("propertySidePanel");
  const propSummaryCard = document.getElementById("propSummaryCard");
  const propFullFieldsBox = document.getElementById("propFullFieldsBox");
  const propPhotoEditorBox = document.getElementById("propPhotoEditorBox");
  const propFullActionsBox = document.getElementById("propFullActionsBox");

  // Legacy (los ocultamos siempre)
  const propViewBox = document.getElementById("propViewBox");
  const propEditFields = document.getElementById("propEditFields");
  const propEditActions = document.getElementById("propEditActions");

  let propertiesCache = [];
  let toastTimer = null;

  let selectedProp = null;

  // Modos UI: "new" | "summary" | "photos" | "full"
  let uiMode = "new";

  let baseQuickSnapshot = "";
  let basePhotoSnapshot = "";

  let existingImages = [];
  let newFiles = [];
  let urlsToDelete = [];
  let mainImage = "";

  function setLegacyHiddenAlways() {
    if (propViewBox) propViewBox.style.display = "none";
    if (propEditFields) propEditFields.style.display = "none";
    if (propEditActions) propEditActions.style.display = "none";
  }

  function showSuccess(msg) {
    if (!formMessage) return;
    formMessage.className = "info-msg";
    formMessage.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (formMessage) formMessage.textContent = "";
    }, 2500);
  }

  function showError(msg) {
    if (!formMessage) return;
    formMessage.className = "error-msg";
    formMessage.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (formMessage) formMessage.textContent = "";
    }, 3500);
  }

  function setSelectedRow(id) {
    propertiesBody?.querySelectorAll("tr.is-selected").forEach((tr) => tr.classList.remove("is-selected"));
    const row = propertiesBody?.querySelector(`tr[data-row-id="${CSS.escape(id)}"]`);
    if (row) row.classList.add("is-selected");
  }

  function setSticky(prop) {
    if (!propStickyHead || !propStickyTitle || !propStickySub) return;

    if (!prop?.id) {
      propStickyHead.style.display = "none";
      return;
    }

    propStickyHead.style.display = "flex";
    propStickyTitle.textContent = prop.nombre || prop.id || "Alojamiento";
    propStickySub.textContent = `${prop.ciudad || ""} · ${prop.id || ""}`.trim();
  }

  function setUIMode(mode) {
    uiMode = mode;

    if (propSummaryCard) propSummaryCard.style.display = (mode === "summary" || mode === "photos") ? "block" : "none";
    if (propFullFieldsBox) propFullFieldsBox.style.display = (mode === "full" || mode === "new") ? "block" : "none";
    if (propPhotoEditorBox) propPhotoEditorBox.style.display = (mode === "photos" || mode === "full" || mode === "new") ? "block" : "none";
    if (propFullActionsBox) propFullActionsBox.style.display = (mode === "full" || mode === "new") ? "block" : "none";

    if (propCancelEditBtn) {
      propCancelEditBtn.style.display = (mode === "full") ? "inline-flex" : "none";
    }

    if (deletePropertyBtn) {
      deletePropertyBtn.style.display = (selectedProp?.id && (mode === "full")) ? "inline-flex" : "none";
    }

    ensurePhotoQuickSaveWrap();
    updateQuickSaveVisibility();
  }

  function isQuickDirty() {
    return quickSnapshot() !== baseQuickSnapshot;
  }

  function isPhotoDirty() {
    return photoSnapshot() !== basePhotoSnapshot;
  }

  function updateQuickSaveVisibility() {
    const headerBtn = document.getElementById("quickSaveBtn");
    const photoSaveWrap = ensurePhotoQuickSaveWrap();
    const photoBtn = document.getElementById("photoQuickSaveBtn");

    const hasSel = !!selectedProp?.id;
    const quickDirty = isQuickDirty();
    const photoDirty = isPhotoDirty();
    const hasChanges = quickDirty || photoDirty;

    // Botón del header: solo en resumen (no en modo fotos)
    if (headerBtn) {
      const showHeader = hasSel && (uiMode === "summary") && hasChanges;
      headerBtn.style.display = showHeader ? "inline-flex" : "none";
    }

    // Botón debajo de fotos: solo en modo fotos
    if (photoSaveWrap && photoBtn) {
      const showPhoto = hasSel && (uiMode === "photos") && hasChanges;
      photoSaveWrap.style.display = showPhoto ? "block" : "none";
      photoBtn.disabled = !showPhoto;
    }
  }
  
  function ensurePhotoQuickSaveWrap() {
    if (!propPhotoEditorBox || !photoPreview) return null;

    let wrap = document.getElementById("photoQuickSaveWrap");
    if (wrap) return wrap;

    wrap = document.createElement("div");
    wrap.id = "photoQuickSaveWrap";
    wrap.className = "inline-actions";
    wrap.style.marginTop = "12px";
    wrap.style.display = "none";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "photoQuickSaveBtn";
    btn.className = "btn-primary";
    btn.textContent = "Guardar cambios";

    btn.addEventListener("click", async () => {
      await saveQuickChanges(btn);
    }, { signal: events.signal });

    wrap.appendChild(btn);

    // Insertar justo debajo del grid de fotos
    if (photoPreview.parentNode === propPhotoEditorBox) {
      photoPreview.insertAdjacentElement("afterend", wrap);
    } else {
      propPhotoEditorBox.appendChild(wrap);
    }

    return wrap;
  }

  function quickSnapshot() {
    return [
      nombreInput?.value ?? "",
      direccionInput?.value ?? "",
      ciudadInput?.value ?? "",
      capacidadInput?.value ?? "",
      precioBaseInput?.value ?? "",
      minNightsInput?.value ?? "1",
      activaInput?.checked ? "1" : "0",
    ].join("|");
  }

  function photoSnapshot() {
    const urls = getPhotoItems().map((x) => x.url).filter(Boolean);
    return [
      mainImage || "",
      urls.join(","),
    ].join("|");
  }

  function readImagesFromProp(p) {
    const imgs = Array.isArray(p?.images) ? p.images : [];
    const uniq = Array.from(new Set(imgs.filter(Boolean)));
    const main = (p?.imageMain || "").trim();
    const mainOk = main && uniq.includes(main) ? main : (uniq[0] || "");
    return { uniq, mainOk };
  }

  function getPhotoItems() {
    const items = [];

    existingImages.forEach((url) => {
      items.push({ url, kind: "existing" });
    });

    newFiles.forEach((file) => {
      const url = URL.createObjectURL(file);
      items.push({ url, kind: "new", file });
    });

    return items;
  }

  function clearNewFilePreviews() {
    if (!newFiles.length) return;
    try {
      getPhotoItems().forEach((it) => {
        if (it.kind === "new" && it.url?.startsWith("blob:")) URL.revokeObjectURL(it.url);
      });
    } catch (_) {}
    newFiles = [];
  }

  function setMainByIndex(idx) {
    const items = getPhotoItems();
    const it = items[idx];
    if (!it?.url) return;
    mainImage = it.url;
    renderPhotos();
  }

  function moveByIndex(idx, delta) {
    const items = getPhotoItems();
    const it = items[idx];
    if (!it) return;

    const isExisting = it.kind === "existing";
    const isNew = it.kind === "new";

    // Reordenamos dentro de cada bucket (existing/new) según el item
    if (isExisting) {
      const from = idx;
      const to = Math.max(0, Math.min(existingImages.length - 1, idx + delta));
      const copy = [...existingImages];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      existingImages = copy;
    } else if (isNew) {
      // idx dentro de items, traduce a index dentro de newFiles
      const newIdx = idx - existingImages.length;
      const from = newIdx;
      const to = Math.max(0, Math.min(newFiles.length - 1, newIdx + delta));
      const copy = [...newFiles];
      const [m] = copy.splice(from, 1);
      copy.splice(to, 0, m);
      newFiles = copy;
    }

    renderPhotos();
  }

  function removeByIndex(idx) {
    const items = getPhotoItems();
    const it = items[idx];
    if (!it) return;

    if (it.kind === "existing") {
      existingImages = existingImages.filter((x) => x !== it.url);
      urlsToDelete.push(it.url);
    } else if (it.kind === "new") {
      // quita el file
      const newIdx = idx - existingImages.length;
      const file = newFiles[newIdx];
      newFiles = newFiles.filter((x) => x !== file);
      try { if (it.url?.startsWith("blob:")) URL.revokeObjectURL(it.url); } catch(_) {}
    }

    if (mainImage === it.url) {
      const left = getPhotoItems()[0]?.url || "";
      mainImage = left;
    }

    renderPhotos();
  }

  function renderPhotos() {
    if (!photoPreview) return;

    const items = getPhotoItems();
    photoPreview.innerHTML = "";

    items.forEach((it, idx) => {
      const imgDiv = document.createElement("div");
      imgDiv.className = "photo-item" + (it.url === mainImage ? " main-photo" : "");
      imgDiv.draggable = true;

      imgDiv.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("text/plain", String(idx));
      }, { signal: events.signal });

      imgDiv.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        imgDiv.classList.add("drag-over");
      }, { signal: events.signal });

      imgDiv.addEventListener("dragleave", () => {
        imgDiv.classList.remove("drag-over");
      }, { signal: events.signal });

      imgDiv.addEventListener("drop", (ev) => {
        ev.preventDefault();
        imgDiv.classList.remove("drag-over");

        const from = Number(ev.dataTransfer?.getData("text/plain") || -1);
        const to = idx;
        if (Number.isNaN(from) || from < 0 || from === to) return;

        // Drag&drop: solo soporta reorder dentro de existing o dentro de newFiles
        const itemsNow = getPhotoItems();
        const fromItem = itemsNow[from];
        const toItem = itemsNow[to];
        if (!fromItem || !toItem) return;

        if (fromItem.kind !== toItem.kind) return;

        if (fromItem.kind === "existing") {
          const copy = [...existingImages];
          const [m] = copy.splice(from, 1);
          copy.splice(to, 0, m);
          existingImages = copy;
        } else {
          const fromIdx = from - existingImages.length;
          const toIdx = to - existingImages.length;
          const copy = [...newFiles];
          const [m] = copy.splice(fromIdx, 1);
          copy.splice(toIdx, 0, m);
          newFiles = copy;
        }

        renderPhotos();
      }, { signal: events.signal });

      const img = document.createElement("img");
      img.src = it.url;
      img.alt = "foto";

      const topBar = document.createElement("div");
      topBar.className = "photo-top";

      const star = document.createElement("button");
      star.type = "button";
      star.className = "star-icon" + (it.url === mainImage ? " is-main" : "");
      star.innerHTML = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path>
        </svg>
      `;
      star.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setMainByIndex(idx);
      }, { signal: events.signal });

      const del = document.createElement("button");
      del.type = "button";
      del.className = "photo-delete";
      del.textContent = "✕";
      del.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        removeByIndex(idx);
      }, { signal: events.signal });

      topBar.appendChild(star);
      topBar.appendChild(del);

      const actions = document.createElement("div");
      actions.className = "photo-actions";

      const left = document.createElement("button");
      left.type = "button";
      left.textContent = "←";
      left.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        moveByIndex(idx, -1);
      }, { signal: events.signal });

      const right = document.createElement("button");
      right.type = "button";
      right.textContent = "→";
      right.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        moveByIndex(idx, 1);
      }, { signal: events.signal });

      actions.appendChild(left);
      actions.appendChild(right);

      imgDiv.appendChild(img);
      imgDiv.appendChild(topBar);
      imgDiv.appendChild(actions);

      photoPreview.appendChild(imgDiv);
    });

    updateQuickSaveVisibility();
    if (selectedProp?.id) renderQuickSummary(); // refresca contador/thumbs del cuadrado de fotos con blobs
  }

  function onFilesPicked(e) {
    const allow =
      (uiMode === "new") ||
      (uiMode === "full") ||
      (uiMode === "photos");

    if (!allow) return;

    const input = e?.currentTarget || propertyPhotosInput;
    const picked = Array.from(input?.files || []);
    if (!picked.length) return;

    clearNewFilePreviews();
    newFiles = picked;

    if (!mainImage) mainImage = getPhotoItems()[0]?.url || "";
    renderPhotos();
    input.value = "";
  }

  propertyPhotosInput?.addEventListener("change", onFilesPicked, { signal: events.signal });

  async function uploadNewFiles(propertyId) {
    if (!storage || !newFiles.length) return [];
    const out = [];
    for (const file of newFiles) {
      const safeName = String(file.name || "foto").replaceAll(" ", "_").replaceAll("/", "_");
      const path = `apartamentos/${propertyId}/${Date.now()}-${safeName}`;
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

  async function saveImagesToDoc(propertyId, uploadedUrls) {
    const combined = [...existingImages, ...uploadedUrls].filter(Boolean);

    let finalMain = (mainImage || "").trim();

    if (finalMain && finalMain.startsWith("blob:")) {
      const items = getPhotoItems();
      const idx = items.findIndex((x) => x.url === finalMain);
      if (idx >= 0) {
        if (idx < existingImages.length) {
          finalMain = existingImages[idx] || "";
        } else {
          const newIdx = idx - existingImages.length;
          finalMain = uploadedUrls[newIdx] || "";
        }
      } else {
        finalMain = combined[0] || "";
      }
    }

    if (finalMain && !combined.includes(finalMain)) finalMain = combined[0] || "";
    if (!finalMain) finalMain = combined[0] || "";

    await db.collection("apartamentos").doc(propertyId).set(
      { images: combined, imageMain: finalMain, fotos: [], updatedAt: serverTimestamp() },
      { merge: true }
    );
  }

  async function saveQuickChanges(triggerBtn) {
    if (!selectedProp?.id) return;

    setButtonLoading(triggerBtn, true, "Guardando");

    try {
      const data = {
        nombre: (nombreInput?.value ?? "").trim(),
        direccion: (direccionInput?.value ?? "").trim(),
        ciudad: (ciudadInput?.value ?? "").trim(),
        capacidad: capacidadInput?.value ? Number(capacidadInput.value) : null,
        precioBase: precioBaseInput?.value ? Number(precioBaseInput.value) : null,
        activa: !!activaInput?.checked,
        updatedAt: serverTimestamp(),
      };

      await db.collection("apartamentos").doc(selectedProp.id).set(data, { merge: true });

      if (isPhotoDirty()) {
        const uploadedUrls = await uploadNewFiles(selectedProp.id);
        await saveImagesToDoc(selectedProp.id, uploadedUrls);
        await deleteMarkedUrlsFromStorage();

        clearNewFilePreviews();
        if (propertyPhotosInput) propertyPhotosInput.value = "";
      }

      await loadProperties();
      selectedProp = propertiesCache.find((x) => x.id === selectedProp.id) || selectedProp;

      await fillFormWithProperty(selectedProp);

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

  function escapeAttr(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function renderQuickSummary() {
    if (!propSummaryCard) return;
    if (!selectedProp?.id) return;

    const p = selectedProp;

    // Fotos: usa el estado actual (incluye blobs sin guardar)
    const items = getPhotoItems();
    const urls = items.map((x) => x.url).filter(Boolean);
    const mainOk = mainImage && urls.includes(mainImage) ? mainImage : (urls[0] || "");
    const ordered = mainOk ? [mainOk, ...urls.filter((u) => u !== mainOk)] : urls;

    const thumbs = ordered.slice(0, 6);
    const extra = Math.max(0, ordered.length - 6);

    propSummaryCard.innerHTML = `
      <div class="prop-summary-head">
        <div class="prop-summary-title">
          <h3>Resumen del apartamento</h3>
          <div class="muted">${escapeHtml(p?.id || "")} · ${escapeHtml(p?.ciudad || "")}</div>
        </div>

        <div class="prop-summary-actions">
          <button type="button" class="btn-primary btn-sm" id="quickSaveBtn" style="display:none">Guardar</button>
          <button type="button" class="btn-secondary btn-sm quick-edit-all" id="quickEditAllBtn">Editar todo</button>
        </div>
      </div>

      <div class="prop-summary-grid">
        <div class="prop-sq" data-q="nombre">
          <div class="k">Nombre</div>
          <input type="text" id="qNombre" value="${escapeAttr(nombreInput?.value ?? p?.nombre ?? "")}">
        </div>

        <div class="prop-sq" data-q="ciudad">
          <div class="k">Ciudad</div>
          <input type="text" id="qCiudad" value="${escapeAttr(ciudadInput?.value ?? p?.ciudad ?? "")}">
        </div>

        <div class="prop-sq" data-q="direccion">
          <div class="k">Dirección</div>
          <input type="text" id="qDireccion" value="${escapeAttr(direccionInput?.value ?? p?.direccion ?? "")}">
        </div>

        <div class="prop-sq" data-q="capacidad">
          <div class="k">Capacidad</div>
          <input type="number" id="qCapacidad" min="1" value="${escapeAttr(capacidadInput?.value ?? p?.capacidad ?? "")}">
        </div>

        <div class="prop-sq" data-q="precioBase">
          <div class="k">Precio base</div>
          <input type="number" id="qPrecioBase" min="0" step="1" value="${escapeAttr(precioBaseInput?.value ?? p?.precioBase ?? "")}">
        </div>

        <div class="prop-sq" data-q="activa">
          <div class="k">Activo</div>
          <label class="checkbox-label">
            <input type="checkbox" id="qActiva" ${activaInput?.checked ? "checked" : (p?.activa ? "checked" : "")}>
            Activo
          </label>
        </div>
      </div>
      <div class="prop-summary-grid2">
        <div class="prop-sq prop-sq-wide is-click" data-q="fotos" id="qFotosBox" title="Editar fotos">
          <div class="k">Fotos</div>
          <div class="val">${escapeHtml(String(ordered.length))} fotos</div>
          <div class="prop-thumbs">
            ${thumbs.map((url, idx) => `
              <div class="prop-thumb ${url === mainOk ? "is-main" : ""}">
                <img src="${escapeAttr(url)}" alt="Foto" loading="lazy" decoding="async">
                ${(idx === 5 && extra > 0) ? `<span class="prop-thumb-more">+${extra}</span>` : ``}
              </div>
            `).join("")}
          </div>
        </div>

        <div class="prop-sq prop-sq-wide">
          <div class="k">Más datos</div>
          <div class="val">Usa <button type="button" class="btn-secondary btn-sm quick-edit-all" id="quickEditAllBtnMore">Editar todo</button></div>
        </div>
      </div>
    `;

    const quickSaveBtn = document.getElementById("quickSaveBtn");
    const quickEditAllBtns = propSummaryCard.querySelectorAll(".quick-edit-all");

    const qNombre = document.getElementById("qNombre");
    const qCiudad = document.getElementById("qCiudad");
    const qDireccion = document.getElementById("qDireccion");
    const qCapacidad = document.getElementById("qCapacidad");
    const qPrecioBase = document.getElementById("qPrecioBase");
    const qActiva = document.getElementById("qActiva");
    const qFotosBox = document.getElementById("qFotosBox");

    const syncQuickToForm = () => {
      if (nombreInput) nombreInput.value = qNombre?.value ?? "";
      if (ciudadInput) ciudadInput.value = qCiudad?.value ?? "";
      if (direccionInput) direccionInput.value = qDireccion?.value ?? "";
      if (capacidadInput) capacidadInput.value = qCapacidad?.value ?? "";
      if (precioBaseInput) precioBaseInput.value = qPrecioBase?.value ?? "";
      if (activaInput) activaInput.checked = !!qActiva?.checked;

      setSticky({ ...selectedProp, nombre: nombreInput?.value, ciudad: ciudadInput?.value });
    };

    const onQuickChange = () => {
      syncQuickToForm();
      updateQuickSaveVisibility();
    };

    [qNombre, qCiudad, qDireccion, qCapacidad, qPrecioBase].forEach((el) => {
      el?.addEventListener("input", onQuickChange, { signal: events.signal });
    });
    qActiva?.addEventListener("change", onQuickChange, { signal: events.signal });

    qFotosBox?.addEventListener("click", () => {
      if (!selectedProp?.id) return;
      if (formTitle) formTitle.textContent = "Editar fotos";
      setUIMode("photos");
      updateQuickSaveVisibility();
      propPhotoEditorBox?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }, { signal: events.signal });

    quickEditAllBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!selectedProp?.id) return;
        if (formTitle) formTitle.textContent = "Editar alojamiento";
        setUIMode("full");
      }, { signal: events.signal });
    });

    quickSaveBtn?.addEventListener("click", async () => {
      await saveQuickChanges(quickSaveBtn);
    }, { signal: events.signal });
  }

  async function fillFormWithProperty(prop) {
    if (!prop?.id) return;

    if (propertyIdInput) propertyIdInput.value = prop.id || "";

    if (nombreInput) nombreInput.value = prop.nombre ?? "";
    if (direccionInput) direccionInput.value = prop.direccion ?? "";
    if (ciudadInput) ciudadInput.value = prop.ciudad ?? "";
    if (capacidadInput) capacidadInput.value = prop.capacidad ?? "";
    if (dormitoriosInput) dormitoriosInput.value = prop.dormitorios ?? "";
    if (banosInput) banosInput.value = prop.banos ?? "";
    if (descripcionInput) descripcionInput.value = prop.descripcion ?? "";
    if (descripcionLargaInput) descripcionLargaInput.value = prop.descripcionLarga ?? "";
    if (precioBaseInput) precioBaseInput.value = prop.precioBase ?? "";
    if (activaInput) activaInput.checked = !!prop.activa;

    if (serviciosInput) {
      serviciosInput.value = Array.isArray(prop.servicios) ? prop.servicios.join(", ") : (prop.servicios ?? "");
    }

    if (latInput) latInput.value = prop.lat ?? "";
    if (lngInput) lngInput.value = prop.lng ?? "";
    if (taglineInput) taglineInput.value = prop.tagline ?? "";

    if (highlightsInput) {
      highlightsInput.value = Array.isArray(prop.highlights) ? prop.highlights.join("\n") : (prop.highlights ?? "");
    }

    if (checkInTimeInput) checkInTimeInput.value = prop.checkInTime ?? "";
    if (checkOutTimeInput) checkOutTimeInput.value = prop.checkOutTime ?? "";
    if (normasInput) normasInput.value = prop.normas ?? "";
    if (minNightsInput) minNightsInput.value = prop.minNights ?? 1;

    urlsToDelete = [];
    clearNewFilePreviews();
    if (propertyPhotosInput) propertyPhotosInput.value = "";

    const { uniq, mainOk } = readImagesFromProp(prop);
    existingImages = uniq;
    mainImage = mainOk;

    renderPhotos();

    const apartmentId = prop.id;
    const reservasId = resolveReservasId?.(apartmentId) || apartmentId;

    await calendarAdmin?.ensureCalendarForProperty?.({
      apartmentId,
      reservasPropertyId: reservasId,
      basePrice: Number(prop.precioBase || 0),
      propertyName: prop.nombre || apartmentId,
    });

    await priceCalendar?.ensureCalendarForProperty?.({
      apartmentId,
      reservasPropertyId: reservasId,
      basePrice: Number(prop.precioBase || 0),
      propertyName: prop.nombre || apartmentId,
    });

    baseQuickSnapshot = quickSnapshot();
    basePhotoSnapshot = photoSnapshot();
  }

  async function selectProperty(prop) {
    selectedProp = prop;

    setSelectedRow(prop.id);
    setSticky(prop);

    if (formTitle) formTitle.textContent = "Alojamiento seleccionado";
    await fillFormWithProperty(prop);

    setUIMode("summary");
    renderQuickSummary();
  }

  async function loadProperties() {
    propertiesCache = await fetchProperties();
    renderPropertiesTable();
    calendarAdmin?.resetCalendarUI?.();
    onPropertiesLoaded?.(propertiesCache);
    return propertiesCache;
  }

  function showInlineEditor(prop, clickedTr) {
    propertiesBody?.querySelectorAll('.edit-inline-row').forEach((r) => r.remove());

    const row = document.createElement('tr');
    row.className = 'edit-inline-row';

    const cell = document.createElement('td');
    cell.colSpan = 7;
    cell.style.cssText = 'padding:0;border:none;background:transparent';

    const div = document.createElement('div');
    div.className = 'edit-inline';
    div.innerHTML = `
      <h3>${escapeHtml(prop.nombre || prop.id || 'Alojamiento')}</h3>
      <div class="row">
        <label>Nombre<input type="text" class="ei-nombre" value="${escapeHtml(String(prop.nombre ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
        <label>Ciudad<input type="text" class="ei-ciudad" value="${escapeHtml(String(prop.ciudad ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
      </div>
      <div class="row" style="margin-top:10px">
        <label>Capacidad<input type="number" class="ei-capacidad" min="1" value="${escapeHtml(String(prop.capacidad ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
        <label>Precio/noche (€)<input type="number" class="ei-precio" min="0" step="1" value="${escapeHtml(String(prop.precioBase ?? ''))}" style="font-size:16px;margin-top:4px;width:100%"></label>
      </div>
      <label class="checkbox-label" style="margin-top:10px">
        <input type="checkbox" class="ei-activa" ${prop.activa ? 'checked' : ''}> Activo
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
        const precioVal = div.querySelector('.ei-precio')?.value;
        if (precioVal !== '' && precioVal != null) payload.precioBase = Number(precioVal);
        await db.collection('apartamentos').doc(prop.id).set(payload, { merge: true });
        msg.style.color = '#027a48';
        msg.textContent = '✅ Guardado';
        await loadProperties();
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
      await selectProperty(prop);
      if (propertySidePanel) propertySidePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setUIMode('full');
    });

    div.querySelector('.ei-close')?.addEventListener('click', () => row.remove());

    cell.appendChild(div);
    row.appendChild(cell);
    clickedTr.insertAdjacentElement('afterend', row);
    setTimeout(() => div.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }

  function renderPropertiesTable() {
    if (!propertiesBody) return;

    if (!propertiesCache.length) {
      propertiesBody.innerHTML = `<tr><td colspan="7">No hay alojamientos todavía.</td></tr>`;
      return;
    }

    propertiesBody.innerHTML = propertiesCache.map((p) => {
      const precio = typeof p.precioBase === "number" ? p.precioBase.toFixed(0) : "-";
      const isSel = selectedProp?.id && p.id === selectedProp.id;
      return `
        <tr data-row-id="${escapeHtml(p.id)}" class="${isSel ? "is-selected" : ""}">
          <td>${escapeHtml(p.orden ?? "")}</td>
          <td>${escapeHtml(p.nombre ?? "")}</td>
          <td>${escapeHtml(p.ciudad ?? "")}</td>
          <td>${escapeHtml(p.capacidad ?? "")}</td>
          <td>${escapeHtml(precio)}</td>
          <td>${p.activa ? "Sí" : "No"}</td>
          <td><button class="btn-secondary" data-edit-id="${escapeHtml(p.id)}">Editar</button></td>
        </tr>
      `;
    }).join("");

    // Click en fila: inline editor en móvil, resumen en desktop
    propertiesBody.querySelectorAll('tr[data-row-id]').forEach((tr) => {
      tr.addEventListener("click", async (ev) => {
        if (ev.target.closest("button, a, input, select, textarea, label")) return;

        const id = tr.getAttribute("data-row-id");
        const prop = propertiesCache.find((x) => x.id === id);
        if (!prop) return;

        if (window.innerWidth <= 768) {
          showInlineEditor(prop, tr);
        } else {
          await selectProperty(prop);
        }
      }, { signal: events.signal });
    });

    // Botón Editar: inline editor en móvil, resumen en desktop
    propertiesBody.querySelectorAll("[data-edit-id]").forEach((btn) => {
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const id = btn.getAttribute("data-edit-id");
        const prop = propertiesCache.find((x) => x.id === id);
        if (!prop) return;

        if (window.innerWidth <= 768) {
          const tr = btn.closest('tr');
          if (tr) showInlineEditor(prop, tr);
        } else {
          await selectProperty(prop);
        }
      }, { signal: events.signal });
    });
  }

  function resetForm() {
    selectedProp = null;
    setSticky(null);
    setSelectedRow("__none__");

    if (formTitle) formTitle.textContent = "Nuevo alojamiento";

    propertyForm?.reset();
    if (propertyIdInput) propertyIdInput.value = "";

    existingImages = [];
    urlsToDelete = [];
    mainImage = "";
    clearNewFilePreviews();
    if (propertyPhotosInput) propertyPhotosInput.value = "";
    if (photoPreview) photoPreview.innerHTML = "";

    baseQuickSnapshot = quickSnapshot();
    basePhotoSnapshot = photoSnapshot();

    if (propSummaryCard) propSummaryCard.style.display = "none";
    setUIMode("new");

    if (formMessage) formMessage.textContent = "";
  }

  async function onSubmit(e) {
    e.preventDefault();

    // Submit solo se usa en "new" o "full"
    const hasSel = !!selectedProp?.id;
    if (hasSel && uiMode !== "full") {
      showError("Para guardar cambios rápidos usa el botón “Guardar” del resumen.");
      return;
    }

    const submitBtn = propertyForm?.querySelector('button[type="submit"]');
    setButtonLoading(submitBtn, true, "Guardando");

    try {
      const id = propertyIdInput?.value?.trim() || "";
      const dataToSave = {
        nombre: nombreInput?.value?.trim() || "",
        direccion: direccionInput?.value?.trim() || "",
        ciudad: ciudadInput?.value?.trim() || "",
        capacidad: capacidadInput?.value ? Number(capacidadInput.value) : null,
        dormitorios: dormitoriosInput?.value ? Number(dormitoriosInput.value) : null,
        banos: banosInput?.value ? Number(banosInput.value) : null,
        descripcion: descripcionInput?.value?.trim() || "",
        descripcionLarga: descripcionLargaInput?.value?.trim() || "",
        precioBase: precioBaseInput?.value ? Number(precioBaseInput.value) : null,
        activa: !!activaInput?.checked,
        servicios: serviciosInput?.value?.trim()
          ? serviciosInput.value.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        lat: latInput?.value ? Number(latInput.value) : null,
        lng: lngInput?.value ? Number(lngInput.value) : null,
        tagline: taglineInput?.value?.trim() || "",
        highlights: highlightsInput?.value?.trim()
          ? highlightsInput.value.split("\n").map((s) => s.trim()).filter(Boolean)
          : [],
        checkInTime: checkInTimeInput?.value?.trim() || "",
        checkOutTime: checkOutTimeInput?.value?.trim() || "",
        normas: normasInput?.value?.trim() || "",
        minNights: minNightsInput?.value ? Math.max(1, Number(minNightsInput.value)) : 1,
        updatedAt: serverTimestamp(),
      };

      // Orden
      let orden = null;
      if (id) {
        const existing = propertiesCache.find((p) => p.id === id);
        orden = existing?.orden ?? null;
      } else {
        const ordenes = propertiesCache.map((p) => (typeof p.orden === "number" ? p.orden : 0));
        orden = (ordenes.length ? Math.max(...ordenes) : 0) + 1;
      }
      dataToSave.orden = orden;

      const docRef = id ? db.collection("apartamentos").doc(id) : db.collection("apartamentos").doc();
      await docRef.set(dataToSave, { merge: true });
      const finalId = id || docRef.id;

      // Fotos (si hay cambios)
      const uploadedUrls = await uploadNewFiles(finalId);
      await saveImagesToDoc(finalId, uploadedUrls);
      await deleteMarkedUrlsFromStorage();

      clearNewFilePreviews();
      if (propertyPhotosInput) propertyPhotosInput.value = "";

      await loadProperties();

      selectedProp = propertiesCache.find((p) => p.id === finalId) || selectedProp;
      if (selectedProp) {
        setSticky(selectedProp);
        setSelectedRow(selectedProp.id);
        await fillFormWithProperty(selectedProp);
      }

      showSuccess("Alojamiento guardado.");
      if (formTitle) formTitle.textContent = "Alojamiento seleccionado";
      setUIMode("summary");
      renderQuickSummary();
    } catch (err) {
      console.error(err);
      showError(`Error guardando: ${err?.message || err}`);
    } finally {
      setButtonLoading(submitBtn, false);
    }
  }

  propertyForm?.addEventListener("submit", onSubmit, { signal: events.signal });

  propEnableEditBtn?.addEventListener("click", () => {
    if (!selectedProp?.id) return;
    if (formTitle) formTitle.textContent = "Editar alojamiento";
    setUIMode("full");
  }, { signal: events.signal });

  propCancelEditBtn?.addEventListener("click", async () => {
    if (!selectedProp?.id) return;
    await fillFormWithProperty(selectedProp);
    if (formTitle) formTitle.textContent = "Alojamiento seleccionado";
    setUIMode("summary");
    renderQuickSummary();
  }, { signal: events.signal });

  newPropertyBtn?.addEventListener("click", resetForm, { signal: events.signal });
  resetFormBtn?.addEventListener("click", resetForm, { signal: events.signal });

  async function start() {
    setLegacyHiddenAlways();
    if (propertySidePanel) propertySidePanel.style.overflow = "visible";
    setUIMode("new");
    await loadProperties();
  }

  function stop() {
    calendarAdmin?.resetCalendarUI?.();
    priceCalendar?.resetCalendarUI?.();
    priceCalendar?.stop?.();
    resetForm();
  }

  function destroy() {
    events.abort();
    clearNewFilePreviews();
    if (photoPreview) photoPreview.innerHTML = "";
  }

  return {
    start,
    stop,
    destroy,
    loadProperties,
    getPropertiesCache: () => propertiesCache,
  };
}