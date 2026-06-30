// perfil/guests-perfil.js
import { db } from "../shared/firebase.js";
import { state } from "../shared/state.js";
import { setupAddressAutocomplete } from "../shared/places.js";

let guestModalAutocompleteReady = false;

// Helpers
function el(id) {
  return document.getElementById(id);
}

function val(id) {
  const n = el(id);
  return n ? String(n.value || "").trim() : "";
}

// Modal alta huésped
export async function openAddGuestModal() {
  el("addGuestModal")?.classList.add("active");

  if (!guestModalAutocompleteReady) {
    await setupAddressAutocomplete();
    guestModalAutocompleteReady = true;
  }
}

export function closeAddGuestModal() {
  el("addGuestModal")?.classList.remove("active");
  el("addGuestForm")?.reset();
}

// Modal selección
export function openSelectFrequentGuestModal(adultIndex) {
  state.currentAdultIndexToFill = adultIndex;
  loadFrequentGuestsForSelection();
  el("selectFrequentGuestModal")?.classList.add("active");
}

export function closeSelectGuestModal() {
  el("selectFrequentGuestModal")?.classList.remove("active");
}

// Listado perfil
export async function loadFrequentGuests() {
  if (!state.currentUser) return;

  try {
    const snap = await db
      .collection("usuarios")
      .doc(state.currentUser.uid)
      .collection("huespedes_frecuentes")
      .get();

    let html = "";

    if (snap.empty) {
      html = '<p style="color:#999;text-align:center;">No tienes huéspedes guardados</p>';
    } else {
      snap.forEach((doc) => {
        const g = doc.data() || {};
        html += `
          <div class="frequent-guest-item">
            <div>
              <p style="font-weight:500;">${g.name || ""} ${g.surname || ""}</p>
              <p style="font-size:0.85rem;color:#666;">${g.email || ""}</p>
            </div>
            <div>
              <button
                class="btn-danger btn-sm"
                onclick="deleteFrequentGuest('${doc.id}')"
              >
                Borrar
              </button>
            </div>
          </div>
        `;
      });
    }

    el("frecuentGuestsList") && (el("frecuentGuestsList").innerHTML = html);
  } catch (err) {
    console.error("Error loadFrequentGuests:", err);
  }
}

// Listado selección
async function loadFrequentGuestsForSelection() {
  if (!state.currentUser) return;

  const container = el("frequentGuestsSelectList");
  if (!container) return;

  try {
    const snap = await db
      .collection("usuarios")
      .doc(state.currentUser.uid)
      .collection("huespedes_frecuentes")
      .get();

    let html = "";

    if (snap.empty) {
      html = '<p style="color:#999;text-align:center;">No tienes huéspedes guardados</p>';
    } else {
      snap.forEach((doc) => {
        const g = doc.data() || {};
        const data = encodeURIComponent(JSON.stringify(g));

        html += `
          <div
            class="frequent-guest-select-item"
            data-guest="${data}"
          >
            <p style="font-weight:500;margin:0 0 4px 0;">${g.name || ""} ${g.surname || ""}</p>
            <p style="font-size:0.85rem;color:#666;margin:0;">
              ${g.email || ""} · ${g.phone || ""}
            </p>
          </div>
        `;
      });
    }

    container.innerHTML = html;

    container.querySelectorAll(".frequent-guest-select-item").forEach((item) => {
      item.addEventListener("click", () => {
        const raw = item.dataset.guest;
        if (!raw) return;
        try {
          const guest = JSON.parse(decodeURIComponent(raw));
          selectAndFillGuest(state.currentAdultIndexToFill, guest);
        } catch (_) {}
      });
    });
  } catch (err) {
    console.error("Error loadFrequentGuestsForSelection:", err);
  }
}

// Rellenar huésped
export function selectAndFillGuest(index, g) {
  const nameInputs = document.querySelectorAll(".guestName");
  if (!nameInputs[index]) {
    alert("Error al cargar datos");
    return;
  }

  document.querySelectorAll(".guestName")[index].value = g.name || "";
  document.querySelectorAll(".guestSurname")[index].value = g.surname || "";
  document.querySelectorAll(".guestEmail")[index].value = g.email || "";
  document.querySelectorAll(".guestPhone")[index].value = g.phone || "";
  document.querySelectorAll(".guestDocType")[index].value = g.docType || "";
  document.querySelectorAll(".guestDocNumber")[index].value = g.docNumber || "";
  document.querySelectorAll(".guestNationality")[index].value = g.nationality || "";
  document.querySelectorAll(".guestBirthDate")[index].value = g.birthDate || "";
  document.querySelectorAll(".guestCountry")[index].value = g.country || "";
  document.querySelectorAll(".guestAddress")[index].value = g.address || "";
  document.querySelectorAll(".guestCity")[index].value = g.city || "";
  document.querySelectorAll(".guestZipcode")[index].value = g.zipcode || "";
  document.querySelectorAll(".guestProvince")[index].value = g.province || "";

  closeSelectGuestModal();
  alert("✓ Datos del huésped cargados");
}

// Borrar huésped
export async function deleteFrequentGuest(guestId) {
  if (!state.currentUser) return;
  if (!confirm("¿Eliminar huésped frecuente?")) return;

  try {
    await db
      .collection("usuarios")
      .doc(state.currentUser.uid)
      .collection("huespedes_frecuentes")
      .doc(guestId)
      .delete();

    loadFrequentGuests();
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
}

// Form alta huésped
export function setupAddGuestForm() {
  const form = el("addGuestForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!state.currentUser) {
      alert("❌ Debes iniciar sesión");
      return;
    }

    const frequentGuest = {
      name: val("frequentGuestName"),
      surname: val("frequentGuestSurname"),
      email: val("frequentGuestEmail"),
      phone: val("frequentGuestPhone"),
      docType: val("frequentGuestDocType"),
      docNumber: val("frequentGuestDocNumber"),
      nationality: val("frequentGuestNationality"),
      birthDate: val("frequentGuestBirthDate"),
      country: val("frequentGuestCountry"),
      address: val("frequentGuestAddress"),
      city: val("frequentGuestCity"),
      zipcode: val("frequentGuestZipcode"),
      province: val("frequentGuestProvince"),
      createdAt: new Date().toISOString(),
    };

    if (!frequentGuest.name || !frequentGuest.surname || !frequentGuest.email || !frequentGuest.phone) {
      alert("Completa los campos obligatorios");
      return;
    }

    try {
      await db
        .collection("usuarios")
        .doc(state.currentUser.uid)
        .collection("huespedes_frecuentes")
        .add(frequentGuest);

      alert("✓ Huésped guardado");
      closeAddGuestModal();
      loadFrequentGuests();
    } catch (err) {
      alert("❌ Error: " + err.message);
    }
  });
}