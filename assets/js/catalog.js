import { findRating } from './rating-match.js';
import { posterSkeletons,emptyState } from './ui-states.js';
import { getPlans, togglePlan, readAll, mediaKey } from './library-store.js';
import { db, collection, query, where, getDocs } from './firebase-init.js';
import { buildDiscoverUrl, hasCatalogFilters, FILTER_DEFAULTS } from './catalog-filters.js';
import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

import { loadRoulette, saveRoulette } from './roulette-store.js';
import { TMDB_API_KEY, escapeHtml, posterUrl, fetchJson, watchUrl, trailerUrl } from './shared.js';
const GENRE_MAP = { 28: "Боевик", 12: "Приключения", 16: "Мультфильм", 35: "Комедия", 80: "Криминал", 99: "Документальный", 18: "Драма", 10751: "Семейный", 14: "Фэнтези", 36: "История", 27: "Ужасы", 10402: "Музыка", 9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика", 10770: "ТВ фильм", 53: "Триллер", 10752: "Военный", 37: "Вестерн", 10759: "Боевик/Прикл.", 10762: "Детский", 10763: "Новости", 10764: "Реалити", 10765: "Фантастика/Фэнтези", 10766: "Мыльная опера", 10767: "Ток-шоу", 10768: "Война/Политика" };

onAuthStateChanged(auth, (user) => { if (user) { loadCatalog(); loadPersonalLibrary(user.uid); } else { window.location.href = '../index.html'; } });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const catalogGrid = document.getElementById('catalog-grid');
const trailerModal = document.getElementById('trailer-modal');
const trailerIframe = document.getElementById('trailer-iframe');
const detailModal = document.getElementById('detail-modal');
const toast = document.getElementById('toast');
const loadMoreBtn = document.getElementById('load-more-btn');
const filterBtns = document.querySelectorAll('.cat-filter-btn');

document.getElementById('close-trailer')?.addEventListener('click', () => { 
    if (trailerModal) trailerModal.classList.add('hidden'); 
    if (trailerIframe) trailerIframe.src = ''; 
});
document.getElementById('close-detail')?.addEventListener('click', () => { 
    detailRequest++;
    if (detailModal) detailModal.classList.add('hidden'); 
});

let currentPage = 1, currentFilter = 'trending', browsingFilter='trending', isLoading = false;
let catalogController, catalogRequest = 0, detailRequest = 0, searchQuery = '';
let appliedFilters = {...FILTER_DEFAULTS};
const filterForm = document.getElementById('catalog-filter-form');

function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg; toast.classList.remove('hidden'); toast.classList.add('show');
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.classList.add('hidden'), 300); }, 2500);
}

function getEndpoint(type, page) {
    if (type === 'trending') return `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=ru-RU&page=${page}`;
    if (type === 'movie') return `https://api.themoviedb.org/3/movie/popular?api_key=${TMDB_API_KEY}&language=ru-RU&page=${page}`;
    if (type === 'tv') return `https://api.themoviedb.org/3/tv/popular?api_key=${TMDB_API_KEY}&language=ru-RU&page=${page}`;
    if (type === 'anime') return `https://api.themoviedb.org/3/discover/tv?api_key=${TMDB_API_KEY}&with_genres=16&with_original_language=ja&sort_by=popularity.desc&language=ru-RU&page=${page}`;
    return `https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}&language=ru-RU&page=${page}`;
}

