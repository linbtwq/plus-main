import { posterSkeletons } from './ui-states.js';
import { auth,onAuthStateChanged,signOut } from './firebase-init.js';
import { getPlans,removePlan,sendPlansToRoulette } from './library-store.js';
import { posterUrl,watchUrl,NO_POSTER } from './shared.js';
let records=[],user,loading=false,transferring=false;
const grid=document.getElementById('plans-grid'),status=document.getElementById('plans-status');
function render(){
    document.getElementById('plans-to-roulette').disabled=loading||transferring||!records.length;
    grid.replaceChildren();
    const search=document.getElementById('plans-search').value.trim().toLocaleLowerCase(),type=document.getElementById('plans-type').value,genre=document.getElementById('plans-genre').value;
    const result=records.filter(m=>(!search||m.title.toLocaleLowerCase().includes(search))&&(!type||m.mediaType===type)&&(!genre||m.genres.split(',').map(v=>v.trim()).includes(genre))).sort((a,b)=>document.getElementById('plans-sort').value==='title'?a.title.localeCompare(b.title,'ru'):b.createdAt-a.createdAt);
    status.textContent=result.length?`${result.length} в планах`:records.length?'По этим фильтрам ничего нет.':'Добавь первый фильм из каталога — он появится здесь.';
    for(const movie of result){
        const card=document.createElement('article');card.className='plan-card';
        const link=document.createElement('a');link.href=watchUrl(movie.tmdbId,movie.mediaType,movie.title);link.setAttribute('aria-label',`Смотреть: ${movie.title}`);
        const image=document.createElement('img');image.src=posterUrl(movie.poster);image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.src=NO_POSTER;},{once:true});
        const title=document.createElement('h2');title.textContent=movie.title;
        const meta=document.createElement('p');meta.textContent=[movie.year,movie.mediaType==='tv'?'Сериал':'Фильм',movie.genres].filter(Boolean).join(' · ');
        link.append(image,title,meta);
        const actions=document.createElement('div');actions.className='plan-actions';
        const watch=document.createElement('a');watch.className='profile-small-btn';watch.textContent='Смотреть';watch.href=link.href;
        const rate=document.createElement('a');rate.className='profile-small-btn';rate.textContent='Оценить';rate.href=`rate.html?${new URLSearchParams({id:movie.tmdbId,type:movie.mediaType,title:movie.title})}`;
        const remove=document.createElement('button');remove.className='text-button';remove.textContent='Убрать';remove.addEventListener('click',async()=>{remove.disabled=true;try{await removePlan(user.uid,movie);records=records.filter(m=>m.id!==movie.id);render();}catch{status.textContent='Не удалось убрать фильм. Попробуй ещё раз.';remove.disabled=false;}});
        actions.append(watch,rate,remove);card.append(link,actions);grid.append(card);
    }
}
async function load(){
    if(!user||loading)return;loading=true;
    const controls=Array.from(document.querySelectorAll('.plans-controls input,.plans-controls select,#plans-retry,#plans-to-roulette'));controls.forEach(el=>el.disabled=true);
    const genre=document.getElementById('plans-genre').value;
    status.textContent='Загружаем планы…';posterSkeletons(grid);
    try{
        records=await getPlans(user.uid);const genres=[...new Set(records.flatMap(m=>m.genres.split(',').map(v=>v.trim()).filter(Boolean)))].sort();document.getElementById('plans-genre').replaceChildren(new Option('Все жанры',''),...genres.map(g=>new Option(g,g)));
        if(genres.includes(genre))document.getElementById('plans-genre').value=genre;render();
    }catch{grid.replaceChildren();status.textContent='Не удалось загрузить планы. Проверь соединение и повтори загрузку.';}
    finally{loading=false;controls.forEach(el=>el.disabled=false);document.getElementById('plans-to-roulette').disabled=transferring||!records.length;grid.setAttribute('aria-busy','false');}
}
onAuthStateChanged(auth,u=>{if(!u){location.href='../index.html';return;}user=u;document.getElementById('nav-user-name').textContent=u.displayName||'Киноман';load();});
document.getElementById('plans-retry').addEventListener('click',load);
document.querySelectorAll('.plans-controls input,.plans-controls select').forEach(el=>el.addEventListener(el.tagName==='INPUT'?'input':'change',render));
document.getElementById('sidebar-logout')?.addEventListener('click',()=>signOut(auth));


document.getElementById('plans-to-roulette').addEventListener('click',async()=>{
    if(!user||loading||transferring)return;transferring=true;const button=document.getElementById('plans-to-roulette'),message=document.getElementById('plans-transfer-status');button.disabled=true;button.textContent='Добавляем…';message.textContent='';
    try{const result=await sendPlansToRoulette(user.uid);message.textContent=result.added?`Добавлено: ${result.added}${result.skipped?`. Уже в списке: ${result.skipped}`:''}.`:'Все фильмы уже в рулетке или планы пусты.';document.getElementById('plans-open-roulette').hidden=false;}
    catch(error){message.textContent=error.code?'Не удалось добавить фильмы. Проверь соединение и повтори.':error.message;}
    finally{transferring=false;button.disabled=!records.length;button.textContent='Все в рулетку';}
});
