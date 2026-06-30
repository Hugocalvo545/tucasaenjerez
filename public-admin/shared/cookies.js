// Función para cargar cookies según el consentimiento
function loadCookies(consent) {
    if (consent === 'accept') {
        // Cargar cookies no esenciales (por ejemplo, cookies de análisis y publicitarias)
        loadAnalyticsCookies();
    }
    // Si el usuario rechaza, solo se cargarán las cookies necesarias
}

// Función para cargar cookies analíticas
function loadAnalyticsCookies() {
    // Aquí cargarías las librerías para Google Analytics u otros servicios de análisis
    console.log('Se cargan cookies analíticas');
}

// Manejo del consentimiento de cookies
document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptButton = document.getElementById('accept-cookies');
    const rejectButton = document.getElementById('reject-cookies');

    // Verificar si el usuario ya dio su consentimiento
    const cookieConsent = localStorage.getItem('cookie-consent');
    if (!cookieConsent) {
        cookieBanner.style.display = 'block'; // Mostrar banner si no hay consentimiento
    } else {
        loadCookies(cookieConsent); // Cargar cookies según el consentimiento almacenado
    }

    // Aceptar cookies
    acceptButton.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'accept');
        loadCookies('accept');
        cookieBanner.style.display = 'none';
    });

    // Rechazar cookies
    rejectButton.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'reject');
        loadCookies('reject');
        cookieBanner.style.display = 'none';
    });
});