// Каждый ответ относится к конкретному фильтру и странице.
async function loadCatalog(isLoadMore = false) {
    if (isLoadMore && isLoading) return;
    catalogController?.abort();
    catalogController = new AbortController();
    const request = ++catalogRequest;
    const filter = currentFilter;
    const page = isLoadMore ? currentPage : 1;
    const query = searchQuery;
    isLoading = true;
    if (!isLoadMore) { posterSkeletons(catalogGrid,8); document.getElementById('catalog-spotlight').hidden = true; }
    loadMoreBtn.disabled = true;
    try {
        const url = filter === 'search'
            ? `https://api.themoviedb.org/3/search/multi?${new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ru-RU', query, page })}`
            : hasCatalogFilters(appliedFilters) ? buildDiscoverUrl(filter, appliedFilters, page) : getEndpoint(filter, page);
        const data = await fetchJson(url, { signal: catalogController.signal });
        if (request !== catalogRequest) return;
        if (!Array.isArray(data.results)) throw new Error('Неверный ответ каталога');
        if (!isLoadMore) { catalogGrid.replaceChildren(); renderSpotlight(filter === 'trending' && !hasCatalogFilters(appliedFilters) ? data.results.find(item => ['movie','tv'].includes(item.media_type) && item.backdrop_path) : null); }
        data.results.filter(item => !item.media_type || ['movie', 'tv'].includes(item.media_type))
            .forEach(item => renderCatalogCard(item, hasCatalogFilters(appliedFilters) && !['tv','anime','search'].includes(filter) ? 'movie' : filter));
        if (!catalogGrid.children.length) emptyState(catalogGrid,'Ничего не нашлось','Попробуй другой запрос или смягчи фильтры.',{label:'Сбросить подбор',run:()=>{filterForm.reset();appliedFilters={...FILTER_DEFAULTS};searchInput.value='';searchQuery='';currentFilter=browsingFilter='trending';filterBtns.forEach(b=>b.classList.toggle('active',b.dataset.type==='trending'));updateFilterAvailability();loadCatalog();}});
        document.getElementById('catalog-results-summary').textContent = data.total_results ? `Найдено: ${data.total_results.toLocaleString('ru-RU')}` : '';
        currentPage = page + 1;
        loadMoreBtn.style.display = page < Math.min(data.total_pages || 1, 500) ? 'block' : 'none';
    } catch (e) {
        const error = e;
        if (request !== catalogRequest || error.name === 'AbortError') return;
        if (!isLoadMore) emptyState(catalogGrid,'Каталог не загрузился','Проверь соединение и повтори попытку.',{label:'Повторить',run:()=>loadCatalog()});
        else showToast('Не удалось загрузить следующую страницу');
    } finally {
        if (request === catalogRequest) { catalogGrid.setAttribute('aria-busy','false');isLoading = false; loadMoreBtn.disabled = false; loadMoreBtn.textContent = 'ЗАГРУЗИТЬ ЕЩЁ'; }
    }
}

if (filterBtns.length > 0) {
    filterBtns.forEach(btn => { btn.addEventListener('click', () => { filterBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); clearTimeout(searchTimer); searchInput.value = ''; searchQuery = ''; currentFilter = browsingFilter = btn.getAttribute('data-type'); updateFilterAvailability(); loadCatalog(); }); });
}

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadCatalog(true));
}

// Большой кадр берётся из актуального каталога, без выдуманных подборок.
function renderSpotlight(movie) {
    const section = document.getElementById('catalog-spotlight');
    section.hidden = !movie;
    if (!movie) return;
    document.getElementById('spotlight-backdrop').style.backgroundImage = `url("${posterUrl(`https://image.tmdb.org/t/p/w1280${movie.backdrop_path}`)}")`;
    document.getElementById('spotlight-title').textContent = movie.title || movie.name;
    document.getElementById('spotlight-open').textContent = movie.media_type === 'tv' ? 'Открыть сериал ↗' : 'Открыть фильм ↗';
    document.getElementById('spotlight-overview').textContent = movie.overview || '';
    document.getElementById('spotlight-open').onclick = () => openDetailModal(movie.id, movie.media_type);
}

