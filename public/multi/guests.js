import { db } from '../shared/firebase.js';
import { state } from '../shared/state.js';

const DOC_TYPES = [
  { value: 'DNI', label: 'DNI' },
  { value: 'NIE', label: 'NIE' },
  { value: 'PASAPORTE', label: 'Pasaporte' },
  { value: 'OTRO', label: 'Otro' },
];

function escHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[m]));
}

// Escape para meter un string en un argumento JS (onclick="fn('...')")
function escJsArg(s = '') {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

function toISODate(value) {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  return '';
}

function docUiMeta(docType = '') {
  const t = String(docType || '').toUpperCase();

  if (t === 'DNI') {
    return {
      placeholder: '12345678Z',
      help: 'DNI (8 números + letra).',
      maxLength: 9,
      inputMode: 'text',
      autoCapitalize: 'characters',
    };
  }

  if (t === 'NIE') {
    return {
      placeholder: 'X1234567L',
      help: 'NIE (X/Y/Z + 7 números + letra).',
      maxLength: 9,
      inputMode: 'text',
      autoCapitalize: 'characters',
    };
  }

  if (t === 'PASAPORTE') {
    return {
      placeholder: 'AA1234567',
      help: 'Pasaporte (6–20 caracteres).',
      maxLength: 20,
      inputMode: 'text',
      autoCapitalize: 'characters',
    };
  }

  return {
    placeholder: 'Documento / ID',
    help: 'Documento (6–20 caracteres).',
    maxLength: 20,
    inputMode: 'text',
    autoCapitalize: 'characters',
  };
}

function applyDocTypeUI(prefix) {
  const dt = document.getElementById(`${prefix}_docType`);
  const dn = document.getElementById(`${prefix}_docNumber`);
  const help = document.getElementById(`${prefix}_docHelp`);
  if (!dt || !dn) return;

  const meta = docUiMeta(dt.value);

  dn.placeholder = meta.placeholder;
  dn.maxLength = meta.maxLength;
  dn.setAttribute('inputmode', meta.inputMode);
  dn.setAttribute('autocapitalize', meta.autoCapitalize);

  // “suave”: no bloquea, solo limpia espacios y mayus al salir
  dn.addEventListener('blur', () => {
    dn.value = String(dn.value || '').trim().replace(/\s+/g, '').toUpperCase();
  }, { once: true });

  if (help) help.textContent = meta.help;
}

function getCounts() {
  const adults = parseInt(document.getElementById('bookAdults')?.value || '1', 10) || 1;
  const children = parseInt(document.getElementById('bookChildren')?.value || '0', 10) || 0;
  return { adults, children };
}

function setSummaryCounts() {
  const { adults, children } = getCounts();
  const summaryAdults = document.getElementById('summaryAdults');
  const summaryChildren = document.getElementById('summaryChildren');
  if (summaryAdults) summaryAdults.textContent = String(adults);
  if (summaryChildren) summaryChildren.textContent = String(children);
}

function buildDocTypeOptions(selected) {
  return DOC_TYPES
    .map(o => `<option value="${o.value}" ${o.value === selected ? 'selected' : ''}>${o.label}</option>`)
    .join('');
}

function getUserProfileDefaults() {
  const p = state.userProfile || {};
  return {
    name: p.name || '',
    surname: p.surname || '',
    email: p.email || state.currentUser?.email || '',
    phone: p.phone || '',
    docType: p.docType || 'DNI',
    docNumber: p.docNumber || '',
    nationality: p.nationality || 'Española',
    birthDate: toISODate(p.birthDate || ''),
    country: p.country || 'España',
    address: p.address || '',
    city: p.city || '',
    postalCode: p.postalCode || '',
    province: p.province || '',
  };
}

function guestCardHTML({ kind, index, title, defaults = {}, canUseFrequent = false, isPrimary = false }) {
  const prefix = `${kind}_${index}`;
  const docType = defaults.docType || 'DNI';

  if (kind === 'child') {
    return `
    <section class="guest-card" data-kind="${kind}" data-index="${index}">
      <div class="guest-card__head">
        <div>
          <div class="guest-card__kicker">&lt;14</div>
          <h4 class="guest-card__title">${escHtml(title)}</h4>
        </div>

        <div class="guest-card__actions">
          <button type="button" class="btn-ghost btn-sm" onclick="clearGuestForm('${prefix}')">Limpiar</button>
        </div>
      </div>

      <div class="guest-grid">
        <div class="form-field">
          <label>Nombre <span class="required">*</span></label>
          <input id="${prefix}_name" value="${escHtml(defaults.name || '')}" autocomplete="given-name" />
        </div>

        <div class="form-field">
          <label>Apellidos <span class="required">*</span></label>
          <input id="${prefix}_surname" value="${escHtml(defaults.surname || '')}" autocomplete="family-name" />
        </div>

        <div class="form-field">
          <label>Fecha nacimiento <span class="required">*</span></label>
          <input id="${prefix}_birthDate" type="date" value="${escHtml(toISODate(defaults.birthDate || ''))}" />
        </div>

        <div class="form-field">
          <label>Nacionalidad <span class="required">*</span></label>
          <input id="${prefix}_nationality" value="${escHtml(defaults.nationality || '')}" placeholder="Española / French / ..." />
        </div>

        <!-- Documento opcional (no molesta) -->
        <details class="guest-doc-optional">
          <summary>Documento (opcional)</summary>

          <div class="guest-grid" style="margin-top:10px;">
            <div class="form-field">
              <label>Tipo documento</label>
              <select id="${prefix}_docType" data-prefix="${prefix}">
                ${buildDocTypeOptions(docType)}
              </select>
            </div>

            <div class="form-field">
              <label>Nº documento</label>
              <input
                id="${prefix}_docNumber"
                value="${escHtml(defaults.docNumber || '')}"
                placeholder="${escHtml(docUiMeta(docType).placeholder)}"
                maxlength="${docUiMeta(docType).maxLength}"
                inputmode="${docUiMeta(docType).inputMode}"
                autocapitalize="${docUiMeta(docType).autoCapitalize}"
              />
              <div class="field-help" id="${prefix}_docHelp">${escHtml(docUiMeta(docType).help)}</div>
            </div>
          </div>
        </details>
      </div>
    </section>
    `;
  }

  return `
  <section class="guest-card" data-kind="${kind}" data-index="${index}">
    <div class="guest-card__head">
      <div>
        <div class="guest-card__kicker">14+</div>
        <h4 class="guest-card__title">${escHtml(title)}</h4>
      </div>

      <div class="guest-card__actions">
        ${canUseFrequent ? `<button type="button" class="btn-secondary btn-sm" onclick="openSelectFrequentGuestModal(${index})">Usar huésped frecuente</button>` : ''}
        ${!isPrimary ? `<button type="button" class="btn-ghost btn-sm" onclick="clearGuestForm('${prefix}')">Limpiar</button>` : ''}
      </div>
    </div>

    <div class="guest-grid">
      <div class="form-field">
        <label>Nombre <span class="required">*</span></label>
        <input id="${prefix}_name" value="${escHtml(defaults.name || '')}" autocomplete="given-name" />
      </div>

      <div class="form-field">
        <label>Apellidos <span class="required">*</span></label>
        <input id="${prefix}_surname" value="${escHtml(defaults.surname || '')}" autocomplete="family-name" />
      </div>

      ${isPrimary ? `
        <div class="form-field">
          <label>Email <span class="required">*</span></label>
          <input
            id="${prefix}_email"
            value="${escHtml(defaults.email || '')}"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder="name@email.com"
          />
        </div>
      ` : ''}

      ${isPrimary ? `
        <div class="form-field">
          <label>Teléfono <span class="required">*</span></label>
          <input
            id="${prefix}_phone"
            value="${escHtml(defaults.phone || '')}"
            type="tel"
            inputmode="tel"
            autocomplete="tel"
            placeholder="+34 600 000 000"
          />
        </div>
      ` : ''}

      <div class="form-field">
        <label>Tipo documento <span class="required">*</span></label>
        <select id="${prefix}_docType" data-prefix="${prefix}">
          ${buildDocTypeOptions(docType)}
        </select>
      </div>

      <div class="form-field">
        <label>Nº documento <span class="required">*</span></label>
        <input
          id="${prefix}_docNumber"
          value="${escHtml(defaults.docNumber || '')}"
          placeholder="${escHtml(docUiMeta(docType).placeholder)}"
          maxlength="${docUiMeta(docType).maxLength}"
          inputmode="${docUiMeta(docType).inputMode}"
          autocapitalize="${docUiMeta(docType).autoCapitalize}"
        />
        <div class="field-help" id="${prefix}_docHelp">${escHtml(docUiMeta(docType).help)}</div>
      </div>

      <div class="form-field">
        <label>Nacionalidad <span class="required">*</span></label>
        <input id="${prefix}_nationality" value="${escHtml(defaults.nationality || '')}" placeholder="Española / French / ..." />
      </div>

      <div class="form-field">
        <label>Fecha nacimiento <span class="required">*</span></label>
        <input id="${prefix}_birthDate" type="date" value="${escHtml(toISODate(defaults.birthDate || ''))}" />
      </div>

      ${isPrimary ? `
        <div class="form-field">
          <label>País <span class="required">*</span></label>
          <input id="${prefix}_country" value="${escHtml(defaults.country || '')}" autocomplete="country-name" placeholder="España / France / USA..." />
        </div>
      ` : ''}

      ${isPrimary ? `
        <div class="form-field">
          <label>Dirección <span class="required">*</span></label>
          <input id="${prefix}_address" value="${escHtml(defaults.address || '')}" autocomplete="street-address" placeholder="Calle, número, piso..." />
        </div>
      ` : ''}

      ${isPrimary ? `
        <div class="form-field">
          <label>Ciudad <span class="required">*</span></label>
          <input id="${prefix}_city" value="${escHtml(defaults.city || '')}" autocomplete="address-level2" placeholder="Madrid / Paris / London..." />
        </div>
      ` : ''}

      ${isPrimary ? `
        <div class="form-field">
          <label>Código postal <span class="required">*</span></label>
          <input id="${prefix}_postalCode" value="${escHtml(defaults.postalCode || '')}" inputmode="numeric" autocomplete="postal-code" placeholder="28001" />
        </div>
      ` : ''}

      ${isPrimary ? `
        <div class="form-field">
          <label>Provincia / Estado <span class="required">*</span></label>
          <input id="${prefix}_province" value="${escHtml(defaults.province || '')}" autocomplete="address-level1" placeholder="Madrid / California / Île-de-France..." />
        </div>
      ` : ''}
    </div>

    ${kind === 'adult' && !isPrimary ? `
      <div class="guest-card__foot">
        <button type="button" class="btn-secondary btn-sm" onclick="showSaveGuestForm(${index})">
          Guardar como huésped frecuente
        </button>
        <div class="save-guest-inline" id="saveGuestInline_${index}" style="display:none;"></div>
      </div>
    ` : ''}
  </section>
  `;
}

function snapshotGuestInputs() {
  const data = {};
  document.querySelectorAll('#guestFormsContainer input, #guestFormsContainer select')
    .forEach(el => {
      if (el.id) data[el.id] = el.value;
    });
  return data;
}

function restoreGuestInputs(snapshot) {
  Object.entries(snapshot).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  });
}


