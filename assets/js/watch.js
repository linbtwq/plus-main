import { createAnimePlayer } from './anime-player.js';
import { readWatchHistory,saveWatchProgress } from './watch-history.js';
import { playerUrl, resolvePlayerImdb, validImdb } from './player-sources.js';
import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

onAuthStateChanged(auth, (user) => { if (!user) window.location.href = '../index.html'; else startWatching(user); });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

import { TMDB_API_KEY, validId, fetchJson } from './shared.js';

const titleEl = document.getElementById('movie-title');
const playerContainer = document.getElementById('kodik-player');
const controlsPanel = document.getElementById('player-controls-panel');
const translationContainer = document.getElementById('translation-container');

const sourceSelect = document.getElementById('source-select');
const seasonSelect = document.getElementById('season-select');
const episodeSelect = document.getElementById('episode-select');
const seasonGroup = document.getElementById('season-group');
const episodeGroup = document.getElementById('episode-group');

const urlParams = new URLSearchParams(window.location.search);
const rawId = urlParams.get('id');
const tmdbId = validId(rawId) ? rawId : null;
let imdbId = validImdb(urlParams.get('imdb')) ? urlParams.get('imdb') : '';
let imdbLookup = null, playerRequest = 0;
const mediaType = ['movie', 'tv'].includes(urlParams.get('type')) ? urlParams.get('type') : null;
const movieTitle = urlParams.get('title') || 'Без названия';

let currentSource = 'collaps';
let currentSeason = 1;
let currentEpisode = 1;
let episodeRequest = 0;
let savedProgress=null,watchUser=null,animeProgress={};
sourceSelect.value = currentSource;
const playerStatus = document.getElementById('player-status');
const audioHint = document.getElementById('audio-hint');

const anime=createAnimePlayer({container:playerContainer,panel:document.getElementById('anime-panel'),status:playerStatus,onProgress:data=>{animeProgress=data;rememberProgress();}});
function rememberProgress(){if(watchUser&&tmdbId&&mediaType)saveWatchProgress(watchUser.uid,{tmdbId,mediaType,title:movieTitle,source:currentSource,season:currentSeason,episode:currentEpisode,...(currentSource==='aniliberty'?animeProgress:{})});}

function updateAudioHint() {
    translationContainer.style.display = 'block';
    audioHint.textContent = currentSource === 'aniliberty' ? 'Русская озвучка AniLiberty. Выбери точный релиз и серию ниже. Другие студии могут быть доступны в меню озвучки Collaps.' : currentSource === 'collaps'
        ? 'Открой меню озвучки внутри плеера и выбери «Рус. Дублированный» или нужную студию. Набор дорожек зависит от фильма и серии.'
        : 'Аудиодорожки выбираются внутри плеера. Если русской озвучки нет, переключись на «Collaps — русские озвучки».';
}

