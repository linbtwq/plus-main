import { addRatingRevision } from './activity-store.js';
import { db,doc,collection,getDocs,query,where,runTransaction,serverTimestamp } from './firebase-init.js';
import { friendshipId,validUserId,getProfile } from './profile-store.js';

export async function jointFriends(uid){
    const snapshot=await getDocs(query(collection(db,'friendships'),where('members','array-contains',uid)));
    const ids=snapshot.docs.map(record=>record.data()).filter(data=>data.status==='accepted').map(data=>data.members.find(id=>id!==uid));
    const people=await Promise.all(ids.map(async id=>({uid:id,...await getProfile(id)})));
    return people.filter(person=>typeof person.displayName==='string'&&person.displayName.trim()).sort((a,b)=>(a.displayName||'').localeCompare(b.displayName||'','ru'));
}
const validRecordId=id=>typeof id==='string'&&id.length>0&&id.length<1000&&!id.includes('/');

// Собственная запись и приглашение сохраняются вместе; чужой архив автор не изменяет.
export async function saveJointRating(uid,movie,partner,existingId=''){
    if(!validUserId(uid)||!validUserId(partner.uid)||uid===partner.uid||!movie.isDuo)throw new Error('Выбери друга для совместной оценки');
    const reference=existingId?doc(db,'movies',existingId):doc(db,'movies',`joint-source-${uid}-${crypto.randomUUID()}`);
    if(!validRecordId(reference.id))throw new Error('Неверный код оценки');
    const invitation=doc(db,'jointRatings',`${uid}:${partner.uid}:${reference.id}`);
    return runTransaction(db,async transaction=>{
        const friendship=await transaction.get(doc(db,'friendships',friendshipId(uid,partner.uid)));
        if(!friendship.exists()||friendship.data().status!=='accepted')throw new Error('Совместную оценку можно отправить только подтверждённому другу');
        const source=await transaction.get(reference),previous=await transaction.get(invitation);
        if(source.exists()&&source.data().userId!==uid)throw new Error('Нельзя изменять чужую оценку');
        const payload={...movie,userId:uid,timestamp:source.exists()?source.data().timestamp:movie.timestamp,jointPartnerId:partner.uid,jointPartnerName:partner.displayName,jointFirstId:uid};
        transaction.set(reference,payload);addRatingRevision(transaction,uid,reference.id,source.exists()?source.data():null,payload);
        if(previous.exists()&&previous.data().status==='accepted')return {id:reference.id,status:'accepted'};
        transaction.set(invitation,{senderId:uid,receiverId:partner.uid,members:[uid,partner.uid],sourceMovieId:reference.id,movie:payload,status:'pending',createdAt:previous.exists()?previous.data().createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
        return {id:reference.id,status:'pending'};
    });
}
export async function listJointRatings(uid){
    const snapshot=await getDocs(query(collection(db,'jointRatings'),where('members','array-contains',uid)));
    return snapshot.docs.map(record=>({...record.data(),id:record.id})).sort((a,b)=>(b.updatedAt?.seconds||0)-(a.updatedAt?.seconds||0));
}

// Получатель сам подтверждает копию оценки в своём архиве. Повторное принятие не создаёт дубликат.
export async function respondJointRating(user,id,action){
    if(!validRecordId(id)||!['accepted','declined','cancelled'].includes(action))throw new Error('Неверное действие');
    const reference=doc(db,'jointRatings',id),copy=doc(db,'movies',`joint-${id}`);
    return runTransaction(db,async transaction=>{
        const snapshot=await transaction.get(reference);if(!snapshot.exists())throw new Error('Приглашение не найдено');
        const invite=snapshot.data(),receiver=invite.receiverId===user.uid;
        if(action==='cancelled' ? invite.senderId!==user.uid : !receiver)throw new Error('Это приглашение принадлежит другому участнику');
        if(invite.status==='accepted'&&action==='accepted')return copy.id;
        if(invite.status!=='pending')throw new Error('Приглашение уже обработано');
        if(action==='accepted'){
            const relation=await transaction.get(doc(db,'friendships',friendshipId(user.uid,invite.senderId)));
            if(!relation.exists()||relation.data().status!=='accepted')throw new Error('Дружба больше не подтверждена');
            const existing=await transaction.get(copy);if(existing.exists())throw new Error('Копия оценки уже существует');
            const profile=await transaction.get(doc(db,'profiles',user.uid));
            const received={...invite.movie,userId:user.uid,authorName:profile.exists()?profile.data().displayName:user.displayName||'Киноман',authorPhoto:user.photoURL||null,timestamp:serverTimestamp(),jointPartnerId:invite.senderId,jointPartnerName:invite.movie.authorName};
            transaction.set(copy,received);addRatingRevision(transaction,user.uid,copy.id,null,received,'joint');
        }
        transaction.set(reference,{...invite,status:action,updatedAt:serverTimestamp()});
        return copy.id;
    });
}
