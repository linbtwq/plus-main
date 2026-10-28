import { auth, db, collection, getDocs, query, orderBy, onAuthStateChanged, deleteDoc, doc, updateDoc, signOut } from './firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
let currentUser = null, loadedMovies = [];
const escapeHtml = (str) => String(str || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));

onAuthStateChanged(auth, (user) => { 
    if (user) { currentUser = user; document.getElementById('nav-user-name').textContent = user.displayName; if(user.photoURL) document.getElementById('nav-user-avatar').src = user.photoURL; fetchMovies(); } 
    else { window.location.href = '../index.html'; }
});
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

function recoverOriginalScore(stats, isDuo) {
    if (!stats) return 0;
    const getP = (val, idx) => { if (!val) return 0; let s = String(val); return s.includes('/') ? (parseFloat(s.split('/')[idx]) || 0) : (parseFloat(s) || 0); };
    const calc = (idx) => { let base = 0; ['script', 'actors', 'directing', 'chars', 'idea'].forEach(k => base += getP(stats[k], idx)); let vibe = 0; ['atmosphere', 'impression'].forEach(k => vibe += getP(stats[k], idx) * 5); return Math.max(0, Math.round(((base + vibe - 15) / 85) * 100)); };
    let s1 = calc(0); return isDuo ? Math.round((s1 + calc(1)) / 2) : s1;
}

async function fetchMovies() {
    const grid = document.getElementById('movies-grid');
    grid.innerHTML = Array(8).fill(`<div class="movie-card skeleton"><div class="card-frame"><div class="skeleton-shimmer"></div></div><div class="card-caption"><div class="skeleton-line" style="width: 80%;"></div><div class="skeleton-line" style="width: 50%;"></div></div></div>`).join('');
    try {
        const snap = await getDocs(query(collection(db, "movies"), orderBy("timestamp", "desc")));
        loadedMovies = [];
        snap.forEach(d => {
            let data = d.data(), finalScore = data.score;
            if (data.stats && data.stats.script && !String(data.stats.script).includes('.') && !data.isPerfectlyRestored) {
                finalScore = parseFloat((recoverOriginalScore(data.stats, data.isDuo) / 10).toFixed(1));
                updateDoc(doc(db, "movies", d.id), { score: finalScore, isPerfectlyRestored: true });
            }
            data.score = finalScore; loadedMovies.push({ id: d.id, ...data });
        });
        updateCounters(loadedMovies); renderGenres(loadedMovies); applyFiltersAndSort();
    } catch (e) { grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color:var(--rust); font-weight:800;">ОШИБКА ДОСТУПА</p>'; }
}

function updateCounters(movies) {
    if (!document.getElementById('stat-total')) return;
    document.getElementById('stat-total').textContent = movies.length;
    document.getElementById('stat-masterpieces').textContent = movies.filter(m => Number(m.score) === 10).length;
    document.getElementById('stat-avg').textContent = movies.length > 0 ? (movies.reduce((a, m) => a + Number(m.score || 0), 0) / movies.length).toFixed(1) : '0.0';
}

function render(movies) {
    const grid = document.getElementById('movies-grid'); grid.innerHTML = '';
    if (movies.length === 0) return grid.innerHTML = '<p style="grid-column:1/-1; text-align:center; color:var(--ink-mid); font-weight:800; padding:50px;">НИЧЕГО НЕ НАЙДЕНО 📂</p>';

    movies.forEach(m => {
        const isOwner = currentUser && m.userId === currentUser.uid;
        let colorClass = m.score < 4.0 ? 'color-red' : m.score < 5.5 ? 'color-orange' : m.score < 7.0 ? 'color-yellow' : m.score < 8.5 ? 'color-lime' : m.score < 10.0 ? 'color-green' : 'color-gold';
        const card = document.createElement('div');
        card.className = `movie-card${Number(m.score) === 10 ? ' masterpiece' : ''}`;
        card.innerHTML = `
            <div class="card-frame">
                ${m.poster ? `<img src="${m.poster}" class="card-cover" loading="lazy">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;">НЕТ ФОТО</div>`}
                <div class="card-score-pill ${colorClass}">${Number(m.score).toFixed(1)}</div>
                ${isOwner ? `<button class="card-del-btn" onclick="event.stopPropagation(); removeMovie('${m.id}')">✕</button>` : ''}
            </div>
            <div class="card-caption"><div class="card-headline">${escapeHtml(m.title)}${m.isDuo?' 💕':''}</div><div class="card-sub"><span>${escapeHtml(m.genres ? m.genres.split(',')[0] : 'КИНО')}</span><span>${escapeHtml(m.authorName)}</span></div></div>
        `;
        
                const frame = card.querySelector('.card-frame');
        let rect = null;
        let rafId = null;

        card.addEventListener('mouseenter', () => {
            rect = frame.getBoundingClientRect();
        });

        card.addEventListener('mousemove', (e) => {
            if (!frame || !rect) return;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                frame.style.transform = `perspective(1000px) rotateX(${((y - rect.height/2)/(rect.height/2)) * -10}deg) rotateY(${((x - rect.width/2)/(rect.width/2)) * 10}deg) scale3d(1.02, 1.02, 1.02)`;
                frame.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`); 
                frame.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
            });
        });

        card.addEventListener('mouseleave', () => { 
            rect = null;
            if (rafId) cancelAnimationFrame(rafId);
            if (frame) frame.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; 
        });
        card.addEventListener('mouseleave', () => { if (frame) frame.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; });
        
        card.addEventListener('click', () => openArchiveModal(m));
        grid.appendChild(card);
    });
}

