import { auth, db, collection, getDocs, query, orderBy, onAuthStateChanged, deleteDoc, doc, updateDoc } from '../firebase-init.js';

let currentUser = null;
let loadedMovies = [];

const modal = document.getElementById('custom-modal');
const confirmBtn = document.getElementById('modal-confirm');
const cancelBtn = document.getElementById('modal-cancel');

function askConfirmation() {
    return new Promise((resolve) => {
        modal.classList.remove('hidden');
        confirmBtn.onclick = () => { modal.classList.add('hidden'); resolve(true); };
        cancelBtn.onclick = () => { modal.classList.add('hidden'); resolve(false); };
    });
}

onAuthStateChanged(auth, (user) => { 
    if (user) { currentUser = user; fetchMovies(); } 
    else { window.location.href = 'index.html'; }
});

function recoverOriginalScore(stats, isDuo) {
    if (!stats) return 0;
    function getP(val, idx) {
        if (!val) return 0;
        let s = String(val);
        if (s.includes('/')) return parseFloat(s.split('/')[idx]) || 0;
        return parseFloat(s) || 0;
    }
    function calcForPlayer(idx) {
        let base = 0;
        ['script', 'actors', 'directing', 'chars', 'idea'].forEach(k => { base += getP(stats[k], idx); });
        let vibe = 0;
        ['atmosphere', 'impression'].forEach(k => { vibe += getP(stats[k], idx) * 5; });
        let raw = base + vibe;
        let sc = Math.round(((raw - 15) / 85) * 100);
        return sc < 0 ? 0 : sc;
    }
    let s1 = calcForPlayer(0);
    if (isDuo) {
        let s2 = calcForPlayer(1);
        return Math.round((s1 + s2) / 2);
    }
    return s1;
}

async function fetchMovies() {
    const grid = document.getElementById('movies-grid');
    grid.innerHTML = '<p style="text-align: center; width: 100%; grid-column: 1/-1; font-family: \'Unbounded\'; color: #888;">ЗАГРУЗКА БАЗЫ ДАННЫХ...</p>';
    
    try {
        const q = query(collection(db, "movies"), orderBy("timestamp", "desc"));
        const snap = await getDocs(q);
        
        loadedMovies = [];
        snap.forEach(d => {
            let data = d.data();
            let finalScore = data.score;

            let isOldMovie = data.stats && data.stats.script && !String(data.stats.script).includes('.');

            if (isOldMovie && !data.isPerfectlyRestored) {
                let original100Score = recoverOriginalScore(data.stats, data.isDuo);
                
                finalScore = parseFloat((original100Score / 10).toFixed(1));
                
                updateDoc(doc(db, "movies", d.id), { 
                    score: finalScore, 
                    isPerfectlyRestored: true,
                    isFixed: true 
                });
            }

            data.score = finalScore;
            loadedMovies.push({ id: d.id, ...data });
        });
        
        updateStats(loadedMovies);
        renderGenres(loadedMovies);
        render(loadedMovies);
    } catch (e) { 
        console.error("Ошибка:", e);
        grid.innerHTML = '<p style="text-align: center; width: 100%; grid-column: 1/-1; color: #ff3333; font-family: \'Unbounded\';">ОШИБКА ДОСТУПА К БАЗЕ</p>'; 
    }
}

function updateStats(movies) {
    const totalEl = document.getElementById('total-movies');
    const avgEl = document.getElementById('average-score');
    
    if (!totalEl || !avgEl) return;

    totalEl.innerText = movies.length;
    
    if (movies.length === 0) {
        avgEl.innerText = '0';
        avgEl.className = '';
        return;
    }
    
    const totalScore = movies.reduce((sum, movie) => sum + movie.score, 0);
    const avg = totalScore / movies.length;
    
    avgEl.innerText = avg.toFixed(1);
    
    let colorClass = '';
    if (avg < 4.0) colorClass = 'color-red';
    else if (avg < 5.5) colorClass = 'color-orange';
    else if (avg < 7.0) colorClass = 'color-yellow';
    else if (avg < 8.5) colorClass = 'color-lime';
    else colorClass = 'color-green';
    
    avgEl.className = colorClass;
}

