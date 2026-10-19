import { auth, db, provider, signInWithPopup, signOut, onAuthStateChanged, collection, getDocs, query, orderBy, limit } from './firebase-init.js';

const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
const loginSection = document.getElementById('login-section');
const appMenu = document.getElementById('app-menu');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, async (user) => {
    loginSection.style.display = user ? 'none' : 'flex';
    appMenu.style.display = user ? 'block' : 'none';

    if (user) {
        document.getElementById('user-name').textContent = user.displayName || 'Киноман';
        const avatar = document.getElementById('user-avatar');
        if (user.photoURL) avatar.src = user.photoURL; else avatar.style.display = 'none';
        
        // Загружаем Hero Баннер
        try {
            const res = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}&language=ru-RU`);
            const data = await res.json();
            const movie = data.results[0];
            if (movie) {
                document.getElementById('hero-banner-bg').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`;
                document.getElementById('hero-banner-title').textContent = movie.title;
                document.getElementById('hero-banner-desc').textContent = movie.overview;
                
                document.getElementById('hero-banner-play').onclick = async () => {
                    const resV = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}&language=ru-RU`);
                    const dataV = await resV.json();
                    let video = dataV.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                    if (!video) {
                        const resEn = await fetch(`https://api.themoviedb.org/3/movie/${movie.id}/videos?api_key=${TMDB_API_KEY}&language=en-US`);
                        const dataEn = await resEn.json();
                        video = dataEn.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
                    }
                    if (video) {
                        document.getElementById('trailer-iframe').src = `https://www.youtube.com/embed/${video.key}?autoplay=1`;
                        document.getElementById('trailer-modal').classList.remove('hidden');
                    } else {
                        alert('Трейлер не найден');
                    }
                };
                document.getElementById('cinema-hero').classList.remove('hidden');
            }
        } catch (e) { console.error("Ошибка Hero баннера:", e); }
    }
});

document.getElementById('close-trailer').onclick = () => {
    document.getElementById('trailer-modal').classList.add('hidden');
    document.getElementById('trailer-iframe').src = '';
};

loginBtn.addEventListener('click', async () => {
    loginBtn.disabled = true;
    try { await signInWithPopup(auth, provider); } 
    catch (err) { if (err.code === 'auth/popup-blocked') alert('Разреши всплывающие окна.'); } 
    finally { loginBtn.disabled = false; }
});
logoutBtn.addEventListener('click', () => signOut(auth));