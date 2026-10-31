import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

import { loadRoulette, saveRoulette } from './roulette-store.js';
import { TMDB_API_KEY, escapeHtml, posterUrl, fetchJson, watchUrl, trailerUrl } from './shared.js';
const GENRE_MAP = { 28: "Боевик", 12: "Приключения", 16: "Мультфильм", 35: "Комедия", 80: "Криминал", 99: "Документальный", 18: "Драма", 10751: "Семейный", 14: "Фэнтези", 36: "История", 27: "Ужасы", 10402: "Музыка", 9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика", 10770: "ТВ фильм", 53: "Триллер", 10752: "Военный", 37: "Вестерн", 10759: "Боевик/Прикл.", 10762: "Детский", 10763: "Новости", 10764: "Реалити", 10765: "Фантастика/Фэнтези", 10766: "Мыльная опера", 10767: "Ток-шоу", 10768: "Война/Политика" };

onAuthStateChanged(auth, (user) => { if (user) { loadCatalog(); } else { window.location.href = '../index.html'; } });
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

let currentPage = 1, currentFilter = 'trending', isLoading = false;
let catalogController, catalogRequest = 0, detailRequest = 0, searchQuery = '';

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
    if (!isLoadMore) catalogGrid.textContent = 'Загрузка…';
    loadMoreBtn.disabled = true;
    try {
        const url = filter === 'search'
            ? `https://api.themoviedb.org/3/search/multi?${new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ru-RU', query, page })}`
            : getEndpoint(filter, page);
        const data = await fetchJson(url, { signal: catalogController.signal });
        if (request !== catalogRequest) return;
        if (!Array.isArray(data.results)) throw new Error('Неверный ответ каталога');
        if (!isLoadMore) catalogGrid.replaceChildren();
        data.results.filter(item => !item.media_type || ['movie', 'tv'].includes(item.media_type))
            .forEach(item => renderCatalogCard(item, filter));
        if (!catalogGrid.children.length) catalogGrid.textContent = 'Ничего не найдено';
        currentPage = page + 1;
        loadMoreBtn.style.display = page < Math.min(data.total_pages || 1, 500) ? 'block' : 'none';
    } catch (error) {
        if (request !== catalogRequest || error.name === 'AbortError') return;
        if (!isLoadMore) catalogGrid.textContent = 'Не удалось загрузить каталог. Повторите поиск или выберите категорию.';
        else showToast('Не удалось загрузить следующую страницу');
    } finally {
        if (request === catalogRequest) { isLoading = false; loadMoreBtn.disabled = false; loadMoreBtn.textContent = 'ЗАГРУЗИТЬ ЕЩЁ'; }
    }
}

if (filterBtns.length > 0) {
    filterBtns.forEach(btn => { btn.addEventListener('click', () => { filterBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); clearTimeout(searchTimer); searchInput.value = ''; searchQuery = ''; currentFilter = btn.getAttribute('data-type'); loadCatalog(); }); });
}

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadCatalog(true));
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
        </div>
        <div class="cat-info"><div class="cat-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div><div class="cat-genres">${escapeHtml(genres)}</div></div>
    `;

    const wrapper = card.querySelector('.cat-poster-wrapper');
    let rect = null;
    let rafId = null;

    card.addEventListener('mouseenter', () => { rect = wrapper.getBoundingClientRect(); });

    card.addEventListener('mousemove', (e) => {
        if (!wrapper || !rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            wrapper.style.transform = `perspective(1000px) rotateX(${((y - rect.height/2)/(rect.height/2)) * -12}deg) rotateY(${((x - rect.width/2)/(rect.width/2)) * 12}deg) scale3d(1.03, 1.03, 1.03)`;
        });
    });

    card.addEventListener('mouseleave', () => { 
        rect = null;
        if (rafId) cancelAnimationFrame(rafId);
        if (wrapper) wrapper.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; 
    });
    
    card.addEventListener('click', () => openDetailModal(m.id, mediaType));
    catalogGrid.appendChild(card);
}

async function openDetailModal(id, mediaType) {
    if (!detailModal) return;
    
    const request = ++detailRequest;
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
        
        const ratingEl = document.getElementById('detail-rating');
        if (ratingEl) ratingEl.textContent = `⭐ ${data.vote_average ? data.vote_average.toFixed(1) : '?'}`;
        
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
        currentFilter = searchQuery ? 'search' : 'trending';
        filterBtns.forEach(button => button.classList.toggle('active', button.dataset.type === currentFilter));
        searchTimer = setTimeout(() => loadCatalog(), 350);
    });
}
