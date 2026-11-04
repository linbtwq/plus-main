import { db,doc,getDoc,collection,query,where,limit,startAfter,getDocs,runTransaction,serverTimestamp } from './firebase-init.js';
import { ACHIEVEMENTS,ACHIEVEMENT_BY_ID,eligibleAchievements } from './achievement-catalog.js';
import { achievementMetrics,mergeAchievementMetrics } from './achievement-metrics.js';
import { ACHIEVEMENT_SOURCES,pendingAchievements,clearAchievementPending } from './achievement-events.js';
const validUid=uid=>typeof uid==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(uid);
async function records(name,uid){
 const result=[];let cursor;
 do{const filters=[where(name==='friendships'||name==='jointRatings'?'members':'userId',name==='friendships'||name==='jointRatings'?'array-contains':'==',uid),limit(200)];if(cursor)filters.push(startAfter(cursor));const snapshot=await getDocs(query(collection(db,name),...filters));result.push(...snapshot.docs.map(row=>({...row.data(),id:row.id})));cursor=snapshot.size===200?snapshot.docs.at(-1):null;}while(cursor);
 return result;
}
async function source(name,uid){if(name==='profile'||name==='activityStats'){const row=await getDoc(doc(db,name==='profile'?'profiles':name,uid));return row.exists()?row.data():{};}return records(name,uid);}
export async function readAchievements(uid){if(!validUid(uid))throw new Error('Неверный профиль');return (await records('achievements',uid)).filter(row=>ACHIEVEMENT_BY_ID.has(row.achievementId));}
export async function syncAchievements(uid,{full=false,sources=[]}={}){
 if(!validUid(uid))throw new Error('Сначала войди в аккаунт');
 const pending=pendingAchievements(uid),requested=[...new Set(full?ACHIEVEMENT_SOURCES:[...Object.keys(pending),...sources])].filter(name=>ACHIEVEMENT_SOURCES.includes(name));
 const [owned,snapshot]=await Promise.all([readAchievements(uid),getDoc(doc(db,'achievementProgress',uid))]);
 const data={uid},failed=[];let next=0;
 // Только действия пользователя запускают обновление; фонового опроса нет.
 await Promise.all(Array.from({length:Math.min(3,requested.length)},async()=>{while(next<requested.length){const name=requested[next++];try{data[name]=await source(name,uid);}catch{failed.push(name);}}}));
 const calculated=achievementMetrics(data),ref=doc(db,'achievementProgress',uid);
 const result=await runTransaction(db,async tx=>{
  const current=await tx.get(ref),metrics=mergeAchievementMetrics(snapshot.exists()?snapshot.data().metrics:{},current.exists()?current.data().metrics:{},calculated);
  const candidates=eligibleAchievements(metrics,owned.map(row=>row.achievementId));
  const references=candidates.map(item=>doc(db,'achievements',`${uid}:${item.id}`));
  const existing=await Promise.all(references.map(reference=>tx.get(reference)));
  tx.set(ref,{userId:uid,metrics,updatedAt:serverTimestamp()});
  const unlocked=[];candidates.forEach((item,index)=>{if(existing[index].exists())return;tx.set(references[index],{userId:uid,achievementId:item.id,unlockedAt:serverTimestamp()});unlocked.push(item.id);});
  return {metrics,unlocked};
 });
 clearAchievementPending(uid,Object.fromEntries(Object.entries(pending).filter(([name])=>!failed.includes(name))));
 const known=new Map(owned.map(row=>[row.achievementId,row]));for(const id of result.unlocked)known.set(id,{achievementId:id,unlockedAt:{seconds:Date.now()/1000}});
 return {...result,owned:[...known.values()],failed,total:ACHIEVEMENTS.length,metadataMissing:(data.movies||[]).filter(movie=>!movie.metadata).length};
}
export async function readFeatured(uid){const snapshot=await getDoc(doc(db,'achievementCabinets',uid));return snapshot.exists()?snapshot.data().badges.filter(id=>ACHIEVEMENT_BY_ID.has(id)):[];}
export async function setFeatured(uid,ids){
 if(!validUid(uid)||ids.length>3||new Set(ids).size!==ids.length||ids.some(id=>!ACHIEVEMENT_BY_ID.has(id)))throw new Error('На витрине может быть до трёх разных наград');
 await runTransaction(db,async tx=>{const earned=await Promise.all(ids.map(id=>tx.get(doc(db,'achievements',`${uid}:${id}`))));if(earned.some(item=>!item.exists()))throw new Error('Сначала получи это достижение');tx.set(doc(db,'achievementCabinets',uid),{userId:uid,badges:ids,updatedAt:serverTimestamp()});});
}
