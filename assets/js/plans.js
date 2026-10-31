import { posterSkeletons } from './ui-states.js';
import { auth,onAuthStateChanged,signOut } from './firebase-init.js';
import { getPlans,removePlan } from './library-store.js';
import { posterUrl,watchUrl,NO_POSTER } from './shared.js';
let records=[],user;
const grid=document.getElementById('plans-grid'),status=document.getElementById('plans-status');
function render(){
    grid.replaceChildren();
    const search=document.getElementById('plans-search').value.trim().toLocaleLowerCase(),type=document.getElementById('plans-type').value,genre=document.getElementById('plans-genre').value;
    const result=records.filter(m=>(!search||m.title.toLocaleLowerCase().includes(search))&&(!type||m.mediaType===type)&&(!genre||m.genres.split(',').map(v=>v.trim()).includes(genre))).sort((a,b)=>document.getElementById('plans-sort').value==='title'?a.title.localeCompare(b.title,'ru'):b.createdAt-a.createdAt);
    status.textContent=result.length?`${result.length} в планах`:records.length?'По этим фильтрам ничего нет.':'Добавь первый фильм из каталога — он появится здесь.';
    for(const movie of result){
        const card=document.createElement('article');card.className='plan-card';
        const link=document.createElement('a');link.href=watchUrl(movie.tmdbId,movie.mediaType,movie.title);
        const image=document.createElement('img');image.src=posterUrl(movie.poster);image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.src=NO_POSTER;},{once:true});
        const title=document.createElement('h2');title.textContent=movie.title;
        const meta=document.createElement('p');meta.textContent=[movie.year,movie.mediaType==='tv'?'Сериал':'Фильм',movie.genres].filter(Boolean).join(' · ');
        link.append(image,title,meta);
        const actions=document.createElement('div');actions.className='plan-actions';
        const rate=document.createElement('a');rate.className='profile-small-btn';rate.textContent='Оценить';rate.href=`rate.html?${new URLSearchParams({id:movie.tmdbId,type:movie.mediaType,title:movie.title})}`;
        const remove=document.createElement('button');remove.className='text-button';remove.textContent='Убрать';remove.addEventListener('click',async()=>{remove.disabled=true;try{await removePlan(user.uid,movie);records=records.filter(m=>m.id!==movie.id);render();}catch{status.textContent='Не удалось убрать фильм. Попробуй ещё раз.';remove.disabled=false;}});
        actions.append(rate,remove);card.append(link,actions);grid.append(card);
    }
}
async function load(){status.textContent='Загружаем планы…';posterSkeletons(grid);try{records=await getPlans(user.uid);const genres=[...new Set(records.flatMap(m=>m.genres.split(',').map(v=>v.trim()).filter(Boolean)))].sort();document.getElementById('plans-genre').replaceChildren(new Option('Все жанры',''),...genres.map(g=>new Option(g,g)));render();}catch{grid.replaceChildren();status.textContent='Не удалось загрузить планы. Проверь соединение и повтори загрузку.';}finally{grid.setAttribute('aria-busy','false');}}
onAuthStateChanged(auth,u=>{if(!u){location.href='../index.html';return;}user=u;document.getElementById('nav-user-name').textContent=u.displayName||'Киноман';load();});
document.getElementById('plans-retry').addEventListener('click',load);
document.querySelectorAll('.plans-controls input,.plans-controls select').forEach(el=>el.addEventListener(el.tagName==='INPUT'?'input':'change',render));
document.getElementById('sidebar-logout')?.addEventListener('click',()=>signOut(auth));
