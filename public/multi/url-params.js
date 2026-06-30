export function applyURLParams() {
  const params = new URLSearchParams(window.location.search);

  const ci     = params.get("ci");
  const co     = params.get("co");
  const guests = params.get("guests");
  const ciudad = params.get("ciudad");

  if (!ci && !co && !guests && !ciudad) return;

  // Guardar en global para que app-multi.js los lea cuando tenga datos
  window.__jlaURLParams = { ci, co, guests, ciudad, applied: false };

  if (ci) {
    const el = document.getElementById("filterCheckIn");
    if (el) el.value = ci;
  }
  if (co) {
    const el = document.getElementById("filterCheckOut");
    if (el) el.value = co;
  }
  if (guests) {
    const el = document.getElementById("filterGuests");
    if (el) {
      const n = parseInt(guests, 10);
      if (n >= 1 && n <= 8) el.value = n;
    }
  }
}
