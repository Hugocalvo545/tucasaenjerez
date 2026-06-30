
export const state = {
  currentUser: null,
  userData: {},
  userProfile: {},
  userPoints: 0,
  currentLevel: 1,
  currentDiscount: 0,
  _computedBaseTotal: 0,
  _computedDiscount: 0,
  _computedDiscountAmount: 0,

  frequentGuestToSave: null,
  currentAdultIndexToFill: null,

  autocompleteService: null,

  calendarCurrentDate: new Date(),
  bookCheckInDate: null,
  bookCheckOutDate: null,
  priceMap: new Map(),
  priceUnsub: null,

  checkInDatesSet: new Set(),
  checkOutDatesSet: new Set(),

  reservedDatesSet: new Set(),
  holdDatesSet: new Set(),
  ownHoldDatesSet: new Set(),
  adminBlockedSet: new Set(),

  activeHoldId: null,
  reservasUnsub: null,
  holdsUnsub: null,
  bloqueosUnsub: null,

  currentPropertyId: "atico-jerez",
  currentPropertyName: "Ático Dúplex en Jerez",
  currentPricePerNight: null,
  currentPropertyMinNights: 1,
  currentPropertyTipo: null,
  currentPropertySourceProperties: [],  // para packs: IDs de los apartamentos individuales

  bookingsHistoryCache: [],
  bookingsDisplayCache: [],
  bookingsVisible: true,
};
