const textArea = document.getElementById('movie-list');
const reel = document.getElementById('slot-reel');
const spinBtn = document.getElementById('spin-btn');
const resultModal = document.getElementById('result-modal');
const winnerName = document.getElementById('winner-name');

const modeBtns = document.querySelectorAll('.mode-btn');
let currentMode = 'classic';

const durationInput = document.getElementById('spin-duration');
const speedValDisplay = document.getElementById('speed-val');

const ITEM_HEIGHT = 60; 
let isSpinning = false;

modeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (isSpinning) return;
        modeBtns.forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentMode = e.target.getAttribute('data-mode');
    });
});

if (durationInput) {
    durationInput.addEventListener('input', (e) => {
        speedValDisplay.textContent = `${e.target.value} сек`;
    });
}

spinBtn.onclick = () => {
    if (isSpinning) return;

    const rawText = textArea.value.trim();
    const movieList = rawText.split('\n').map(m => m.trim()).filter(m => m !== '');

    if (movieList.length < 2) return alert("Блин, добавь хотя бы парочку фильмов в список! 🐰");

    isSpinning = true;
    spinBtn.disabled = true;
    spinBtn.innerHTML = "КРУТИМ... 💫";

    const spinDurationMS = parseFloat(durationInput.value) * 1000;

    const winnerIndex = Math.floor(Math.random() * movieList.length);
    const winnerMovie = movieList[winnerIndex];

    reel.innerHTML = '';
    
    const spinCount = Math.max(10, Math.floor(spinDurationMS / 120)); 
    
    for (let i = 0; i < spinCount; i++) {
        const div = document.createElement('div');
        div.className = 'slot-item blur-effect'; 
        div.textContent = movieList[Math.floor(Math.random() * movieList.length)];
        reel.appendChild(div);
    }

    const winDiv = document.createElement('div');
    winDiv.className = 'slot-item';
    winDiv.textContent = winnerMovie;
    winDiv.style.color = '#ff4d94'; 
    reel.appendChild(winDiv);

    for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.className = 'slot-item blur-effect';
        div.textContent = movieList[Math.floor(Math.random() * movieList.length)];
        reel.appendChild(div);
    }

    reel.style.transition = 'none';
    reel.style.transform = `translateY(0px)`;
    void reel.offsetHeight;

    const targetY = -((spinCount - 1) * ITEM_HEIGHT);
    
    reel.style.transition = `transform ${spinDurationMS}ms cubic-bezier(0.1, 0.9, 0.2, 1)`;
    reel.style.transform = `translateY(${targetY}px)`;

    setTimeout(() => {
        document.querySelectorAll('.slot-item').forEach(el => el.classList.remove('blur-effect'));
        
        setTimeout(() => {
            try {
                winnerName.textContent = winnerMovie;
                resultModal.classList.remove('hidden');
            } catch (err) {
                console.error("Модалка потерялась", err);
            }
            
            isSpinning = false;
            spinBtn.disabled = false;
            spinBtn.innerHTML = "ДЕРНУТЬ РЫЧАГ ✨";

            if (currentMode === 'elimination') {
                const updatedList = movieList.filter(m => m !== winnerMovie);
                textArea.value = updatedList.join('\n');
            }

        }, 800); 
        
    }, spinDurationMS); 
};

document.getElementById('close-modal').onclick = () => resultModal.classList.add('hidden');
