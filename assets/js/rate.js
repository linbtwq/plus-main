import { saveRatingRecord } from './activity-store.js';
import { mediaMetadata } from './activity-model.js';
import { findRating } from './rating-match.js';
import { createJointRatingForm } from './joint-rating-form.js';
import { saveJointRating } from './joint-ratings.js';
import { readAll, removePlan } from './library-store.js';
import { getProfile } from './profile-store.js';
import { auth, db, getDoc, doc, serverTimestamp, onAuthStateChanged, signOut } from './firebase-init.js';

import { TMDB_API_KEY, fetchJson, tmdb, validId } from './shared.js';
const ratingMode = 'detailed';
let editingRecord=null;
let selectedMovie = null;
let selectedTmdbId = null, selectedMediaType = null, searchRequest = 0, saving = false;
let currentUser = null, currentScore = 0, selectedPoster = '', selectedGenres = '';

const jointForm=createJointRatingForm(()=>currentUser);
const GENRE_MAP = { 28: "Боевик", 12: "Приключения", 16: "Мультфильм", 35: "Комедия", 80: "Криминал", 99: "Документальный", 18: "Драма", 10751: "Семейный", 14: "Фэнтези", 36: "История", 27: "Ужасы", 10402: "Музыка", 9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика", 10770: "ТВ фильм", 53: "Триллер", 10752: "Военный", 37: "Вестерн", 10759: "Боевик/Прикл.", 10762: "Детский", 10763: "Новости", 10764: "Реалити", 10765: "Фантастика/Фэнтези", 10766: "Мыльная опера", 10767: "Ток-шоу", 10768: "Война/Политика" };

const ICON = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const SAVE_HTML = `${ICON('bookmark-plus')} СОХРАНИТЬ В АРХИВ`;
const SPIN_HTML = `${ICON('loader-circle', 'ic-spin')} СОХРАНЕНИЕ…`;
const NO_IMG = "data:image/svg+xml;utf8," + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='92' height='138'><rect width='92' height='138' fill='#2A0111'/><rect x='6' y='6' width='80' height='126' rx='6' fill='none' stroke='#78B6DB' stroke-opacity='.5' stroke-dasharray='4 4'/></svg>");

function showToast(msg) {
    const t = document.getElementById('toast'); if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    requestAnimationFrame(() => t.classList.add('show'));
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.classList.add('hidden'), 300); }, 2600);
}

onAuthStateChanged(auth, (user) => { if (user) { currentUser = user;jointForm.load(); if(new URLSearchParams(location.search).has('edit'))loadEditingRecord();else checkRatingDraft(); } else window.location.href = '../index.html'; });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const titleInput = document.getElementById('movie-title');
const suggestionsBox = document.getElementById('suggestions');
const previewBox = document.getElementById('movie-preview');
const previewPosterImg = document.getElementById('preview-poster-img');
const previewNoPoster = document.getElementById('preview-no-poster');
const previewOverview = document.getElementById('preview-overview');
const typeSelected = document.getElementById('media-type-selected');
const typeOptions = document.querySelectorAll('#media-type-options .sort-opt');

let searchTimer, abortController;

titleInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    abortController?.abort();
    const request = ++searchRequest;
    suggestionsBox.style.display = 'none';
    const query = e.target.value.trim();
    if (query.length < 2) { suggestionsBox.style.display = 'none'; return; }

    searchTimer = setTimeout(async () => {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        try {
            const resp = await fetchJson(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`, { signal: abortController.signal });
            const data = resp;
            if (request !== searchRequest) return;
            showSuggestions(data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv').slice(0, 5));
        } catch (err) { if (err.name !== 'AbortError' && request === searchRequest) showToast('Не удалось загрузить подсказки. Попробуйте ещё раз.'); }
    }, 500);
});

function showSuggestions(movies) {
    if (movies.length === 0) return suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = ''; suggestionsBox.style.display = 'block';

    movies.forEach(m => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';div.tabIndex=0;div.setAttribute('role','button');div.setAttribute('aria-label',`Оценить: ${m.title||m.name}`);
        div.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();div.click();}if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();(event.key==='ArrowDown'?div.nextElementSibling:div.previousElementSibling)?.focus();}if(event.key==='Escape'){suggestionsBox.style.display='none';titleInput.focus();}});
        const title = m.title || m.name;
        const thumb = document.createElement('img');
        thumb.src = m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : NO_IMG;
        thumb.alt = '';
        const name = document.createElement('div');
        name.className = 'suggestion-name';
        name.textContent = title;
        const year = (m.release_date || m.first_air_date || '').slice(0, 4);
        if (year) { const y = document.createElement('span'); y.className = 'suggestion-year'; y.textContent = year; name.appendChild(y); }
        div.append(thumb, name);
        
        div.addEventListener('click', () => {
            selectedTmdbId = m.id; selectedMediaType = m.media_type;
            titleInput.value = title;
            selectedPoster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
            
            let mediaType = 'movie';
            if (m.media_type === 'tv') mediaType = (m.original_language === 'ja' && m.genre_ids?.includes(16)) ? 'anime' : 'series';
            
            typeOptions.forEach(opt => opt.classList.remove('active'));
            const targetOpt = document.querySelector(`#media-type-options .sort-opt[data-value="${mediaType}"]`);
            if (targetOpt) { targetOpt.classList.add('active'); typeSelected.innerHTML = `${targetOpt.innerHTML} <span>▼</span>`; typeSelected.setAttribute('data-value', mediaType); }

            if (selectedPoster) { previewPosterImg.src = selectedPoster; previewPosterImg.style.display = 'block'; previewNoPoster.classList.add('hidden'); } 
            else { previewPosterImg.style.display = 'none'; previewNoPoster.classList.remove('hidden'); }

            selectedGenres = m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ') : '';
            document.getElementById('preview-title').textContent = title;
            document.getElementById('preview-genres').textContent = selectedGenres || 'Жанр не указан';
            previewOverview.textContent = m.overview || 'Описание отсутствует...';
            
            selectedMovie = {...m, media_type:m.media_type};
            previewBox.classList.remove('hidden'); document.getElementById('search-wrapper').style.display = 'none'; suggestionsBox.style.display = 'none'; saveRatingDraft();
        });
        suggestionsBox.appendChild(div);
    });
}

document.getElementById('clear-preview').addEventListener('click', () => {
    searchRequest++; abortController?.abort(); clearTimeout(searchTimer); selectedTmdbId = null; selectedMediaType = null; selectedMovie = null;
    titleInput.value = ''; selectedPoster = ''; selectedGenres = '';
    previewBox.classList.add('hidden'); document.getElementById('search-wrapper').style.display = 'block'; titleInput.focus();
});

// У каждого критерия есть точный ввод числа и ползунок для быстрого выбора.
for(const range of document.querySelectorAll('.sliders-wrapper input[type="range"]')) {
    const old=document.getElementById(`val-${range.id}`);
    const input=document.createElement('input');input.type='number';input.id=old.id;input.className='val-display';input.min=range.min;input.max=range.max;input.step='.1';input.value=range.value;
    const label=range.closest('.range-group').querySelector('.rg-name').textContent;
    input.setAttribute('aria-label',`${label}, точная оценка`);range.setAttribute('aria-label',label);old.replaceWith(input);
    input.addEventListener('change',()=>{range.value=String(Math.min(Number(range.max),Math.max(Number(range.min),Number(input.value)||Number(range.min))));range.dispatchEvent(new Event('input',{bubbles:true}));});
}
const getVal = (id) => parseFloat(document.getElementById(id).value);
function getScore(suffix) {
    let base = 0; ['script', 'actors', 'directing', 'chars', 'idea'].forEach(id => { const v = getVal(`${id}-${suffix}`); document.getElementById(`val-${id}-${suffix}`).value = v.toFixed(1); base += v; });
    let vibe = 0; ['atmosphere', 'impression'].forEach(id => { const v = getVal(`${id}-${suffix}`); document.getElementById(`val-${id}-${suffix}`).value = v.toFixed(1); vibe += v; });
    return (base + vibe) / 6;
}

const VERDICTS = [
    { max: 3.5, text: 'Лучше бы не смотрели' },
    { max: 5.5, text: 'Так себе, на один раз' },
    { max: 7.0, text: 'Нормально, можно глянуть' },
    { max: 8.5, text: 'Достойно, рекомендую' },
    { max: 9.9, text: 'Отличное кино!' },
    { max: 10.0, text: 'Абсолютный шедевр' }
];

