import { db, doc, getDoc, setDoc } from './firebase-init.js';
import { readRoulette, writeRoulette } from './shared.js';

// Облачная версия принадлежит аккаунту, локальная копия используется при сбое сети.
export async function loadRoulette(uid) {
    if (localStorage.getItem(`roulettePending:${uid}`)) {
        const pending = readRoulette(uid);
        await saveRoulette(uid, pending);
        return pending;
    }
    const snapshot = await getDoc(doc(db, 'roulette', uid));
    const text = snapshot.exists() ? snapshot.data().text : readRoulette(uid);
    const value = typeof text === 'string' ? text : '';
    writeRoulette(uid, value);
    localStorage.removeItem(`roulettePending:${uid}`);
    return value;
}

export async function saveRoulette(uid, text, cache = true) {
    if (!uid || typeof text !== 'string' || text.length > 100000) throw new Error('Список слишком длинный или вход не выполнен');
    if (cache) writeRoulette(uid, text);
    await setDoc(doc(db, 'roulette', uid), { text });
    // Новое изменение могло появиться, пока выполнялся сетевой запрос.
    if (readRoulette(uid) === text) localStorage.removeItem(`roulettePending:${uid}`);
}