function render(moviesToRender) {
    const grid = document.getElementById('movies-grid');
    grid.innerHTML = '';
    
    if (moviesToRender.length === 0) {
        grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #a38c95; font-family: \'Unbounded\';">НИЧЕГО НЕ НАЙДЕНО 🌸</p>';
        return;
    }

    moviesToRender.forEach(m => {
        const isOwner = currentUser && m.userId === currentUser.uid;
        
        let colorClass = '';
        if (m.score < 4.0) colorClass = 'color-red';
        else if (m.score < 5.5) colorClass = 'color-orange';
        else if (m.score < 7.0) colorClass = 'color-yellow';
        else if (m.score < 8.5) colorClass = 'color-lime';
        else colorClass = 'color-green';
        
        const isPlatinum = m.score === 10 ? ' platinum-card' : '';
        
        const displayScore = Number.isInteger(m.score) ? m.score.toFixed(1) : m.score;
        
        const posterImg = m.poster ? `<img src="${m.poster}" class="card-poster">` : `<div class="card-poster no-img">БЕЗ ОБЛОЖКИ</div>`;
        const titleExtra = m.isDuo ? ' <span title="Смотрели вместе 🐰💕" style="font-size: 1.1rem;">💕</span>' : '';

        const card = document.createElement('div');
        card.className = `movie-card${isPlatinum}`;

        card.innerHTML = `
            <div class="poster-container">
                ${posterImg}
                <div class="poster-overlay"></div>
                ${isOwner ? `<button class="delete-btn" onclick="removeMovie('${m.id}')" title="Удалить">✕</button>` : ''}
            </div>
            <div class="card-content">
                <div class="card-header">
                    <img src="${m.authorPhoto || ''}" class="card-avatar" referrerpolicy="no-referrer">
                    <span class="card-author">${m.authorName || 'Аноним'}</span>
                </div>
                
                <div class="movie-title">${m.title}${titleExtra}</div>
                <div class="movie-genres">${m.genres || ''}</div>
                
                <div class="movie-score-wrapper">
                    <div class="movie-score ${colorClass}">${displayScore}</div>
                    <div class="stats-tooltip">
                        <div class="stat-row"><span>Сценарий</span><span class="stat-val">${m.stats?.script || '?'}</span></div>
                        <div class="stat-row"><span>Актеры</span><span class="stat-val">${m.stats?.actors || '?'}</span></div>
                        <div class="stat-row"><span>Режиссура</span><span class="stat-val">${m.stats?.directing || '?'}</span></div>
                        <div class="stat-row"><span>Персонажи</span><span class="stat-val">${m.stats?.chars || '?'}</span></div>
                        <div class="stat-row"><span>Идея</span><span class="stat-val">${m.stats?.idea || '?'}</span></div>
                        <div style="height: 1px; background: rgba(229, 138, 163, 0.2); margin: 8px 0;"></div>
                        <div class="stat-row"><span>Атмосфера</span><span class="stat-val">${m.stats?.atmosphere || '?'}</span></div>
                        <div class="stat-row"><span>Впечатление</span><span class="stat-val">${m.stats?.impression || '?'}</span></div>
                    </div>
                </div>
                <div style="font-size:0.6rem; color:#a38c95; font-family:'Unbounded'; margin-top:10px; font-weight:700;">${m.date || ''}</div>
            </div>
        `;
        
        grid.appendChild(card);
    });
}

window.removeMovie = async (id) => {
    let confirmed = false;
    if (window.innerWidth <= 768) {
        confirmed = confirm('Точно удалить эту оценку?');
    } else {
        confirmed = await askConfirmation();
    }
    
    if (confirmed) {
        try {
            await deleteDoc(doc(db, "movies", id));
            loadedMovies = loadedMovies.filter(m => m.id !== id);
            updateStats(loadedMovies);
            render(loadedMovies);
        } catch (e) {
            console.error("Ошибка удаления:", e);
            alert("Ошибка при удалении");
        }
    }
};