export function updateGuestForms() {
  setSummaryCounts();

  const snapshot = snapshotGuestInputs();

  const { adults, children } = getCounts();
  const container = document.getElementById('guestFormsContainer');
  if (!container) return;

  const primaryDefaults = getUserProfileDefaults();

  let html = '';

  html += guestCardHTML({
    kind: 'adult',
    index: 1,
    title: 'Titular de la reserva',
    defaults: primaryDefaults,
    canUseFrequent: false,
    isPrimary: true,
  });

  for (let i = 2; i <= adults; i++) {
    html += guestCardHTML({
      kind: 'adult',
      index: i,
      title: `Adulto ${i}`,
      defaults: {},
      canUseFrequent: true,
      isPrimary: false,
    });
  }

  for (let c = 1; c <= children; c++) {
    html += guestCardHTML({
      kind: 'child',
      index: c,
      title: `Niño ${c}`,
      defaults: {},
      canUseFrequent: false,
      isPrimary: false,
    });
  }

  container.innerHTML = html;

  restoreGuestInputs(snapshot);
  
  document.querySelectorAll('#guestFormsContainer select[id$="_docType"]').forEach(sel => {
    const prefix = sel.getAttribute('data-prefix');
    if (!prefix) return;

    applyDocTypeUI(prefix);
    sel.addEventListener('change', () => applyDocTypeUI(prefix));
  });
}

