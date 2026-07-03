// shared/countries.js
// Lista única y reutilizable de países (ISO 3166-1) en español, para poblar los
// selects de País y Nacionalidad del registro (y de la edición de perfil).
//
// Cada entrada: { code: <ISO 3166-1 alpha-3>, name: <nombre en español> }.
//
// ─────────────────────────────────────────────────────────────────────────────
// TODO VERIFICAR-SES:
// El export XML de SES.HOSPEDAJES (public-admin/intranet/modules/registro-viajeros-ui.js)
// NO convierte códigos: vuelca el string tal cual en <paisNacionalidad> y
// <paisResidencia>. Hoy, por tanto, el "código que consume el export" es el NOMBRE
// en español (p. ej. "España"), y así se rellenan los VALUE aquí (populateCountrySelect
// usa `name`), sin cambiar lo que emite el export ni romper datos existentes.
//
// Si SES.HOSPEDAJES exige ISO 3166-1 alpha-3 ("ESP"), hay que cambiar DOS cosas A LA VEZ:
//   1) en populateCountrySelect: usar `c.code` como value en vez de `c.name`, y
//   2) el export XML para que emita/valide ese código.
// Por eso guardamos también `code`: dejar el cambio a una sola línea. Pendiente de
// confirmar el formato real con el Ministerio del Interior antes de tocar el export.
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRIES = [
  { code: "AFG", name: "Afganistán" },
  { code: "ALB", name: "Albania" },
  { code: "DEU", name: "Alemania" },
  { code: "AND", name: "Andorra" },
  { code: "AGO", name: "Angola" },
  { code: "AIA", name: "Anguila" },
  { code: "ATG", name: "Antigua y Barbuda" },
  { code: "SAU", name: "Arabia Saudí" },
  { code: "DZA", name: "Argelia" },
  { code: "ARG", name: "Argentina" },
  { code: "ARM", name: "Armenia" },
  { code: "ABW", name: "Aruba" },
  { code: "AUS", name: "Australia" },
  { code: "AUT", name: "Austria" },
  { code: "AZE", name: "Azerbaiyán" },
  { code: "BHS", name: "Bahamas" },
  { code: "BHR", name: "Baréin" },
  { code: "BGD", name: "Bangladés" },
  { code: "BRB", name: "Barbados" },
  { code: "BEL", name: "Bélgica" },
  { code: "BLZ", name: "Belice" },
  { code: "BEN", name: "Benín" },
  { code: "BMU", name: "Bermudas" },
  { code: "BTN", name: "Bután" },
  { code: "BLR", name: "Bielorrusia" },
  { code: "BOL", name: "Bolivia" },
  { code: "BIH", name: "Bosnia y Herzegovina" },
  { code: "BWA", name: "Botsuana" },
  { code: "BRA", name: "Brasil" },
  { code: "BRN", name: "Brunéi" },
  { code: "BGR", name: "Bulgaria" },
  { code: "BFA", name: "Burkina Faso" },
  { code: "BDI", name: "Burundi" },
  { code: "CPV", name: "Cabo Verde" },
  { code: "KHM", name: "Camboya" },
  { code: "CMR", name: "Camerún" },
  { code: "CAN", name: "Canadá" },
  { code: "QAT", name: "Catar" },
  { code: "TCD", name: "Chad" },
  { code: "CHL", name: "Chile" },
  { code: "CHN", name: "China" },
  { code: "CYP", name: "Chipre" },
  { code: "COL", name: "Colombia" },
  { code: "COM", name: "Comoras" },
  { code: "COG", name: "Congo" },
  { code: "COD", name: "Congo (República Democrática del)" },
  { code: "PRK", name: "Corea del Norte" },
  { code: "KOR", name: "Corea del Sur" },
  { code: "CIV", name: "Costa de Marfil" },
  { code: "CRI", name: "Costa Rica" },
  { code: "HRV", name: "Croacia" },
  { code: "CUB", name: "Cuba" },
  { code: "CUW", name: "Curazao" },
  { code: "DNK", name: "Dinamarca" },
  { code: "DMA", name: "Dominica" },
  { code: "ECU", name: "Ecuador" },
  { code: "EGY", name: "Egipto" },
  { code: "SLV", name: "El Salvador" },
  { code: "ARE", name: "Emiratos Árabes Unidos" },
  { code: "ERI", name: "Eritrea" },
  { code: "SVK", name: "Eslovaquia" },
  { code: "SVN", name: "Eslovenia" },
  { code: "ESP", name: "España" },
  { code: "USA", name: "Estados Unidos" },
  { code: "EST", name: "Estonia" },
  { code: "SWZ", name: "Esuatini" },
  { code: "ETH", name: "Etiopía" },
  { code: "PHL", name: "Filipinas" },
  { code: "FIN", name: "Finlandia" },
  { code: "FJI", name: "Fiyi" },
  { code: "FRA", name: "Francia" },
  { code: "GAB", name: "Gabón" },
  { code: "GMB", name: "Gambia" },
  { code: "GEO", name: "Georgia" },
  { code: "GHA", name: "Ghana" },
  { code: "GIB", name: "Gibraltar" },
  { code: "GRD", name: "Granada" },
  { code: "GRC", name: "Grecia" },
  { code: "GRL", name: "Groenlandia" },
  { code: "GLP", name: "Guadalupe" },
  { code: "GUM", name: "Guam" },
  { code: "GTM", name: "Guatemala" },
  { code: "GUF", name: "Guayana Francesa" },
  { code: "GGY", name: "Guernsey" },
  { code: "GIN", name: "Guinea" },
  { code: "GNQ", name: "Guinea Ecuatorial" },
  { code: "GNB", name: "Guinea-Bisáu" },
  { code: "GUY", name: "Guyana" },
  { code: "HTI", name: "Haití" },
  { code: "HND", name: "Honduras" },
  { code: "HKG", name: "Hong Kong" },
  { code: "HUN", name: "Hungría" },
  { code: "IND", name: "India" },
  { code: "IDN", name: "Indonesia" },
  { code: "IRQ", name: "Irak" },
  { code: "IRN", name: "Irán" },
  { code: "IRL", name: "Irlanda" },
  { code: "ISL", name: "Islandia" },
  { code: "CYM", name: "Islas Caimán" },
  { code: "COK", name: "Islas Cook" },
  { code: "FRO", name: "Islas Feroe" },
  { code: "MDV", name: "Islas Maldivas" },
  { code: "MLT", name: "Malta" },
  { code: "FLK", name: "Islas Malvinas" },
  { code: "MNP", name: "Islas Marianas del Norte" },
  { code: "MHL", name: "Islas Marshall" },
  { code: "SLB", name: "Islas Salomón" },
  { code: "TCA", name: "Islas Turcas y Caicos" },
  { code: "VGB", name: "Islas Vírgenes Británicas" },
  { code: "VIR", name: "Islas Vírgenes de los Estados Unidos" },
  { code: "ISR", name: "Israel" },
  { code: "ITA", name: "Italia" },
  { code: "JAM", name: "Jamaica" },
  { code: "JPN", name: "Japón" },
  { code: "JEY", name: "Jersey" },
  { code: "JOR", name: "Jordania" },
  { code: "KAZ", name: "Kazajistán" },
  { code: "KEN", name: "Kenia" },
  { code: "KGZ", name: "Kirguistán" },
  { code: "KIR", name: "Kiribati" },
  { code: "KWT", name: "Kuwait" },
  { code: "LAO", name: "Laos" },
  { code: "LSO", name: "Lesoto" },
  { code: "LVA", name: "Letonia" },
  { code: "LBN", name: "Líbano" },
  { code: "LBR", name: "Liberia" },
  { code: "LBY", name: "Libia" },
  { code: "LIE", name: "Liechtenstein" },
  { code: "LTU", name: "Lituania" },
  { code: "LUX", name: "Luxemburgo" },
  { code: "MAC", name: "Macao" },
  { code: "MKD", name: "Macedonia del Norte" },
  { code: "MDG", name: "Madagascar" },
  { code: "MYS", name: "Malasia" },
  { code: "MWI", name: "Malaui" },
  { code: "MLI", name: "Malí" },
  { code: "MAR", name: "Marruecos" },
  { code: "MTQ", name: "Martinica" },
  { code: "MUS", name: "Mauricio" },
  { code: "MRT", name: "Mauritania" },
  { code: "MYT", name: "Mayotte" },
  { code: "MEX", name: "México" },
  { code: "FSM", name: "Micronesia" },
  { code: "MDA", name: "Moldavia" },
  { code: "MCO", name: "Mónaco" },
  { code: "MNG", name: "Mongolia" },
  { code: "MNE", name: "Montenegro" },
  { code: "MSR", name: "Montserrat" },
  { code: "MOZ", name: "Mozambique" },
  { code: "MMR", name: "Myanmar (Birmania)" },
  { code: "NAM", name: "Namibia" },
  { code: "NRU", name: "Nauru" },
  { code: "NPL", name: "Nepal" },
  { code: "NIC", name: "Nicaragua" },
  { code: "NER", name: "Níger" },
  { code: "NGA", name: "Nigeria" },
  { code: "NIU", name: "Niue" },
  { code: "NOR", name: "Noruega" },
  { code: "NCL", name: "Nueva Caledonia" },
  { code: "NZL", name: "Nueva Zelanda" },
  { code: "OMN", name: "Omán" },
  { code: "NLD", name: "Países Bajos" },
  { code: "PAK", name: "Pakistán" },
  { code: "PLW", name: "Palaos" },
  { code: "PSE", name: "Palestina" },
  { code: "PAN", name: "Panamá" },
  { code: "PNG", name: "Papúa Nueva Guinea" },
  { code: "PRY", name: "Paraguay" },
  { code: "PER", name: "Perú" },
  { code: "PYF", name: "Polinesia Francesa" },
  { code: "POL", name: "Polonia" },
  { code: "PRT", name: "Portugal" },
  { code: "PRI", name: "Puerto Rico" },
  { code: "GBR", name: "Reino Unido" },
  { code: "CAF", name: "República Centroafricana" },
  { code: "CZE", name: "República Checa" },
  { code: "DOM", name: "República Dominicana" },
  { code: "REU", name: "Reunión" },
  { code: "RWA", name: "Ruanda" },
  { code: "ROU", name: "Rumanía" },
  { code: "RUS", name: "Rusia" },
  { code: "ESH", name: "Sáhara Occidental" },
  { code: "WSM", name: "Samoa" },
  { code: "ASM", name: "Samoa Americana" },
  { code: "KNA", name: "San Cristóbal y Nieves" },
  { code: "SMR", name: "San Marino" },
  { code: "MAF", name: "San Martín (parte francesa)" },
  { code: "SPM", name: "San Pedro y Miquelón" },
  { code: "VCT", name: "San Vicente y las Granadinas" },
  { code: "SHN", name: "Santa Elena" },
  { code: "LCA", name: "Santa Lucía" },
  { code: "STP", name: "Santo Tomé y Príncipe" },
  { code: "SEN", name: "Senegal" },
  { code: "SRB", name: "Serbia" },
  { code: "SYC", name: "Seychelles" },
  { code: "SLE", name: "Sierra Leona" },
  { code: "SGP", name: "Singapur" },
  { code: "SXM", name: "Sint Maarten (parte neerlandesa)" },
  { code: "SYR", name: "Siria" },
  { code: "SOM", name: "Somalia" },
  { code: "LKA", name: "Sri Lanka" },
  { code: "ZAF", name: "Sudáfrica" },
  { code: "SDN", name: "Sudán" },
  { code: "SSD", name: "Sudán del Sur" },
  { code: "SWE", name: "Suecia" },
  { code: "CHE", name: "Suiza" },
  { code: "SUR", name: "Surinam" },
  { code: "THA", name: "Tailandia" },
  { code: "TWN", name: "Taiwán" },
  { code: "TZA", name: "Tanzania" },
  { code: "TJK", name: "Tayikistán" },
  { code: "IOT", name: "Territorio Británico del Océano Índico" },
  { code: "TLS", name: "Timor Oriental" },
  { code: "TGO", name: "Togo" },
  { code: "TKL", name: "Tokelau" },
  { code: "TON", name: "Tonga" },
  { code: "TTO", name: "Trinidad y Tobago" },
  { code: "TUN", name: "Túnez" },
  { code: "TKM", name: "Turkmenistán" },
  { code: "TUR", name: "Turquía" },
  { code: "TUV", name: "Tuvalu" },
  { code: "UKR", name: "Ucrania" },
  { code: "UGA", name: "Uganda" },
  { code: "URY", name: "Uruguay" },
  { code: "UZB", name: "Uzbekistán" },
  { code: "VUT", name: "Vanuatu" },
  { code: "VAT", name: "Ciudad del Vaticano" },
  { code: "VEN", name: "Venezuela" },
  { code: "VNM", name: "Vietnam" },
  { code: "WLF", name: "Wallis y Futuna" },
  { code: "YEM", name: "Yemen" },
  { code: "DJI", name: "Yibuti" },
  { code: "ZMB", name: "Zambia" },
  { code: "ZWE", name: "Zimbabue" },
];