const searchEl = document.getElementById('local-search');
if(searchEl) {
    searchEl.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredMovies = loadedMovies.filter(m => m.title.toLowerCase().includes(searchTerm));
        render(filteredMovies);
    });
}


function renderGenres(movies) {
    const container = document.getElementById('genre-filters');
    if (!container) return;
    let allGenres = new Set();
    movies.forEach(m => {
        if(m.genres) {
            m.genres.split(',').forEach(g => allGenres.add(g.trim()));
        }
    });
    let html = `<button class="genre-pill active" data-genre="all">ВСЕ</button>`;
    Array.from(allGenres).sort().forEach(g => {
        if(g) html += `<button class="genre-pill" data-genre="${g}">${g.toUpperCase()}</button>`;
    });
    container.innerHTML = html;
    container.querySelectorAll('.genre-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.genre-pill').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            applyFiltersAndSort();
        });
    });
}
function applyFiltersAndSort() {
    let currentMovies = [...loadedMovies];
    const activeTypeBtn = document.querySelector('.type-tab.active');
    if (activeTypeBtn && activeTypeBtn.dataset.type !== 'all') {
        const selectedType = activeTypeBtn.dataset.type;
        currentMovies = currentMovies.filter(m => (m.type || 'movie') === selectedType);
    }

    const activeGenreBtn = document.querySelector('.genre-pill.active');
    if (activeGenreBtn && activeGenreBtn.dataset.genre !== 'all') {
        const selectedGenre = activeGenreBtn.dataset.genre;
        currentMovies = currentMovies.filter(m => m.genres && m.genres.includes(selectedGenre));
    }

    const activeSort = document.querySelector('.dropdown-item.active');
    if (activeSort) {
        const sortType = activeSort.getAttribute('data-value');
        if (sortType === 'high') currentMovies.sort((a, b) => b.score - a.score);
        else if (sortType === 'low') currentMovies.sort((a, b) => a.score - b.score);
        else if (sortType === 'new') currentMovies.sort((a, b) => {
            const timeA = a.timestamp ? a.timestamp.seconds : 0;
            const timeB = b.timestamp ? b.timestamp.seconds : 0;
            return timeB - timeA;
        });
    }
    const searchEl = document.getElementById('local-search');
    if (searchEl && searchEl.value) {
        const searchTerm = searchEl.value.toLowerCase();
        currentMovies = currentMovies.filter(m => m.title.toLowerCase().includes(searchTerm));
    }
    
    render(currentMovies);
}
document.addEventListener('DOMContentLoaded', () => {
    const dropdown = document.getElementById('custom-sort');
    const selected = document.getElementById('dropdown-selected');
    const options = document.querySelectorAll('.dropdown-item');

    if (!selected || !dropdown) return;

    selected.addEventListener('click', () => { dropdown.classList.toggle('open'); });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) { dropdown.classList.remove('open'); }
    });
    
document.querySelectorAll('.type-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
        document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
        e.target.classList.add('active');
        applyFiltersAndSort();
    });
});
    options.forEach(option => {
        option.addEventListener('click', () => {
            options.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            selected.innerHTML = `${option.innerText} <span class="arrow">▼</span>`;
            dropdown.classList.remove('open');

            let currentMovies = [...loadedMovies];
            if(searchEl) {
                const searchTerm = searchEl.value.toLowerCase();
                currentMovies = loadedMovies.filter(m => m.title.toLowerCase().includes(searchTerm));
            }

            const sortType = option.getAttribute('data-value');
            if (sortType === 'high') currentMovies.sort((a, b) => b.score - a.score);
            else if (sortType === 'low') currentMovies.sort((a, b) => a.score - b.score);
            else if (sortType === 'new') currentMovies.sort((a, b) => {
                const timeA = a.timestamp ? a.timestamp.seconds : 0;
                const timeB = b.timestamp ? b.timestamp.seconds : 0;
                return timeB - timeA;
            });
            
            render(currentMovies);
        });
    });
});