export function getAllGuestData() {
  const { adults, children } = getCounts();
  const all = [];

  for (let i = 1; i <= adults; i++) all.push(readGuestForm('adult', i));
  for (let c = 1; c <= children; c++) all.push(readGuestForm('child', c));

  return all;
}

function readGuestForm(kind, index) {
  const prefix = `${kind}_${index}`;
  const val = (id) => document.getElementById(id)?.value?.trim() || '';

  return {
    kind,
    index,
    name: val(`${prefix}_name`),
    surname: val(`${prefix}_surname`),
    email: val(`${prefix}_email`),
    phone: val(`${prefix}_phone`),
    docType: document.getElementById(`${prefix}_docType`)?.value || '',
    docNumber: val(`${prefix}_docNumber`),
    nationality: val(`${prefix}_nationality`),
    birthDate: val(`${prefix}_birthDate`),
    country: val(`${prefix}_country`),
    address: val(`${prefix}_address`),
    city: val(`${prefix}_city`),
    postalCode: val(`${prefix}_postalCode`),
    province: val(`${prefix}_province`),
  };
}

import {
  isPlausibleName,
  isValidEmail,
  isValidPhone,
  validateDocByType
} from "../shared/utils.js";

export function validateGuestsRequired() {
  const guests = getAllGuestData();
  if (!guests.length) return { ok: false, message: "Faltan viajeros.", fieldId: null };

  const primary = guests.find(g => g.kind === "adult" && g.index === 1);
  if (!primary) return { ok: false, message: "Falta el viajero principal (Adulto 1).", fieldId: "adult_1_name" };

  const requiredPrimary = [
    "name", "surname", "email", "phone",
    "docType", "docNumber", "nationality", "birthDate",
    "country", "address", "city", "postalCode", "province",
  ];

  for (const f of requiredPrimary) {
    if (!String(primary[f] || "").trim()) {
      return { ok: false, message: `Falta "${f}" en viajero principal.`, fieldId: `adult_1_${f}` };
    }
  }

  if (!isPlausibleName(primary.name)) return { ok: false, message: "Revisa el nombre del viajero principal.", fieldId: "adult_1_name" };
  if (!isPlausibleName(primary.surname)) return { ok: false, message: "Revisa los apellidos del viajero principal.", fieldId: "adult_1_surname" };
  if (!isValidEmail(primary.email)) return { ok: false, message: "Revisa el email del viajero principal.", fieldId: "adult_1_email" };
  if (!isValidPhone(primary.phone)) return { ok: false, message: "Revisa el teléfono del viajero principal.", fieldId: "adult_1_phone" };
  if (!validateDocByType(primary.docType, primary.docNumber)) return { ok: false, message: "Revisa el documento del viajero principal.", fieldId: "adult_1_docNumber" };

  const requiredAdult = ["name", "surname", "docType", "docNumber", "nationality", "birthDate"];

  for (const g of guests) {
    if (g.kind === "adult" && g.index !== 1) {
      for (const f of requiredAdult) {
        if (!String(g[f] || "").trim()) {
          return { ok: false, message: `Falta "${f}" en Adulto ${g.index}.`, fieldId: `adult_${g.index}_${f}` };
        }
      }
      if (!isPlausibleName(g.name)) return { ok: false, message: `Revisa el nombre del Adulto ${g.index}.`, fieldId: `adult_${g.index}_name` };
      if (!isPlausibleName(g.surname)) return { ok: false, message: `Revisa los apellidos del Adulto ${g.index}.`, fieldId: `adult_${g.index}_surname` };
      if (!validateDocByType(g.docType, g.docNumber)) return { ok: false, message: `Revisa el documento del Adulto ${g.index}.`, fieldId: `adult_${g.index}_docNumber` };
    }

    if (g.kind === "child") {
      if (!String(g.name || "").trim()) return { ok: false, message: `Falta "name" en Menor ${g.index}.`, fieldId: `child_${g.index}_name` };
      if (!String(g.surname || "").trim()) return { ok: false, message: `Falta "surname" en Menor ${g.index}.`, fieldId: `child_${g.index}_surname` };
      if (!isPlausibleName(g.name)) return { ok: false, message: `Revisa el nombre del Menor ${g.index}.`, fieldId: `child_${g.index}_name` };
      if (!isPlausibleName(g.surname)) return { ok: false, message: `Revisa los apellidos del Menor ${g.index}.`, fieldId: `child_${g.index}_surname` };
    }
  }

  return { ok: true, message: "" };
}

