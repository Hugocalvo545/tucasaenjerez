function loadCookies(consent) {
    if (consent === 'accept') {
        loadAnalyticsCookies();
    }
}

function loadAnalyticsCookies() {
    console.log('Se cargan cookies analíticas');
}

document.addEventListener('DOMContentLoaded', () => {
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptButton = document.getElementById('accept-cookies');
    const rejectButton = document.getElementById('reject-cookies');

    const cookieConsent = localStorage.getItem('cookie-consent');
    if (!cookieConsent) {
        cookieBanner.style.display = 'block';
    } else {
        loadCookies(cookieConsent);
    }

    acceptButton.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'accept');
        loadCookies('accept');
        cookieBanner.style.display = 'none';
    });

    rejectButton.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'reject');
        loadCookies('reject');
        cookieBanner.style.display = 'none';
    });
});