function renderCatalogCard(m, filter = currentFilter) {
    if (!catalogGrid) return;

    const title = m.title || m.name;
    const mediaType = m.media_type || (filter === 'movie' ? 'movie' : 'tv');
    const poster = posterUrl(`https://image.tmdb.org/t/p/w300${m.poster_path}`);
    const genres = m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ') : 'Жанр неизвестен';

    const card = document.createElement('div');
    card.className = 'catalog-card';

    card.innerHTML = `
        <div class="cat-poster-wrapper">
            <img src="${escapeHtml(poster)}" class="cat-poster" loading="lazy" alt="${escapeHtml(title)}">
            <span class="cat-play-mark" aria-hidden="true">▶</span>
        </div>
        <div class="cat-info"><div class="cat-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div><div class="cat-genres">${escapeHtml(genres)}</div></div>
    `;

    const wrapper = card.querySelector('.cat-poster-wrapper');
    const detailsButton=document.createElement('button');detailsButton.type='button';detailsButton.className='cat-details-trigger';detailsButton.setAttribute('aria-label',`Подробнее: ${title}`);wrapper.append(detailsButton);
    const planButton=document.createElement('button');planButton.type='button';planButton.className='cat-plan-toggle';planButton.setAttribute('aria-label',`В планы: ${title}`);planButton.textContent='♡';
    planButton.addEventListener('click',async event=>{
        event.stopPropagation();if(planButton.disabled)return;planButton.disabled=true;
        try{await personalPromise;const added=await togglePlan(auth.currentUser.uid,{...m,mediaType,genresText:genres});if(added)personalPlans.add(mediaKey(m.id,mediaType));else personalPlans.delete(mediaKey(m.id,mediaType));document.querySelectorAll('.catalog-card').forEach(decorateCard);}catch{showToast('Не удалось изменить планы. Попробуй ещё раз.');}finally{planButton.disabled=false;}
    });wrapper.append(planButton);
    let rect = null;
    let rafId = null;

    card.addEventListener('mouseenter', () => { rect = wrapper.getBoundingClientRect(); });

    card.addEventListener('mousemove', (e) => {
            if(!matchMedia('(hover: hover) and (pointer: fine)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches||card.closest('.archive-list'))return;
        if (!wrapper || !rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            wrapper.style.transform = `perspective(1000px) rotateX(${((y - rect.height/2)/(rect.height/2)) * -2}deg) rotateY(${((x - rect.width/2)/(rect.width/2)) * 2}deg) scale3d(1.01, 1.01, 1.01)`;
        });
    });

    card.addEventListener('mouseleave', () => { 
        rect = null;
        if (rafId) cancelAnimationFrame(rafId);
        if (wrapper) wrapper.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; 
    });
    
    card.addEventListener('click', () => openDetailModal(m.id, mediaType));
    card.dataset.mediaKey=mediaKey(m.id,mediaType);
    const meta=document.createElement('div');meta.className='catalog-card-meta';meta.textContent=[(m.release_date||m.first_air_date||'').slice(0,4),mediaType==='tv'?'Сериал':'Фильм'].filter(Boolean).join(' · ');card.querySelector('.cat-info').append(meta);
    decorateCard(card);
    catalogGrid.appendChild(card);
}

async function openDetailModal(id, mediaType) {
    if (!detailModal) return;
    
    const request = ++detailRequest;
    document.getElementById('detail-own-rating').textContent='Проверяем твою оценку…';
    document.getElementById('detail-friend-ratings').replaceChildren();
    document.getElementById('detail-plan-btn').disabled=true;
    document.getElementById('detail-rate-btn').href=`rate.html?${new URLSearchParams({id,type:mediaType})}`;
    detailModal.classList.remove('hidden');
    ['detail-play-btn', 'detail-add-btn', 'detail-watch-btn'].forEach(id => document.getElementById(id).disabled = true);
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = 'Загрузка...';
    
    try {
        const res = await fetchJson(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = res;
        if (request !== detailRequest) return;
        const title = data.title || data.name;
        
        const backdrop = document.getElementById('detail-backdrop');
        if (backdrop) backdrop.style.backgroundImage = data.backdrop_path ? `url(https://image.tmdb.org/t/p/original${data.backdrop_path})` : 'none';
        
        const poster = document.getElementById('detail-poster');
        if (poster) poster.src = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
        
        if (titleEl) titleEl.textContent = title;
        
        
        const yearEl = document.getElementById('detail-year');
        if (yearEl) yearEl.textContent = (data.release_date || data.first_air_date || '').split('-')[0];
        
        const runtimeEl = document.getElementById('detail-runtime');
        if (runtimeEl) runtimeEl.textContent = data.runtime ? `${data.runtime} мин` : (data.number_of_seasons ? `${data.number_of_seasons} сез.` : '');
        
        const genresEl = document.getElementById('detail-genres');
        if (genresEl) genresEl.textContent = data.genres ? data.genres.map(g => g.name).join(', ') : '';
        
        const overviewEl = document.getElementById('detail-overview');
        if (overviewEl) overviewEl.textContent = data.overview || 'Описание отсутствует.';
        
        document.getElementById('detail-play-btn').onclick = () => playTrailer(id, mediaType);
        document.getElementById('detail-add-btn').onclick = () => addToRoulette(title);
        
        document.getElementById('detail-watch-btn').onclick = () => {
            window.location.href = watchUrl(id, mediaType, title, data.imdb_id || '');
        };
        ['detail-play-btn', 'detail-add-btn', 'detail-watch-btn'].forEach(id => document.getElementById(id).disabled = false);
        const planButton=document.getElementById('detail-plan-btn');
        const refreshPlan=()=>{planButton.textContent=personalPlans.has(mediaKey(id,mediaType))?'✓ В планах':'♡ В планы';};
        refreshPlan();planButton.disabled=false;
        planButton.onclick=async()=>{planButton.disabled=true;try{const added=await togglePlan(auth.currentUser.uid,{...data,id,mediaType});if(request!==detailRequest)return;if(added)personalPlans.add(mediaKey(id,mediaType));else personalPlans.delete(mediaKey(id,mediaType));refreshPlan();document.querySelectorAll('.catalog-card').forEach(decorateCard);}catch{showToast('Не удалось сохранить планы. Попробуй ещё раз.');}finally{if(request===detailRequest)planButton.disabled=false;}};
        renderPersonalDetail(id,mediaType,request,data);

    } catch (e) { 
        if (request === detailRequest && titleEl) titleEl.textContent = 'Ошибка загрузки';
    }
}

async function playTrailer(id, mediaType) {
    const request = detailRequest;
    try {
        const url = await trailerUrl(id, mediaType);
        if (request !== detailRequest || detailModal.classList.contains('hidden')) return;
        trailerIframe.src = url;
        trailerModal.classList.remove('hidden');
    } catch (error) { showToast(error.message); }
}

async function addToRoulette(title) {
    const button = document.getElementById('detail-add-btn');
    button.disabled = true;
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) throw new Error('Вход не выполнен');
        const movies = (await loadRoulette(uid)).split('\n').map(value => value.trim()).filter(Boolean);
        if (movies.includes(title)) return showToast('Уже в списке!');
        movies.push(title);
        await saveRoulette(uid, movies.join('\n'));
        showToast(`«${title}» добавлен!`);
    } catch { showToast('Не удалось синхронизировать список. Попробуйте ещё раз.'); }
    finally { button.disabled = false; }
}

