import { deleteWithHistory } from './activity-store.js';
import { MASTERPIECE_BANNER } from './rating-style.js';
import { getProfile, safeAvatar } from './profile-store.js';
import { auth, db, collection, getDocs, query, orderBy, onAuthStateChanged, signOut, limit, where, startAfter } from './firebase-init.js';
import { escapeHtml, posterUrl, resolveMedia, watchUrl, trailerUrl } from './shared.js';

let currentUser = null, loadedMovies = [], lastDocument = null, hasMore = true, loading = false;
const PAGE_SIZE = 48;
const moreButton = document.getElementById('archive-load-more');
const grid = document.getElementById('movies-grid');
const loadStatus = document.getElementById('archive-load-status');
moreButton.addEventListener('click', () => fetchMovies(loadedMovies.length > 0));

// Показываем силуэты карточек до получения ответа, сохраняя размер сетки.
function showSkeletons(append = false) {
    if (!append) grid.replaceChildren();
    grid.querySelectorAll('.archive-empty').forEach(element => element.remove());
    for (let index = 0; index < 8; index++) {
        const card = document.createElement('div');
        card.className = 'movie-card skeleton';
        card.setAttribute('aria-hidden', 'true');
        card.innerHTML = '<div class="card-frame skeleton-surface"></div><div class="card-caption"><div class="skeleton-line skeleton-surface"></div><div class="skeleton-line skeleton-line-short skeleton-surface"></div></div>';
        grid.appendChild(card);
    }
    grid.setAttribute('aria-busy', 'true');
}
showSkeletons();

onAuthStateChanged(auth, user => {
    if (!user) { window.location.href = '../index.html'; return; }
    currentUser = user;
    document.getElementById('nav-user-name').textContent = user.displayName || 'Киноман';
    if (user.photoURL) document.getElementById('nav-user-avatar').src = user.photoURL;
    getProfile(user.uid).then(profile => {
        if (profile && auth.currentUser?.uid === user.uid) {
            document.getElementById('nav-user-name').textContent = profile.displayName;
            const image = safeAvatar(profile.photoURL);
            const avatar = document.getElementById('nav-user-avatar');
            avatar.style.display = image ? '' : 'none';
            if (image) avatar.src = image;
        }
    }).catch(() => {});
    fetchMovies();
});
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

// Читаем только личные записи порциями, не изменяя старые данные.
async function fetchMovies(append = false) {
    if (loading || !currentUser || (append && !hasMore)) return;
    loading = true;
    moreButton.disabled = true;
    moreButton.textContent = 'Загрузка…';
    loadStatus.textContent = '';
    if (!append) { loadedMovies = []; lastDocument = null; }
    showSkeletons(append);
    try {
        const constraints = [where('userId', '==', currentUser.uid), orderBy('timestamp', 'desc')];
        if (append && lastDocument) constraints.push(startAfter(lastDocument));
        const snap = await getDocs(query(collection(db, 'movies'), ...constraints, limit(PAGE_SIZE + 1)));
        const records = snap.docs.slice(0, PAGE_SIZE);
        records.forEach(record => {
            const data = record.data();
            loadedMovies.push({ ...data, id: record.id,
                title: typeof data.title === 'string' ? data.title : 'Без названия',
                genres: typeof data.genres === 'string' ? data.genres : '',
                score: Number.isFinite(Number(data.score)) ? Math.min(10, Math.max(0, Number(data.score))) : 0
            });
        });
        lastDocument = records.at(-1) || lastDocument;
        hasMore = snap.size > PAGE_SIZE;
        moreButton.hidden = !hasMore;
        loading = false;
        updateCounters(loadedMovies); renderGenres(loadedMovies); applyFiltersAndSort();
    } catch (error) {
        console.error('Ошибка загрузки архива:', error);
        loadStatus.textContent = 'Не удалось загрузить записи. Попробуйте ещё раз.';
        moreButton.hidden = false;
        moreButton.textContent = 'Повторить загрузку';
    } finally {
        loading = false;
        grid.querySelectorAll('.skeleton').forEach(element => element.remove());
        grid.setAttribute('aria-busy', 'false');
        moreButton.disabled = false;
        if (!loadStatus.textContent) moreButton.textContent = 'Загрузить ещё';
    }
}

