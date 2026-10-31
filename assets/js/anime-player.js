import { fetchJson } from './shared.js';
const API='https://aniliberty.top/api/v1/';
export function safeAnimeStream(value){try{const url=new URL(value);return url.protocol==='https:'&&(url.hostname==='libria.fun'||url.hostname.endsWith('.libria.fun')||url.hostname==='aniliberty.top'||url.hostname.endsWith('.aniliberty.top')||url.hostname==='anilibria.top'||url.hostname.endsWith('.anilibria.top'))&&url.pathname.endsWith('.m3u8')?url.href:'';}catch{return '';}}
export async function searchAnime(query){const data=await fetchJson(`${API}app/search/releases?${new URLSearchParams({query})}`);return Array.isArray(data)?data.filter(m=>Number.isSafeInteger(m.id)&&m.id>0):[];}
export async function getAnimeRelease(id){if(!Number.isSafeInteger(Number(id))||Number(id)<=0)throw new Error('Неверный выпуск');return fetchJson(`${API}anime/releases/${id}`);}
let hlsLibrary;
async function loadHls(){if(window.Hls)return window.Hls;hlsLibrary||=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../vendor/hls.light.min.js',import.meta.url).href;script.onload=()=>resolve(window.Hls);script.onerror=()=>{hlsLibrary=null;reject(new Error('Не удалось загрузить видеоплеер'));};document.head.append(script);});return hlsLibrary;}
export function createAnimePlayer({container,panel,status,onProgress}){
    let hls,video,release,version=0,active=false,searchVersion=0,resume=null,lastSaved=0;
    const search=document.getElementById('anime-query'),results=document.getElementById('anime-results'),episodes=document.getElementById('anime-episode'),quality=document.getElementById('anime-quality');
    function stop(){version++;if(video){video.pause();video.removeAttribute('src');video.load();video=null;}hls?.destroy();hls=null;}
    async function play(){
        stop();const request=version;
        const episode=release?.episodes?.find(ep=>String(ep.ordinal)===episodes.value);if(!episode)return;
        const stream=safeAnimeStream(episode[`hls_${quality.value}`]);
        if(!stream){status.textContent='Эта серия недоступна в выбранном качестве.';return;}
        video=document.createElement('video');const current=video;current.controls=true;current.playsInline=true;current.preload='metadata';current.className='anime-video';container.replaceChildren(current);status.textContent='Загружаем серию в озвучке AniLiberty…';
        const progress=()=>{if(request!==version)return;onProgress({animeRelease:release.id,animeEpisode:episode.ordinal,quality:quality.value,position:Number.isFinite(current.currentTime)?Math.floor(current.currentTime):0});};
        current.addEventListener('loadedmetadata',()=>{if(request!==version)return;if(resume&&Number(resume.animeRelease)===release.id&&Number(resume.animeEpisode)===episode.ordinal&&Number.isFinite(resume.position)&&resume.position>0&&resume.position<current.duration-10)current.currentTime=resume.position;resume=null;progress();status.textContent='Озвучка AniLiberty. Позиция сохраняется в этом браузере.';});
        current.addEventListener('timeupdate',()=>{if(Date.now()-lastSaved>5000){lastSaved=Date.now();progress();}});current.addEventListener('pause',progress);current.addEventListener('seeked',progress);current.addEventListener('error',()=>{if(request===version)status.textContent='Не удалось воспроизвести серию. Попробуй другое качество или источник.';});
        const skip=document.getElementById('anime-skip-opening');const opening=episode.opening;skip.hidden=!(Number.isFinite(opening?.start)&&Number.isFinite(opening?.stop)&&opening.stop>opening.start);skip.onclick=()=>{if(current.currentTime>=opening.start&&current.currentTime<opening.stop)current.currentTime=opening.stop;};
        current.addEventListener('timeupdate',()=>{skip.disabled=!(opening&&current.currentTime>=opening.start&&current.currentTime<opening.stop);});
        try{
            const Hls=await loadHls();if(request!==version)return;
            // HLS.js обходит неполную нативную поддержку HLS в Chromium.
            if(Hls?.isSupported()){
                hls=new Hls();hls.loadSource(stream);hls.attachMedia(current);
                hls.on(Hls.Events.ERROR,(_,data)=>{if(data.fatal&&request===version)status.textContent='Поток недоступен. Попробуй другое качество или источник.';});
            }else if(current.canPlayType('application/vnd.apple.mpegurl'))current.src=stream;
            else status.textContent='Браузер не поддерживает этот поток. Выбери другой источник.';
        }catch{
            if(request!==version)return;
            if(current.canPlayType('application/vnd.apple.mpegurl'))current.src=stream;
            else status.textContent='Не удалось загрузить видеоплеер. Попробуй снова.';
        }
    }
    function updateQuality(){const episode=release?.episodes?.find(ep=>String(ep.ordinal)===episodes.value);const old=quality.value;quality.replaceChildren();for(const q of ['1080','720','480'])if(safeAnimeStream(episode?.[`hls_${q}`]))quality.append(new Option(`${q}p`,q));if(Array.from(quality.options).some(o=>o.value===old))quality.value=old;}
    async function selectRelease(id,saved=null){
        stop();const request=version;status.textContent='Загружаем эпизоды AniLiberty…';
        try{const data=await getAnimeRelease(id);if(!active||request!==version)return;if(data.is_blocked_by_geo||data.is_blocked_by_copyrights)throw new Error('Релиз недоступен в твоём регионе или ограничен правообладателем.');release=data;resume=saved;document.getElementById('anime-release-title').textContent=data.name?.main||'Релиз';episodes.replaceChildren();for(const ep of [...(data.episodes||[])].sort((a,b)=>a.ordinal-b.ordinal))if(['480','720','1080'].some(q=>safeAnimeStream(ep[`hls_${q}`])))episodes.append(new Option(`Серия ${ep.ordinal}${ep.name?' · '+ep.name:''}`,ep.ordinal));if(!episodes.options.length)throw new Error('У релиза пока нет доступных эпизодов.');if(saved&&Array.from(episodes.options).some(o=>Number(o.value)===Number(saved.animeEpisode)))episodes.value=String(saved.animeEpisode);updateQuality();if(saved&&Array.from(quality.options).some(o=>o.value===saved.quality))quality.value=saved.quality;await play();}catch(error){if(request===version)status.textContent=error.message||'Не удалось загрузить релиз.';}
    }
    document.getElementById('anime-search-form').addEventListener('submit',async event=>{event.preventDefault();const query=search.value.trim();if(query.length<2)return;const request=++searchVersion;results.replaceChildren();status.textContent='Ищем аниме в AniLiberty…';try{const items=await searchAnime(query);if(request!==searchVersion||!active)return;status.textContent=items.length?'Выбери точный сезон или фильм из результатов.':'Не найдено. Попробуй оригинальное название или другой источник.';for(const item of items){const button=document.createElement('button');button.type='button';button.className='anime-result';button.textContent=`${item.name?.main||item.name?.english||'Без названия'} · ${item.year||''} · ${item.type?.description||''}`;button.addEventListener('click',()=>selectRelease(item.id));results.append(button);}}catch{if(request===searchVersion&&active)status.textContent='Не удалось получить каталог AniLiberty. Попробуй позже или выбери другой источник.';}});
    episodes.addEventListener('change',()=>{updateQuality();play();});quality.addEventListener('change',()=>{if(video)resume={animeRelease:release.id,animeEpisode:Number(episodes.value),position:video.currentTime};play();});
    window.addEventListener('pagehide',()=>{if(video)onProgress({animeRelease:release?.id,animeEpisode:Number(episodes.value),quality:quality.value,position:Math.floor(video.currentTime||0)});});
    return {getProgress(){return video&&release?{animeRelease:release.id,animeEpisode:Number(episodes.value),quality:quality.value,position:Math.floor(video.currentTime||0)}:null;},async open(title,saved){active=true;panel.hidden=false;search.value=title;if(saved?.animeRelease)await selectRelease(saved.animeRelease,saved);else{status.textContent='Найди аниме и выбери нужный сезон. Озвучка этого источника — AniLiberty.';container.replaceChildren();}},close(){active=false;searchVersion++;stop();panel.hidden=true;}};
}