// ==========================================
// ПОИСК В КАТАЛОГЕ
// ==========================================
const searchInput = document.getElementById('catalog-search');
let searchTimer;

if (searchInput) {
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        // Отменяем ответ сразу после ввода, до окончания задержки поиска.
        catalogController?.abort();
        catalogRequest++;
        isLoading = false;
        loadMoreBtn.disabled = true;
        searchQuery = searchInput.value.trim();
        currentFilter = searchQuery ? 'search' : browsingFilter;
        filterBtns.forEach(button => button.classList.toggle('active', button.dataset.type === currentFilter));
        searchTimer = setTimeout(() => loadCatalog(), 350);
    });
}

// Закрываем окно клавишей Escape и возвращаем доступ к странице.
document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!trailerModal.classList.contains('hidden')) document.getElementById('close-trailer').click();
    else if (!detailModal.classList.contains('hidden')) document.getElementById('close-detail').click();
});
for (const modal of [detailModal, trailerModal]) modal.addEventListener('click', event => {
    if (event.target === modal) document.getElementById(modal === detailModal ? 'close-detail' : 'close-trailer').click();
});
const modalObserver = new MutationObserver(() => {
    document.body.classList.toggle('has-catalog-modal', !detailModal.classList.contains('hidden') || !trailerModal.classList.contains('hidden'));
});
for (const modal of [detailModal, trailerModal]) modalObserver.observe(modal, {attributes:true, attributeFilter:['class']});