function openArchiveModal(m) {
    const modal = document.getElementById('archive-modal');
    document.getElementById('am-poster').src = m.poster || 'https://via.placeholder.com/200x300?text=No+Poster';
    document.getElementById('am-title').textContent = m.title;
    document.getElementById('am-genres').textContent = m.genres || 'Жанр неизвестен';
    document.getElementById('am-score').textContent = Number(m.score).toFixed(1);
    document.getElementById('am-date').textContent = m.date || 'Дата не указана';
    
    const stats = m.stats || {};
    document.getElementById('am-script').textContent = stats.script || '?';
    document.getElementById('am-actors').textContent = stats.actors || '?';
    document.getElementById('am-directing').textContent = stats.directing || '?';
    document.getElementById('am-chars').textContent = stats.chars || '?';
    document.getElementById('am-idea').textContent = stats.idea || '?';
    document.getElementById('am-atmosphere').textContent = stats.atmosphere || '?';
    document.getElementById('am-impression').textContent = stats.impression || '?';
    
    const reviewBox = document.getElementById('am-review');
    if (m.review) { reviewBox.textContent = `"${m.review}"`; reviewBox.classList.remove('hidden'); } 
    else { reviewBox.classList.add('hidden'); }

    // Кнопка трейлера
    document.getElementById('am-trailer-btn').onclick = async () => {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(m.title)}&language=ru-RU`);
            const data = await res.json();
            if (data.results.length > 0) {
                const id = data.results[0].id;
                const resV = await fetch(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${TMDB_API_KEY}&language=ru-RU`);
                const dataV = await resV.json();
                let video = dataV.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                if (!video) {
                    const resEn = await fetch(`https://api.themoviedb.org/3/movie/${id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
                    const dataEn = await resEn.json();
                    video = dataEn.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                }
                if (video) {
                    document.getElementById('trailer-iframe').src = `https://www.youtube.com/embed/${video.key}?autoplay=1`;
                    document.getElementById('trailer-modal').classList.remove('hidden');
                } else alert('Трейлер не найден');
            } else alert('Фильм не найден на TMDB');
        } catch(e) { alert('Ошибка'); }
    };
    
    // НОВАЯ КНОПКА СМОТРЕТЬ
    document.getElementById('am-watch-btn').onclick = () => {
        window.location.href = `watch.html?title=${encodeURIComponent(m.title)}`;
    };
    
    modal.classList.remove('hidden');
}

document.getElementById('close-archive-modal').onclick = () => document.getElementById('archive-modal').classList.add('hidden');
document.getElementById('close-trailer').onclick = () => { document.getElementById('trailer-modal').classList.add('hidden'); document.getElementById('trailer-iframe').src = ''; };

window.removeMovie = async (id) => {
    if (!confirm('Точно удалить?')) return;
    try {
        await deleteDoc(doc(db, "movies", id));
        loadedMovies = loadedMovies.filter(m => m.id !== id);
        updateCounters(loadedMovies); renderGenres(loadedMovies); applyFiltersAndSort();
    } catch (e) { alert("Ошибка удаления"); }
};

function renderGenres(movies) {
    const container = document.getElementById('genre-filters'); if (!container) return;
    let allGenres = new Set(); movies.forEach(m => { if(m.genres) m.genres.split(',').forEach(g => allGenres.add(g.trim())); });
    container.innerHTML = `<button class="rail-chip active" data-genre="all">ВСЕ</button>` + Array.from(allGenres).sort().map(g => `<button class="rail-chip" data-genre="${escapeHtml(g)}">${escapeHtml(g.toUpperCase())}</button>`).join('');
    container.querySelectorAll('.rail-chip').forEach(btn => btn.addEventListener('click', (e) => { container.querySelectorAll('.rail-chip').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); applyFiltersAndSort(); }));
}

function applyFiltersAndSort() {
    let curr = [...loadedMovies];
    const q = document.getElementById('live-search').value.trim().toLowerCase();
    if (q) curr = curr.filter(m => m.title.toLowerCase().includes(q));
    
    const type = document.querySelector('.type-btn.active')?.dataset.type;
    if (type && type !== 'all') curr = curr.filter(m => (m.type || 'movie') === type);
    
    const genre = document.querySelector('.rail-chip.active')?.dataset.genre;
    if (genre && genre !== 'all') curr = curr.filter(m => m.genres && m.genres.includes(genre));
    
    const sort = document.querySelector('#dropdown-options .sort-opt.active')?.dataset.value;
    if (sort === 'high') curr.sort((a,b) => b.score - a.score); else if (sort === 'low') curr.sort((a,b) => a.score - b.score); else curr.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    
    render(curr);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('live-search')?.addEventListener('input', applyFiltersAndSort);
    const dropdown = document.getElementById('custom-sort'), selected = document.getElementById('dropdown-selected');
    if (dropdown && selected) {
        selected.addEventListener('click', () => dropdown.classList.toggle('open'));
        document.addEventListener('click', e => { if (!dropdown.contains(e.target)) dropdown.classList.remove('open'); });
        document.querySelectorAll('#dropdown-options .sort-opt').forEach(opt => opt.addEventListener('click', () => {
            document.querySelectorAll('#dropdown-options .sort-opt').forEach(o => o.classList.remove('active')); opt.classList.add('active');
            selected.innerHTML = `${opt.innerText} <span>▼</span>`; dropdown.classList.remove('open'); applyFiltersAndSort();
        }));
    }
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', (e) => { document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active')); e.target.classList.add('active'); applyFiltersAndSort(); }));
});