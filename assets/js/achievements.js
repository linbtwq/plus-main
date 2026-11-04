import { auth,onAuthStateChanged,signOut } from './firebase-init.js';
import { ACHIEVEMENTS,ACHIEVEMENT_BRANCHES,ACHIEVEMENT_BY_ID,RARITIES,achievementLevel } from './achievement-catalog.js';
import { syncAchievements,readFeatured,setFeatured } from './achievement-store.js';
import { achievementIcon } from './achievement-icons.js';
import { announceAchievements } from './achievement-notifications.js';
const el=id=>document.getElementById(id);
let user=null,owned=new Map(),metrics={},featured=[],branch='archive',selected=new URLSearchParams(location.search).get('badge')||'',busy=false,pinning=false,generation=0,metadataMissing=0;
const text=(parent,tag,value,cls='')=>{const node=document.createElement(tag);node.textContent=value;if(cls)node.className=cls;parent.append(node);return node;};
const displayTitle=item=>item.secret&&!owned.has(item.id)?'Неизвестное открытие':item.title;
function header(){
 const level=achievementLevel([...owned.keys()]);el('achievement-emblem').innerHTML=achievementIcon('seal');el('achievement-earned').textContent=String(owned.size);el('achievement-total').textContent=`из ${ACHIEVEMENTS.length} наград`;
 el('achievement-rank').textContent=`Уровень ${level.level} · ${level.rank}`;el('achievement-xp').value=level.progress;el('achievement-xp-caption').textContent=`${level.xp} XP · Ещё ${level.next-level.xp} XP до уровня ${level.level+1}`;
 el('achievement-branches').replaceChildren();
 for(const category of ACHIEVEMENT_BRANCHES){const button=document.createElement('button');button.type='button';button.dataset.branch=category.id;button.setAttribute('aria-pressed',String(category.id===branch));const icon=document.createElement('span');icon.innerHTML=achievementIcon(category.icon);button.append(icon);text(button,'span',category.name);const items=ACHIEVEMENTS.filter(item=>item.branch===category.id);text(button,'small',`${items.filter(item=>owned.has(item.id)).length}/${items.length}`);button.addEventListener('click',()=>{branch=category.id;el('achievement-search').value='';header();renderMap();el('achievement-map').scrollLeft=0;});el('achievement-branches').append(button);}
}
function renderMap(){
 const category=ACHIEVEMENT_BRANCHES.find(item=>item.id===branch),search=el('achievement-search').value.trim().toLocaleLowerCase('ru'),filter=el('achievement-filter').value;
 el('achievement-branch-title').textContent=search?'Поиск по всем веткам':category.name;el('achievement-branch-description').textContent=search?'Выбери значок, чтобы открыть подробности.':category.description;
 const matches=ACHIEVEMENTS.filter(item=>{
  const earned=owned.has(item.id),value=Math.min(item.target,metrics[item.metric]||0);
  if(search?!`${displayTitle(item)} ${item.secret&&!earned?'':item.description}`.toLocaleLowerCase('ru').includes(search):item.branch!==branch)return false;
  return filter==='all'||filter==='unlocked'&&earned||filter==='locked'&&!earned||filter==='near'&&!earned&&!item.secret&&value/item.target>=.5;
 });
 el('achievement-lanes').replaceChildren();
 if(!matches.length){text(el('achievement-lanes'),'p','Здесь пока ничего нет. Попробуй другую ветку или фильтр.','achievement-empty');return;}
 const chains=new Map();for(const item of matches){if(!chains.has(item.chain))chains.set(item.chain,[]);chains.get(item.chain).push(item);}
 for(const items of chains.values()){
  const lane=document.createElement('section');lane.className='achievement-lane';if(search||filter!=='all')lane.classList.add('is-filtered');text(lane,'h3',items[0].secret?'Скрытое открытие':items[0].chainName);
  const track=document.createElement('div');track.className='achievement-track';
  for(const item of items){const earned=owned.has(item.id),available=!item.requires||owned.has(item.requires),button=document.createElement('button');button.type='button';button.className=`achievement-node rarity-${item.rarity}${earned?' is-earned':''}${available?'':' is-distant'}${item.id===selected?' is-selected':''}`;button.dataset.achievement=item.id;button.setAttribute('aria-label',`${displayTitle(item)}. ${earned?'Получено':'Не получено'}`);button.setAttribute('aria-pressed',String(item.id===selected));
   const frame=document.createElement('span');frame.className='achievement-node-frame';frame.innerHTML=achievementIcon(item.secret&&!earned?'lock':item.icon);const mark=document.createElement('span');mark.className='achievement-node-mark';mark.textContent=earned?'✓':available?'◇':'·';frame.append(mark);button.append(frame);text(button,'span',displayTitle(item),'achievement-node-title');text(button,'small',earned?'Получено':item.secret?'Секрет':`${Math.min(item.target,Math.floor(metrics[item.metric]||0))} / ${item.target}`);
   button.addEventListener('click',()=>{select(item.id);if(innerWidth<=760)el('achievement-detail').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});track.append(button);
  }lane.append(track);el('achievement-lanes').append(lane);
 }
 if(!selected||!matches.some(item=>item.id===selected))select(matches.find(item=>!owned.has(item.id))?.id||matches[0].id);else detail();
}
function select(id){selected=id;for(const button of el('achievement-map').querySelectorAll('[data-achievement]')){button.classList.toggle('is-selected',button.dataset.achievement===id);button.setAttribute('aria-pressed',String(button.dataset.achievement===id));}detail();}
function detail(){
 const item=ACHIEVEMENT_BY_ID.get(selected),area=el('achievement-detail');area.replaceChildren();if(!item)return;
 const earned=owned.has(item.id),hidden=item.secret&&!earned;area.dataset.rarity=item.rarity;
 const badge=document.createElement('div');badge.className=`achievement-detail-badge rarity-${item.rarity}${earned?' is-earned':''}`;badge.innerHTML=achievementIcon(hidden?'lock':item.icon);area.append(badge);
 text(area,'span',`${RARITIES[item.rarity].name} · +${item.xp} XP`,'achievement-detail-rarity');text(area,'h2',displayTitle(item));text(area,'p',hidden?item.hint:item.description,'achievement-condition');
 if(hidden)text(area,'p','Точное условие откроется после получения.','achievement-detail-note');
 else {const value=Math.min(item.target,metrics[item.metric]||0),progress=document.createElement('progress');progress.max=item.target;progress.value=earned?item.target:value;progress.setAttribute('aria-label',`Прогресс: ${Math.floor(value)} из ${item.target}`);area.append(progress);text(area,'p',earned?'✓ Достижение получено':`${item.metric==='hours'?value.toFixed(1):Math.floor(value)} / ${item.target}`,'achievement-detail-progress');}
 if(item.branch==='world'&&metadataMissing)text(area,'p',`В ${metadataMissing} оценках ещё нет сведений о составе и годе выпуска. Дополни старые оценки в истории, затем нажми «Проверить прогресс».`,'achievement-detail-note');
 if(!earned&&item.requires)text(area,'p',`Предыдущий этап: ${ACHIEVEMENT_BY_ID.get(item.requires).title}`,'achievement-detail-note');
 const stamp=owned.get(item.id)?.unlockedAt;if(earned&&stamp?.seconds)text(area,'p',`Получено ${new Date(stamp.seconds*1000).toLocaleDateString('ru-RU')}`,'achievement-detail-note');
 if(earned){const button=document.createElement('button');button.type='button';button.className='profile-small-btn';button.disabled=pinning;button.textContent=featured.includes(item.id)?'Убрать с витрины':'На витрину профиля';button.addEventListener('click',()=>pin(item.id));area.append(button);}
 const destination=item.branch==='journey'&&item.chain==='roulette'?'roulette.html':item.branch==='watch'?'activity.html':item.branch==='company'?'profile.html':item.branch==='world'?'activity.html':item.chain==='plans'?'plans.html':'rate.html';
 const link=document.createElement('a');link.href=destination;link.textContent=item.branch==='world'?'Дополнить сведения о фильмах ↗':item.branch==='watch'?'История просмотров ↗':'Продолжить путь ↗';link.className='achievement-next-link';area.append(link);
}
function cabinet(){el('achievement-featured-count').textContent=`${featured.length} / 3`;el('achievement-featured-list').replaceChildren();for(let index=0;index<3;index++){const item=ACHIEVEMENT_BY_ID.get(featured[index]),slot=document.createElement('button');slot.type='button';slot.className=`achievement-feature-slot${item?' rarity-'+item.rarity:''}`;if(item){const icon=document.createElement('span');icon.innerHTML=achievementIcon(item.icon);slot.append(icon);text(slot,'strong',item.title);text(slot,'small','Выбрано для профиля');slot.addEventListener('click',()=>{branch=item.branch;header();select(item.id);renderMap();});}else{slot.disabled=true;text(slot,'span','＋');text(slot,'small','Свободное место');}el('achievement-featured-list').append(slot);}}
async function pin(id){if(pinning||!user)return;const next=featured.includes(id)?featured.filter(value=>value!==id):[...featured,id];if(next.length>3){el('achievement-status').textContent='На витрине уже три награды. Сначала убери одну из выбранных.';return;}pinning=true;detail();try{await setFeatured(user.uid,next);featured=next;cabinet();el('achievement-status').textContent='Витрина профиля обновлена.';}catch{el('achievement-status').textContent='Не удалось сохранить витрину. Попробуй ещё раз.';}finally{pinning=false;detail();}}
async function load(){if(!user||busy)return;busy=true;const request=++generation;el('achievement-refresh').disabled=true;el('achievement-status').textContent='Проверяем твой прогресс…';
 try{const result=await syncAchievements(user.uid,{full:true});if(request!==generation)return;owned=new Map(result.owned.map(item=>[item.achievementId,item]));metrics=result.metrics;metadataMissing=result.metadataMissing||0;try{featured=await readFeatured(user.uid);}catch{featured=[];}if(request!==generation)return;if(ACHIEVEMENT_BY_ID.has(selected))branch=ACHIEVEMENT_BY_ID.get(selected).branch;header();renderMap();cabinet();el('achievement-status').textContent=result.failed.length?'Часть данных пока недоступна. Уже полученные награды сохранены; попробуй проверить прогресс позже.':result.unlocked.length?`Новых достижений: ${result.unlocked.length}. Уже накопленные результаты тоже учтены.`:'Прогресс обновлён. Следующее открытие уже где-то рядом.';announceAchievements(result.unlocked);
 }catch{el('achievement-status').textContent='Не удалось загрузить достижения. Проверь соединение и нажми «Проверить прогресс».';}finally{if(request===generation){busy=false;el('achievement-refresh').disabled=false;}}
}
el('achievement-refresh').addEventListener('click',load);el('achievement-search').addEventListener('input',renderMap);el('achievement-filter').addEventListener('change',renderMap);
for(const [id,direction] of [['achievement-map-left',-1],['achievement-map-right',1]])el(id).addEventListener('click',()=>el('achievement-map').scrollBy({left:direction*320,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
el('achievement-map').addEventListener('keydown',event=>{
 const node=event.target.closest('[data-achievement]');if(!node||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;event.preventDefault();const row=node.closest('.achievement-track'),nodes=[...row.querySelectorAll('button')],index=nodes.indexOf(node);let next;
 if(event.key==='ArrowLeft')next=nodes[index-1];if(event.key==='ArrowRight')next=nodes[index+1];if(event.key==='Home')next=nodes[0];if(event.key==='End')next=nodes.at(-1);if(event.key==='ArrowDown'||event.key==='ArrowUp'){const lane=row.closest('.achievement-lane'),other=event.key==='ArrowDown'?lane.nextElementSibling:lane.previousElementSibling;next=other?.querySelectorAll('button')[index]||other?.querySelector('button');}if(next){next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});select(next.dataset.achievement);}
});
onAuthStateChanged(auth,next=>{generation++;if(!next){user=null;location.href='../index.html';return;}user=next;const avatar=el('nav-user-avatar');if(avatar){avatar.hidden=!next.photoURL;if(next.photoURL)avatar.src=next.photoURL;}if(el('nav-user-name'))el('nav-user-name').textContent=next.displayName||'Киноман';load();});
el('sidebar-logout')?.addEventListener('click',()=>signOut(auth));
