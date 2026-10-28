import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
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
    if (detailModal) detailModal.classList.add('hidden'); 
});

let currentPage = 1, currentFilter = 'trending', isLoading = false;

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

async function loadCatalog(isLoadMore = false) {
    if (isLoading) return; isLoading = true;
    
    if (!isLoadMore) { 
        if (catalogGrid) catalogGrid.innerHTML = '<div class="catalog-loader">ЗАГРУЗКА... ⏳</div>'; 
        currentPage = 1; 
    } 
    else if (loadMoreBtn) { 
        loadMoreBtn.textContent = 'ЗАГРУЗКА... ⏳'; 
        loadMoreBtn.disabled = true; 
    }

    try {
        const res = await fetch(getEndpoint(currentFilter, currentPage));
        const data = await res.json();
        if (!isLoadMore && catalogGrid) catalogGrid.innerHTML = '';
        
        data.results.forEach(item => { if (item.poster_path) renderCatalogCard(item); });
        
        if (loadMoreBtn) {
            if (currentPage < data.total_pages) loadMoreBtn.style.display = 'block'; 
            else loadMoreBtn.style.display = 'none';
        }
        currentPage++;
    } catch (e) {
        if (!isLoadMore && catalogGrid) catalogGrid.innerHTML = '<p style="color:var(--rust); font-weight:800; grid-column:1/-1; text-align:center;">Ошибка загрузки 😢</p>';
    } finally { 
        isLoading = false; 
        if (loadMoreBtn) { loadMoreBtn.textContent = 'ЗАГРУЗИТЬ ЕЩЕ'; loadMoreBtn.disabled = false; }
    }
}

if (filterBtns.length > 0) {
    filterBtns.forEach(btn => { btn.addEventListener('click', () => { filterBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentFilter = btn.getAttribute('data-type'); loadCatalog(); }); });
}

if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => loadCatalog(true));
}

function renderCatalogCard(m) {
    if (!catalogGrid) return;

    const title = m.title || m.name;
    const mediaType = m.media_type || (currentFilter === 'movie' ? 'movie' : 'tv');
    const posterUrl = `https://image.tmdb.org/t/p/w300${m.poster_path}`;
    const rating = m.vote_average ? m.vote_average.toFixed(1) : '?';
    const genres = m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ') : 'Жанр неизвестен';
    let colorClass = rating >= 8 ? 'color-green' : rating >= 6 ? 'color-lime' : rating < 5 ? 'color-red' : 'color-yellow';

    const card = document.createElement('div');
    card.className = 'catalog-card';
    card.innerHTML = `
        <div class="cat-poster-wrapper">
            <img src="${posterUrl}" class="cat-poster" loading="lazy" alt="${title}">
            <div class="cat-rating ${colorClass}">${rating}</div>
        </div>
        <div class="cat-info"><div class="cat-title" title="${title}">${title}</div><div class="cat-genres">${genres}</div></div>
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
    
    detailModal.classList.remove('hidden');
    const titleEl = document.getElementById('detail-title');
    if (titleEl) titleEl.textContent = 'Загрузка...';
    
    try {
        const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = await res.json();
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
        
        // КНОПКА СМОТРЕТЬ (с точным определением аниме)
        document.getElementById('detail-watch-btn').onclick = async () => {
            const originalTitle = data.original_title || data.original_name || title;
            const imdbId = data.imdb_id || '';
            const year = (data.release_date || data.first_air_date || '').split('-')[0];
            
            // Более точное определение аниме (по оригинальному языку или специфичным жанрам)
            const isAnime = data.original_language === 'ja' || (data.genres && data.genres.some(g => g.id === 16));
            
            let kodikType = 'movie';
            if (mediaType === 'tv') {
                kodikType = isAnime ? 'anime-serial' : 'serial';
            } else if (mediaType === 'movie') {
                kodikType = isAnime ? 'anime-movie' : 'movie';
            }

            let shikimoriId = '';
            if (isAnime) {
                try {
                    const shikiRes = await fetch(`https://shikimori.one/api/animes?search=${encodeURIComponent(originalTitle || title)}&limit=1`);
                    const shikiData = await shikiRes.json();
                    if (shikiData && shikiData.length > 0) {
                        shikimoriId = shikiData[0].id;
                    }
                } catch (e) { console.warn("Не удалось получить Shikimori ID", e); }
            }

            window.location.href = `watch.html?title=${encodeURIComponent(title)}&original=${encodeURIComponent(originalTitle)}&imdb=${imdbId}&year=${year}&type=${kodikType}&shikimori=${shikimoriId}`;
        };
    } catch (e) { 
        if (titleEl) titleEl.textContent = 'Ошибка загрузки'; 
    }
}

async function playTrailer(id, mediaType) {
    try {
        const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/videos?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = await res.json();
        let video = data.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
        if (!video) {
            const resEn = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
            const dataEn = await resEn.json();
            video = dataEn.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
        }
        if (video) { 
            if (trailerIframe) trailerIframe.src = `https://www.youtube.com/embed/${video.key}?autoplay=1`; 
            if (trailerModal) trailerModal.classList.remove('hidden'); 
        } 
        else { showToast('Трейлер не найден 😢'); }
    } catch (err) { showToast('Ошибка загрузки'); }
}

function addToRoulette(title) {
    let list = localStorage.getItem('rouletteList') || '';
    let movies = list.split('\n').map(s => s.trim()).filter(Boolean);
    if (movies.includes(title)) return showToast('Уже в списке!');
    movies.push(title);
    localStorage.setItem('rouletteList', movies.join('\n'));
    showToast(`"${title}" добавлен!`);
}

// ==========================================
// ПОИСК В КАТАЛОГЕ
// ==========================================
const searchInput = document.getElementById('catalog-search');
let searchTimer;

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimer);
        const query = e.target.value.trim();
        
        searchTimer = setTimeout(() => {
            if (query.length > 0) {
                currentFilter = 'search';
                loadSearchResults(query);
            } else {
                currentFilter = 'trending';
                filterBtns.forEach(b => b.classList.remove('active'));
                const trendingBtn = document.querySelector('.cat-filter-btn[data-type="trending"]');
                if (trendingBtn) trendingBtn.classList.add('active');
                loadCatalog();
            }
        }, 500);
    });
}

async function loadSearchResults(query) {
    if (isLoading || !catalogGrid) return; isLoading = true;
    catalogGrid.innerHTML = '<div class="catalog-loader">ПОИСК... ⏳</div>'; 
    if (loadMoreBtn) loadMoreBtn.style.display = 'none';

    try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`);
        const data = await res.json();
        
        catalogGrid.innerHTML = '';
        const results = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
        
        if (results.length === 0) {
            catalogGrid.innerHTML = '<p style="color:var(--rust); font-weight:800; grid-column:1/-1; text-align:center;">Ничего не найдено 😢</p>';
        } else {
            results.forEach(item => { if (item.poster_path) renderCatalogCard(item); });
        }
    } catch (e) {
        catalogGrid.innerHTML = '<p style="color:var(--rust); font-weight:800; grid-column:1/-1; text-align:center;">Ошибка поиска</p>';
    } finally { 
        isLoading = false; 
    }
}