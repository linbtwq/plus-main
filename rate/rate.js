import { auth, db, collection, addDoc, serverTimestamp, onAuthStateChanged } from '../firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
let currentUser = null;
let currentScore = 0;
let selectedPoster = ''; 
let selectedGenres = ''; 

const GENRE_MAP = {
    28: "Боевик", 12: "Приключения", 16: "Мультфильм", 35: "Комедия", 80: "Криминал",
    99: "Документальный", 18: "Драма", 10751: "Семейный", 14: "Фэнтези", 36: "История",
    27: "Ужасы", 10402: "Музыка", 9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика",
    10770: "ТВ фильм", 53: "Триллер", 10752: "Военный", 37: "Вестерн",
    10759: "Боевик/Прикл.", 10762: "Детский", 10763: "Новости", 10764: "Реалити",
    10765: "Фантастика/Фэнтези", 10766: "Мыльная опера", 10767: "Ток-шоу", 10768: "Война/Политика"
};

onAuthStateChanged(auth, (user) => { if (user) currentUser = user; else window.location.href = '../index.html'; });

const searchWrapper = document.getElementById('search-wrapper');
const titleInput = document.getElementById('movie-title');
const suggestionsBox = document.getElementById('suggestions');
const scoreDisplay = document.getElementById('final-score');

const previewBox = document.getElementById('movie-preview');
const previewPoster = document.getElementById('preview-poster');
const previewTitle = document.getElementById('preview-title');
const previewGenres = document.getElementById('preview-genres');
const clearBtn = document.getElementById('clear-preview');

const typeDropdown = document.getElementById('media-type-dropdown');
const typeSelected = document.getElementById('media-type-selected');
const typeOptions = document.querySelectorAll('#media-type-options .dropdown-item');

const duoCheckbox = document.getElementById('is-duo-checkbox');
const user2Col = document.getElementById('user2-col');
const user1Title = document.getElementById('user1-title');
const slidersWrapper = document.querySelector('.sliders-wrapper');

/* duo */
duoCheckbox.addEventListener('change', (e) => {
    if (e.target.checked) {
        user2Col.classList.remove('hidden');
        user1Title.classList.remove('hidden');
        slidersWrapper.style.gridTemplateColumns = '1fr 1fr';
    } else {
        user2Col.classList.add('hidden');
        user1Title.classList.add('hidden');
        slidersWrapper.style.gridTemplateColumns = '1fr';
    }
    calculate();
});

if (typeSelected && typeDropdown) {
    typeSelected.addEventListener('click', () => typeDropdown.classList.toggle('open'));
    document.addEventListener('click', (e) => {
        if (!typeDropdown.contains(e.target)) typeDropdown.classList.remove('open');
    });
    typeOptions.forEach(option => {
        option.addEventListener('click', () => {
            typeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
            typeSelected.innerHTML = `${option.innerText} <span class="arrow">▼</span>`;
            typeSelected.setAttribute('data-value', option.getAttribute('data-value'));
            typeDropdown.classList.remove('open');
        });
    });
}

let searchTimer;
titleInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const query = e.target.value.trim();
    if (query.length < 2) { suggestionsBox.style.display = 'none'; return; }

    searchTimer = setTimeout(async () => {
        try {
            const resp = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`);
            const data = await resp.json();
            const filtered = data.results.filter(item => item.media_type === 'movie' || item.media_type === 'tv');
            showSuggestions(filtered.slice(0, 5));
        } catch (err) { console.error("Ошибка API:", err); }
    }, 500);
});


function showSuggestions(movies) {
    if (movies.length === 0) { suggestionsBox.style.display = 'none'; return; }
    suggestionsBox.innerHTML = '';
    suggestionsBox.style.display = 'block';

    movies.forEach(m => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        const title = m.title || m.name;
        const posterUrl = m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : 'https://via.placeholder.com/92x138?text=No+Img';
        div.innerHTML = `<img src="${posterUrl}" class="suggestion-img"><div style="font-family:'Unbounded';font-size:0.8rem">${title}</div>`;
        
        div.addEventListener('click', () => {
            titleInput.value = title;
            selectedPoster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
            selectedGenres = m.genre_ids && m.genre_ids.length > 0 ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ') : '';
            
            previewPoster.src = m.poster_path ? `https://image.tmdb.org/t/p/w200${m.poster_path}` : 'https://via.placeholder.com/60x90?text=No+Img';
            previewTitle.textContent = title;
            previewGenres.textContent = selectedGenres || 'Жанр не указан';
            
            previewBox.classList.remove('hidden');
            searchWrapper.style.display = 'none';
            suggestionsBox.style.display = 'none';
        });
        suggestionsBox.appendChild(div);
    });
}

