import { auth, onAuthStateChanged, signOut } from './firebase-init.js';
import { loadRoulette, saveRoulette } from './roulette-store.js';
import { tmdb, posterUrl, NO_POSTER, readRoulette, writeRoulette, validId, watchUrl } from './shared.js';

const textArea = document.getElementById('movie-list');
const reel = document.getElementById('slot-reel');
const spinBtn = document.getElementById('spin-btn');
const duration = document.getElementById('spin-duration');
const resultModal = document.getElementById('result-modal');
const winnerName = document.getElementById('winner-name');
const modeBtns = document.querySelectorAll('.mode-btn');
let seenTitles = new Set();
let history = [], lastEliminated = '', winningTitle = '', poolPreviewTimer, poolPreviewVersion=0;
let currentMode = 'classic', isSpinning = false, currentUser = null, winnerElement = null;
spinBtn.disabled = true;
textArea.disabled = true;
document.querySelectorAll('.roulette-tools button,.roulette-tools select,.roulette-tools input,.roulette-list-toolbar button').forEach(button=>button.disabled=true);
onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = '../index.html'; return; }
    currentUser = user;
    try { const saved=JSON.parse(localStorage.getItem(`rouletteHistory:${user.uid}`)||'[]'); history=Array.isArray(saved)?saved.filter(item=>typeof item==='string').slice(0,10):[]; } catch {history=[];}
    try {const saved=JSON.parse(localStorage.getItem(`rouletteSeen:${user.uid}`)||'null');seenTitles=new Set(Array.isArray(saved)?saved.filter(item=>typeof item==='string'):history);}catch{seenTitles=new Set(history);}
    renderRouletteHistory();
    try { textArea.value = await loadRoulette(user.uid); }
    catch { textArea.value = readRoulette(user.uid); alert('Не удалось загрузить облачный список. Показана локальная копия.'); }
    textArea.disabled = false;
    spinBtn.disabled = false;
    updateRouletteCount();
    document.querySelectorAll('.roulette-tools button,.roulette-tools select,.roulette-tools input,.roulette-list-toolbar button').forEach(button=>button.disabled=false);
});
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

let saveTimer, saveQueue = Promise.resolve();
function saveList() {
    updateRouletteCount();
    const uid = currentUser?.uid;
    const text = textArea.value;
    try { writeRoulette(uid, text); }
    catch { alert('Не удалось сохранить локальную копию списка.'); }
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
        // Сохраняем изменения последовательно, чтобы старый запрос не затёр новый.
        saveQueue = saveQueue.then(() => saveRoulette(uid, text, false)).catch(() => {
            alert('Список сохранён в браузере, но не синхронизирован. Повторите изменение после восстановления сети.');
        });
    }, 500);
}
textArea.addEventListener('input', saveList);

// Старый общий список переносится только по явному действию владельца аккаунта.
try {
    const legacy = localStorage.getItem('rouletteList');
    if (legacy) {
        const importButton = document.createElement('button');
        importButton.className = 'btn-retro';
        importButton.textContent = 'Добавить старый список этого браузера';
        textArea.parentElement.before(importButton);
        importButton.addEventListener('click', () => {
            if (isSpinning || !currentUser || textArea.disabled) return;
            textArea.value = [...new Set((textArea.value + '\n' + legacy).split('\n').map(value => value.trim()).filter(Boolean))].join('\n');
            saveList();
            importButton.remove();
        });
    }
} catch { /* Продолжаем работу без доступа к старому хранилищу. */ }
modeBtns.forEach(button => button.addEventListener('click', () => {
    if (isSpinning) return;
    modeBtns.forEach(item => item.classList.toggle('active', item === button));
    currentMode = button.dataset.mode;
}));
duration.addEventListener('input', () => { document.getElementById('speed-val').textContent = `${duration.value} сек`; });

const posterCache = new Map();
const movieCache = new Map();
async function getPoster(title) {
    if (posterCache.has(title)) return posterCache.get(title);
    try {
        const data = await tmdb('search/multi', { query: title });
        const results=(data.results||[]).filter(movie=>['movie','tv'].includes(movie.media_type));
        const item=results.find(movie=>(movie.title||movie.name||'').toLocaleLowerCase()===title.toLocaleLowerCase())||results[0];
        if(item&&validId(item.id))movieCache.set(title,{id:item.id,mediaType:item.media_type,title:item.title||item.name});
        const poster = item?.poster_path ? posterUrl(`https://image.tmdb.org/t/p/w200${item.poster_path}`) : NO_POSTER;
        posterCache.set(title, poster);
        return poster;
    } catch { return NO_POSTER; }
}

function makeItem(poster, title, winner = false) {
    const item = document.createElement('div');
    item.className = `slot-item${winner ? '' : ' blur-effect'}`;
    const image = document.createElement('img');
    image.src = poster;
    image.alt = title;
    image.addEventListener('error', () => { if (!image.src.endsWith('/no-poster.svg')) image.src = NO_POSTER; }, { once: true });
    if (winner) image.style.border = '2px solid var(--gold)';
    item.appendChild(image);
    const caption=document.createElement('span');caption.className='slot-caption';caption.textContent=title;item.appendChild(caption);
    return item;
}

