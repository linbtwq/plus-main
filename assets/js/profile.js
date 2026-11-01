import { createJointInbox } from './joint-rating-inbox.js';
import { createComparison } from './compare.js';
import { createProfileRatings } from './profile-ratings.js';
import { prepareProfileImage } from './profile-images.js';
import { auth, onAuthStateChanged, signOut } from './firebase-init.js';
import { validUserId, safeAvatar, ensureProfile, getProfile, saveProfile, watchFriendships, friendshipId, requestFriendship, acceptFriendship, removeFriendship } from './profile-store.js';

const element = id => document.getElementById(id);
const status = element('profile-status');
const ratings = createProfileRatings();
const jointInbox=createJointInbox();
let currentUser, targetProfile, relationships = [], unsubscribe, generation = 0, searchGeneration = 0, searchProfile = null, friendsReady = false;
const people = new Map();
const busyRelationships = new Set();
let messageTimer;
let draftImages = {}, imageJobs = 0, imageSession = 0;
const imageRequests = { avatar: 0, banner: 0 };
function message(text, error = false) {
    clearTimeout(messageTimer);
    status.textContent = text; status.classList.toggle('is-error', error);
    status.classList.toggle('is-toast', !!text && !element('profile-card').hidden && !document.querySelector('dialog[open]'));
    if (text && !error && !element('profile-card').hidden) messageTimer = setTimeout(() => { status.textContent = ''; status.classList.remove('is-toast'); }, 3500);
    document.querySelectorAll('dialog[open] [data-dialog-status]').forEach(node => { node.textContent = text; });
}
function avatar(container, profile) {
    container.replaceChildren();
    const initial = document.createElement('span');
    initial.textContent = (profile.displayName || 'К').trim().slice(0, 1).toLocaleUpperCase();
    container.appendChild(initial);
    const url = safeAvatar(profile.photoURL);
    if (url) {
        const image = document.createElement('img'); image.src = url; image.alt = ''; image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        container.appendChild(image);
    }
}
function showProfile(profile) {
    targetProfile = profile;
    const shareUrl = new URL(location.href);
    shareUrl.searchParams.set('user', profile.uid);
    history.replaceState(null, '', shareUrl);
    element('profile-name').textContent = profile.displayName;
    element('profile-bio').textContent = profile.bio || 'Пока ничего не рассказал о себе';
    element('profile-code').textContent = profile.uid;
    avatar(element('profile-avatar'), profile);
    showBanner(element('profile-cover'), profile.bannerURL);
    element('profile-card').hidden = false;
    const own = profile.uid === currentUser.uid;
    jointInbox.setUser(currentUser,own);
    element('own-profile').hidden = !own;
    element('page-heading').textContent = own ? 'МОЙ ПРОФИЛЬ' : 'ПРОФИЛЬ УЧАСТНИКА';
    element('edit-profile').hidden = !own;
    element('profile-own-meta').hidden = !own;
    if (own) {
        element('profile-display-name').value = profile.displayName;
        element('profile-description').value = profile.bio || '';
    }
    refreshFriendAction();
}
const comparison=createComparison();
function relationshipWith(uid) { return relationships.find(item => item.members.includes(uid)); }
function refreshFriendAction() {
    if (targetProfile && currentUser) {
        const own = targetProfile.uid === currentUser.uid;
        comparison.setAccess(currentUser.uid,targetProfile.uid,!own&&friendsReady&&relationshipWith(targetProfile.uid)?.status==='accepted');
        ratings.setAccess(own ? '' : targetProfile.uid, !own && friendsReady && relationshipWith(targetProfile.uid)?.status === 'accepted', !own && !friendsReady);
    }
    const button = element('friend-action');
    if (!targetProfile || !currentUser || targetProfile.uid === currentUser.uid) { button.hidden = true; return; }
    button.hidden = false;
    const relation = relationshipWith(targetProfile.uid);
    button.textContent = !relation ? 'Добавить в друзья' : relation.status === 'accepted' ? 'Удалить из друзей' : relation.senderId === currentUser.uid ? 'Отменить заявку' : 'Принять заявку';
    button.disabled = !friendsReady || busyRelationships.has(friendshipId(currentUser.uid, targetProfile.uid));
}
async function performFriendAction(button, otherUid, action) {
    const id = friendshipId(currentUser.uid, otherUid);
    if (busyRelationships.has(id)) return;
    busyRelationships.add(id); button.disabled = true;
    try {
        await action(id);
        message('Готово');
    } catch (error) {
        console.error('Ошибка изменения списка друзей:', error);
        message(error.code ? 'Не удалось выполнить действие. Повторите попытку.' : error.message, true);
    } finally {
        busyRelationships.delete(id);
        if (button.isConnected) button.disabled = false;
        refreshFriendAction();
        if (searchProfile) showSearchResult(searchProfile);
    }
}
element('friend-action').addEventListener('click', event => {
    const other = targetProfile.uid;
    const relation = relationshipWith(other);
    if (!relation) performFriendAction(event.currentTarget, other, () => requestFriendship(currentUser.uid, other));
    else if (relation.status === 'pending' && relation.senderId !== currentUser.uid) performFriendAction(event.currentTarget, other, acceptFriendship);
    else if (relation.status === 'pending' || confirm('Удалить пользователя из друзей?')) performFriendAction(event.currentTarget, other, removeFriendship);
});