clearBtn.addEventListener('click', () => {
    titleInput.value = '';
    selectedPoster = '';
    selectedGenres = '';
    previewBox.classList.add('hidden');
    searchWrapper.style.display = 'block';
    titleInput.focus();
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) suggestionsBox.style.display = 'none';
});

const getVal = (id) => parseFloat(document.getElementById(id).value);

function getScore(playerSuffix) {
    let base = 0;
    ['script', 'actors', 'directing', 'chars', 'idea'].forEach(id => {
        const val = getVal(`${id}-${playerSuffix}`);
        document.getElementById(`val-${id}-${playerSuffix}`).textContent = val.toFixed(1);
        base += val;
    });

    let vibe = 0;
    ['atmosphere', 'impression'].forEach(id => {
        const val = getVal(`${id}-${playerSuffix}`);
        document.getElementById(`val-${id}-${playerSuffix}`).textContent = val.toFixed(1);
        vibe += val;
    });

    return (base + vibe) / 6;
}

function calculate() {
    const score1 = getScore('1');
    let rawFinalScore = score1;

    if (duoCheckbox.checked) {
        const score2 = getScore('2');
        rawFinalScore = (score1 + score2) / 2;
    }

    let finalScore = Math.round(rawFinalScore * 10) / 10;
    if (finalScore === 10 && rawFinalScore < 10) {
        finalScore = 9.9;
    }

    if (currentScore !== finalScore) {
        scoreDisplay.classList.remove('pulse');
        void scoreDisplay.offsetWidth;
        scoreDisplay.classList.add('pulse');
    }

    currentScore = finalScore;
    scoreDisplay.textContent = currentScore.toFixed(1);
    
    scoreDisplay.classList.remove('color-red', 'color-orange', 'color-yellow', 'color-lime', 'color-green', 'color-gold');
    
    if (currentScore < 4.0) scoreDisplay.classList.add('color-red');
    else if (currentScore < 5.5) scoreDisplay.classList.add('color-orange');
    else if (currentScore < 7.0) scoreDisplay.classList.add('color-yellow');
    else if (currentScore < 8.5) scoreDisplay.classList.add('color-lime');
    else if (currentScore < 10.0) scoreDisplay.classList.add('color-green');
    else scoreDisplay.classList.add('color-gold');
}

document.querySelectorAll('input[type="range"]').forEach(i => i.addEventListener('input', calculate));
calculate();

document.getElementById('save-btn').onclick = async () => {
    const title = titleInput.value.trim();
    if (!title || previewBox.classList.contains('hidden')) return alert('Выберите фильм из списка!');

    const isDuo = duoCheckbox.checked;

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
        await addDoc(collection(db, "movies"), {
            title,
            genres: selectedGenres,
            type: document.getElementById('media-type-selected').getAttribute('data-value'),
            score: currentScore,
            isDuo: isDuo,
            poster: selectedPoster,
            authorName: currentUser.displayName,
            authorPhoto: currentUser.photoURL,
            userId: currentUser.uid,
            timestamp: serverTimestamp(),
            date: new Date().toLocaleDateString('ru-RU'),
            stats: finalStats
        });
        window.location.href = '../list/list.html';
    } catch (e) { console.error(e); alert("Ошибка Firebase"); }
};
