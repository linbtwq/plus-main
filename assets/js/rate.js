import { auth, db, collection, addDoc, serverTimestamp, onAuthStateChanged, signOut } from './firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
let currentUser = null, currentScore = 0, selectedPoster = '', selectedGenres = '', tmdbRating = 0;

const GENRE_MAP = { 28: "Боевик", 12: "Приключения", 16: "Мультфильм", 35: "Комедия", 80: "Криминал", 99: "Документальный", 18: "Драма", 10751: "Семейный", 14: "Фэнтези", 36: "История", 27: "Ужасы", 10402: "Музыка", 9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика", 10770: "ТВ фильм", 53: "Триллер", 10752: "Военный", 37: "Вестерн", 10759: "Боевик/Прикл.", 10762: "Детский", 10763: "Новости", 10764: "Реалити", 10765: "Фантастика/Фэнтези", 10766: "Мыльная опера", 10767: "Ток-шоу", 10768: "Война/Политика" };

onAuthStateChanged(auth, (user) => { if (user) currentUser = user; else window.location.href = '../index.html'; });
document.getElementById('sidebar-logout')?.addEventListener('click', () => signOut(auth));

const titleInput = document.getElementById('movie-title');
const suggestionsBox = document.getElementById('suggestions');
const previewBox = document.getElementById('movie-preview');
const previewPosterImg = document.getElementById('preview-poster-img');
const previewNoPoster = document.getElementById('preview-no-poster');
const previewOverview = document.getElementById('preview-overview');
const typeSelected = document.getElementById('media-type-selected');
const typeOptions = document.querySelectorAll('#media-type-options .sort-opt');
const tmdbCompare = document.getElementById('tmdb-compare');
const tmdbScoreDisplay = document.getElementById('tmdb-score');

let searchTimer, abortController;

titleInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const query = e.target.value.trim();
    if (query.length < 2) { suggestionsBox.style.display = 'none'; return; }

    searchTimer = setTimeout(async () => {
        if (abortController) abortController.abort();
        abortController = new AbortController();
        try {
            const resp = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(query)}&language=ru-RU`, { signal: abortController.signal });
            const data = await resp.json();
            showSuggestions(data.results.filter(i => i.media_type === 'movie' || i.media_type === 'tv').slice(0, 5));
        } catch (err) { if (err.name !== 'AbortError') console.error(err); }
    }, 500);
});

function showSuggestions(movies) {
    if (movies.length === 0) return suggestionsBox.style.display = 'none';
    suggestionsBox.innerHTML = ''; suggestionsBox.style.display = 'block';

    movies.forEach(m => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        const title = m.title || m.name;
        div.innerHTML = `<img src="${m.poster_path ? `https://image.tmdb.org/t/p/w92${m.poster_path}` : 'https://via.placeholder.com/92x138?text=No+Img'}" style="width:40px; border-radius:6px;"><div style="font-family:'DM Sans'; font-weight:800; font-size:0.95rem;">${title}</div>`;
        
        div.addEventListener('click', () => {
            titleInput.value = title;
            selectedPoster = m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : '';
            tmdbRating = m.vote_average || 0;
            
            let mediaType = 'movie';
            if (m.media_type === 'tv') mediaType = (m.origin_country && m.origin_country.includes('JP')) ? 'anime' : 'series';
            
            typeOptions.forEach(opt => opt.classList.remove('active'));
            const targetOpt = document.querySelector(`#media-type-options .sort-opt[data-value="${mediaType}"]`);
            if (targetOpt) { targetOpt.classList.add('active'); typeSelected.innerHTML = `${targetOpt.innerText} <span>▼</span>`; typeSelected.setAttribute('data-value', mediaType); }

            if (selectedPoster) { previewPosterImg.src = selectedPoster; previewPosterImg.style.display = 'block'; previewNoPoster.classList.add('hidden'); } 
            else { previewPosterImg.style.display = 'none'; previewNoPoster.classList.remove('hidden'); }

            selectedGenres = m.genre_ids ? m.genre_ids.map(id => GENRE_MAP[id]).filter(Boolean).slice(0, 2).join(', ') : '';
            document.getElementById('preview-title').textContent = title;
            document.getElementById('preview-genres').textContent = selectedGenres || 'Жанр не указан';
            previewOverview.textContent = m.overview || 'Описание отсутствует...';
            
            tmdbScoreDisplay.textContent = tmdbRating.toFixed(1);
            tmdbCompare.classList.remove('hidden');

            previewBox.classList.remove('hidden'); document.getElementById('search-wrapper').style.display = 'none'; suggestionsBox.style.display = 'none';
        });
        suggestionsBox.appendChild(div);
    });
}

document.getElementById('clear-preview').addEventListener('click', () => {
    titleInput.value = ''; selectedPoster = ''; selectedGenres = ''; tmdbRating = 0;
    previewBox.classList.add('hidden'); document.getElementById('search-wrapper').style.display = 'block'; titleInput.focus();
    tmdbCompare.classList.add('hidden');
});

const getVal = (id) => parseFloat(document.getElementById(id).value);
function getScore(suffix) {
    let base = 0; ['script', 'actors', 'directing', 'chars', 'idea'].forEach(id => { const v = getVal(`${id}-${suffix}`); document.getElementById(`val-${id}-${suffix}`).textContent = v.toFixed(1); base += v; });
    let vibe = 0; ['atmosphere', 'impression'].forEach(id => { const v = getVal(`${id}-${suffix}`); document.getElementById(`val-${id}-${suffix}`).textContent = v.toFixed(1); vibe += v; });
    return (base + vibe) / 6;
}

const VERDICTS = [{ max: 3.5}, { max: 5.5}, { max: 7.0}, { max: 8.5}, { max: 9.9}, { max: 10.0}];

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
}

document.querySelectorAll('input[type="range"]').forEach(i => i.addEventListener('input', calculate)); calculate();

document.getElementById('save-btn').onclick = async () => {
    if (!titleInput.value.trim() || previewBox.classList.contains('hidden')) return alert('Выберите фильм!');
    const btn = document.getElementById('save-btn'); btn.disabled = true; btn.textContent = 'СОХРАНЕНИЕ... ⏳';

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
        await addDoc(collection(db, "movies"), {
            title: titleInput.value.trim(), genres: selectedGenres, type: typeSelected.getAttribute('data-value'),
            score: currentScore, isDuo, poster: selectedPoster, authorName: currentUser.displayName,
            authorPhoto: currentUser.photoURL, userId: currentUser.uid, timestamp: serverTimestamp(),
            date: new Date().toLocaleDateString('ru-RU'), stats: finalStats, review: document.getElementById('review-text').value.trim() || null
        });
        confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 }, colors: ['#eebf45', '#c4462b', '#f4ebd9', '#1e3a2f'] });
        setTimeout(() => { window.location.href = 'list.html'; }, 800);
    } catch (e) { alert("Ошибка Firebase"); btn.disabled = false; btn.textContent = 'СОХРАНИТЬ В АРХИВ'; }
};