function calculate() {
    const score1 = getScore('1'); let raw = score1;
    if (document.getElementById('is-duo-checkbox').checked) raw = (score1 + getScore('2')) / 2;
    let final = Math.round(raw * 10) / 10; if (final === 10 && raw < 10) final = 9.9;

    const display = document.getElementById('final-score');
    if (currentScore !== final) { display.classList.remove('pulse'); void display.offsetWidth; display.classList.add('pulse'); display.classList.add('vhs-glitch'); setTimeout(() => display.classList.remove('vhs-glitch'), 150); }
    currentScore = final; display.textContent = currentScore.toFixed(1);
    
    const match = VERDICTS.find(v => currentScore <= v.max) || VERDICTS[VERDICTS.length - 1];
    document.getElementById('score-verdict').textContent = match.text;
    
    display.classList.remove('color-red', 'color-orange', 'color-yellow', 'color-lime', 'color-green', 'color-gold');
    if (currentScore < 4.0) display.classList.add('color-red'); else if (currentScore < 5.5) display.classList.add('color-orange');
    else if (currentScore < 7.0) display.classList.add('color-yellow'); else if (currentScore < 8.5) display.classList.add('color-lime');
    else if (currentScore < 10.0) display.classList.add('color-green'); else display.classList.add('color-gold');

    const colorCls = ['color-red', 'color-orange', 'color-yellow', 'color-lime', 'color-green', 'color-gold'].find(c => display.classList.contains(c));
    const ring = document.getElementById('score-ring');
    if (ring) { const wasMaximum=ring.dataset.maximum==='true';ring.dataset.maximum=String(currentScore===10);ring.className = 'score-ring ' + colorCls;
        if(currentScore===10&&!wasMaximum&&!matchMedia('(prefers-reduced-motion: reduce)').matches)ring.classList.add('is-maximum'); ring.style.setProperty('--score', (currentScore * 10).toFixed(1)); }
    const mini = document.getElementById('mini-score');
    if (mini) { mini.className = 'mini-score ' + colorCls + (mini.classList.contains('show') ? ' show' : ''); document.getElementById('mini-val').textContent = currentScore.toFixed(1); }
}

// Логика для чекбокса парной оценки
document.getElementById('is-duo-checkbox')?.addEventListener('change', (e) => {
    const user2Col = document.getElementById('user2-col');
    const user1Title = document.getElementById('user1-title');
    const slidersWrapper = document.getElementById('sliders-wrapper');
    
    if (e.target.checked) {
        user2Col?.classList.remove('hidden');
        user1Title?.classList.remove('hidden');
        slidersWrapper?.classList.add('is-duo');
    } else {
        user2Col?.classList.add('hidden');
        user1Title?.classList.add('hidden');
        slidersWrapper?.classList.remove('is-duo');
    }
    calculate(); // Пересчитываем балл
});

const paintRange = (el) => el.style.setProperty('--f', ((el.value - el.min) / (el.max - el.min)).toFixed(4));
document.querySelectorAll('.sliders-wrapper input[type="range"]').forEach(i => { i.addEventListener('input', () => { paintRange(i); calculate(); }); paintRange(i); });
calculate();