async function loadPerson(uid) {
    if (people.has(uid)) return people.get(uid);
    const profile = await getProfile(uid);
    const result = profile || { uid, displayName: 'Профиль недоступен', bio: '', photoURL: '' };
    people.set(uid, result);
    return result;
}
function friendRow(profile, relation) {
    const row = document.createElement('li'); row.className = 'friend-row';
    const picture = document.createElement('div'); picture.className = 'friend-avatar'; avatar(picture, profile);
    const link = document.createElement('a'); link.className = 'friend-name'; link.href = `profile.html?${new URLSearchParams({ user: profile.uid })}`; link.textContent = profile.displayName;
    const actions = document.createElement('div'); actions.className = 'friend-actions';
    const action = (title, callback, secondary = false) => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = title;
        button.className = `profile-small-btn${secondary ? ' secondary' : ''}`;
        button.disabled = busyRelationships.has(relation.id);
        button.addEventListener('click', () => performFriendAction(button, profile.uid, callback)); actions.appendChild(button);
    };
    if (relation.status === 'accepted') action('Удалить', async id => { if (confirm('Удалить пользователя из друзей?')) await removeFriendship(id); }, true);
    else if (relation.senderId === currentUser.uid) action('Отменить', removeFriendship, true);
    else { action('Принять', acceptFriendship); action('Отклонить', removeFriendship, true); }
    row.append(picture, link, actions);
    return row;
}
let listGeneration = 0;
async function renderRelationships() {
    const request = ++listGeneration;
    const session = generation;
    try {
        const rows = await Promise.all(relationships.map(async relation => {
            const other = relation.members.find(uid => uid !== currentUser.uid);
            return { relation, profile: await loadPerson(other) };
        }));
        if (request !== listGeneration || session !== generation) return;
        const lists = { friends: element('friends-list'), incoming: element('incoming-list'), outgoing: element('outgoing-list') };
        Object.values(lists).forEach(list => list.replaceChildren());
        rows.sort((first, second) => first.profile.displayName.localeCompare(second.profile.displayName, 'ru')).forEach(({ relation, profile }) => {
            const key = relation.status === 'accepted' ? 'friends' : relation.senderId === currentUser.uid ? 'outgoing' : 'incoming';
            lists[key].appendChild(friendRow(profile, relation));
        });
        const count = rows.filter(row => row.relation.status === 'accepted').length;
        element('friends-count').textContent = String(count);
        element('profile-friends-total').textContent = String(count);
        const incomingCount = rows.filter(row => row.relation.status === 'pending' && row.relation.senderId !== currentUser.uid).length;
        element('requests-count').textContent = String(incomingCount);
        element('requests-count').hidden = incomingCount === 0;
        Object.entries(lists).forEach(([key, list]) => {
            if (list.children.length) return;
            const empty = document.createElement('li'); empty.className = 'friends-empty';
            empty.textContent = key === 'friends' ? 'Твоя компания для хорошего кино. Добавь первого друга — и он появится здесь.' : 'Заявок пока нет';
            list.appendChild(empty);
        });
        element('friends-status').textContent = '';
        element('retry-friends').hidden = true;
    } catch (error) { if (session === generation) friendsError(error); }
}
function friendsError(error) {
    console.error('Ошибка загрузки друзей:', error);
    element('friends-status').textContent = 'Не удалось обновить список друзей. Попробуйте ещё раз.';
    element('retry-friends').hidden = false;
}
function listenFriends() {
    unsubscribe?.(); friendsReady = false;
    element('friends-status').textContent = 'Загрузка друзей…';
    const session = generation;
    unsubscribe = watchFriendships(currentUser.uid, data => {
        if (session !== generation) return;
        friendsReady = true;
        relationships = data;
        refreshFriendAction();
        if (searchProfile) showSearchResult(searchProfile);
        renderRelationships();
    }, error => {
        if (session !== generation) return;
        unsubscribe?.(); unsubscribe = null; friendsReady = false;
        refreshFriendAction(); friendsError(error);
        message('Не удалось загрузить друзей. Повторите загрузку профиля.', true);
        element('profile-retry').hidden = false;
    });
}
element('retry-friends').addEventListener('click', listenFriends);

