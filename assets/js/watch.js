import { createWatchTracker } from './watch-tracker.js';
import { readCloudSession } from './activity-store.js';
import { createAnimePlayer } from './anime-player.js';
import { readWatchHistory,saveWatchProgress } from './watch-history.js';
import { playerUrl, resolvePlayerImdb, validImdb } from './player-sources.js';
import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

onAuthStateChanged(auth, (user) => { if (!user) window.location.href = '../index.html'; else startWatching(user); });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

import { validId } from './shared.js';

const titleEl = document.getElementById('movie-title');
const playerContainer = document.getElementById('kodik-player');
const controlsPanel = document.getElementById('player-controls-panel');
const translationContainer = document.getElementById('translation-container');

const sourceSelect = document.getElementById('source-select');

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
let savedProgress=null,watchUser=null,animeProgress={},tracker=null;
sourceSelect.value = currentSource;
const playerStatus = document.getElementById('player-status');
const audioHint = document.getElementById('audio-hint');

const anime=createAnimePlayer({container:playerContainer,panel:document.getElementById('anime-panel'),status:playerStatus,onPlayback:data=>{tracker?.sample(data);updateWatchStatus();},onProgress:data=>{animeProgress=data;rememberProgress();}});
function rememberProgress(){if(watchUser&&tmdbId&&mediaType)saveWatchProgress(watchUser.uid,{tmdbId,mediaType,title:movieTitle,source:currentSource,season:currentSeason,episode:currentEpisode,...(currentSource==='aniliberty'?animeProgress:{})});}

function updateAudioHint() {
    translationContainer.style.display = 'block';
    audioHint.textContent = currentSource === 'aniliberty' ? 'Русская озвучка AniLiberty. Выбери точный релиз и серию ниже. Другие студии могут быть доступны в меню озвучки Collaps.' : currentSource === 'collaps'
        ? `${mediaType === 'tv' ? 'Сезон и серию выбирай прямо внутри плеера. ' : ''}В меню озвучки выбери «Рус. Дублированный» или нужную студию. Набор дорожек зависит от фильма и серии.`
        : `${mediaType === 'tv' ? 'Сезон и серию выбирай внутри плеера. ' : ''}Аудиодорожки тоже выбираются в его меню. Набор дорожек зависит от источника.`;
}