// Плавающий балл: виден, пока итоговая карточка ниже экрана
const miniScore = document.getElementById('mini-score');
const finalBox = document.querySelector('.final-score-box');
miniScore.addEventListener('click',()=>{finalBox.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center'});document.getElementById('save-btn').focus({preventScroll:true});});
function updateMini() {
    if (!miniScore || !finalBox) return;
    const r = finalBox.getBoundingClientRect();
    const farBelow = r.top > window.innerHeight * 0.9;
    miniScore.classList.toggle('show', farBelow && !previewBox.classList.contains('hidden'));
}
window.addEventListener('scroll', updateMini, { passive: true });
window.addEventListener('resize', updateMini);
document.addEventListener('click', () => setTimeout(updateMini, 60));
updateMini();

document.getElementById('save-btn').onclick = async () => {
    if (saving) return;
    if (!currentUser) return showToast('Дождитесь входа в аккаунт');
    if (!validId(selectedTmdbId)) return showToast('Выберите тайтл из каталога');
    if (!titleInput.value.trim() || previewBox.classList.contains('hidden')) { showToast('Сначала выбери фильм из подсказок'); titleInput.focus(); return; }
    clearTimeout(draftTimer);
    saving = true;
    const btn = document.getElementById('save-btn'); btn.disabled = true; btn.innerHTML = SPIN_HTML;

    calculate();
    const isDuo = document.getElementById('is-duo-checkbox').checked;
    const finalStats = {
        script: isDuo ? `${getVal('script-1').toFixed(1)}/${getVal('script-2').toFixed(1)}` : getVal('script-1').toFixed(1),
        actors: isDuo ? `${getVal('actors-1').toFixed(1)}/${getVal('actors-2').toFixed(1)}` : getVal('actors-1').toFixed(1),
        directing: isDuo ? `${getVal('directing-1').toFixed(1)}/${getVal('directing-2').toFixed(1)}` : getVal('directing-1').toFixed(1),
        chars: isDuo ? `${getVal('chars-1').toFixed(1)}/${getVal('chars-2').toFixed(1)}` : getVal('chars-1').toFixed(1),
        idea: isDuo ? `${getVal('idea-1').toFixed(1)}/${getVal('idea-2').toFixed(1)}` : getVal('idea-1').toFixed(1),
        atmosphere: isDuo ? `${getVal('atmosphere-1').toFixed(1)}/${getVal('atmosphere-2').toFixed(1)}` : getVal('atmosphere-1').toFixed(1),
        impression: isDuo ? `${getVal('impression-1').toFixed(1)}/${getVal('impression-2').toFixed(1)}` : getVal('impression-1').toFixed(1)
    };

    try {
        const authorProfile = await getProfile(currentUser.uid).catch(() => null);
        if(!editingRecord){
            const duplicate=findRating((await readAll('movies',currentUser.uid)).sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0)),{id:selectedTmdbId,mediaType:selectedMediaType,title:titleInput.value,poster:selectedPoster,year:(selectedMovie?.release_date||selectedMovie?.first_air_date||'').slice(0,4)});
            if(duplicate){if(!confirm('У тебя уже есть оценка этого тайтла. Обновить её вместо создания копии?')){saving=false;btn.disabled=false;btn.innerHTML=SAVE_HTML;return;}editingRecord=duplicate;}
        }
        const payload = {
            schemaVersion: 2, ratingMode, tmdbId: Number(selectedTmdbId), mediaType: selectedMediaType,
            title: titleInput.value.trim(), genres: selectedGenres, type: typeSelected.getAttribute('data-value'),
            score: currentScore, isDuo, poster: selectedPoster, authorName: authorProfile?.displayName || currentUser.displayName || 'Киноман',
            authorPhoto: currentUser.photoURL, userId: currentUser.uid, timestamp: editingRecord?.timestamp || serverTimestamp(),
            date: editingRecord?.date || new Date().toLocaleDateString('ru-RU'), stats: finalStats, review: document.getElementById('review-text').value.trim() || null
        };
        try{payload.metadata=mediaMetadata(await tmdb(`${selectedMediaType}/${selectedTmdbId}`,{append_to_response:'credits'}),selectedMediaType);}catch{if(editingRecord?.metadata)payload.metadata=editingRecord.metadata;}
        const partner=jointForm.selected();
        if(editingRecord?.jointPartnerId){payload.jointPartnerId=editingRecord.jointPartnerId;payload.jointPartnerName=editingRecord.jointPartnerName||'';payload.jointFirstId=currentUser.uid;}
        if(partner&&!editingRecord?.jointPartnerId)await saveJointRating(currentUser.uid,payload,partner,editingRecord?.id||'');
        else await saveRatingRecord(currentUser.uid,payload,editingRecord?.id||'');
        removePlan(currentUser.uid,{tmdbId:selectedTmdbId,mediaType:selectedMediaType}).catch(()=>{});
        try { if (typeof window.confetti === 'function') window.confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#78B6DB', '#E9F0F8', '#B8104B', '#FF5C8D'] }); } catch { /* Сохранение не зависит от декоративной анимации. */ }
        try { if(!new URLSearchParams(location.search).has('edit'))localStorage.removeItem(`ratingDraft:${currentUser.uid}`); } catch {}
        setTimeout(() => { window.location.href = 'list.html'; }, 800);
    } catch (e) { saving = false; console.error(e); showToast(e.code?'Не удалось сохранить, попробуй ещё раз':e.message||'Не удалось сохранить, попробуй ещё раз'); btn.disabled = false; btn.innerHTML = SAVE_HTML; }
};

// При переходе из плеера выбираем точный тайтл по идентификатору.
const pageUrlParams = new URLSearchParams(window.location.search);
const prefillId = pageUrlParams.get('id');
const prefillType = pageUrlParams.get('type');
if (validId(prefillId) && ['movie', 'tv'].includes(prefillType)) {
    tmdb(`${prefillType}/${prefillId}`).then(movie => {
        if (selectedTmdbId || titleInput.value.trim()) return;
        showSuggestions([{ ...movie, media_type: prefillType, genre_ids: (movie.genres || []).map(genre => genre.id) }]);
        suggestionsBox.firstElementChild?.click();
    }).catch(() => showToast('Не удалось загрузить тайтл. Выберите его через поиск.'));
} else if (pageUrlParams.get('title')) {
    titleInput.value = pageUrlParams.get('title');
    titleInput.dispatchEvent(new Event('input'));
}

// Обрабатываем выбор категории мышью и клавиатурой.
const typeDropdown = document.getElementById('media-type-dropdown');
typeSelected.tabIndex = 0;
typeSelected.setAttribute('role', 'button');
typeSelected.setAttribute('aria-expanded', 'false');
function toggleType() {
    typeDropdown.classList.toggle('open');
    typeSelected.setAttribute('aria-expanded', String(typeDropdown.classList.contains('open')));
}
typeSelected.addEventListener('click', toggleType);
typeSelected.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleType(); }
});
typeOptions.forEach(option => {
    option.tabIndex = 0;
    const select = () => {
        typeOptions.forEach(item => item.classList.toggle('active', item === option));
        typeSelected.replaceChildren(...Array.from(option.childNodes, child => child.cloneNode(true)));
        typeSelected.dataset.value = option.dataset.value;
        typeDropdown.classList.remove('open');
        typeSelected.setAttribute('aria-expanded', 'false');
    };
    option.addEventListener('click', select);
    option.addEventListener('keydown', event => { if (event.key === 'Enter') select(); });
});
document.addEventListener('click', event => {
    if (!typeDropdown.contains(event.target)) { typeDropdown.classList.remove('open'); typeSelected.setAttribute('aria-expanded', 'false'); }
});

