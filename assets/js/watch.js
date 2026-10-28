import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

onAuthStateChanged(auth, (user) => { if (!user) window.location.href = '../index.html'; });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4'; 

const titleEl = document.getElementById('movie-title');
const playerContainer = document.getElementById('kodik-player');
const controlsPanel = document.getElementById('player-controls-panel');
const translationContainer = document.getElementById('translation-container');
const translationGrid = document.getElementById('translation-grid');

const sourceSelect = document.getElementById('source-select');
const seasonSelect = document.getElementById('season-select');
const episodeSelect = document.getElementById('episode-select');
const seasonGroup = document.getElementById('season-group');
const episodeGroup = document.getElementById('episode-group');

const urlParams = new URLSearchParams(window.location.search);
const tmdbId = urlParams.get('id');
const imdbId = urlParams.get('imdb') || '';
const mediaType = urlParams.get('type');
const movieTitle = urlParams.get('title');

let currentSource = window.innerWidth <= 768 ? 'vidlink' : 'vidsrc';
let currentSeason = 1;
let currentEpisode = 1;
let currentLang = 'ru';

const TRANSLATIONS = [
    { name: 'Русский дубляж', lang: 'ru', flag: '🇷🇺' },
    { name: 'Украинский дубляж', lang: 'uk', flag: '🇺🇦' },
    { name: 'Оригинал (+суб)', lang: 'en', flag: '🇬🇧' }
];

function initTranslations() {
    if (!translationGrid) return;
    translationContainer.style.display = 'block';
    
    TRANSLATIONS.forEach((tr, index) => {
        const btn = document.createElement('button');
        btn.className = 'translation-btn' + (index === 0 ? ' active' : '');
        btn.innerHTML = `
            <span class="flag">${tr.flag}</span>
            <span class="name">${tr.name}</span>
            <svg class="ic check" viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round;"><use href="#i-check"/></svg>
        `;
        btn.onclick = () => {
            document.querySelectorAll('.translation-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLang = tr.lang;
            updatePlayer();
        };
        translationGrid.appendChild(btn);
    });
}

// ЗАГРУЗКА СЕЗОНОВ ИЗ TMDB
async function initSelectors() {
    if (mediaType !== 'tv') return;

    seasonGroup.style.display = 'flex';
    episodeGroup.style.display = 'flex';

    try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = await res.json();

        if (data.seasons && data.seasons.length > 0) {
            const validSeasons = data.seasons.filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
            
            seasonSelect.innerHTML = '';
            validSeasons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.season_number;
                opt.textContent = `Сезон ${s.season_number}`;
                seasonSelect.appendChild(opt);
            });

            if (validSeasons.length > 0) {
                currentSeason = validSeasons[0].season_number;
                await loadEpisodes(currentSeason);
            }
        } else {
            seasonSelect.innerHTML = '<option value="1">Сезон 1</option>';
            await loadEpisodes(1);
        }
    } catch (e) {
        console.error("Ошибка загрузки сезонов:", e);
        seasonSelect.innerHTML = '<option value="1">Сезон 1</option>';
        await loadEpisodes(1);
    }
}

// ЗАГРУЗКА СЕРИЙ ДЛЯ СЕЗОНА
async function loadEpisodes(seasonNum) {
    episodeSelect.innerHTML = '<option>Загрузка...</option>';
    try {
        const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = await res.json();

        episodeSelect.innerHTML = '';
        
        if (data.episodes && data.episodes.length > 0) {
            const sortedEpisodes = data.episodes.sort((a, b) => a.episode_number - b.episode_number);
            
            sortedEpisodes.forEach(ep => {
                const opt = document.createElement('option');
                opt.value = ep.episode_number;
                opt.textContent = `Серия ${ep.episode_number}`;
                episodeSelect.appendChild(opt);
            });
            currentEpisode = sortedEpisodes[0].episode_number;
        } else {
            episodeSelect.innerHTML = '<option value="1">Серия 1</option>';
            currentEpisode = 1;
        }
        updatePlayer(); 
    } catch (e) {
        console.error("Ошибка загрузки серий:", e);
        episodeSelect.innerHTML = '<option value="1">Серия 1</option>';
        currentEpisode = 1;
        updatePlayer();
    }
}

function updatePlayer() {
    if (!tmdbId) return;
    
    const isTv = mediaType === 'tv';
    const s = currentSeason;
    const e = currentEpisode;
    const lang = currentLang;
    let url = '';

    switch (currentSource) {
        case 'vidsrc':
            url = isTv 
                ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${s}&episode=${e}&lang=${lang}` 
                : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}&lang=${lang}`;
            break;
        case '2embed':
            url = isTv 
                ? `https://www.2embed.cc/embedtv/${tmdbId}&s=${s}&e=${e}&lang=${lang}` 
                : `https://www.2embed.cc/embed/${tmdbId}?lang=${lang}`;
            break;
        case 'superembed':
            const embedId = imdbId || tmdbId;
            url = isTv 
                ? `https://multiembed.mov/?video_id=${embedId}&tmdb=1&s=${s}&e=${e}&lang=${lang}`
                : `https://multiembed.mov/?video_id=${embedId}&tmdb=1&lang=${lang}`;
            break;
        case 'vidlink':
            url = isTv 
                ? `https://vidlink.pro/tv/${tmdbId}/${s}/${e}?sub=${lang}`
                : `https://vidlink.pro/movie/${tmdbId}?sub=${lang}`;
            break;
    }

        if (playerContainer) {
        playerContainer.innerHTML = `
            <iframe 
                src="${url}" 
                width="100%" 
                height="100%" 
                frameborder="0" 
                allowfullscreen 
                playsinline 
                allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: auto; touch-action: manipulation; z-index: 10;">
            </iframe>
        `;
    }
}

if (sourceSelect) sourceSelect.addEventListener('change', (e) => { currentSource = e.target.value; updatePlayer(); });
if (seasonSelect) seasonSelect.addEventListener('change', async (e) => { currentSeason = Number(e.target.value); await loadEpisodes(currentSeason); });
if (episodeSelect) episodeSelect.addEventListener('change', (e) => { currentEpisode = Number(e.target.value); updatePlayer(); });

if (tmdbId) {
    if (titleEl) titleEl.textContent = movieTitle;
    if (controlsPanel) controlsPanel.style.display = 'flex';
    
    initTranslations();
    
    if (mediaType === 'tv') {
        initSelectors(); 
    } else {
        updatePlayer(); 
    }

    // Кнопка "Оценить"
    const rateBtn = document.getElementById('watch-rate-btn');
    if (rateBtn) {
        rateBtn.addEventListener('click', () => {
            window.location.href = `rate.html?title=${encodeURIComponent(movieTitle)}`;
        });
    }
} else {
    if (titleEl) titleEl.textContent = "Ошибка: Не передано ID";
}