import { listJointRatings,respondJointRating } from './joint-ratings.js';
import { posterUrl,NO_POSTER } from './shared.js';
export function createJointInbox(){
    const area=document.getElementById('joint-inbox'),list=document.getElementById('joint-inbox-list'),status=document.getElementById('joint-inbox-status'),refresh=document.getElementById('joint-inbox-refresh');
    let user=null,version=0,busy=false;
    const labels={pending:'Ждёт подтверждения',accepted:'Подтверждено',declined:'Отклонено',cancelled:'Отменено'};
    async function load(){
        if(!user||area.hidden||busy)return;busy=true;refresh.disabled=true;const request=version;status.textContent='Загружаем совместные оценки…';list.replaceChildren();
        try{const records=await listJointRatings(user.uid);if(request!==version)return;status.textContent=records.length?'':'Пока нет приглашений к совместным оценкам.';
            for(const invite of records){
                const incoming=invite.receiverId===user.uid,card=document.createElement('article');card.className='joint-invite';
                const image=document.createElement('img');image.src=posterUrl(invite.movie.poster);image.alt='';image.loading='lazy';image.addEventListener('error',()=>{image.src=NO_POSTER;},{once:true});
                const content=document.createElement('div'),title=document.createElement('h3');title.textContent=invite.movie.title;
                const meta=document.createElement('p');meta.textContent=`${incoming?'От '+invite.movie.authorName:'Для '+(invite.movie.jointPartnerName||'друга')} · ${Number(invite.movie.score).toFixed(1)} / 10 · ${labels[invite.status]||invite.status}`;
                content.append(title,meta);
                const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='Баллы и отзыв';details.append(summary);
                const stats=document.createElement('dl');stats.className='joint-invite-stats';const names={script:'Сценарий',actors:'Актёры',directing:'Режиссура',chars:'Персонажи',idea:'Идея',atmosphere:'Атмосфера',impression:'Впечатление'};
                for(const [key,label] of Object.entries(names)){const row=document.createElement('div'),term=document.createElement('dt'),value=document.createElement('dd');term.textContent=label;value.textContent=String(invite.movie.stats?.[key]||'—');row.append(term,value);stats.append(row);}details.append(stats);
                if(invite.movie.review){const review=document.createElement('p');review.textContent=invite.movie.review;details.append(review);}content.append(details);
                const actions=document.createElement('div');actions.className='joint-invite-actions';
                if(invite.status==='pending'){
                    const choices=incoming?[['Подтвердить','accepted'],['Отклонить','declined']]:[['Отменить приглашение','cancelled']];
                    for(const [label,action] of choices){const button=document.createElement('button');button.type='button';button.className=action==='accepted'?'profile-primary':'profile-small-btn';button.textContent=label;button.addEventListener('click',async()=>{actions.querySelectorAll('button').forEach(el=>el.disabled=true);try{await respondJointRating(user,invite.id,action);await load();}catch(error){status.textContent=error.code?'Не удалось обработать приглашение. Попробуй ещё раз.':error.message;actions.querySelectorAll('button').forEach(el=>el.disabled=false);}});actions.append(button);}
                }
                content.append(actions);card.append(image,content);list.append(card);
            }
        }catch{if(request===version)status.textContent='Не удалось загрузить совместные оценки. Обнови список после проверки соединения.';}
        finally{if(request===version){busy=false;refresh.disabled=false;}}
    }
    refresh.addEventListener('click',load);
    return {setUser(next,own){version++;user=next;busy=false;area.hidden=!own;list.replaceChildren();if(own)load();}};
}