// Фильтры отправляются в Discover: подбор применяется ко всему каталогу.
function updateFilterAvailability() {
    const context=currentFilter==='search'?browsingFilter:currentFilter;
    const tv = ['tv','anime'].includes(context);
    for (const select of [filterForm.elements.genre,filterForm.elements.exclude]) {
        const movieOnly=[28,12,14,36,27,10402,10749,878,10770,53,10752];
        const tvOnly=[10759,10762,10763,10764,10765,10766,10767,10768];
        for(const option of select.options)option.hidden = (tv ? movieOnly : tvOnly).includes(Number(option.value));
        if(Array.from(select.options).some(option=>option.value===select.value&&option.hidden)){select.value='';appliedFilters[select.name]='';}
    }
    const search = !!searchInput.value.trim();
    document.getElementById('catalog-filter-fields').disabled = search;
    document.getElementById('catalog-filter-note').hidden = !search;
    document.querySelectorAll('[data-tv-filter]').forEach(select => { select.disabled = !['tv','anime'].includes(context); });
    filterForm.elements.originalLanguage.disabled = context === 'anime';
}
for (const id of ['filter-genre','filter-exclude']) {
    const select = document.getElementById(id);
    for (const [value,name] of Object.entries(GENRE_MAP)) {
        const option = document.createElement('option'); option.value=value; option.textContent=name; select.appendChild(option);
    }
}
filterForm.addEventListener('submit', event => {
    event.preventDefault();
    appliedFilters = {...FILTER_DEFAULTS,...Object.fromEntries(new FormData(filterForm)),released:filterForm.elements.released.checked};
    try { buildDiscoverUrl(currentFilter, appliedFilters); } catch(error) { showToast(error.message); return; }
    loadCatalog();
});
document.getElementById('reset-catalog-filters').addEventListener('click', () => {
    filterForm.reset(); appliedFilters={...FILTER_DEFAULTS}; loadCatalog();
});
document.getElementById('enable-catalog-filters').addEventListener('click', () => {searchInput.value='';searchInput.dispatchEvent(new Event('input'));});
searchInput.addEventListener('input',updateFilterAvailability);
filterBtns.forEach(button=>button.addEventListener('click',updateFilterAvailability));
const initialGenre = new URLSearchParams(location.search).get('genre');
if (initialGenre && GENRE_MAP[initialGenre]) {filterForm.elements.genre.value=initialGenre;appliedFilters.genre=initialGenre;}
updateFilterAvailability();


