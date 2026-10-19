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

let currentPage = 1, currentFilter = 'trending', isLoading = false;

document.getElementById('close-trailer').onclick = () => { trailerModal.classList.add('hidden'); trailerIframe.src = ''; };
document.getElementById('close-detail').onclick = () => { detailModal.classList.add('hidden'); };

function showToast(msg) {
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
    if (!isLoadMore) { catalogGrid.innerHTML = '<div class="catalog-loader">ЗАГРУЗКА... ⏳</div>'; currentPage = 1; } 
    else { loadMoreBtn.textContent = 'ЗАГРУЗКА... ⏳'; loadMoreBtn.disabled = true; }

    try {
        const res = await fetch(getEndpoint(currentFilter, currentPage));
        const data = await res.json();
        if (!isLoadMore) catalogGrid.innerHTML = '';
        data.results.forEach(item => { if (item.poster_path) renderCatalogCard(item); });
        if (currentPage < data.total_pages) loadMoreBtn.style.display = 'block'; else loadMoreBtn.style.display = 'none';
        currentPage++;
    } catch (e) {
        if (!isLoadMore) catalogGrid.innerHTML = '<p style="color:var(--rust); font-weight:800; grid-column:1/-1; text-align:center;">Ошибка загрузки 😢</p>';
    } finally { isLoading = false; loadMoreBtn.textContent = 'ЗАГРУЗИТЬ ЕЩЕ'; loadMoreBtn.disabled = false; }
}

filterBtns.forEach(btn => { btn.addEventListener('click', () => { filterBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); currentFilter = btn.getAttribute('data-type'); loadCatalog(); }); });
loadMoreBtn.addEventListener('click', () => loadCatalog(true));

function renderCatalogCard(m) {
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
    card.addEventListener('mousemove', (e) => {
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect(), x = e.clientX - rect.left, y = e.clientY - rect.top;
        wrapper.style.transform = `perspective(1000px) rotateX(${((y - rect.height/2)/(rect.height/2)) * -12}deg) rotateY(${((x - rect.width/2)/(rect.width/2)) * 12}deg) scale3d(1.03, 1.03, 1.03)`;
    });
    card.addEventListener('mouseleave', () => { if (wrapper) wrapper.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; });
    card.addEventListener('click', () => openDetailModal(m.id, mediaType));
    catalogGrid.appendChild(card);
}

async function openDetailModal(id, mediaType) {
    detailModal.classList.remove('hidden');
    document.getElementById('detail-title').textContent = 'Загрузка...';
    try {
        const res = await fetch(`https://api.themoviedb.org/3/${mediaType}/${id}?api_key=${TMDB_API_KEY}&language=ru-RU`);
        const data = await res.json();
        const title = data.title || data.name;
        document.getElementById('detail-backdrop').style.backgroundImage = data.backdrop_path ? `url(https://image.tmdb.org/t/p/original${data.backdrop_path})` : 'none';
        document.getElementById('detail-poster').src = data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '';
        document.getElementById('detail-title').textContent = title;
        document.getElementById('detail-rating').textContent = `⭐ ${data.vote_average ? data.vote_average.toFixed(1) : '?'}`;
        document.getElementById('detail-year').textContent = (data.release_date || data.first_air_date || '').split('-')[0];
        document.getElementById('detail-runtime').textContent = data.runtime ? `${data.runtime} мин` : (data.number_of_seasons ? `${data.number_of_seasons} сез.` : '');
        document.getElementById('detail-genres').textContent = data.genres ? data.genres.map(g => g.name).join(', ') : '';
        document.getElementById('detail-overview').textContent = data.overview || 'Описание отсутствует.';
        
        document.getElementById('detail-play-btn').onclick = () => playTrailer(id, mediaType);
        document.getElementById('detail-add-btn').onclick = () => addToRoulette(title);
    } catch (e) { document.getElementById('detail-title').textContent = 'Ошибка загрузки'; }
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
        if (video) { trailerIframe.src = `https://www.youtube.com/embed/${video.key}?autoplay=1`; trailerModal.classList.remove('hidden'); } 
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