// Черновик принадлежит аккаунту и восстанавливается только по явному выбору.
let draftTimer;
function saveRatingDraft() {
    if(!currentUser || saving || !selectedMovie || editingRecord || new URLSearchParams(location.search).has('edit'))return;
    clearTimeout(draftTimer);draftTimer=setTimeout(()=>{
        if(saving)return;
        const data={movie:selectedMovie,mode:ratingMode,duo:document.getElementById('is-duo-checkbox').checked,review:document.getElementById('review-text').value,type:typeSelected.dataset.value,partnerId:jointForm.selected()?.uid||'',values:{}};
        document.querySelectorAll('.sliders-wrapper input[type="range"]').forEach(input=>data.values[input.id]=input.value);
        try {localStorage.setItem(`ratingDraft:${currentUser.uid}`,JSON.stringify(data));document.getElementById('rating-draft-status').textContent='Черновик сохранён';}catch{document.getElementById('rating-draft-status').textContent='Не удалось сохранить черновик';}
    },400);
}
function checkRatingDraft() {
    let draft;try{draft=JSON.parse(localStorage.getItem(`ratingDraft:${currentUser.uid}`)||'null');}catch{return;}
    if(!draft?.movie||!validId(draft.movie.id))return;
    const wrapper=document.createElement('div');wrapper.className='rating-draft-banner';
    const text=document.createElement('span');text.textContent=`Есть черновик: ${draft.movie.title||draft.movie.name}`;
    const restore=document.createElement('button');restore.type='button';restore.className='text-button';restore.textContent='Восстановить';
    const discard=document.createElement('button');discard.type='button';discard.className='text-button';discard.textContent='Удалить';
    restore.addEventListener('click',()=>{
        showSuggestions([draft.movie]);suggestionsBox.firstElementChild?.click();
        for(const [id,value] of Object.entries(draft.values||{})){const input=document.getElementById(id);if(input?.matches('.sliders-wrapper input[type="range"]')&&Number.isFinite(Number(value))){input.value=String(Math.min(Number(input.max),Math.max(Number(input.min),Number(value))));if(input.type==='range')paintRange(input);}}
        document.getElementById('is-duo-checkbox').checked=!!draft.duo;document.getElementById('is-duo-checkbox').dispatchEvent(new Event('change'));
        jointForm.restore(draft.partnerId);document.getElementById('review-text').value=String(draft.review||'').slice(0,10000);wrapper.remove();calculate();
    });
    discard.addEventListener('click',()=>{try{localStorage.removeItem(`ratingDraft:${currentUser.uid}`);}catch{}wrapper.remove();});
    wrapper.append(text,restore,discard);document.querySelector('.rate-page-heading').after(wrapper);
}
document.querySelector('.rate-wrapper').addEventListener('input',saveRatingDraft);
document.querySelector('.rate-wrapper').addEventListener('change',saveRatingDraft);


