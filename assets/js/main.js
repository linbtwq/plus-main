import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-init.js';

import { tmdb, trailerUrl } from './shared.js';
const loginSection = document.getElementById('login-section');
const appMenu = document.getElementById('app-menu');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, async (user) => {
    loginSection.style.display = user ? 'none' : 'flex';
    appMenu.style.display = user ? 'block' : 'none';

    if (!user) {
        document.getElementById('cinema-hero').classList.add('hidden');
        document.getElementById('trailer-modal').classList.add('hidden');
        document.getElementById('trailer-iframe').src = '';
    }
    if (user) {
        document.getElementById('user-name').textContent = user.displayName || 'Киноман';
        const avatar = document.getElementById('user-avatar');
        avatar.style.display = user.photoURL ? '' : 'none';
        if (user.photoURL) avatar.src = user.photoURL;
        
        // Загружаем Hero Баннер
        try {
            const data = await tmdb('trending/movie/week');
            if (auth.currentUser?.uid !== user.uid) return;
            const movie = data.results[0];
            if (movie) {
                document.getElementById('hero-banner-bg').style.backgroundImage = `url(https://image.tmdb.org/t/p/original${movie.backdrop_path})`;
                document.getElementById('hero-banner-title').textContent = movie.title;
                document.getElementById('hero-banner-desc').textContent = movie.overview;
                
                document.getElementById('hero-banner-play').onclick = async () => {
                    try {
                        const url = await trailerUrl(movie.id, 'movie');
                        if (auth.currentUser?.uid !== user.uid) return;
                        document.getElementById('trailer-iframe').src = url;
                        document.getElementById('trailer-modal').classList.remove('hidden');
                    } catch (error) { alert(error.message); }

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
    catch (err) {
        if (err.code === 'auth/popup-blocked') alert('Разрешите всплывающие окна для входа.');
        else if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(err.code)) alert('Не удалось войти. Проверьте соединение и повторите попытку.');
    }
    finally { loginBtn.disabled = false; }
});
logoutBtn.addEventListener('click', () => signOut(auth).catch(() => alert('Не удалось выйти. Попробуйте ещё раз.')));