function centerWinner() {
    if (!winnerElement) return;
    // Измеряем реальные размеры после применения мобильных стилей.
    const offset = reel.parentElement.clientHeight / 2 - winnerElement.offsetTop - winnerElement.offsetHeight / 2;
    reel.style.transform = `translateY(${offset}px)`;
}
function resizeReel() {
    if (!winnerElement) return;
    reel.style.transition = 'none';
    centerWinner();
}
window.addEventListener('resize', resizeReel);
new ResizeObserver(resizeReel).observe(reel.parentElement);

spinBtn.onclick = async () => {
    if (isSpinning || !currentUser) return;
    const allMovies = [...new Set(textArea.value.split('\n').map(value => value.trim()).filter(Boolean))];
    const movies = currentMode === 'no-repeat' ? allMovies.filter(title=>!seenTitles.has(title)) : allMovies;
    if(currentMode==='no-repeat'&&!movies.length)return alert('Все фильмы уже выпадали. Очисти историю или пополни список.');
    if (!allMovies.length) return alert('Добавь хотя бы один тайтл или подготовь список из планов.');
    if (movies.length > 200) return alert('За один раз можно прокрутить до 200 тайтлов.');
    isSpinning = true;
    clearTimeout(poolPreviewTimer);poolPreviewVersion++;
    spinBtn.disabled = true;
    textArea.disabled = true;
    duration.disabled = true;
    modeBtns.forEach(button => button.disabled = true);
    document.querySelectorAll('.roulette-tools button,.roulette-tools select,.roulette-tools input,.roulette-list-toolbar button').forEach(button=>button.disabled=true);
    spinBtn.textContent = 'ЗАГРУЗКА…';
    try {
        // Ограничиваем число одновременных запросов к каталогу.
        const posters = new Array(movies.length);
        let next = 0;
        await Promise.all(Array.from({ length: Math.min(4, movies.length) }, async () => {
            while (next < movies.length) {
                const index = next++;
                posters[index] = await getPoster(movies[index]);
            }
        }));
        const milliseconds = Math.min(10, Math.max(1, Number(duration.value) || 5)) * 1000;
        const winnerIndex = Math.floor(Math.random() * movies.length);
        const count = Math.max(10, Math.floor(milliseconds / 120));
        winnerElement = null;
        reel.replaceChildren();
        for (let index = 0; index < count; index++) {
            const random = Math.floor(Math.random() * movies.length);
            reel.appendChild(makeItem(posters[random], movies[random]));
        }
        winnerElement = makeItem(posters[winnerIndex], movies[winnerIndex], true);
        reel.appendChild(winnerElement);
        for (let index = 0; index < 3; index++) reel.appendChild(makeItem(posters[index % movies.length], movies[index % movies.length]));
        reel.style.transition = 'none';
        reel.style.transform = 'translateY(0)';
        void reel.offsetHeight;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const animationDuration = reducedMotion ? 0 : milliseconds;
        spinBtn.textContent = 'КРУТИМ…';
        reel.style.transition = reducedMotion ? 'none' : `transform ${animationDuration}ms cubic-bezier(0.1, 0.9, 0.2, 1)`;
        centerWinner();
        await new Promise(resolve => setTimeout(resolve, animationDuration));
        reel.querySelectorAll('.slot-item').forEach(item => item.classList.remove('blur-effect'));
        winningTitle=movies[winnerIndex];
        winnerName.textContent = winningTitle;
        const winnerPoster=document.getElementById('winner-poster');winnerPoster.src=posters[winnerIndex];winnerPoster.hidden=false;
        history=[winningTitle,...history.filter(title=>title!==winningTitle)].slice(0,10);seenTitles.add(winningTitle);
        try{localStorage.setItem(`rouletteSeen:${currentUser.uid}`,JSON.stringify([...seenTitles]));}catch{}
        try{localStorage.setItem(`rouletteHistory:${currentUser.uid}`,JSON.stringify(history));}catch{}
        renderRouletteHistory();
        if (currentMode === 'elimination') {
            lastEliminated=winningTitle;document.getElementById('roulette-undo').hidden=false;
            movies.splice(winnerIndex, 1);
            textArea.value = movies.join('\n');
            saveList();
        }
        resultModal.classList.remove('hidden');
    } catch (error) { console.error('Ошибка рулетки:', error); alert('Не удалось запустить рулетку. Попробуйте ещё раз.'); }
    finally {
        isSpinning = false;
        spinBtn.disabled = false;
        textArea.disabled = false;
        duration.disabled = false;
        modeBtns.forEach(button => button.disabled = false);
        document.querySelectorAll('.roulette-tools button,.roulette-tools select,.roulette-tools input,.roulette-list-toolbar button').forEach(button=>button.disabled=false);
        spinBtn.textContent = 'Выбрать фильм';
    }
};
document.getElementById('close-modal').onclick = () => resultModal.classList.add('hidden');