let personalPlans=new Set(),personalRatings=[],personalReady=false,personalPromise;
function decorateCard(card){
    card.querySelector('.library-badge')?.remove();
    const planButton=card.querySelector('.cat-plan-toggle');if(planButton){const active=personalPlans.has(card.dataset.mediaKey);planButton.textContent=active?'✓':'♡';planButton.setAttribute('aria-pressed',String(active));planButton.setAttribute('aria-label',`${active?'Убрать из планов':'В планы'}: ${card.querySelector('.cat-title').textContent}`);}
    const [mediaType,id]=card.dataset.mediaKey.split(':');
    const rating=findRating(personalRatings,{id,mediaType,title:card.querySelector('.cat-title').textContent,poster:card.querySelector('img')?.src});
    const planned=personalPlans.has(card.dataset.mediaKey);
    card.classList.toggle('personal-masterpiece',Number(rating?.score)===10);
    if(!rating&&!planned)return;
    const badge=document.createElement('span');badge.className='library-badge';badge.textContent=rating?(Number(rating.score)===10?'Шедевр · Твои 10 из 10':`✓ Твоя ${Number(rating.score).toFixed(1)}`):'♡ В планах';card.querySelector('.cat-poster-wrapper').append(badge);
}
function loadPersonalLibrary(uid){
    // Сбой планов не должен скрывать успешно загруженные личные оценки.
    personalPromise=Promise.allSettled([getPlans(uid),readAll('movies',uid)]).then(([plans,ratings])=>{
        if(auth.currentUser?.uid!==uid)return;
        if(plans.status==='fulfilled')personalPlans=new Set(plans.value.map(m=>mediaKey(m.tmdbId,m.mediaType)));
        personalReady=ratings.status==='fulfilled';
        if(personalReady)personalRatings=ratings.value.sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0));
        document.querySelectorAll('.catalog-card').forEach(decorateCard);
    });
}
async function renderPersonalDetail(id,type,request,data){
    await personalPromise;
    const uid=auth.currentUser?.uid;
    if(!uid||request!==detailRequest)return;
    try {
        const ratings=await readAll('movies',uid);
        if(auth.currentUser?.uid!==uid||request!==detailRequest)return;
        personalRatings=ratings.sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0));
        personalReady=true;
        document.querySelectorAll('.catalog-card').forEach(decorateCard);
    } catch {
        if(auth.currentUser?.uid!==uid||request!==detailRequest)return;
        personalReady=false;
    }
    if(request!==detailRequest)return;
    const target={id,mediaType:type,title:data.title||data.name,poster:data.poster_path?`https://image.tmdb.org/t/p/w500${data.poster_path}`:'',year:(data.release_date||data.first_air_date||'').slice(0,4)};
    const own=findRating(personalRatings,target);
    document.getElementById('detail-own-rating').textContent=own?`Твоя оценка: ${Number(own.score).toFixed(1)}${own.review?' · '+own.review:''}`:personalReady?'Ты ещё не оценивал этот тайтл.':'Не удалось проверить твою оценку.';
    const rate=document.getElementById('detail-rate-btn');rate.textContent=own?'Изменить оценку':'Оценить';rate.href=`rate.html?${new URLSearchParams(own?{edit:own.id}:{id,type})}`;
    document.getElementById('detail-plan-btn').textContent=personalPlans.has(mediaKey(id,type))?'✓ В планах':'♡ В планы';
    const area=document.getElementById('detail-friend-ratings');area.textContent='Загружаем оценки друзей…';
    try{
        const snap=await getDocs(query(collection(db,'friendships'),where('members','array-contains',auth.currentUser.uid)));
        const friends=snap.docs.map(d=>d.data()).filter(d=>d.status==='accepted').map(d=>d.members.find(uid=>uid!==auth.currentUser.uid));
        const records=[];let index=0;
        await Promise.all(Array.from({length:Math.min(3,friends.length)},async()=>{while(index<friends.length){const uid=friends[index++];const movies=await readAll('movies',uid);const found=findRating(movies.sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0)),target);if(found)records.push({...found,uid});}}));
        if(request!==detailRequest)return;area.replaceChildren();
        if(!records.length){area.textContent='Друзья пока не оценили этот тайтл.';return;}
        for(const movie of records){const row=document.createElement('a');row.href=`profile.html?user=${encodeURIComponent(movie.uid)}`;row.className='friend-score-row';const name=document.createElement('span');name.textContent=movie.authorName||'Друг';const score=document.createElement('strong');score.textContent=Number(movie.score).toFixed(1);row.append(name,score);area.append(row);}
    }catch{if(request===detailRequest)area.textContent='Оценки друзей сейчас недоступны.';}
}
