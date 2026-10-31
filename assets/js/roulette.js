import { auth, onAuthStateChanged, signOut } from './firebase-init.js';
import { loadRoulette, saveRoulette } from './roulette-store.js';
import { tmdb, posterUrl, NO_POSTER, readRoulette, writeRoulette } from './shared.js';

const textArea = document.getElementById('movie-list');
const reel = document.getElementById('slot-reel');
const spinBtn = document.getElementById('spin-btn');
const duration = document.getElementById('spin-duration');
const resultModal = document.getElementById('result-modal');
const winnerName = document.getElementById('winner-name');
const modeBtns = document.querySelectorAll('.mode-btn');
let currentMode = 'classic', isSpinning = false, currentUser = null, winnerElement = null;
spinBtn.disabled = true;
textArea.disabled = true;
onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = '../index.html'; return; }
    currentUser = user;
    try { textArea.value = await loadRoulette(user.uid); }
    catch { textArea.value = readRoulette(user.uid); alert('Не удалось загрузить облачный список. Показана локальная копия.'); }
    textArea.disabled = false;
    spinBtn.disabled = false;
});
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

let saveTimer, saveQueue = Promise.resolve();
function saveList() {
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
async function getPoster(title) {
    if (posterCache.has(title)) return posterCache.get(title);
    try {
        const data = await tmdb('search/multi', { query: title });
        const item = (data.results || []).find(movie => ['movie', 'tv'].includes(movie.media_type) && movie.poster_path);
        const poster = item ? posterUrl(`https://image.tmdb.org/t/p/w200${item.poster_path}`) : NO_POSTER;
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
    const movies = [...new Set(textArea.value.split('\n').map(value => value.trim()).filter(Boolean))];
    if (movies.length < 2) return alert('Добавь хотя бы два разных тайтла!');
    if (movies.length > 200) return alert('За один раз можно прокрутить до 200 тайтлов.');
    isSpinning = true;
    spinBtn.disabled = true;
    textArea.disabled = true;
    duration.disabled = true;
    modeBtns.forEach(button => button.disabled = true);
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
        winnerName.textContent = movies[winnerIndex];
        if (currentMode === 'elimination') {
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
        spinBtn.textContent = 'КРУТИТЬ';
    }
};
document.getElementById('close-modal').onclick = () => resultModal.classList.add('hidden');