export function openAddGuestModal() {
  document.getElementById('addGuestModal')?.classList.add('active');
}

export function closeAddGuestModal() {
  document.getElementById('addGuestModal')?.classList.remove('active');
  document.getElementById('addGuestForm')?.reset();
}

export function openSelectFrequentGuestModal(adultIndex) {
  state.currentAdultIndexToFill = adultIndex;
  loadFrequentGuestsForSelection();
  document.getElementById('selectFrequentGuestModal')?.classList.add('active');
}

export function closeSelectGuestModal() {
  document.getElementById('selectFrequentGuestModal')?.classList.remove('active');
}

export async function loadFrequentGuests() {
  if (!state.currentUser) return [];
  try {
    const snap = await db.collection('usuarios')
      .doc(state.currentUser.uid)
      .collection('huespedes_frecuentes')
      .get();

    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    renderFrequentGuestsList(list);
    return list;
  } catch (err) {
    console.error('Error loadFrequentGuests:', err);
    return [];
  }
}

function renderFrequentGuestsList(list) {
  const container = document.getElementById('frecuentGuestsList');
  if (!container) return;

  if (!list.length) {
    container.innerHTML = `<p style="color:#777;margin:0;">No tienes huéspedes guardados todavía.</p>`;
    return;
  }

  container.innerHTML = list.map(g => `
    <div class="frequent-guest-item">
      <div>
        <div style="font-weight:700;">${escHtml(g.name || '')} ${escHtml(g.surname || '')}</div>
        <div style="color:#666;font-size:.9rem;">${escHtml(g.email || '')}</div>
      </div>
      <button class="btn-danger btn-sm" onclick="deleteFrequentGuest('${escJsArg(g.id)}')">Borrar</button>
    </div>
  `).join('');
}

