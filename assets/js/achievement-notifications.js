import { auth,onAuthStateChanged } from './firebase-init.js';
import { syncAchievements } from './achievement-store.js';
import { pendingAchievements } from './achievement-events.js';
import { ACHIEVEMENT_BY_ID } from './achievement-catalog.js';
import { achievementIcon } from './achievement-icons.js';
let timer=0,busy=false,user=null,queued=new Set(),toastTimer=0;
export function announceAchievements(ids){
 const rewards=[...new Set(ids)].map(id=>ACHIEVEMENT_BY_ID.get(id)).filter(Boolean);if(!rewards.length)return;
 let toast=document.getElementById('achievement-notification');if(!toast){toast=document.createElement('aside');toast.id='achievement-notification';toast.className='achievement-notification';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);}
 toast.replaceChildren();const badge=document.createElement('span');badge.className='reward-toast-icon';badge.innerHTML=achievementIcon(rewards[0].icon);const copy=document.createElement('div'),label=document.createElement('small'),title=document.createElement('strong'),link=document.createElement('a'),close=document.createElement('button');
 label.textContent=rewards.length===1?'Достижение получено!':`Получено достижений: ${rewards.length}`;title.textContent=rewards[0].title;link.textContent=rewards.length>1?`Ещё ${rewards.length-1} · Открыть награды ↗`:'Открыть награду ↗';link.href=new URL(`../../pages/achievements.html?badge=${encodeURIComponent(rewards[0].id)}`,import.meta.url).href;close.type='button';close.textContent='×';close.setAttribute('aria-label','Закрыть уведомление о достижении');close.addEventListener('click',()=>{toast.hidden=true;clearTimeout(toastTimer);});copy.append(label,title,link);toast.append(badge,copy,close);toast.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.hidden=true;},9000);
}
function schedule(){clearTimeout(timer);if(!user||document.hidden||['/achievements.html','/profile.html'].some(path=>location.pathname.endsWith(path)))return;const uid=user.uid;if(!Object.keys(pendingAchievements(uid)).length&&!queued.size)return;timer=setTimeout(run,1200);}
async function run(){if(busy||!user)return;const uid=user.uid,sources=[...queued];queued.clear();busy=true;let success=false;
 try{const result=await syncAchievements(uid,{sources});if(user?.uid===uid){success=true;announceAchievements(result.unlocked);window.dispatchEvent(new CustomEvent('achievements:synced',{detail:{uid}}));}}catch{if(user?.uid===uid)for(const source of sources)queued.add(source);}finally{busy=false;if(success&&queued.size)schedule();}
}
onAuthStateChanged(auth,next=>{user=next;queued.clear();clearTimeout(timer);if(!next){clearTimeout(toastTimer);const toast=document.getElementById('achievement-notification');if(toast)toast.hidden=true;}if(next)schedule();});
window.addEventListener('achievements:dirty',event=>{if(event.detail?.uid!==user?.uid)return;for(const source of event.detail.sources||[])queued.add(source);if(!busy)schedule();});
window.addEventListener('online',schedule);document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
