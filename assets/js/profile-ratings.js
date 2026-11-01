import { MASTERPIECE_BANNER } from './rating-style.js';
import { db, collection, query, where, orderBy, limit, startAfter, getDocs } from './firebase-init.js';
import { posterUrl } from './shared.js';

// Просмотр оценок не содержит действий изменения или удаления чужих записей.
export function createProfileRatings() {
    const element = id => document.getElementById(id);
    const grid = element('profile-ratings-grid');
    const status = element('profile-ratings-status');
    const more = element('profile-ratings-more');
    const dialog = element('rating-detail-dialog');
    const pageSize = 24;
    let targetUid = '', allowed = false, busy = false, moreAvailable = false, cursor = null, records = [], version = 0, pendingState = null;
    function filtered() {
        const search = element('ratings-search').value.trim().toLocaleLowerCase();
        const type = element('ratings-type').value;
        const sort = element('ratings-sort').value;
        const result = records.filter(movie => (!search || movie.title.toLocaleLowerCase().includes(search)) && (type === 'all' || movie.type === type));
        if (sort === 'high') result.sort((a,b) => b.score - a.score);
        if (sort === 'low') result.sort((a,b) => a.score - b.score);
        return result;
    }
    function details(movie) {
        if (!allowed) return;
        element('rating-detail-title').textContent = movie.title;
        dialog.classList.toggle('is-masterpiece',movie.score===10);
        element('rating-detail-distinction').hidden=movie.score!==10;
        element('rating-detail-poster').src = posterUrl(movie.poster);
        element('rating-detail-score').textContent = movie.score === null ? '—' : movie.score.toFixed(1);
        element('rating-detail-date').textContent = typeof movie.date === 'string' ? movie.date : '';
        element('rating-detail-genres').textContent = typeof movie.genres === 'string' ? movie.genres : '';
        element('rating-detail-review').textContent = typeof movie.review === 'string' && movie.review.trim() ? movie.review : 'Без отзыва';
        const stats = element('rating-detail-stats'); stats.replaceChildren();
        const labels = {script:'Сценарий',actors:'Актёры',directing:'Режиссура',chars:'Персонажи',idea:'Идея',atmosphere:'Атмосфера',impression:'Впечатление'};
        const criteria = movie.ratingMode === 'quick' ? {script:movie.isDuo?'Общие оценки двух участников':'Общая оценка'} : labels;
        for (const [key, label] of Object.entries(criteria)) {
            const value = movie.stats?.[key];
            if (typeof value !== 'string' && typeof value !== 'number') continue;
            const row = document.createElement('div');
            const term = document.createElement('dt'); term.textContent = label;
            const description = document.createElement('dd'); description.textContent = String(value);
            row.append(term, description); stats.appendChild(row);
        }
        if (!dialog.open) dialog.showModal();
    }
    function render() {
        grid.replaceChildren();
        const movies = filtered();
        for (const movie of movies) {
            const card = document.createElement('button'); card.type = 'button'; card.className = 'profile-rating-card';
            card.setAttribute('aria-label', `${movie.title}, оценка ${movie.score === null ? 'не указана' : movie.score.toFixed(1)}`);
            const frame = document.createElement('span'); frame.className = 'profile-rating-frame';
            const image = document.createElement('img'); image.src = posterUrl(movie.poster); image.alt = ''; image.loading = 'lazy';
            const score = document.createElement('span'); score.className = 'profile-rating-score';
            score.textContent = movie.score === null ? '—' : movie.score.toFixed(1);
            if (movie.score === 10) {score.classList.add('is-perfect');score.textContent='10.0 / 10';card.classList.add('masterpiece');}
            const title = document.createElement('span'); title.className = 'profile-rating-title'; title.textContent = movie.title;
            const genre = document.createElement('span'); genre.className = 'profile-rating-genre'; genre.textContent = typeof movie.genres === 'string' ? movie.genres.split(',')[0] : '';
            frame.append(image, score);if(movie.score===10){const ribbon=document.createElement('span');ribbon.innerHTML=MASTERPIECE_BANNER;frame.append(ribbon.firstElementChild);}
            card.append(frame, title, genre);
            card.addEventListener('click', () => details(movie)); grid.appendChild(card);
        }
        if (!movies.length && !busy) status.textContent = records.length ? 'По этим фильтрам пока ничего не найдено.' : 'Оценок пока нет.';
        else if (!busy) status.textContent = '';
        if (busy) skeletons();
    }
    function skeletons() {
        for (let index = 0; index < 4; index++) {
            const card = document.createElement('div'); card.className = 'profile-rating-placeholder'; card.setAttribute('aria-hidden','true');
            const frame = document.createElement('div'); frame.className = 'profile-rating-frame skeleton-surface';
            card.appendChild(frame); grid.appendChild(card);
        }
    }
    async function load(append = false) {
        if (!allowed || busy || append && !moreAvailable) return;
        const request = version;
        busy = true; more.disabled = true; status.textContent = '';
        if (!append) { records = []; cursor = null; }
        render(); grid.setAttribute('aria-busy','true');
        try {
            const constraints = [where('userId','==',targetUid),orderBy('timestamp','desc')];
            if (append && cursor) constraints.push(startAfter(cursor));
            const snapshot = await getDocs(query(collection(db,'movies'), ...constraints, limit(pageSize + 1)));
            if (request !== version || !allowed) return;
            const docs = snapshot.docs.slice(0,pageSize);
            records.push(...docs.map(record => {
                const data = record.data();
                return {...data,id:record.id,title:typeof data.title === 'string' ? data.title : 'Без названия',score:typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= 10 ? data.score : null};
            }));
            cursor = docs.at(-1) || cursor; moreAvailable = snapshot.size > pageSize;
            busy = false; render(); more.hidden = !moreAvailable; more.textContent = 'Загрузить ещё';
        } catch (error) {
            if (request !== version) return;
            console.error('Ошибка загрузки оценок:',error);
            busy = false; render();
            status.textContent = 'Не удалось загрузить оценки. Попробуйте ещё раз.';
            more.hidden = false; more.textContent = 'Повторить загрузку';
        } finally {
            if (request === version) { busy = false; more.disabled = false; grid.setAttribute('aria-busy','false'); }
        }
    }
    more.addEventListener('click', () => load(records.length > 0));
    element('ratings-refresh').addEventListener('click', () => load());
    for (const id of ['ratings-search','ratings-type','ratings-sort']) element(id).addEventListener(id === 'ratings-search' ? 'input' : 'change', () => { if (allowed) render(); });
    return {
        setAccess(uid, canRead, pending = false) {
            if (uid === targetUid && allowed === canRead && pending === pendingState) return;
            version++; pendingState = pending; targetUid = uid; allowed = canRead; busy = false; records = []; cursor = null; moreAvailable = false;
            grid.replaceChildren(); grid.setAttribute('aria-busy','false'); more.hidden = true;
            if (dialog.open) dialog.close();
            for (const id of ['rating-detail-title','rating-detail-score','rating-detail-date','rating-detail-genres','rating-detail-review']) element(id).textContent = '';
            element('rating-detail-poster').removeAttribute('src'); element('rating-detail-stats').replaceChildren();
            element('ratings-controls').hidden = !canRead;
            element('ratings-refresh').hidden = !canRead;
            element('profile-ratings').hidden = !uid;
            status.textContent = pending ? 'Проверяем доступ к оценкам…' : canRead ? '' : 'Оценки доступны друзьям. После принятия заявки они появятся здесь.';
            if (canRead) load();
        }
    };
}
