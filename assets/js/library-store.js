import { markAchievementsDirty } from './achievement-events.js';
import { deleteWithHistory } from './activity-store.js';
import { db, doc, getDoc, setDoc, collection, query, where, getDocs, limit, startAfter } from './firebase-init.js';
import { validId, posterUrl } from './shared.js';
import { validUserId, friendshipId } from './profile-store.js';

export const mediaKey = (id, type) => ['movie','tv'].includes(type) && validId(id) ? `${type}:${id}` : '';
export async function readAll(collectionName, uid) {
    if (!validUserId(uid) || !['movies','plans'].includes(collectionName)) throw new Error('Неверный запрос библиотеки');
    const result = []; let cursor;
    // Порции не обрезают сравнение и списки для рулетки первыми записями.
    do {
        const filters = [where('userId','==',uid),limit(200)];
        if (cursor) filters.push(startAfter(cursor));
        const snapshot = await getDocs(query(collection(db,collectionName),...filters));
        result.push(...snapshot.docs.map(record=>({...record.data(),id:record.id})));
        cursor = snapshot.size === 200 ? snapshot.docs.at(-1) : null;
    } while (cursor);
    return result;
}
export async function assertFriend(uid, other) {
    if(uid === other)return;
    const snapshot=await getDoc(doc(db,'friendships',friendshipId(uid,other)));
    if(!snapshot.exists() || snapshot.data().status !== 'accepted')throw new Error('Выберите подтверждённого друга');
}
export async function getPlans(uid, viewer = uid) {
    await assertFriend(viewer,uid);
    return readAll('plans',uid);
}
export async function togglePlan(uid, movie) {
    const key = mediaKey(movie.tmdbId ?? movie.id,movie.mediaType ?? movie.media_type);
    if(!validUserId(uid)||!key)throw new Error('Выберите фильм из каталога');
    const reference=doc(db,'plans',`${uid}:${key}`),snapshot=await getDoc(reference);
    if(snapshot.exists()){await deleteWithHistory(uid,'plans',reference.id);return false;}
    const data={userId:uid,tmdbId:Number(movie.tmdbId??movie.id),mediaType:movie.mediaType??movie.media_type,title:String(movie.title||movie.name||'Без названия').slice(0,500),poster:movie.poster|| (movie.poster_path?posterUrl(`https://image.tmdb.org/t/p/w500${movie.poster_path}`):''),genres:String(movie.genresText|| (Array.isArray(movie.genres)?movie.genres.map(g=>g.name).join(', '):movie.genres||'')).slice(0,500),year:String(movie.year||(movie.release_date||movie.first_air_date||'').slice(0,4)),createdAt:Date.now()};
    await setDoc(reference,data);markAchievementsDirty(uid,['plans']);return true;
}
export async function removePlan(uid, movie) {
    const key=mediaKey(movie.tmdbId,movie.mediaType);
    if(validUserId(uid)&&key)await deleteWithHistory(uid,'plans',`${uid}:${key}`);
}
export function compareRatings(mine,theirs) {
    const latest = records => {const map=new Map();for(const movie of [...records].sort((a,b)=>(b.timestamp?.seconds||0)-(a.timestamp?.seconds||0))){const key=mediaKey(movie.tmdbId,movie.mediaType);if(key&&!map.has(key)&&Number.isFinite(Number(movie.score)))map.set(key,movie);}return map;};
    const own=latest(mine),other=latest(theirs);
    return [...own].filter(([key])=>other.has(key)).map(([key,movie])=>({key,title:movie.title,poster:movie.poster,mine:Number(movie.score),theirs:Number(other.get(key).score),difference:Math.abs(Number(movie.score)-Number(other.get(key).score))}));
}

// Одна транзакция дополняет актуальный облачный список, сохраняя уже добавленные фильмы.
export async function sendPlansToRoulette(uid){
    const [{loadRoulette}, {runTransaction}, {mergeRouletteTitles}, {readRoulette,writeRoulette}]=await Promise.all([import('./roulette-store.js'),import('./firebase-init.js'),import('./roulette-merge.js'),import('./shared.js')]);
    const plans=await getPlans(uid);if(!plans.length)return {added:0,skipped:0};
    const cached=await loadRoulette(uid),reference=doc(db,'roulette',uid);
    const result=await runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(reference),text=snapshot.exists()?snapshot.data().text:cached;
        const merged=mergeRouletteTitles(text,plans.map(movie=>movie.title));
        if(merged.added)transaction.set(reference,{text:merged.text});return merged;
    });
    if(readRoulette(uid)===cached){try{writeRoulette(uid,result.text);localStorage.removeItem(`roulettePending:${uid}`);}catch{}}
    return result;
}
