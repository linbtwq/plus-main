import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

onAuthStateChanged(auth, (user) => { if (!user) window.location.href = '../index.html'; });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const KODIK_TOKEN = '447d179e875efe44217f20d1ee2146be'; 
const KODIK_API = 'https://kodik-api.com';
const MY_PROXY = 'https://white-thunder-adab.lilchwistieyay.workers.dev';

// Умный запрос, который перебирает прокси, если один заблокирован
function fetchKodik(targetUrl) {
    return new Promise((resolve, reject) => {
        const encodedUrl = encodeURIComponent(targetUrl);
        
        // Список прокси (твой воркер, резерв 1, резерв 2)
        const proxies = [
            `${MY_PROXY}?url=${encodedUrl}`,
            `https://api.allorigins.win/raw?url=${encodedUrl}`,
            `https://corsproxy.io/?${encodedUrl}`
        ];
        
        let proxyIndex = 0;

        function tryNextProxy() {
            if (proxyIndex >= proxies.length) {
                return reject(new Error("Все прокси заблокированы (AdBlock/Антивирус). Отключите их для localhost."));
            }

            const proxyUrl = proxies[proxyIndex++];
            console.log(`[Кодик] Пробуем прокси ${proxyIndex}/${proxies.length}...`);

            const xhr = new XMLHttpRequest();
            xhr.open('GET', proxyUrl, true);
            xhr.timeout = 5000; // Ждем 5 секунд

            xhr.onload = function() {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        let text = xhr.responseText;
                        // Особенность allorigins
                        if (proxyUrl.includes('allorigins')) {
                            const wrapper = JSON.parse(text);
                            text = wrapper.contents;
                        }
                        resolve(JSON.parse(text));
                    } catch (e) {
                        reject(new Error("Ошибка чтения ответа"));
                    }
                } else {
                    console.warn(`Прокси ${proxyIndex} ответил: ${xhr.status}`);
                    tryNextProxy(); // Пробуем следующий при ошибке сервера
                }
            };

            xhr.onerror = function() {
                console.warn(`Прокси ${proxyIndex} заблокирован (сетевая ошибка).`);
                tryNextProxy(); // Пробуем следующий
            };

            xhr.ontimeout = function() {
                console.warn(`Прокси ${proxyIndex} завис (таймаут).`);
                tryNextProxy(); // Пробуем следующий
            };

            xhr.send();
        }

        tryNextProxy();
    });
}

const video = document.getElementById('main-video');
const wrapper = document.querySelector('.player-wrapper');
const loader = document.getElementById('video-loader');
const titleEl = document.getElementById('movie-title');

// ==========================================
// ПОИСК И ВОСПРОИЗВЕДЕНИЕ
// ==========================================
async function searchAndPlay(title, originalTitle, imdbId, year, type, shikimoriId) {
    titleEl.textContent = "Поиск фильма...";
    loader.classList.remove('hidden');

    try {
        let url = `${KODIK_API}/get-player?token=${KODIK_TOKEN}`;
        
        if (shikimoriId) url += `&shikimoriID=${shikimoriId}`;
        else if (imdbId && imdbId !== 'undefined' && imdbId !== 'null' && imdbId.trim() !== '') url += `&imdbID=${imdbId}`;
        else {
            url += `&title=${encodeURIComponent(title)}`;
            if (originalTitle) url += `&title_orig=${encodeURIComponent(originalTitle)}`;
            if (year) url += `&year=${year}`;
        }

        url += `&types=${type || 'movie'}`;

        let data = await fetchKodik(url);

        // Если не нашли по ID, пробуем по названию (без ID)
        if ((!data.link || data.found === false) && (shikimoriId || imdbId)) {
            let fallbackUrl = `${KODIK_API}/get-player?token=${KODIK_TOKEN}&title=${encodeURIComponent(title)}&types=${type || 'movie'}`;
            if (originalTitle) fallbackUrl += `&title_orig=${encodeURIComponent(originalTitle)}`;
            if (year) fallbackUrl += `&year=${year}`;
            data = await fetchKodik(fallbackUrl);
        }

        if (data && data.link && data.allowed === 1) {
            let playerLink = data.link;
            if (playerLink.startsWith('//')) playerLink = 'https:' + playerLink;
            wrapper.innerHTML = `<iframe src="${playerLink}" width="100%" height="100%" frameborder="0" allowfullscreen allow="autoplay *; fullscreen *"></iframe>`;
            loader.classList.add('hidden');
            titleEl.textContent = title;
        } else {
            throw new Error("В базе Кодика нет этого фильма (или он платный).");
        }
    } catch (err) {
        console.error("ОШИБКА:", err);
        titleEl.textContent = "Ошибка 😢";
        loader.classList.add('hidden');
        wrapper.innerHTML = `<div style="position:absolute; inset:0; background:rgba(11,22,34,0.9); display:flex; align-items:center; justify-content:center; flex-direction:column; z-index:99; padding: 20px; text-align: center;">
            <h2 style="color:var(--rust); font-family:'Playfair Display';">Увы...</h2>
            <p style="color:var(--paper); margin-top:10px; font-size: 0.9rem;">${err.message}</p>
            <button onclick="window.history.back()" class="btn-retro" style="margin-top:20px;">Вернуться назад</button>
        </div>`;
    }
}

// Запуск при открытии страницы
const urlParams = new URLSearchParams(window.location.search);
const movieTitle = urlParams.get('title');
const movieOriginal = urlParams.get('original');
const movieImdb = urlParams.get('imdb');
const movieYear = urlParams.get('year');
const movieType = urlParams.get('type');
const movieShikimori = urlParams.get('shikimori');

if (movieTitle) {
    searchAndPlay(movieTitle, movieOriginal, movieImdb, movieYear, movieType, movieShikimori);
} else {
    video.src = "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";
    titleEl.textContent = "Тестовое видео";
}