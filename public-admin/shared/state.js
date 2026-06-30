// shared/state.js

export const state = {
  // Usuario
  currentUser: null,
  userData: {},
  userPoints: 0,
  currentLevel: 1,
  currentDiscount: 0,

  // Perfil / huéspedes
  frequentGuestToSave: null,
  currentAdultIndexToFill: null,

  // Servicios externos
  autocompleteService: null,

  // Calendario
  calendarCurrentDate: new Date(),
  bookCheckInDate: null,
  bookCheckOutDate: null,
  priceMap: new Map(),
  priceUnsub: null,

  checkInDatesSet: new Set(),
  checkOutDatesSet: new Set(),

  // Reservas / bloqueos
  reservedDatesSet: new Set(),
  holdDatesSet: new Set(),
  ownHoldDatesSet: new Set(),

  activeHoldId: null,
  reservasUnsub: null,
  holdsUnsub: null,

  // Propiedad actual
  currentPropertyId: "atico-jerez",
  currentPropertyName: "Ático Dúplex en Jerez",
  currentPricePerNight: null,

  // Historial / listados
  bookingsHistoryCache: [],
  bookingsDisplayCache: [],
  bookingsVisible: true,
};