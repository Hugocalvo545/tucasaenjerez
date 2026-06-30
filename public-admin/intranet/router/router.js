import { routes } from './routes.js';
import { setStore } from '../shared/state.js';

let currentModule = null;

export async function navigate(path) {
  // Desmontar módulo previo (¡evita listeners duplicados!)
  if (currentModule && typeof currentModule.destroy === 'function') {
    currentModule.destroy();
  }

  const route = routes.find(r => r.path === path);
  if (!route) {
    console.warn('Ruta no encontrada:', path);
    return navigate('/dashboard');
  }

  setStore({ route: path });
  history.pushState(null, '', path);

  const module = await route.load();
  module.init?.();

  currentModule = module;
}

export function initRouter() {
  window.addEventListener('load', () => navigate(location.pathname));
  window.addEventListener('popstate', () => navigate(location.pathname));

  // Navegación interna (evita recargar)
  document.addEventListener('click', e => {
    const link = e.target.closest('a[data-link]');
    if (!link) return;
    e.preventDefault();
    navigate(link.getAttribute('href'));
  });
}