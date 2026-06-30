export const routes = [
  { path: '/dashboard', load: () => import('../modules/dashboard-ui.js') },
  { path: '/reservas', load: () => import('../modules/reservas-ui.js') },
  { path: '/alojamientos', load: () => import('../modules/properties-ui.js') },
  { path: '/packs', load: () => import('../modules/packs-ui.js') },
  { path: '/chat', load: () => import('../modules/chat-ui.js') },
  { path: '/comentarios', load: () => import('../modules/comentarios-ui.js') },
  { path: '/ganancias', load: () => import('../modules/ganancias-ui.js') },
  { path: '/precio-calendar', load: () => import('../modules/price-calendar.js') },
  { path: '/special-prices', load: () => import('../modules/special-prices.js') },
];