function listItems() {return textArea.value.split('\n').map(value=>value.trim()).filter(Boolean);}
function updateRouletteCount() {document.getElementById('roulette-count').textContent=String(new Set(listItems()).size);previewRoulettePool();}
function renderRouletteHistory() {
    const list=document.getElementById('roulette-history');list.replaceChildren();
    if(!history.length){const item=document.createElement('li');item.textContent='Пока ничего не выбирали';item.className='history-empty';list.appendChild(item);}
    for(const title of history){const item=document.createElement('li');item.textContent=title;list.appendChild(item);}
}
document.getElementById('roulette-dedupe').addEventListener('click',()=>{textArea.value=[...new Set(listItems())].join('\n');saveList();});
document.getElementById('roulette-shuffle').addEventListener('click',()=>{
    const items=listItems();for(let i=items.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
    textArea.value=items.join('\n');saveList();
});
document.getElementById('roulette-undo').addEventListener('click',()=>{if(!lastEliminated)return;textArea.value=[...new Set([...listItems(),lastEliminated])].join('\n');saveList();lastEliminated='';document.getElementById('roulette-undo').hidden=true;});
document.getElementById('roulette-clear-history').addEventListener('click',()=>{history=[];seenTitles.clear();try{localStorage.removeItem(`rouletteHistory:${currentUser.uid}`);localStorage.removeItem(`rouletteSeen:${currentUser.uid}`);}catch{}renderRouletteHistory();});
document.getElementById('roulette-export').addEventListener('click',()=>{
    const url=URL.createObjectURL(new Blob([textArea.value],{type:'text/plain;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download='plus-plus-movies.txt';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
document.getElementById('roulette-import').addEventListener('change',async event=>{
    const file=event.target.files[0];if(!file)return;
    if(file.size>100000){document.getElementById('roulette-status').textContent='Файл должен быть не больше 100 КБ';event.target.value='';return;}
    const text=await file.text();if(isSpinning)return;
    textArea.value=[...new Set([...listItems(),...text.replace(/^\uFEFF/,'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean)])].join('\n');saveList();event.target.value='';
});
document.getElementById('roulette-discover').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try {
        const genre=document.getElementById('roulette-discover-genre').value;
        const data=await tmdb('discover/movie',{sort_by:'popularity.desc',...(genre?{with_genres:genre}:{}),page:Math.floor(Math.random()*5)+1});
        const items=listItems(),existing=new Set(items);
        const additions=(data.results||[]).filter(movie=>movie.title&&!existing.has(movie.title)).slice(0,10);
        for(const movie of additions){items.push(movie.title);movieCache.set(movie.title,{id:movie.id,mediaType:'movie',title:movie.title});if(movie.poster_path)posterCache.set(movie.title,posterUrl(`https://image.tmdb.org/t/p/w200${movie.poster_path}`));}
        textArea.value=[...new Set(items)].join('\n');saveList();document.getElementById('roulette-status').textContent=`Добавлено: ${additions.length}`;
    }catch{document.getElementById('roulette-status').textContent='Не удалось получить фильмы из каталога. Попробуй ещё раз.';}
    finally{button.disabled=false;}
});
async function openWinner(rate) {
    if(!winningTitle)return;
    await getPoster(winningTitle);const movie=movieCache.get(winningTitle);
    if(!movie){alert('Тайтл не найден. Попробуй уточнить название в списке.');return;}
    location.href=rate?`rate.html?${new URLSearchParams({id:movie.id,type:movie.mediaType,title:movie.title})}`:watchUrl(movie.id,movie.mediaType,movie.title);
}
document.getElementById('roulette-watch-winner').addEventListener('click',()=>openWinner(false));
document.getElementById('roulette-rate-winner').addEventListener('click',()=>openWinner(true));

// До вращения показываем реальные варианты из списка вместо пустого барабана.
function previewRoulettePool() {
    if(isSpinning)return;
    clearTimeout(poolPreviewTimer);const request=++poolPreviewVersion;
    poolPreviewTimer=setTimeout(async()=>{
        const titles=[...new Set(listItems())].slice(0,3);
        if(!titles.length){reel.replaceChildren();const empty=document.createElement('div');empty.className='slot-item';empty.textContent='Добавь фильмы в список';reel.appendChild(empty);reel.style.transform='none';winnerElement=null;return;}
        const posters=await Promise.all(titles.map(getPoster));
        if(request!==poolPreviewVersion||isSpinning)return;
        winnerElement=null;reel.style.transition='none';reel.style.transform='none';reel.replaceChildren();
        for(let i=0;i<3;i++){const index=i%titles.length;const item=makeItem(posters[index],titles[index]);item.classList.remove('blur-effect');reel.appendChild(item);}
    },350);
}