// Copia ordenada alfabéticamente por nombre (locale español, ignora acentos/mayúsculas).
const SORTED = [...COUNTRIES].sort((a, b) =>
  a.name.localeCompare(b.name, "es", { sensitivity: "base" })
);

/**
 * Rellena un <select> con la lista completa de países.
 * - value = c.name (nombre en español). Ver TODO VERIFICAR-SES arriba.
 * - Mantiene una opción placeholder ("Selecciona") con value "".
 * - Si `selected` no está en la lista (dato antiguo, p. ej. "Española"), se
 *   inyecta como opción propia para no perder el valor guardado.
 *
 * @param {HTMLSelectElement} select
 * @param {{ selected?: string, placeholder?: string }} [opts]
 */
export function populateCountrySelect(select, opts = {}) {
  if (!select) return;
  const { selected = "", placeholder = "Selecciona" } = opts;

  const options = [`<option value="">${placeholder}</option>`];

  const known = SORTED.some((c) => c.name === selected);
  if (selected && !known) {
    // Valor previo que no está en el catálogo (dato heredado): lo conservamos.
    options.push(`<option value="${selected}" selected>${selected}</option>`);
  }

  for (const c of SORTED) {
    const isSel = c.name === selected ? " selected" : "";
    options.push(`<option value="${c.name}"${isSel}>${c.name}</option>`);
  }

  select.innerHTML = options.join("");
}
