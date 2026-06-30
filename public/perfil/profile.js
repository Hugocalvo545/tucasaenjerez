import { auth, db } from "../shared/firebase.js";
import { state } from "../shared/state.js";
import { LEVELS, calculateLevel } from "../shared/config.js";

export { calculateLevel };

export function getUserLevel(points) {
  return calculateLevel(points).level;
}

export function getLevelInfo(levelNum) {
  const n = Number(levelNum) || 1;
  return LEVELS.find((l) => l.level === n) || LEVELS[0];
}

export function getDiscountForLevel(levelNum) {
  return getLevelInfo(levelNum).discount || 0;
}

function el(id) { return document.getElementById(id); }

export function updateLevelDisplay() {
  const points = Number(state.userPoints) || 0;
  const level = calculateLevel(points);
  const nextLevel = LEVELS.find((l) => l.level === level.level + 1) || null;
  const isMax = !nextLevel;
  const pct = isMax
    ? 100
    : Math.min(100, Math.max(0, Math.round((points - level.min) / (nextLevel.min - level.min) * 100)));

  const levelNumber    = el("levelNumber");
  const levelName      = el("levelName");
  const levelProgressBar = el("levelProgressBar");
  const levelProgressText = el("levelProgressText");
  const levelBadge     = el("levelBadge");
  const discountBadge  = el("discountBadge");

  if (levelNumber)  levelNumber.textContent  = level.level;
  if (levelName)    levelName.textContent    = level.name;
  if (levelProgressBar) levelProgressBar.style.width = `${pct}%`;
  if (levelBadge)   levelBadge.textContent  = `Nivel ${level.level} · ${level.name}`;

  if (levelProgressText) {
    if (isMax) {
      levelProgressText.textContent = "¡Nivel máximo alcanzado! 🎉";
    } else {
      const remaining = (nextLevel.min - points).toLocaleString("es-ES");
      levelProgressText.textContent =
        `${remaining} puntos para ${nextLevel.name} (${nextLevel.min.toLocaleString("es-ES")} pts) · ${pct}%`;
    }
  }

  if (discountBadge) {
    if (level.discount > 0) {
      discountBadge.textContent = `🎉 Descuento ${level.discount}%`;
      discountBadge.style.background = "#27ae60";
    } else {
      discountBadge.textContent = "Sin descuento aún";
      discountBadge.style.background = "#95a5a6";
    }
  }
}

export function updatePointsDisplay() {
  const node = el("pointsDisplay");
  if (node) node.textContent = (Number(state.userPoints) || 0).toLocaleString("es-ES");
}

export function displayUserProfile() {
  const u = state.userData || {};
  const fullName = `${u.name || ""} ${u.surname || ""}`.trim() || "Usuario";

  const profileFullName = el("profileFullName");
  const profileEmail    = el("profileEmail");
  if (profileFullName) profileFullName.textContent = fullName;
  if (profileEmail)    profileEmail.textContent    = u.email || "-";

  const set = (id, v) => { const n = el(id); if (n) n.textContent = v || "-"; };

  set("pNombre",      fullName);
  set("pEmail",       u.email);
  set("pPhone",       u.phone);
  set("pDocType",     u.docType);
  set("pDocNumber",   u.docNumber);
  set("pNationality", u.nationality);
  set("pBirthDate",   u.birthDate);
  set("pCountry",     u.country);
  set("pAddress",     u.address);
  set("pCity",        u.city);
  set("pZipcode",     u.zipcode);
  set("pProvince",    u.province);

  updateLevelDisplay();
  updatePointsDisplay();
}

export function openProfileEdit() {
  const u = state.userData || {};
  const setVal = (id, v) => { const n = el(id); if (n) n.value = v || ""; };

  setVal("ep_name",        u.name);
  setVal("ep_surname",     u.surname);
  setVal("ep_email",       u.email || state.currentUser?.email || "");
  setVal("ep_phone",       u.phone);
  setVal("ep_birthDate",   u.birthDate || "");
  setVal("ep_docType",     u.docType || "DNI");
  setVal("ep_docNumber",   u.docNumber);
  setVal("ep_nationality", u.nationality || "Española");
  setVal("ep_country",     u.country || "España");
  setVal("ep_address",     u.address);
  setVal("ep_city",        u.city);
  setVal("ep_zipcode",     u.zipcode);
  setVal("ep_province",    u.province);

  const msgEl = el("profileEditMsg");
  if (msgEl) msgEl.textContent = "";

  const editCard = el("profileEditCard");
  if (editCard) editCard.style.display = "";
  const infoView = el("profileInfoView");
  if (infoView) infoView.style.display = "none";

  editCard?.scrollIntoView?.({ behavior: "smooth", block: "start" });
}

export function closeProfileEdit() {
  const editCard = el("profileEditCard");
  if (editCard) editCard.style.display = "none";
  const infoView = el("profileInfoView");
  if (infoView) infoView.style.display = "";
}

export async function saveProfileEdit() {
  const get  = (id) => (el(id)?.value || "").trim();
  const msgEl = el("profileEditMsg");
  const btn   = el("saveProfileBtn");

  if (btn) { btn.disabled = true; btn.textContent = "Guardando..."; }
  if (msgEl) msgEl.textContent = "";

  try {
    const uid = state.currentUser?.uid;
    if (!uid) throw new Error("No hay sesión activa.");

    const name    = get("ep_name");
    const surname = get("ep_surname");

    const data = {
      name,
      surname,
      phone:       get("ep_phone"),
      birthDate:   get("ep_birthDate"),
      docType:     get("ep_docType"),
      docNumber:   get("ep_docNumber"),
      nationality: get("ep_nationality"),
      country:     get("ep_country"),
      address:     get("ep_address"),
      city:        get("ep_city"),
      zipcode:     get("ep_zipcode"),
      province:    get("ep_province"),
    };

    await db.collection("usuarios").doc(uid).set(data, { merge: true });

    const displayName = [name, surname].filter(Boolean).join(" ").trim();
    if (auth.currentUser && displayName) {
      await auth.currentUser.updateProfile({ displayName });
    }

    Object.assign(state.userData, data);
    displayUserProfile();
    closeProfileEdit();

    if (msgEl) {
      msgEl.style.color = "#27ae60";
      msgEl.textContent = "✅ Datos guardados correctamente.";
      setTimeout(() => { if (msgEl) msgEl.textContent = ""; }, 3000);
    }
  } catch (err) {
    console.error("Error guardando perfil:", err);
    if (msgEl) {
      msgEl.style.color = "#b00020";
      msgEl.textContent = `❌ ${err.message || "No se pudo guardar."}`;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "Guardar cambios"; }
  }
}

export function showProfileScreen() {
  const login   = el("loginScreen");
  const profile = el("profileScreen");
  const booking = el("bookingScreen");
  if (login)   login.classList.remove("active");
  if (profile) profile.classList.add("active");
  if (booking) booking.style.display = "none";
}