function updateCounters(movies) {
    if (!document.getElementById('stat-total')) return;
    document.getElementById('stat-total').textContent = movies.length;
    document.getElementById('stat-masterpieces').textContent = movies.filter(m => Number(m.score) === 10).length;
    document.getElementById('stat-avg').textContent = movies.length > 0 ? (movies.reduce((a, m) => a + Number(m.score || 0), 0) / movies.length).toFixed(1) : '0.0';
}

function render(movies) {
    const grid = document.getElementById('movies-grid'); grid.innerHTML = '';
    if (movies.length === 0) return grid.innerHTML = '<p class="archive-empty" style="grid-column:1/-1; text-align:center; color:var(--ink-mid); font-weight:800; padding:50px;">НИЧЕГО НЕ НАЙДЕНО 📂</p>';

    movies.forEach(m => {
        const isOwner = currentUser && m.userId === currentUser.uid;
        let colorClass = m.score < 4.0 ? 'color-red' : m.score < 5.5 ? 'color-orange' : m.score < 7.0 ? 'color-yellow' : m.score < 8.5 ? 'color-lime' : m.score < 10.0 ? 'color-green' : 'color-gold';
        const card = document.createElement('div');
        card.className = `movie-card${Number(m.score) === 10 ? ' masterpiece' : ''}`;
        card.innerHTML = `
            <div class="card-frame">
                ${m.poster ? `<img src="${escapeHtml(posterUrl(m.poster))}" class="card-cover" loading="lazy">` : `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;">НЕТ ФОТО</div>`}
                <div class="card-score-pill ${colorClass}">${Number(m.score).toFixed(1)}${Number(m.score)===10?'<small class="maximum-score-scale">/10</small>':''}</div>
                ${Number(m.score)===10?MASTERPIECE_BANNER:''}
                ${isOwner ? `<button class="card-del-btn" >✕</button>` : ''}
            </div>
            <div class="card-caption"><div class="card-headline">${escapeHtml(m.title)}${m.isDuo?' 💕':''}</div>${Number(m.score)===10?'<span class="masterpiece-list-label">Шедевр · 10 из 10</span>':''}<div class="card-sub"><span>${escapeHtml(m.genres ? m.genres.split(',')[0] : 'КИНО')}</span><span>${escapeHtml(m.authorName)}</span></div><p class="archive-list-review">${escapeHtml(m.review||'Без отзыва')}</p><span class="archive-list-date">${escapeHtml(m.date||'')}</span></div>
        `;
        
        card.querySelector('.card-del-btn')?.setAttribute('aria-label',`Удалить оценку: ${m.title}`);
        card.querySelector('.card-del-btn')?.addEventListener('click', event => { event.stopPropagation(); removeMovie(m.id); });
        const frame = card.querySelector('.card-frame');
        let rect = null;
        let rafId = null;

        card.addEventListener('mouseenter', () => {
            rect = frame.getBoundingClientRect();
        });

        card.addEventListener('mousemove', (e) => {
            if(!matchMedia('(hover: hover) and (pointer: fine)').matches||matchMedia('(prefers-reduced-motion: reduce)').matches||card.closest('.archive-list'))return;
            if (!frame || !rect) return;
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                frame.style.transform = `perspective(1000px) rotateX(${((y - rect.height/2)/(rect.height/2)) * -2}deg) rotateY(${((x - rect.width/2)/(rect.width/2)) * 2}deg) scale3d(1.01, 1.01, 1.01)`;
                frame.style.setProperty('--mouse-x', `${(x / rect.width) * 100}%`); 
                frame.style.setProperty('--mouse-y', `${(y / rect.height) * 100}%`);
            });
        });

        card.addEventListener('mouseleave', () => { 
            rect = null;
            if (rafId) cancelAnimationFrame(rafId);
            if (frame) frame.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`; 
        });
        
        card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Открыть оценку: ${m.title}${Number(m.score)===10?", шедевр, максимальная оценка 10 из 10":""}`);card.addEventListener('keydown',event=>{if(event.target===card&&(event.key==='Enter'||event.key===' ')){event.preventDefault();openArchiveModal(m);}});
        card.addEventListener('click', () => openArchiveModal(m));
        grid.appendChild(card);
    });
}

let archiveReturnFocus;
function openArchiveModal(m) {
    archiveReturnFocus=document.activeElement;
    const modal = document.getElementById('archive-modal');
    document.getElementById('am-edit-btn').href=`rate.html?${new URLSearchParams({edit:m.id})}`;
    document.getElementById('am-poster').src = posterUrl(m.poster);
    document.getElementById('am-title').textContent = m.title;
    modal.querySelector('.archive-detail-box').classList.toggle('is-masterpiece',Number(m.score)===10);
    document.getElementById('am-distinction').hidden=Number(m.score)!==10;
    document.getElementById('am-participants').textContent=m.isDuo?(m.jointPartnerName?'Вместе с '+m.jointPartnerName:'Совместная оценка'):'Личная оценка';
    document.getElementById('am-duo-legend').hidden=!m.isDuo||m.ratingMode==='quick';
    const participantNames=m.jointPartnerId?[m.jointFirstId===m.userId?m.authorName:m.jointPartnerName,m.jointFirstId===m.userId?m.jointPartnerName:m.authorName]:['Оценка 1','Оценка 2'];
    document.querySelectorAll('#am-duo-legend span').forEach((label,index)=>{label.textContent=participantNames[index]||`Оценка ${index+1}`;label.title=label.textContent;});
    document.getElementById('am-genres').textContent = m.genres || 'Жанр неизвестен';
    document.getElementById('am-score').textContent = Number(m.score).toFixed(1);
    document.getElementById('am-date').textContent = m.date || 'Дата не указана';
    
    const stats = m.stats || {};
    document.getElementById('am-criteria-heading').textContent=m.ratingMode==='quick'?'Способ оценки':'По критериям';
    document.querySelector('.archive-modal-stats').hidden = m.ratingMode === 'quick';
    document.getElementById('am-rating-mode').textContent = m.ratingMode === 'quick' ? (m.isDuo ? `Быстрая парная оценка: ${stats.script || ''}` : 'Быстрая оценка') : '';
    document.getElementById('am-script').textContent = stats.script || '?';
    document.getElementById('am-actors').textContent = stats.actors || '?';
    document.getElementById('am-directing').textContent = stats.directing || '?';
    document.getElementById('am-chars').textContent = stats.chars || '?';
    document.getElementById('am-idea').textContent = stats.idea || '?';
    document.getElementById('am-atmosphere').textContent = stats.atmosphere || '?';
    document.getElementById('am-impression').textContent = stats.impression || '?';
    
    const reviewBox = document.getElementById('am-review');
    if (m.review) { reviewBox.textContent = m.review; reviewBox.classList.remove('hidden'); }
    else { reviewBox.classList.add('hidden'); }
    document.getElementById('am-review-section').hidden=!m.review;

    for(const [key,max] of Object.entries({script:10,actors:10,directing:10,chars:10,idea:10,atmosphere:5,impression:5})){
        const value=document.getElementById(`am-${key}`);const parts=String(stats[key]||'').split('/');value.replaceChildren();
        for(const [index,part] of parts.slice(0,m.isDuo?2:1).entries()){const badge=document.createElement('span');badge.className=`archive-stat-value participant-${index+1}`;badge.textContent=part||'—';value.append(badge);}
        const row=value.parentElement;row.style.setProperty('--stat-one',`${Math.max(0,Math.min(100,Number(parts[0])/max*100))||0}%`);row.style.setProperty('--stat-two',`${Math.max(0,Math.min(100,Number(parts[1])/max*100))||0}%`);row.classList.toggle('is-duo',!!m.isDuo);
    }

    // Используем сохранённый идентификатор, а для старых записей выполняем поиск.
    document.getElementById('am-trailer-btn').onclick = async () => {
        try {
            const media = await resolveMedia(m);
            const url = await trailerUrl(media.id, media.mediaType);
            if (modal.classList.contains('hidden') || document.getElementById('am-title').textContent !== m.title) return;
            document.getElementById('trailer-iframe').src = url;
            document.getElementById('trailer-modal').classList.remove('hidden');
        } catch (error) { alert(error.message); }
    };
    document.getElementById('am-watch-btn').onclick = async () => {
        try {
            const media = await resolveMedia(m);
            window.location.href = watchUrl(media.id, media.mediaType, m.title);
        } catch (error) { alert(error.message); }
    };

    modal.classList.remove('hidden');
    document.body.classList.add('archive-detail-open');
    document.getElementById('close-archive-modal').focus({preventScroll:true});
}

function closeArchive(){document.getElementById('archive-modal').classList.add('hidden');document.body.classList.remove('archive-detail-open');archiveReturnFocus?.focus({preventScroll:true});}
document.getElementById('close-archive-modal').onclick=closeArchive;
document.getElementById('archive-modal').addEventListener('click',event=>{if(event.target.id==='archive-modal')closeArchive();});
document.addEventListener('keydown',event=>{
    if(!document.getElementById('trailer-modal').classList.contains('hidden')){if(event.key==='Escape')document.getElementById('close-trailer').click();return;}
    if(document.getElementById('archive-modal').classList.contains('hidden'))return;
    if(event.key==='Escape')closeArchive();
    if(event.key==='Tab'){const nodes=Array.from(document.querySelectorAll('#archive-modal button,#archive-modal a[href]')).filter(el=>!el.disabled);const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
document.getElementById('close-trailer').onclick = () => { document.getElementById('trailer-modal').classList.add('hidden'); document.getElementById('trailer-iframe').src = ''; };

async function removeMovie(id) {
    if (!loadedMovies.some(movie => movie.id === id && movie.userId === currentUser?.uid) || !confirm('Точно удалить?')) return;
    try {
        await deleteWithHistory(currentUser.uid,'movies',id);
        loadedMovies = loadedMovies.filter(m => m.id !== id);
        updateCounters(loadedMovies); renderGenres(loadedMovies); applyFiltersAndSort();
    } catch (e) { alert("Ошибка удаления"); }
};

function renderGenres(movies) {
    const container = document.getElementById('genre-filters'); if (!container) return;
    const activeGenre = container.querySelector('.rail-chip.active')?.dataset.genre || 'all';
    let allGenres = new Set(); movies.forEach(m => { if(m.genres) m.genres.split(',').forEach(g => allGenres.add(g.trim())); });
    container.innerHTML = `<button class="rail-chip active" data-genre="all">ВСЕ</button>` + Array.from(allGenres).sort().map(g => `<button class="rail-chip" data-genre="${escapeHtml(g)}">${escapeHtml(g.toUpperCase())}</button>`).join('');
    const selectedGenre = Array.from(container.querySelectorAll('.rail-chip')).find(button => button.dataset.genre === activeGenre);
    if (selectedGenre) { container.querySelector('.rail-chip.active')?.classList.remove('active'); selectedGenre.classList.add('active'); }
    container.querySelectorAll('.rail-chip').forEach(btn => btn.addEventListener('click', (e) => { container.querySelectorAll('.rail-chip').forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active'); applyFiltersAndSort(); }));
}

function applyFiltersAndSort() {
    let curr = [...loadedMovies];
    const q = document.getElementById('live-search').value.trim().toLowerCase();
    if (q) curr = curr.filter(m => m.title.toLowerCase().includes(q));
    
    const type = document.querySelector('.type-btn.active')?.dataset.type;
    if (type && type !== 'all') curr = curr.filter(m => (m.type || 'movie') === type);
    
    const genre = document.querySelector('.rail-chip.active')?.dataset.genre;
    if (genre && genre !== 'all') curr = curr.filter(m => m.genres && m.genres.split(',').map(value => value.trim()).includes(genre));
    
    const sort = document.querySelector('#dropdown-options .sort-opt.active')?.dataset.value;
    if (sort === 'high') curr.sort((a,b) => b.score - a.score); else if (sort === 'low') curr.sort((a,b) => a.score - b.score); else curr.sort((a,b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    
    render(curr);
    if (loading) showSkeletons(true);
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('live-search')?.addEventListener('input', applyFiltersAndSort);
    const dropdown = document.getElementById('custom-sort'), selected = document.getElementById('dropdown-selected');
    if (dropdown && selected) {
        const setSortOpen=open=>{dropdown.classList.toggle('open',open);selected.setAttribute('aria-expanded',String(open));};
        selected.addEventListener('click', () => setSortOpen(!dropdown.classList.contains('open')));
        selected.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();setSortOpen(true);dropdown.querySelector('.sort-opt.active')?.focus();}});
        const options=Array.from(dropdown.querySelectorAll('.sort-opt'));
        options.forEach((option,index)=>{option.tabIndex=0;option.setAttribute('role','button');option.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();option.click();}if(event.key==='Escape'){setSortOpen(false);selected.focus();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();options[(index+(event.key==='ArrowDown'?1:options.length-1))%options.length].focus();}});});
        document.addEventListener('click', e => { if (!dropdown.contains(e.target)) setSortOpen(false); });
        document.querySelectorAll('#dropdown-options .sort-opt').forEach(opt => opt.addEventListener('click', () => {
            document.querySelectorAll('#dropdown-options .sort-opt').forEach(o => o.classList.remove('active')); opt.classList.add('active');
            selected.innerHTML = `${escapeHtml(opt.innerText)} <span>▼</span>`; setSortOpen(false); selected.focus();applyFiltersAndSort();
        }));
    }
    document.querySelectorAll('.type-btn').forEach(btn => btn.addEventListener('click', (e) => { document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active')); e.currentTarget.classList.add('active'); applyFiltersAndSort(); }));
});

const genreRail = document.getElementById('genre-filters');
const genrePrevious = document.getElementById('genre-previous');
const genreNext = document.getElementById('genre-next');

function updateGenreScroll() {
    const max = genreRail.scrollWidth - genreRail.clientWidth;
    genrePrevious.hidden = genreNext.hidden = max <= 1;
    genrePrevious.disabled = genreRail.scrollLeft <= 1;
    genreNext.disabled = genreRail.scrollLeft >= max - 1;
}

function scrollGenres(direction) {
    genreRail.scrollBy({ left: direction * Math.max(160, genreRail.clientWidth * 0.7), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
genrePrevious.addEventListener('click', () => scrollGenres(-1));
genreNext.addEventListener('click', () => scrollGenres(1));
genreRail.addEventListener('scroll', updateGenreScroll, { passive: true });
genreRail.addEventListener('wheel', event => {
    if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const before = genreRail.scrollLeft;
    const delta = event.deltaY * (event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? genreRail.clientWidth : 1);
    genreRail.scrollLeft += delta;
    if (genreRail.scrollLeft !== before) event.preventDefault();
}, { passive: false });
genreRail.addEventListener('keydown', event => {
    if (event.target !== genreRail || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Home') genreRail.scrollLeft = 0;
    else if (event.key === 'End') genreRail.scrollLeft = genreRail.scrollWidth;
    else scrollGenres(event.key === 'ArrowRight' ? 1 : -1);
});
new ResizeObserver(updateGenreScroll).observe(genreRail);
new MutationObserver(updateGenreScroll).observe(genreRail, { childList: true });
updateGenreScroll();


function setArchiveView(view){
    grid.classList.toggle('archive-list',view==='list');
    for(const mode of ['grid','list'])document.getElementById(`archive-view-${mode}`).setAttribute('aria-pressed',String(mode===view));
    try{localStorage.setItem('archiveView',view);}catch{}
}
for(const mode of ['grid','list'])document.getElementById(`archive-view-${mode}`).addEventListener('click',()=>setArchiveView(mode));
try{setArchiveView(localStorage.getItem('archiveView')==='list'?'list':'grid');}catch{}
