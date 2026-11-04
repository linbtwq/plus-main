import { db,doc,getDoc,runTransaction,serverTimestamp,collection,query,where,orderBy,limit,startAfter,getDocs } from './firebase-init.js';
import { dayKey,streakAfter } from './activity-model.js';
const uidValid=uid=>typeof uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(uid);
const idFor=uid=>`${uid}:${crypto.randomUUID()}`;
const defaults={watchedSeconds:0,completions:0,rouletteStarts:0,logins:0,activeDays:0,currentStreak:0,bestStreak:0,lastDay:''};
export const statsRef=uid=>doc(db,'activityStats',uid);
export function addRatingRevision(transaction,uid,movieId,before,after,reason='rating'){
    transaction.set(doc(db,'ratingHistory',idFor(uid)),{userId:uid,movieId,before:before||null,after,reason,createdAt:serverTimestamp()});
}
export async function saveRatingRecord(uid,payload,id=''){
    const reference=doc(db,'movies',id||`joint-source-${uid}-${crypto.randomUUID()}`);
    await runTransaction(db,async tx=>{
        const old=id?await tx.get(reference):null;
        if(id&&(!old.exists()||old.data().userId!==uid))throw new Error('Оценка недоступна');
        const after={...payload,timestamp:old?.exists()?old.data().timestamp:payload.timestamp};
        tx.set(reference,after);addRatingRevision(tx,uid,reference.id,old?.exists()?old.data():null,after);
    });return reference.id;
}
export async function deleteWithHistory(uid,name,id){
    if(!uidValid(uid)||!['movies','plans','friendships'].includes(name))throw new Error('Неверное удаление');
    const ref=doc(db,name,id),history=doc(db,'deletedItems',idFor(uid));
    await runTransaction(db,async tx=>{
        const item=await tx.get(ref);if(!item.exists())return;
        const data=item.data();if(name==='friendships'?!data.members?.includes(uid):data.userId!==uid)throw new Error('Нельзя удалять чужую запись');
        const audit={userId:uid,actorId:uid,collectionName:name,itemId:id,snapshot:data,createdAt:serverTimestamp()};
        tx.set(history,audit);
        if(name==='friendships'){const other=data.members.find(member=>member!==uid);tx.set(doc(db,'deletedItems',idFor(other)),{...audit,userId:other});}
        tx.delete(ref);
    });
}
export async function recordVisit(user){
    if(!uidValid(user?.uid))return;
    const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC',date=dayKey(new Date(),timezone),uid=user.uid;
    const signedIn=Date.parse(user.metadata?.lastSignInTime||''),login=Number.isFinite(signedIn)?doc(db,'activityEvents',`${uid}:login-${signedIn}`):null;
    const cacheKey=`activityVisit:${uid}:${date}:${Number.isFinite(signedIn)?signedIn:0}`;
    try{if(sessionStorage.getItem(cacheKey))return;}catch{}
    const day=doc(db,'activityDays',`${uid}:${date}`),stats=statsRef(uid);
    // Повторный переход по страницам не создаёт новые входы и дни активности.
    await runTransaction(db,async tx=>{
        const [oldDay,oldStats,oldLogin]=await Promise.all([tx.get(day),tx.get(stats),login?tx.get(login):null]);
        if(oldDay.exists()&&(!login||oldLogin.exists()))return;
        const totals={...defaults,...(oldStats.exists()?oldStats.data():{})};
        if(!oldDay.exists()){
            tx.set(day,{userId:uid,date,timezone,createdAt:serverTimestamp()});totals.activeDays++;
            const gap=streakAfter(totals.lastDay,date);
            if(!totals.lastDay||gap>0){totals.currentStreak=gap===1?totals.currentStreak+1:1;totals.bestStreak=Math.max(totals.bestStreak,totals.currentStreak);totals.lastDay=date;}
        }
        if(login&&!oldLogin.exists()){tx.set(login,{userId:uid,type:'login',label:'Вход в аккаунт',occurredAt:signedIn,createdAt:serverTimestamp()});totals.logins++;}
        tx.set(stats,{...totals,userId:uid,updatedAt:serverTimestamp()});
    });
    try{sessionStorage.setItem(cacheKey,'1');}catch{}
}
export async function recordRouletteStart(uid,mode){
    const label={classic:'Обычная',elimination:'На выбывание','no-repeat':'Без повторов'}[mode]||'Выбор фильма';
    const event=doc(db,'activityEvents',idFor(uid)),stats=statsRef(uid);
    await runTransaction(db,async tx=>{const old=await tx.get(stats);tx.set(event,{userId:uid,type:'roulette',label:`Запуск рулетки · ${label}`,occurredAt:Date.now(),createdAt:serverTimestamp()});tx.set(stats,{...defaults,...(old.exists()?old.data():{}),userId:uid,rouletteStarts:(old.exists()?old.data().rouletteStarts||0:0)+1,updatedAt:serverTimestamp()});});
}
export async function saveWatchSession(uid,id,entry){
    const ref=doc(db,'watchSessions',id),stats=statsRef(uid);
    await runTransaction(db,async tx=>{
        const [old,oldStats]=await Promise.all([tx.get(ref),tx.get(stats)]),previous=old.exists()?old.data():null;
        const watchedSeconds=Math.max(previous?.watchedSeconds||0,entry.watchedSeconds||0),completed=!!(previous?.completed||entry.completed);
        const data={...entry,userId:uid,watchedSeconds,completed,completionMethod:previous?.completed?previous.completionMethod:entry.completionMethod,createdAt:previous?.createdAt||serverTimestamp(),updatedAt:serverTimestamp()};
        tx.set(ref,data);const totals={...defaults,...(oldStats.exists()?oldStats.data():{})};
        totals.watchedSeconds+=watchedSeconds-(previous?.watchedSeconds||0);totals.completions+=Number(completed)-Number(previous?.completed||false);
        tx.set(stats,{...totals,userId:uid,updatedAt:serverTimestamp()});
    });
}
export async function readActivityPage(uid,name,cursor=null){
    if(!uidValid(uid)||!['watchSessions','ratingHistory','deletedItems','activityEvents','activityDays'].includes(name))throw new Error('Неверный запрос истории');
    const filters=[where('userId','==',uid),orderBy('createdAt','desc'),limit(31)];if(cursor)filters.push(startAfter(cursor));
    const snapshot=await getDocs(query(collection(db,name),...filters)),docs=snapshot.docs.slice(0,30);
    return {records:docs.map(d=>({...d.data(),id:d.id})),cursor:docs.at(-1)||null,more:snapshot.size>30};
}
export async function readActivityStats(uid){const snapshot=await getDoc(statsRef(uid));return {...defaults,...(snapshot.exists()?snapshot.data():{})};}
export async function readCloudSession(uid,id){if(!id.startsWith(uid+':')||id.includes('/'))return null;const snapshot=await getDoc(doc(db,'watchSessions',id));return snapshot.exists()?snapshot.data():null;}

export async function enrichRating(uid,id,metadata){
    const ref=doc(db,'movies',id);
    await runTransaction(db,async tx=>{
        const old=await tx.get(ref);if(!old.exists()||old.data().userId!==uid)throw new Error('Оценка недоступна');
        const after={...old.data(),metadata};tx.set(ref,after);addRatingRevision(tx,uid,id,old.data(),after,'metadata');
    });
}
