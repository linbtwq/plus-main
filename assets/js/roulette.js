import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
onAuthStateChanged(auth, (user) => { if (!user) window.location.href = '../index.html'; });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const textArea = document.getElementById('movie-list');
const reel = document.getElementById('slot-reel');
const spinBtn = document.getElementById('spin-btn');
const resultModal = document.getElementById('result-modal');
const winnerName = document.getElementById('winner-name');
const modeBtns = document.querySelectorAll('.mode-btn');
let currentMode = 'classic', isSpinning = false;

textArea.value = localStorage.getItem('rouletteList') || '';
textArea.addEventListener('input', () => localStorage.setItem('rouletteList', textArea.value));

modeBtns.forEach(btn => btn.addEventListener('click', (e) => {
    if (isSpinning) return; modeBtns.forEach(b => b.classList.remove('active')); e.target.classList.add('active'); currentMode = e.target.getAttribute('data-mode');
}));

document.getElementById('spin-duration')?.addEventListener('input', (e) => { document.getElementById('speed-val').textContent = `${e.target.value} сек`; });

async function getPoster(title) {
    try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&language=ru-RU`);
        const data = await res.json();
        const item = data.results.find(r => r.poster_path);
        return item ? `https://image.tmdb.org/t/p/w200${item.poster_path}` : 'https://via.placeholder.com/100x150?text=No+Poster';
    } catch { return 'https://via.placeholder.com/100x150?text=Err'; }
}

spinBtn.onclick = async () => {
    if (isSpinning) return;
    const movieList = textArea.value.trim().split('\n').map(m => m.trim()).filter(m => m !== '');
    if (movieList.length < 2) return alert("Добавь хотя бы парочку фильмов!");

    isSpinning = true; spinBtn.disabled = true; spinBtn.innerHTML = "ЗАГРУЗКА... ⏳";

    // Подгружаем постеры (чтобы крутить картинки)
    const posters = await Promise.all(movieList.map(title => getPoster(title)));
    
    spinBtn.innerHTML = "КРУТИМ... 💫";
    const spinDurationMS = parseFloat(document.getElementById('spin-duration').value) * 1000;
    const winnerIndex = Math.floor(Math.random() * movieList.length);
    const winnerMovie = movieList[winnerIndex];

    reel.innerHTML = '';
    const spinCount = Math.max(10, Math.floor(spinDurationMS / 120)); 
    
    for (let i = 0; i < spinCount; i++) {
        const idx = Math.floor(Math.random() * movieList.length);
        const div = document.createElement('div');
        div.className = 'slot-item blur-effect'; 
        div.innerHTML = `<img src="${posters[idx]}" alt="">`;
        reel.appendChild(div);
    }

    const winDiv = document.createElement('div');
    winDiv.className = 'slot-item';
    winDiv.innerHTML = `<img src="${posters[winnerIndex]}" style="border: 2px solid var(--gold);" alt="">`;
    reel.appendChild(winDiv);

    for (let i = 0; i < 3; i++) {
        const idx = Math.floor(Math.random() * movieList.length);
        const div = document.createElement('div');
        div.className = 'slot-item blur-effect';
        div.innerHTML = `<img src="${posters[idx]}" alt="">`;
        reel.appendChild(div);
    }

    reel.style.transition = 'none'; reel.style.transform = `translateY(0px)`; void reel.offsetHeight;
    const targetY = -((spinCount - 1) * 90); // Высота .slot-item теперь 90px
    
    reel.style.transition = `transform ${spinDurationMS}ms cubic-bezier(0.1, 0.9, 0.2, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;

    setTimeout(() => {
        document.querySelectorAll('.slot-item').forEach(el => el.classList.remove('blur-effect'));
        setTimeout(() => {
            winnerName.textContent = winnerMovie;
            resultModal.classList.remove('hidden');
            isSpinning = false; spinBtn.disabled = false; spinBtn.innerHTML = "КРУТИТЬ";
            if (currentMode === 'elimination') {
                movieList.splice(winnerIndex, 1); textArea.value = movieList.join('\n'); localStorage.setItem('rouletteList', textArea.value);
            }
        }, 800); 
    }, spinDurationMS); 
};

document.getElementById('close-modal').onclick = () => resultModal.classList.add('hidden');