// Редактирование загружает только собственную запись и сохраняет исходную дату.
async function loadEditingRecord(){
    const id=new URLSearchParams(location.search).get('edit');
    if(!id||id.includes('/')||id.length>1500){showToast('Неверный код оценки');return;}
    document.getElementById('save-btn').disabled=true;
    try{
        const snapshot=await getDoc(doc(db,'movies',id));
        if(!snapshot.exists()||snapshot.data().userId!==currentUser.uid)throw new Error('Оценка недоступна');
        const movie={...snapshot.data(),id};
        const media=movie.tmdbId&&movie.mediaType?{id:movie.tmdbId,mediaType:movie.mediaType}:await (await import('./shared.js')).resolveMedia(movie);
        showSuggestions([{id:media.id,media_type:media.mediaType,title:movie.title,poster_path:movie.poster?.split('/w500')[1]||'',genre_ids:[],overview:''}]);suggestionsBox.firstElementChild?.click();
        editingRecord=movie;selectedGenres=movie.genres||'';document.getElementById('preview-genres').textContent=selectedGenres;
        const option=document.querySelector(`#media-type-options [data-value="${['movie','series','anime'].includes(movie.type)?movie.type:'movie'}"]`);option?.click();
        document.getElementById('is-duo-checkbox').checked=!!movie.isDuo;document.getElementById('is-duo-checkbox').dispatchEvent(new Event('change'));
        for(const key of ['script','actors','directing','chars','idea','atmosphere','impression']){
            const parts=String(movie.stats?.[key]||'').split('/');if(movie.jointFirstId&&movie.jointFirstId!==currentUser.uid)parts.reverse();
            for(const [index,user] of ['1','2'].entries()){
                const range=document.getElementById(`${key}-${user}`),value=Number(parts[index]??parts[0]);
                if(Number.isFinite(value)&&value>0){range.value=Math.min(Number(range.max),Math.max(Number(range.min),value));paintRange(range);}
            }
        }
        jointForm.restore(movie.jointPartnerId);if(movie.jointPartnerId){jointForm.lock();document.getElementById('is-duo-checkbox').disabled=true;}document.getElementById('review-text').value=movie.review||'';
        document.querySelector('.rate-page-heading h1').textContent='Изменить оценку';
        document.querySelector('.score-save-row > p').textContent='Изменения обновят запись в архиве.';
        document.getElementById('clear-preview').hidden=true;
        calculate();
    }catch(error){showToast('Не удалось открыть оценку для изменения.');console.error(error);}
    finally{document.getElementById('save-btn').disabled=false;}
}

// Подсказки объясняют разницу между критериями без дополнительных экранов.
const criterionHints={script:'Сюжет, диалоги, логика событий и темп истории.',actors:'Убедительность актёрской игры или озвучки персонажей.',directing:'Постановка сцен, визуальный язык и работа с ритмом.',chars:'Насколько интересны герои, их мотивация, развитие и насколько хорошо прописаны.',idea:'Замысел и темы: что фильм хочет сказать и насколько это цепляет.',atmosphere:'Музыка, звук и настроение мира фильма. До 5 баллов.',impression:'Личное послевкусие и желание вернуться к фильму. До 5 баллов.'};
for(const group of document.querySelectorAll('.range-group')){
    const key=group.querySelector('input[type="range"]').id.replace(/-[12]$/,'');
    const help=document.createElement('details');help.className='criterion-help';
    const summary=document.createElement('summary');summary.textContent='Что оцениваем';
    const text=document.createElement('p');text.textContent=criterionHints[key];help.append(summary,text);group.append(help);
}

// Подсказки доступны без мыши: стрелка вниз переводит фокус на результат.
titleInput.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&suggestionsBox.style.display!=='none'&&suggestionsBox.firstElementChild){event.preventDefault();suggestionsBox.firstElementChild.focus();}if(event.key==='Escape')suggestionsBox.style.display='none';});