async function updatePlayer() {
    if (!tmdbId || !mediaType) return;
    const request = ++playerRequest;
    const source = currentSource;
    const season = currentSeason, episode = currentEpisode;
    updateAudioHint();
    tracker?.start(source,currentSeason,currentEpisode);updateWatchStatus();
    if(source==='aniliberty'){playerContainer.setAttribute('aria-busy','false');const resume=savedProgress?.source==='aniliberty'?savedProgress:anime.getProgress()||(animeProgress.animeRelease?animeProgress:null);await anime.open(movieTitle,resume);if(request!==playerRequest)return;savedProgress=null;rememberProgress();return;}
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
        let url = playerUrl(source, { tmdbId, imdbId, mediaType, season, episode });
        if(source==='vidlink'&&savedProgress?.source===source&&!savedProgress.completed&&Number.isFinite(savedProgress.position)&&savedProgress.position>0){const resumed=new URL(url);resumed.searchParams.set('startAt',Math.floor(savedProgress.position));url=resumed.href;}
        savedProgress=null;
        // Параметры проходят проверку и не интерпретируются как HTML.
        const iframe = document.createElement('iframe');
        iframe.src = url;
        iframe.title = `${movieTitle} — ${source === 'collaps' ? 'выбор русской озвучки' : 'плеер'}`;
        iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:0;';
        iframe.addEventListener('load', () => {
            if (request !== playerRequest) return;
            playerContainer.setAttribute('aria-busy', 'false');
            // Загрузка iframe не подтверждает доступность самого видео на чужом сервере.
            playerStatus.textContent = 'Источник открыт. Если внутри появилась ошибка, нажми «Другой источник».';
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

document.getElementById('next-player-source').addEventListener('click', () => {
    // Аниме выбирается отдельно: каталог релизов не заменяет обычный видеосервер.
    const sources = [...sourceSelect.options].filter(option => option.value !== 'aniliberty' && !option.disabled);
    const index = sources.findIndex(option => option.value === currentSource);
    sourceSelect.value = sources[(index + 1) % sources.length].value;
    sourceSelect.dispatchEvent(new Event('change'));
});

if (sourceSelect) sourceSelect.addEventListener('change', (e) => { if(currentSource==='aniliberty'){animeProgress=anime.getProgress()||animeProgress;rememberProgress();}currentSource = e.target.value;updatePlayer(); });

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

async function startWatching(user){
    if(watchUser?.uid===user.uid)return;watchUser=user;
    if(!tmdbId||!mediaType)return;
    tracker=createWatchTracker(user.uid,{tmdbId:Number(tmdbId),mediaType,title:movieTitle},text=>{document.getElementById('watch-history-status').textContent=text;});
    const cloudId=urlParams.get('session');
    if(cloudId){
        try{const entry=await readCloudSession(user.uid,cloudId);if(entry&&String(entry.tmdbId)===tmdbId&&entry.mediaType===mediaType)savedProgress={...entry,animeEpisode:entry.episode};}catch{document.getElementById('watch-history-status').textContent='Не удалось загрузить облачную позицию. Можно продолжить вручную.';}
    }else savedProgress=urlParams.get('resume')==='1'?readWatchHistory(user.uid).find(m=>String(m.tmdbId)===String(tmdbId)&&m.mediaType===mediaType):null;
    if(savedProgress){currentSource=savedProgress.source;currentSeason=savedProgress.season;currentEpisode=savedProgress.episode;sourceSelect.value=currentSource;animeProgress=savedProgress;}
    updateAudioHint();updatePlayer();
}
function updateWatchStatus(){
    const button=document.getElementById('watch-complete');if(!button)return;
    button.disabled=!tracker||tracker.isComplete();button.textContent=tracker?.isComplete()?'✓ Просмотр записан':'Отметить просмотренным';
    document.getElementById('watch-tracking-note').textContent=['aniliberty','vidlink'].includes(currentSource)?'Время учитывается, когда плеер передаёт события воспроизведения. Завершение можно отметить вручную.':'Этот источник не передаёт время просмотра. Отметь досмотр вручную; часы за открытый плеер не начисляются.';
}
document.getElementById('watch-complete').addEventListener('click',async event=>{
    event.currentTarget.disabled=true;
    try{await tracker?.complete();}finally{updateWatchStatus();}
});
// Принимаем события только от текущего iframe и документированного источника.
window.addEventListener('message',event=>{
    const iframe=playerContainer.querySelector('iframe');
    if(currentSource!=='vidlink'||event.origin!=='https://vidlink.pro'||event.source!==iframe?.contentWindow||event.data?.type!=='PLAYER_EVENT')return;
    const data=event.data.data;
    if(!data||!['play','pause','timeupdate','seeked','ended'].includes(data.event))return;
    if(String(data.mtmdbId??data.tmdbId)!==tmdbId||data.mediaType!==mediaType)return;
    tracker?.sample({position:data.currentTime,duration:data.duration,playing:['play','timeupdate'].includes(data.event),seeking:data.event==='seeked',ended:data.event==='ended',season:data.season,episode:data.episode});
    if(Number.isSafeInteger(data.season)&&data.season>0)currentSeason=data.season;
    if(Number.isSafeInteger(data.episode)&&data.episode>0)currentEpisode=data.episode;
    rememberProgress();updateWatchStatus();
});
window.addEventListener('pagehide',()=>tracker?.flush());
window.addEventListener('online',()=>tracker?.flush());
