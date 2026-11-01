import { jointFriends } from './joint-ratings.js';
export function createJointRatingForm(getUser){
    const checkbox=document.getElementById('is-duo-checkbox'),area=document.getElementById('joint-friend-area'),select=document.getElementById('joint-friend-select'),status=document.getElementById('joint-friend-status');
    let friends=[],busy=false,desired='',editing=false;
    function refresh(){area.hidden=!checkbox.checked;const partner=friends.find(friend=>friend.uid===select.value);document.getElementById('user2-title').textContent=partner?`Оценки: ${partner.displayName}`:'Оценки второго участника';}
    async function load(){
        const user=getUser();if(!user||busy)return;busy=true;select.disabled=true;status.textContent='Загружаем друзей…';
        try{friends=await jointFriends(user.uid);select.replaceChildren(new Option('Без привязки к профилю',''),...friends.map(friend=>new Option(friend.displayName||'Друг',friend.uid)));if(desired&&friends.some(friend=>friend.uid===desired))select.value=desired;status.textContent=editing?'Это сохранённая совместная оценка. Правки изменят только твою копию; новая заявка другу не отправится.':friends.length?'Друг получит приглашение и подтвердит оценку в своём профиле. После подтверждения запись будет у обоих.':'Пока нет друзей. Можно сохранить парную оценку без привязки к профилю или добавить друга.';refresh();}
        catch{status.textContent='Не удалось загрузить друзей. Нажми «Обновить», чтобы повторить.';}
        finally{busy=false;select.disabled=editing;}
    }
    checkbox.addEventListener('change',refresh);select.addEventListener('change',()=>{desired=select.value;refresh();});document.getElementById('joint-friends-retry').addEventListener('click',load);
    return {load,lock(){editing=true;select.disabled=true;status.textContent='Это сохранённая совместная оценка. Правки изменят только твою копию; новая заявка другу не отправится.';},selected(){return checkbox.checked?friends.find(friend=>friend.uid===select.value)||null:null;},restore(uid){desired=uid||'';if(friends.some(friend=>friend.uid===desired))select.value=desired;refresh();}};
}
