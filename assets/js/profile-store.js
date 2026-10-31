import { db, doc, getDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp, collection, query, where, onSnapshot } from './firebase-init.js';

export const validUserId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export function friendshipId(first, second) {
    if (!validUserId(first) || !validUserId(second) || first === second) throw new Error('Неверный код друга');
    return [first, second].sort().join(':');
}
export { safeProfileImage as safeAvatar } from './profile-images.js';
import { safeProfileImage, AVATAR_LIMIT, BANNER_LIMIT } from './profile-images.js';
export async function getProfile(uid) {
    if (!validUserId(uid)) throw new Error('Неверный код профиля');
    const snapshot = await getDoc(doc(db, 'profiles', uid));
    return snapshot.exists() ? { ...snapshot.data(), uid } : null;
}

// Транзакция не перезаписывает имя и описание уже существующего профиля.
export async function ensureProfile(user) {
    if (!validUserId(user?.uid)) throw new Error('Сначала войдите в аккаунт');
    const reference = doc(db, 'profiles', user.uid);
    await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) transaction.set(reference, {
            displayName: (user.displayName || 'Киноман').trim().slice(0, 60) || 'Киноман',
            bio: '', photoURL: safeProfileImage(user.photoURL, AVATAR_LIMIT), bannerURL: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
        });
    });
    return getProfile(user.uid);
}
export async function saveProfile(uid, displayName, bio, images = {}) {
    displayName = displayName.trim(); bio = bio.trim();
    if (!validUserId(uid) || !displayName || displayName.length > 60 || bio.length > 500) throw new Error('Имя должно содержать от 1 до 60 символов, описание — до 500');
    const changes = { displayName, bio, updatedAt: serverTimestamp() };
    for (const [field, max] of [['photoURL', AVATAR_LIMIT], ['bannerURL', BANNER_LIMIT]]) {
        if (!(field in images)) continue;
        const value = images[field];
        if (value !== '' && !safeProfileImage(value, max)) throw new Error('Некорректное изображение профиля');
        changes[field] = value;
    }
    await updateDoc(doc(db, 'profiles', uid), changes);
}
export function watchFriendships(uid, next, error) {
    return onSnapshot(query(collection(db, 'friendships'), where('members', 'array-contains', uid)), snapshot => {
        next(snapshot.docs.map(record => ({ ...record.data(), id: record.id })));
    }, error);
}
export async function requestFriendship(uid, otherUid) {
    const id = friendshipId(uid, otherUid);
    const reference = doc(db, 'friendships', id);
    await runTransaction(db, async transaction => {
        const existing = await transaction.get(reference);
        if (existing.exists()) throw new Error(existing.data().status === 'accepted' ? 'Вы уже друзья' : 'Заявка уже существует. Проверьте входящие и исходящие заявки.');
        const profile = await transaction.get(doc(db, 'profiles', otherUid));
        if (!profile.exists()) throw new Error('Профиль не найден. Друг должен сначала войти на сайт и открыть свой профиль.');
        transaction.set(reference, { members: [uid, otherUid].sort(), senderId: uid, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
}
export async function acceptFriendship(id) {
    await updateDoc(doc(db, 'friendships', id), { status: 'accepted', updatedAt: serverTimestamp() });
}
export async function removeFriendship(id) { await deleteDoc(doc(db, 'friendships', id)); }
