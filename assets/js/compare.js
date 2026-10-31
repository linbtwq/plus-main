import { readAll,compareRatings,assertFriend } from './library-store.js';
import { posterUrl } from './shared.js';
export function createComparison(){
    const button=document.getElementById('compare-friend'),dialog=document.getElementById('compare-dialog'),status=document.getElementById('compare-status'),grid=document.getElementById('compare-results');
    let viewer='',other='',version=0,rows=[];
    function render(){
        grid.replaceChildren();const sort=document.getElementById('compare-sort').value,search=document.getElementById('compare-search').value.toLocaleLowerCase();
        const filtered=rows.filter(m=>m.title.toLocaleLowerCase().includes(search)).sort((a,b)=>sort==='difference'?b.difference-a.difference:sort==='together'?(b.mine+b.theirs)-(a.mine+a.theirs):a.difference-b.difference);
        for(const movie of filtered){const row=document.createElement('article');row.className='comparison-row';const img=document.createElement('img');img.src=posterUrl(movie.poster);img.alt='';img.loading='lazy';const name=document.createElement('strong');name.textContent=movie.title;const scores=document.createElement('div');scores.className='comparison-scores';scores.textContent=`Ты ${movie.mine.toFixed(1)} · Друг ${movie.theirs.toFixed(1)} · Разница ${movie.difference.toFixed(1)}`;row.append(img,name,scores);grid.append(row);}
        if(!filtered.length)grid.textContent=rows.length?'По этому запросу ничего нет.':'Общих оценённых фильмов пока нет.';
    }
    button.addEventListener('click',async()=>{
        const request=++version;rows=[];grid.replaceChildren();status.textContent='Сопоставляем ваши оценки…';document.getElementById('compare-metrics').textContent='';dialog.showModal();
        try{await assertFriend(viewer,other);const [mine,theirs]=await Promise.all([readAll('movies',viewer),readAll('movies',other)]);if(request!==version)return;rows=compareRatings(mine,theirs);const avg=rows.length?rows.reduce((sum,m)=>sum+m.difference,0)/rows.length:0;document.getElementById('compare-metrics').textContent=rows.length?`${rows.length} общих тайтлов · Средняя разница ${avg.toFixed(1)} · Совпадений в пределах 1 балла: ${rows.filter(m=>m.difference<=1).length}`:'';status.textContent='';render();}catch{if(request===version)status.textContent='Не удалось сравнить оценки. Проверь, что вы всё ещё друзья, и попробуй ещё раз.';}
    });
    document.getElementById('compare-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('close',()=>{version++;rows=[];grid.replaceChildren();});
    document.getElementById('compare-sort').addEventListener('change',render);document.getElementById('compare-search').addEventListener('input',render);
    return {setAccess(uid,target,allowed){if(uid===viewer&&target===other&&button.hidden===!allowed)return;version++;viewer=uid;other=target;button.hidden=!allowed;rows=[];grid.replaceChildren();if(dialog.open)dialog.close();}};
}
