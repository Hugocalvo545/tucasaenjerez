export function createRouter({ getRoute, setRoute, routes }) {
  let current = null;

  function navigate(route) {
    const next = route || getRoute();
    if (!next || !routes[next]) return;

    if (current && current !== next) {
      routes[current].stop?.();
    }

    setRoute(next);
    routes[next].start?.();

    current = next;
  }

  function init() {
    window.addEventListener("hashchange", () => navigate(getRoute()));
    navigate(getRoute());
  }

  function destroy() {
    if (current) routes[current].stop?.();
    window.removeEventListener("hashchange", () => navigate(getRoute()));
    current = null;
  }

  return { init, navigate, destroy };
}