// Загружаем сезоны из TMDB
async function initSelectors() {
    if (mediaType !== 'tv') return;

    seasonGroup.style.display = 'flex';
    episodeGroup.style.display = 'flex';

    try {
        const res = await fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = res;

        if (data.seasons && data.seasons.length > 0) {
            const validSeasons = data.seasons.filter(s => s.season_number > 0).sort((a, b) => a.season_number - b.season_number);
            
            seasonSelect.innerHTML = '';
            if (!validSeasons.length) validSeasons.push({ season_number: 1 });
            validSeasons.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.season_number;
                opt.textContent = `Сезон ${s.season_number}`;
                seasonSelect.appendChild(opt);
            });

            if (validSeasons.length > 0) {
                currentSeason = validSeasons.some(s=>s.season_number===savedProgress?.season)?savedProgress.season:validSeasons[0].season_number;
                seasonSelect.value=String(currentSeason);
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

// Загружаем серии выбранного сезона
async function loadEpisodes(seasonNum) {
    const request = ++episodeRequest;
    episodeSelect.disabled = true;
    episodeSelect.innerHTML = '<option>Загрузка...</option>';
    try {
        const res = await fetchJson(`https://api.themoviedb.org/3/tv/${tmdbId}/season/${seasonNum}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = res;

        if (request !== episodeRequest) return;
        episodeSelect.innerHTML = '';
        
        if (data.episodes && data.episodes.length > 0) {
            const sortedEpisodes = data.episodes.sort((a, b) => a.episode_number - b.episode_number);
            
            sortedEpisodes.forEach(ep => {
                const opt = document.createElement('option');
                opt.value = ep.episode_number;
                opt.textContent = `Серия ${ep.episode_number}`;
                episodeSelect.appendChild(opt);
            });
            currentEpisode = savedProgress?.season===seasonNum&&sortedEpisodes.some(e=>e.episode_number===savedProgress.episode)?savedProgress.episode:sortedEpisodes[0].episode_number;
            episodeSelect.value=String(currentEpisode);
        } else {
            episodeSelect.innerHTML = '<option value="1">Серия 1</option>';
            currentEpisode = 1;
        }
        episodeSelect.disabled = false;
        updatePlayer(); 
    } catch (e) {
        if (request !== episodeRequest) return;
        episodeSelect.disabled = false;
        console.error("Ошибка загрузки серий:", e);
        episodeSelect.innerHTML = '<option value="1">Серия 1</option>';
        currentEpisode = 1;
        updatePlayer();
    }
}

async function updatePlayer() {
    if (!tmdbId || !mediaType) return;
    const request = ++playerRequest;
    const source = currentSource;
    const season = currentSeason, episode = currentEpisode;
    updateAudioHint();
    seasonGroup.style.display=episodeGroup.style.display=mediaType==='tv'&&source!=='aniliberty'?'flex':'none';
    if(source==='aniliberty'){playerContainer.setAttribute('aria-busy','false');const resume=savedProgress?.source==='aniliberty'?savedProgress:anime.getProgress()||(animeProgress.animeRelease?animeProgress:null);await anime.open(movieTitle,resume);savedProgress=null;rememberProgress();return;}
    anime.close();
    rememberProgress();
    playerStatus.textContent = source === 'collaps' ? 'Подключаем источник с русскими озвучками…' : 'Подключаем плеер…';
    playerContainer.replaceChildren();
    playerContainer.setAttribute('aria-busy', 'true');
    try {
        if (source === 'collaps' && !imdbId) {
            imdbLookup ||= resolvePlayerImdb(tmdbId, mediaType).catch(error => { imdbLookup = null; throw error; });
            imdbId = await imdbLookup;
        }
        if (request !== playerRequest) return;
        const url = playerUrl(source, { tmdbId, imdbId, mediaType, season, episode });
        // Параметры проходят проверку и не интерпретируются как HTML.
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.title = `${movieTitle} — ${source === 'collaps' ? 'выбор русской озвучки' : 'плеер'}`;
        iframe.allowFullscreen = true;
        iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
        iframe.addEventListener('load', () => {
            if (request !== playerRequest) return;
            playerContainer.setAttribute('aria-busy', 'false');
            playerStatus.textContent = 'Если видео недоступно, перезапусти плеер или выбери другой источник.';
        });
        playerContainer.replaceChildren(iframe);
    } catch (error) {
        if (request !== playerRequest) return;
        playerContainer.setAttribute('aria-busy', 'false');
        playerStatus.textContent = source === 'collaps' && !imdbId
            ? 'Не удалось определить IMDb ID для русского плеера. Перезапусти его или выбери другой источник.'
            : 'Не удалось открыть плеер. Попробуй другой источник.';
        const placeholder = document.createElement('p');
        placeholder.className = 'player-empty'; placeholder.textContent = 'Источник пока недоступен';
        playerContainer.appendChild(placeholder);
        console.error('Ошибка подключения плеера:', error);
    }
}
document.getElementById('reload-player').addEventListener('click', () => {
    if (!imdbId) imdbLookup = null;
    updatePlayer();
});

if (sourceSelect) sourceSelect.addEventListener('change', (e) => { if(currentSource==='aniliberty'){animeProgress=anime.getProgress()||animeProgress;rememberProgress();}currentSource = e.target.value;if(currentSource!=='aniliberty'&&mediaType==='tv'&&!seasonSelect.options.length)initSelectors();else updatePlayer(); });
if (seasonSelect) seasonSelect.addEventListener('change', async (e) => { playerRequest++; currentSeason = Number(e.target.value); await loadEpisodes(currentSeason); });
if (episodeSelect) episodeSelect.addEventListener('change', (e) => { currentEpisode = Number(e.target.value); updatePlayer(); });

if (tmdbId && mediaType) {
    if (titleEl) titleEl.textContent = movieTitle;
    if (controlsPanel) controlsPanel.style.display = 'flex';
    
    // Кнопка "Оценить"
    const rateBtn = document.getElementById('watch-rate-btn');
    if (rateBtn) {
        rateBtn.addEventListener('click', () => {
            window.location.href = `rate.html?${new URLSearchParams({ title: movieTitle, id: tmdbId, type: mediaType })}`;
        });
    }
} else {
    if (titleEl) titleEl.textContent = "Ошибка: неверный идентификатор или тип тайтла";
}

function startWatching(user){
    if(watchUser?.uid===user.uid)return;watchUser=user;
    if(!tmdbId||!mediaType)return;
    savedProgress=urlParams.get('resume')==='1'?readWatchHistory(user.uid).find(m=>String(m.tmdbId)===String(tmdbId)&&m.mediaType===mediaType):null;
    if(savedProgress){currentSource=savedProgress.source;currentSeason=savedProgress.season;currentEpisode=savedProgress.episode;sourceSelect.value=currentSource;animeProgress=savedProgress;}
    updateAudioHint();
    if(currentSource==='aniliberty')updatePlayer();
    else if(mediaType==='tv')initSelectors();else updatePlayer();
}