async function initialize(user) {
    const session = ++generation;
    jointInbox.setUser(user,false);
    comparison.setAccess('','',false);
    ratings.setAccess('', false);
    unsubscribe?.(); unsubscribe = null; friendsReady = false; relationships = []; people.clear(); searchProfile = null;
    element('profile-retry').hidden = true;
    element('profile-card').hidden = element('own-profile').hidden = true;
    message('Загрузка профиля…');
    try {
        const own = await ensureProfile(user);
        const uid = new URLSearchParams(location.search).get('user') || user.uid;
        const profile = uid === user.uid ? own : await getProfile(uid);
        if (session !== generation) return;
        if (!profile) throw new Error('Профиль не найден. Попроси друга сначала открыть свой профиль на сайте.');
        showProfile(profile); listenFriends(); refreshFriendAction(); message('');
    } catch (error) {
        if (session !== generation) return;
        console.error('Ошибка загрузки профиля:', error);
        message(error.code ? 'Не удалось загрузить профиль. Попробуйте ещё раз.' : error.message, true);
        element('profile-retry').hidden = false;
    }
}
onAuthStateChanged(auth, user => {
    if (!user) { ratings.setAccess('', false); generation++; unsubscribe?.(); window.location.href = '../index.html'; return; }
    currentUser = user; initialize(user);
});
window.addEventListener('pagehide', () => {jointInbox.setUser(null,false); comparison.setAccess('','',false);ratings.setAccess('', false); unsubscribe?.(); unsubscribe = null; friendsReady = false; });
window.addEventListener('pageshow', event => { if (event.persisted && currentUser && targetProfile) listenFriends(); });
element('profile-retry').addEventListener('click', () => initialize(currentUser));
element('sidebar-logout').addEventListener('click', () => signOut(auth).catch(() => message('Не удалось выйти. Попробуйте ещё раз.', true)));
element('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const button = element('save-profile'); if (button.disabled || imageJobs) return; button.disabled = true;
    try {
        await saveProfile(currentUser.uid, element('profile-display-name').value, element('profile-description').value, draftImages);
        const updated = await getProfile(currentUser.uid);
        people.set(currentUser.uid, updated); showProfile(updated); element('edit-profile-dialog').close(); message('Профиль сохранён');
    } catch (error) { message(error.code ? 'Не удалось сохранить профиль. Попробуйте ещё раз.' : error.message, true); }
    finally { button.disabled = false; }
});
element('copy-profile-link').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); message('Ссылка на профиль скопирована'); }
    catch { message('Скопируйте ссылку на профиль из адресной строки браузера.', true); }
});
element('copy-profile-code').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(targetProfile.uid); message('Код профиля скопирован'); }
    catch { message('Не удалось скопировать автоматически. Выделите код профиля и скопируйте вручную.', true); }
});

function parseFriendCode(text) {
    const value = text.trim();
    if (validUserId(value)) return value;
    try {
        const url = new URL(value);
        const uid = url.searchParams.get('user');
        if (['http:', 'https:'].includes(url.protocol) && validUserId(uid)) return uid;
    } catch { /* Обычный код уже проверен выше. */ }
    throw new Error('Вставьте корректный код друга или ссылку на его профиль');
}
function showSearchResult(profile) {
    searchProfile = profile;
    const container = element('friend-search-result'); container.replaceChildren();
    const link = document.createElement('a'); link.href = `profile.html?${new URLSearchParams({ user: profile.uid })}`; link.textContent = profile.displayName;
    const description = document.createElement('p'); description.textContent = profile.bio;
    const button = document.createElement('button'); button.className = 'profile-small-btn'; button.type = 'button';
    const relation = relationshipWith(profile.uid);
    button.textContent = !relation ? 'Добавить в друзья' : relation.status === 'accepted' ? 'Уже в друзьях' : relation.senderId === currentUser.uid ? 'Заявка отправлена' : 'Принять заявку';
    button.disabled = !friendsReady || busyRelationships.has(friendshipId(currentUser.uid, profile.uid)) || !!relation && (relation.status === 'accepted' || relation.senderId === currentUser.uid);
    button.addEventListener('click', () => performFriendAction(button, profile.uid, relation ? acceptFriendship : () => requestFriendship(currentUser.uid, profile.uid)));
    container.append(link, description, button);
}
element('friend-search-form').addEventListener('submit', async event => {
    event.preventDefault();
    const request = ++searchGeneration;
    const button = element('find-friend'); button.disabled = true;
    searchProfile = null; element('friend-search-result').textContent = 'Ищем профиль…';
    try {
        const uid = parseFriendCode(element('friend-code').value);
        if (uid === currentUser.uid) throw new Error('Это твой профиль. Попроси друга прислать его код.');
        const profile = await getProfile(uid);
        if (request !== searchGeneration) return;
        if (!profile) throw new Error('Профиль не найден. Другу нужно сначала открыть свой профиль на сайте.');
        showSearchResult(profile);
    } catch (error) {
        if (request === searchGeneration) element('friend-search-result').textContent = error.code ? 'Поиск недоступен. Попробуйте ещё раз.' : error.message;
    } finally { if (request === searchGeneration) button.disabled = false; }
});

