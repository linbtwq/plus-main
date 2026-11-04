import { auth,onAuthStateChanged,signOut } from './firebase-init.js';
import { readActivityPage,readActivityStats,enrichRating,recordVisit } from './activity-store.js';
import { mediaMetadata,dayKey,streakAfter } from './activity-model.js';
import { readAll } from './library-store.js';
import { tmdb,validId } from './shared.js';
const el=id=>document.getElementById(id);
let user=null,section='watchSessions',cursor=null,more=false,busy=false,version=0,enriching=false;
const date=value=>value?.seconds?new Date(value.seconds*1000).toLocaleString('ru-RU'):'Только что';
const line=(parent,text,tag='p')=>{const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;};
async function metrics(){
    const uid=user.uid;
    try{const totals=await readActivityStats(uid);if(user?.uid!==uid)return;el('activity-metrics').replaceChildren();
        const gap=streakAfter(totals.lastDay,dayKey());
        for(const [label,value] of [['Учтено часов',(totals.watchedSeconds/3600).toFixed(1)],['Досмотров',totals.completions],['Дней подряд',gap===null||gap>1?0:totals.currentStreak],['Рекорд серии',totals.bestStreak],['Дней активности',totals.activeDays],['Запусков рулетки',totals.rouletteStarts],['Входов',totals.logins]]){
            const item=document.createElement('div');line(item,String(value),'strong');line(item,label,'span');el('activity-metrics').append(item);
        }el('activity-summary-status').textContent='В часах учитывается только полученное от плееров время воспроизведения. Повторные досмотры сохраняются отдельными сессиями.';
    }catch{el('activity-summary-status').textContent='Не удалось загрузить счётчики. Попробуй обновить страницу.';}
}
function renderRecord(record){
    const card=document.createElement('article');card.className='activity-record';line(card,date(record.createdAt),'small');
    if(section==='watchSessions'){
        line(card,record.title,'h2');line(card,`${record.source} · ${record.mediaType==='tv'?`Сезон ${record.season}, серия ${record.episode} · `:''}${Math.floor(record.watchedSeconds/60)} мин учтено`);
        line(card,record.completed?`✓ Досмотрено · ${record.completionMethod==='manual'?'отмечено вручную':'определено автоматически'}`:record.watchedSeconds?'Просмотр не завершён':'Плеер открыт; просмотр не подтверждён');
        const link=document.createElement('a');link.className='profile-small-btn';link.textContent=record.completed?'Пересмотреть':'Продолжить';link.href=`watch.html?${new URLSearchParams({id:record.tmdbId,type:record.mediaType,title:record.title,session:record.id})}`;card.append(link);
    }else if(section==='ratingHistory'){
        line(card,record.after.title,'h2');line(card,record.reason==='metadata'?'Дополнены сведения о фильме':record.before?`Оценка ${Number(record.before.score).toFixed(1)} → ${Number(record.after.score).toFixed(1)}`:`Первая сохранённая версия · ${Number(record.after.score).toFixed(1)}`);
        const details=document.createElement('details');line(details,'Баллы, отзыв и сведения','summary');
        for(const [key,label] of Object.entries({script:'Сценарий',actors:'Актёры',directing:'Режиссура',chars:'Персонажи',idea:'Идея',atmosphere:'Атмосфера',impression:'Впечатление'}))line(details,`${label}: ${record.before?.stats?.[key]??'—'} → ${record.after.stats?.[key]??'—'}`);
        if(record.before?.review)line(details,`Предыдущий отзыв: ${record.before.review}`);
        line(details,`Отзыв: ${record.after.review||'Без отзыва'}`);
        const data=record.after.metadata;if(data){line(details,`Год: ${data.year||'не указан'} · Страны: ${data.countries.join(', ')||'не указаны'}`);line(details,`Режиссёры: ${data.directors.map(p=>p?.name||'').join(', ')||'не указаны'}`);if(data.creators.length)line(details,`Создатели: ${data.creators.map(p=>p?.name||'').join(', ')}`);line(details,`Актёры: ${data.actors.map(p=>p?.name||'').join(', ')||'не указаны'}`);}card.append(details);
    }else if(section==='deletedItems'){
        const data=record.snapshot;line(card,data.title||'Связь с другом','h2');line(card,record.collectionName==='friendships'?`Удаление ${data.status==='accepted'?'дружбы':'заявки'} · Удалил: ${record.actorId===user.uid?'ты':'друг'}`:record.collectionName==='plans'?'Убрано из планов':'Удалена оценка');
        const details=document.createElement('details');line(details,'Сохранённые данные','summary');if(record.collectionName==='friendships'){const link=document.createElement('a');link.href=`profile.html?${new URLSearchParams({user:data.members.find(id=>id!==user.uid)})}`;link.textContent='Открыть профиль участника ↗';details.append(link);}else{if(data.score!==undefined)line(details,`Оценка: ${Number(data.score).toFixed(1)}`);if(data.date)line(details,`Дата оценки: ${data.date}`);if(data.year)line(details,`Год: ${data.year}`);if(data.genres)line(details,`Жанры: ${data.genres}`);if(data.review)line(details,`Отзыв: ${data.review}`);for(const [key,label] of Object.entries({script:'Сценарий',actors:'Актёры',directing:'Режиссура',chars:'Персонажи',idea:'Идея',atmosphere:'Атмосфера',impression:'Впечатление'}))if(data.stats?.[key]!==undefined)line(details,`${label}: ${data.stats[key]}`);}card.append(details);
    }else if(section==='activityDays'){line(card,record.date,'h2');line(card,`Часовой пояс: ${record.timezone}`);}
    else {line(card,record.label,'h2');line(card,record.type==='login'?`Время входа: ${new Date(record.occurredAt).toLocaleString('ru-RU')}`:'Запуск записан после нажатия кнопки выбора');}
    el('activity-list').append(card);
}
async function load(append=false){
    if(!user||busy||append&&!more)return;const request=++version;busy=true;el('activity-more').disabled=true;
    if(!append){cursor=null;el('activity-list').replaceChildren();}el('activity-status').textContent='Загружаем историю…';
    try{const result=await readActivityPage(user.uid,section,cursor);if(request!==version)return;cursor=result.cursor;more=result.more;result.records.forEach(renderRecord);el('activity-more').hidden=!more;el('activity-status').textContent=el('activity-list').children.length?'':'В этом разделе пока нет записей.';}
    catch(error){if(request===version){
        const status=el('activity-status');status.replaceChildren();
        const code=String(error?.code||'').replace(/^firestore\//,'');
        status.textContent=code==='failed-precondition'?'Для истории ещё не готов индекс Firestore. Опубликуй индексы проекта и дождись их включения.':code==='permission-denied'?'Firestore запретил доступ к истории. Проверь, что опубликована актуальная версия firestore.rules.':'Не удалось загрузить историю. Проверь соединение и нажми «Обновить».';
        const url=String(error?.message||'').match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/)?.[0];
        if(code==='failed-precondition'&&url){const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=' Создать нужный индекс ↗';status.append(link);}
        console.error('Ошибка загрузки истории:',error);
    }}
    finally{if(request===version){busy=false;el('activity-more').disabled=false;}}
}
for(const button of document.querySelectorAll('[data-history]'))button.addEventListener('click',()=>{version++;busy=false;section=button.dataset.history;document.querySelectorAll('[data-history]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));load();});
el('activity-more').addEventListener('click',()=>load(true));el('activity-refresh').addEventListener('click',()=>{load();metrics();});
onAuthStateChanged(auth,next=>{if(!next){location.href='../index.html';return;}user=next;const name=el('nav-user-name');if(name)name.textContent=next.displayName||'Киноман';const avatar=el('nav-user-avatar');if(avatar){avatar.hidden=!next.photoURL;if(next.photoURL)avatar.src=next.photoURL;avatar.addEventListener('error',()=>{avatar.hidden=true;},{once:true});}load();recordVisit(next).catch(()=>{}).finally(metrics);});
el('sidebar-logout')?.addEventListener('click',()=>signOut(auth));
el('activity-enrich').addEventListener('click',async()=>{
    if(enriching||!user)return;enriching=true;el('activity-enrich').disabled=true;let done=0,failed=0;
    try{const records=(await readAll('movies',user.uid)).filter(movie=>!movie.metadata&&validId(movie.tmdbId)&&['movie','tv'].includes(movie.mediaType));
        for(const movie of records){try{const data=await tmdb(`${movie.mediaType}/${movie.tmdbId}`,{append_to_response:'credits'});await enrichRating(user.uid,movie.id,mediaMetadata(data,movie.mediaType));done++;}catch{failed++;}el('activity-enrich-status').textContent=`Дополнено ${done} из ${records.length}. Не удалось: ${failed}.`;}
        if(!records.length)el('activity-enrich-status').textContent='Все записи с известным ID уже дополнены. Старые записи без ID можно связать с фильмом через редактирование оценки.';
        if(section==='ratingHistory')load();
    }catch{el('activity-enrich-status').textContent='Не удалось загрузить архив. Попробуй ещё раз.';}finally{enriching=false;el('activity-enrich').disabled=false;}
});
