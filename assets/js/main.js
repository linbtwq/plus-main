import { readWatchHistory,resumeUrl,removeWatchProgress } from './watch-history.js';
import { ensureProfile, safeAvatar } from './profile-store.js';
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from './firebase-init.js';

import { tmdb, trailerUrl, posterUrl } from './shared.js';
const loginSection = document.getElementById('login-section');
const appMenu = document.getElementById('app-menu');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');

onAuthStateChanged(auth, async (user) => {
    // Форма входа появляется только после подтверждения отсутствия сессии.
    loginSection.hidden = !!user;
    appMenu.hidden = !user;
    document.getElementById('auth-loading').hidden = true;

    if (!user) {
        document.getElementById('cinema-hero').classList.add('hidden');
        document.getElementById('trailer-modal').classList.add('hidden');
        document.getElementById('trailer-iframe').src = '';
    }
    if (user) {
        renderContinueWatching(user.uid);
        document.getElementById('user-name').textContent = user.displayName || 'Киноман';
        ensureProfile(user).then(profile => {
            if (auth.currentUser?.uid === user.uid && profile) {
                document.getElementById('user-name').textContent = profile.displayName;
                const image = safeAvatar(profile.photoURL);
                const avatar = document.getElementById('user-avatar');
                avatar.style.display = image ? '' : 'none';
                if (image) avatar.src = image;
            }
        }).catch(error => console.error('Не удалось загрузить профиль:', error));
        const avatar = document.getElementById('user-avatar');
        avatar.style.display = user.photoURL ? '' : 'none';
        if (user.photoURL) avatar.src = user.photoURL;
        
        // Подгружаем актуальные постеры и трейлер.
        try {
            const data = await tmdb('trending/movie/week');
            if (auth.currentUser?.uid !== user.uid) return;
            const strip = document.getElementById('home-trending'); strip.replaceChildren();
            for (const item of (data.results || []).slice(0,6)) {
                const link = document.createElement('a'); link.href=`pages/rate.html?${new URLSearchParams({id:item.id,type:'movie',title:item.title})}`;
                const image=document.createElement('img');image.src=posterUrl(`https://image.tmdb.org/t/p/w300${item.poster_path}`);image.alt='';image.loading='lazy';
                const title=document.createElement('span');title.textContent=item.title;link.append(image,title);strip.appendChild(link);
            }
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
// Поиск на главной ведёт сразу к оценке конкретного тайтла.
const homeSearch = document.getElementById('home-movie-search');
const homeResults = document.getElementById('home-suggestions');
let homeTimer, homeRequest=0, homeController;
homeSearch.addEventListener('input', () => {
    clearTimeout(homeTimer); homeController?.abort(); const request=++homeRequest;
    homeResults.hidden=true; const query=homeSearch.value.trim(); if(query.length<2)return;
    homeTimer=setTimeout(async()=>{
        homeController=new AbortController();
        try {
            const data=await tmdb('search/multi',{query},homeController.signal);
            if(request!==homeRequest)return;
            homeResults.replaceChildren();
            for(const movie of (data.results||[]).filter(item=>['movie','tv'].includes(item.media_type)).slice(0,5)) {
                const link=document.createElement('a');link.role='option';link.href=`pages/rate.html?${new URLSearchParams({id:movie.id,type:movie.media_type,title:movie.title||movie.name})}`;
                const image=document.createElement('img');image.src=posterUrl(`https://image.tmdb.org/t/p/w92${movie.poster_path}`);image.alt='';
                const title=document.createElement('span');title.textContent=movie.title||movie.name;
                const year=document.createElement('small');year.textContent=(movie.release_date||movie.first_air_date||'').slice(0,4);
                link.append(image,title,year);homeResults.appendChild(link);
            }
            homeResults.hidden=!homeResults.children.length;
        } catch(error) {if(request===homeRequest&&error.name!=='AbortError'){homeResults.textContent='Не удалось загрузить подсказки. Нажми «Оценить», чтобы продолжить поиск.';homeResults.hidden=false;}}
    },300);
});
document.getElementById('home-rate-form').addEventListener('submit',event=>{
    event.preventDefault();location.href=`pages/rate.html${homeSearch.value.trim()?'?'+new URLSearchParams({title:homeSearch.value.trim()}):''}`;
});
homeSearch.addEventListener('keydown',event=>{if(event.key==='ArrowDown'&&homeResults.firstElementChild){event.preventDefault();homeResults.firstElementChild.focus();}if(event.key==='Escape')homeResults.hidden=true;});
document.addEventListener('click',event=>{if(!event.target.closest('.home-review-copy'))homeResults.hidden=true;});


function renderContinueWatching(uid){
    const section=document.getElementById('home-continue'),area=document.getElementById('continue-list'),records=readWatchHistory(uid);area.replaceChildren();section.hidden=!records.length;
    for(const entry of records.slice(0,6)){const card=document.createElement('article');card.className='continue-card';const link=document.createElement('a');link.href=resumeUrl(entry);const title=document.createElement('strong');title.textContent=entry.title;const meta=document.createElement('span');meta.textContent=entry.source==='aniliberty'?`AniLiberty · Серия ${entry.animeEpisode||1}${entry.position?' · '+Math.floor(entry.position/60)+' мин':''}`:entry.mediaType==='tv'?`Сезон ${entry.season} · Серия ${entry.episode}`:'Продолжить просмотр';link.append(title,meta);const close=document.createElement('button');close.type='button';close.className='text-button';close.textContent='Убрать';close.setAttribute('aria-label',`Убрать из продолжения: ${entry.title}`);close.addEventListener('click',()=>{removeWatchProgress(uid,entry.tmdbId,entry.mediaType);renderContinueWatching(uid);});card.append(link,close);area.append(card);}
}
