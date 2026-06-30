// perfil/auth.js
import { auth, db } from "../shared/firebase.js";
import { state } from "../shared/state.js";
import { isValidEmail, isValidPhone, validateDocByType } from "../shared/utils.js";

// UI helpers
function el(id) {
  return document.getElementById(id);
}

function val(id) {
  const node = el(id);
  return node ? String(node.value || "").trim() : "";
}

function setMsg(node, type, text) {
  if (!node) return;
  const cls =
    type === "loading"
      ? "loading-message"
      : type === "success"
        ? "success-message"
        : "error-message";

  const prefix =
    type === "loading"
      ? '<span class="loading-spinner"></span>'
      : type === "success"
        ? "✓ "
        : "❌ ";

  node.innerHTML = `<div class="${cls}">${prefix}${text}</div>`;
}

function safeStepToggle(fromId, toId) {
  const from = el(fromId);
  const to = el(toId);
  if (from) from.classList.remove("active");
  if (to) to.classList.add("active");
}

function safeClassAdd(id, cls) {
  const node = el(id);
  if (node) node.classList.add(cls);
}

function safeClassRemove(id, cls) {
  const node = el(id);
  if (node) node.classList.remove(cls);
}

// Tabs
export function switchTab(tab) {
  const tabs = document.querySelectorAll(".login-tab");
  const loginTab = el("loginTab");
  const registerTab = el("registerTab");

  tabs.forEach((t) => t.classList.remove("active"));

  const isLogin = tab === "login";

  if (tabs[0] && isLogin) tabs[0].classList.add("active");
  if (tabs[1] && !isLogin) tabs[1].classList.add("active");

  if (loginTab) {
    loginTab.classList.toggle("active", isLogin);
    loginTab.style.display = isLogin ? "block" : "none";
  }

  if (registerTab) {
    registerTab.classList.toggle("active", !isLogin);
    registerTab.style.display = !isLogin ? "block" : "none";
  }
}

// Registro (wizard)
export function regNextStep() {
  const msg = el("regStep1Message");

  const name = val("regName");
  const surname = val("regSurname");
  const email = val("regEmail");
  const phone = val("regPhone");
  const password = el("regPassword") ? el("regPassword").value : "";
  const passwordConfirm = el("regPasswordConfirm") ? el("regPasswordConfirm").value : "";

  if (!name || !surname || !email || !phone || !password || !passwordConfirm) {
    setMsg(msg, "error", "⚠️ Completa todos los campos");
    return;
  }

  if (password.length < 8) {
    setMsg(msg, "error", "⚠️ Mínimo 8 caracteres");
    return;
  }

  if (password !== passwordConfirm) {
    setMsg(msg, "error", "Las contraseñas no coinciden");
    return;
  }

    if (!isValidEmail(email)) {
    setMsg(msg, "error", "Revisa el email");
    return;
  }

  if (!isValidPhone(phone)) {
    setMsg(msg, "error", "Revisa el teléfono");
    return;
  }

  localStorage.setItem("regTemp", JSON.stringify({ name, surname, email, phone, password }));

  safeStepToggle("regStep1Form", "regStep2Form");
  safeClassRemove("regStep1", "active");
  safeClassAdd("regStep1", "completed");
  safeClassAdd("regStep2", "active");
  safeClassAdd("regLine", "active");
}

export function regPrevStep() {
  safeStepToggle("regStep2Form", "regStep1Form");
  safeClassAdd("regStep1", "active");
  safeClassRemove("regStep2", "active");
  safeClassRemove("regLine", "active");
}

// Auth init
export function initAuth(onUserLoggedIn) {
  const loginForm = el("loginForm");
  const loginMsg = el("loginMessage");

  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const email = val("loginEmail");
      const password = el("loginPassword") ? el("loginPassword").value : "";

      try {
        setMsg(loginMsg, "loading", "Iniciando sesión...");
        await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        setMsg(loginMsg, "error", err?.message || "Error al iniciar sesión");
      }
    });
  }

  const registerForm = el("registerForm");
  const registerMsg = el("registerMessage");

  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const temp = JSON.parse(localStorage.getItem("regTemp") || "{}");

      const terms = el("regTerms");
      if (!terms || !terms.checked) {
        setMsg(registerMsg, "error", "Acepta los términos");
        return;
      }

      if (!temp.email || !temp.password) {
        setMsg(registerMsg, "error", "Completa el paso 1 del registro");
        return;
      }

      try {
        setMsg(registerMsg, "loading", "Creando cuenta...");

        const cred = await auth.createUserWithEmailAndPassword(temp.email, temp.password);
        const user = cred.user;

        const birthDay = val("birthDay");
        const birthMonth = val("birthMonth");
        const birthYear = val("birthYear");
        const birthDate = birthDay && birthMonth && birthYear ? `${birthDay}/${birthMonth}/${birthYear}` : "";

        const dt = val("docType");
        const dn = val("docNumber");

        if (!validateDocByType(dt, dn)) {
          setMsg(registerMsg, "error", "Revisa el documento");
          return;
        }

        const profile = {
          name: temp.name || "",
          surname: temp.surname || "",
          email: temp.email || "",
          phone: temp.phone || "",

          docType: val("docType"),
          docNumber: val("docNumber"),
          nationality: val("nationality"),
          birthDate,

          country: val("country"),
          address: val("address"),
          city: val("city"),
          zipcode: val("zipcode"),
          province: val("province"),

          points: 0,
          createdAt: new Date(),
        };

        await db.collection("usuarios").doc(user.uid).set(profile);

        localStorage.removeItem("regTemp");
        setMsg(registerMsg, "success", "Cuenta creada");
      } catch (err) {
        setMsg(registerMsg, "error", err?.message || "Error creando la cuenta");
      }
    });
  }

  auth.onAuthStateChanged((user) => {
    if (user) {
      state.currentUser = { uid: user.uid, email: user.email };
      if (typeof onUserLoggedIn === "function") onUserLoggedIn(user);
      return;
    }
    state.currentUser = null;
  });
}