async function loadFrequentGuestsForSelection() {
  if (!state.currentUser) return;
  const container = document.getElementById('frequentGuestsSelectList');
  if (!container) return;

  try {
    const snap = await db.collection('usuarios')
      .doc(state.currentUser.uid)
      .collection('huespedes_frecuentes')
      .get();

    if (snap.empty) {
      container.innerHTML = `<p style="color:#777;margin:0;">No tienes huéspedes guardados todavía.</p>`;
      return;
    }

    let html = '';
    snap.forEach(doc => {
      const g = doc.data() || {};

      html += `
        <button type="button" class="select-guest-row"
          onclick="selectAndFillGuest(${state.currentAdultIndexToFill},
            '${escJsArg(g.name || '')}',
            '${escJsArg(g.surname || '')}',
            '${escJsArg(g.email || '')}',
            '${escJsArg(g.phone || '')}',
            '${escJsArg(g.docType || '')}',
            '${escJsArg(g.docNumber || '')}',
            '${escJsArg(g.nationality || '')}',
            '${escJsArg(g.birthDate || '')}',
            '${escJsArg(g.country || '')}',
            '${escJsArg(g.address || '')}',
            '${escJsArg(g.city || '')}',
            '${escJsArg(g.postalCode || g.zipcode || '')}',
            '${escJsArg(g.province || '')}'
          )">
          <div class="select-guest-row__name">${escHtml(g.name || '')} ${escHtml(g.surname || '')}</div>
          <div class="select-guest-row__meta">${escHtml(g.email || '')}</div>
        </button>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    console.error('Error loadFrequentGuestsForSelection:', err);
    container.innerHTML = `<p style="color:#777;margin:0;">Error cargando huéspedes.</p>`;
  }
}

export function selectAndFillGuest(adultIndex, name, surname, email, phone, docType, docNumber, nationality, birthDate, country, address, city, postalCode, province) {
  const prefix = `adult_${adultIndex}`;

  const set = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.value = v || '';
  };

  set(`${prefix}_name`, name);
  set(`${prefix}_surname`, surname);
  set(`${prefix}_email`, email);
  set(`${prefix}_phone`, phone);

  const dt = document.getElementById(`${prefix}_docType`);
  if (dt) dt.value = docType || 'DNI';

  set(`${prefix}_docNumber`, docNumber);
  set(`${prefix}_nationality`, nationality);
  set(`${prefix}_birthDate`, toISODate(birthDate));
  set(`${prefix}_country`, country);

  set(`${prefix}_address`, address);
  set(`${prefix}_city`, city);
  set(`${prefix}_postalCode`, postalCode);
  set(`${prefix}_province`, province);

  closeSelectGuestModal();
}

export async function deleteFrequentGuest(docId) {
  if (!state.currentUser) return;
  if (!confirm('¿Borrar este huésped frecuente?')) return;

  try {
    await db.collection('usuarios')
      .doc(state.currentUser.uid)
      .collection('huespedes_frecuentes')
      .doc(docId)
      .delete();

    await loadFrequentGuests();
  } catch (err) {
    console.error('Error deleteFrequentGuest:', err);
    alert('No se pudo borrar. Revisa consola.');
  }
}

export function showSaveGuestForm(adultIndex) {
  const wrap = document.getElementById(`saveGuestInline_${adultIndex}`);
  if (!wrap) return;

  wrap.style.display = 'block';
  wrap.innerHTML = `
    <div class="save-guest-box">
      <div style="font-weight:700;margin-bottom:6px;">Guardar Adulto ${adultIndex} como huésped frecuente</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button type="button" class="btn-primary btn-sm" onclick="saveAdultAsFrequent(${adultIndex})">Guardar</button>
        <button type="button" class="btn-ghost btn-sm" onclick="hideSaveGuestForm(${adultIndex})">Cancelar</button>
      </div>
      <div style="color:#666;font-size:.9rem;margin-top:6px;">Se guardará en tu perfil para próximas reservas.</div>
    </div>
  `;
}

window.hideSaveGuestForm = function (adultIndex) {
  const wrap = document.getElementById(`saveGuestInline_${adultIndex}`);
  if (wrap) { wrap.style.display = 'none'; wrap.innerHTML = ''; }
};

window.clearGuestForm = function (prefix) {
  const ids = ['name', 'surname', 'email', 'phone', 'docNumber', 'nationality', 'birthDate', 'country', 'address', 'city', 'postalCode', 'province'];
  ids.forEach(k => {
    const el = document.getElementById(`${prefix}_${k}`);
    if (el) el.value = '';
  });
  const dt = document.getElementById(`${prefix}_docType`);
  if (dt) dt.value = 'DNI';
};

window.saveAdultAsFrequent = async function (adultIndex) {
  if (!state.currentUser) {
    alert('Debes iniciar sesión para guardar huéspedes frecuentes.');
    return;
  }

  const g = readGuestForm('adult', adultIndex);

  if (!g.name || !g.surname) {
    alert('Falta nombre y apellidos.');
    return;
  }

  try {
    await db.collection('usuarios')
      .doc(state.currentUser.uid)
      .collection('huespedes_frecuentes')
      .add({
        name: g.name,
        surname: g.surname,
        email: g.email,
        phone: g.phone,
        docType: g.docType,
        docNumber: g.docNumber,
        nationality: g.nationality,
        birthDate: g.birthDate,
        country: g.country,
        address: g.address,
        city: g.city,
        postalCode: g.postalCode,
        province: g.province,
        createdAt: new Date().toISOString(),
      });

    hideSaveGuestForm(adultIndex);
    await loadFrequentGuests();
    alert('✅ Huésped guardado.');
  } catch (err) {
    console.error('Error saveAdultAsFrequent:', err);
    alert('No se pudo guardar. Revisa consola.');
  }
};

// Compatibilidad: checkout-app.js lo llama
export function setupAddGuestForm() {
  // De momento no hace falta enganchar nada aquí.
}