// Формы открываются по действию пользователя, оставляя профиль главным на странице.
function openProfileDialog(id) {
    const dialog = element(id);
    dialog.querySelectorAll('[data-dialog-status]').forEach(node => { node.textContent = ''; });
    if (id === 'edit-profile-dialog' && targetProfile) {
        imageSession++; imageJobs = 0; draftImages = {};
        element('save-profile').disabled = false;
        element('profile-avatar-file').value = element('profile-banner-file').value = '';
        element('profile-image-status').textContent = '';
        updateImagePreviews();
        element('profile-display-name').value = targetProfile.displayName;
        element('profile-description').value = targetProfile.bio || '';
    }
    dialog.showModal();
}
element('edit-profile').addEventListener('click', () => openProfileDialog('edit-profile-dialog'));
element('open-friend-search').addEventListener('click', () => openProfileDialog('friend-search-dialog'));
element('share-profile').addEventListener('click', () => openProfileDialog('share-profile-dialog'));
document.querySelectorAll('.profile-dialog').forEach(dialog => {
    dialog.querySelector('[data-close-dialog]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
        const rect = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
});
const profileTabs = Array.from(document.querySelectorAll('[data-profile-tab]'));
function selectProfileTab(tab) {
    profileTabs.forEach(button => {
        const active = button === tab;
        button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
        element(button.dataset.profileTab).hidden = !active;
    });
}
profileTabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectProfileTab(tab));
    tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const target = event.key === 'Home' ? 0 : event.key === 'End' ? profileTabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + profileTabs.length) % profileTabs.length;
        selectProfileTab(profileTabs[target]); profileTabs[target].focus();
    });
});

// Предпросмотр меняется сразу, основной профиль — только после сохранения.
function showBanner(container, value) {
    container.querySelector('.profile-banner-image')?.remove();
    const url = safeAvatar(value);
    container.classList.toggle('has-custom-banner', !!url);
    if (!url) return;
    const image = document.createElement('img');
    image.className = 'profile-banner-image'; image.alt = ''; image.src = url; image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => { image.remove(); container.classList.remove('has-custom-banner'); }, { once: true });
    container.prepend(image);
}
function updateImagePreviews() {
    avatar(element('edit-avatar-preview'), { ...targetProfile, photoURL: draftImages.photoURL ?? targetProfile.photoURL });
    showBanner(element('edit-banner-preview'), draftImages.bannerURL ?? targetProfile.bannerURL);
}
for (const kind of ['avatar', 'banner']) {
    const field = kind === 'avatar' ? 'photoURL' : 'bannerURL';
    const input = element(`profile-${kind}-file`);
    input.addEventListener('change', async () => {
        const file = input.files[0]; if (!file) return;
        const session = imageSession;
        const request = ++imageRequests[kind];
        imageJobs++; element('save-profile').disabled = true;
        element('profile-image-status').textContent = 'Подготавливаем изображение…';
        try {
            const result = await prepareProfileImage(file, kind);
            if (session !== imageSession || request !== imageRequests[kind]) return;
            draftImages[field] = result; updateImagePreviews();
            element('profile-image-status').textContent = 'Изображение готово. Нажмите «Сохранить профиль».';
        } catch (error) {
            if (session === imageSession && request === imageRequests[kind]) element('profile-image-status').textContent = error.message;
        } finally {
            if (session === imageSession) { imageJobs--; element('save-profile').disabled = imageJobs > 0; }
        }
    });
    element(`remove-profile-${kind}`).addEventListener('click', () => {
        imageRequests[kind]++; input.value = ''; draftImages[field] = ''; updateImagePreviews();
        element('profile-image-status').textContent = 'Изображение будет удалено после сохранения.';
    });
}
