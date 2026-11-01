import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const firebase = `
export const auth = { currentUser: window.__signedOut ? null : { uid: window.__viewer || 'owner', displayName: 'Тест', photoURL: null } }, db = {}, provider = {};
export const onAuthStateChanged = (auth, callback) => setTimeout(() => callback(auth.currentUser), window.__authDelay || 0);
export const signOut = async () => {}, signInWithPopup = async () => {};
export const collection = (db, name) => ({name}), doc = (db, name, id) => name ? ({name,id}) : ({name:db.name,id:'auto-'+(window.__autoId=(window.__autoId||0)+1)});
export const where = (...args) => ({where:args}), orderBy = (...args) => ({orderBy:args}), limit = n => ({limit:n}), startAfter = d => ({cursor:d.id});
export const query = (ref, ...constraints) => ({...ref, constraints});
export const getDocs = async q => {
 window.__queries = [...(window.__queries || []), q];
 await new Promise(resolve => setTimeout(resolve, window.__archiveDelay || 0));
 if (window.__archiveFailOnce) {window.__archiveFailOnce=false; throw new Error('Проверка повторной загрузки');}
 const cursor = q.constraints.find(c => c.cursor)?.cursor;
 let data = q.name === 'jointRatings' ? Object.entries(window.__jointRecords || {}).map(([id,m])=>({...m,id})) : q.name === 'plans' ? Object.entries(window.__plans || {}).map(([id,m])=>({...m,id})) : q.name === 'friendships' ? Object.entries(window.__friendRecords || {}).map(([id,m])=>({...m,id})) : window.__movies || [];
 const member=q.constraints.find(c=>c.where?.[0]==='members')?.where[2];if(member)data=data.filter(m=>m.members.includes(member));
 const owner = q.constraints.find(c => c.where?.[0] === 'userId')?.where[2];
 if (owner) data = data.filter(movie => movie.userId === owner);
 if(cursor) data = data.slice(data.findIndex(d => d.id === cursor)+1);
 data = data.slice(0, q.constraints.find(c => c.limit)?.limit || 48);
 const docs = data.map(d => ({id:d.id, data:()=>d}));
 return {docs, size:docs.length, forEach:fn=>docs.forEach(fn)};
};
const profileData = () => window.__profiles ||= {owner:{displayName:'Тест',bio:'',photoURL:''}};
const friendData = () => window.__friendRecords ||= {};
const snapshot = ref => {
 const value = ref.name === 'profiles' ? profileData()[ref.id] : ref.name === 'friendships' ? friendData()[ref.id] : ref.name === 'jointRatings' ? (window.__jointRecords||{})[ref.id] : ref.name === 'plans' ? (window.__plans||{})[ref.id] : ref.name==='movies' ? (window.__movies||[]).find(m=>m.id===ref.id) : {text:window.__roulette || ''};
 return {exists:()=>!!value,data:()=>value};
};
let listener;
const notify = () => setTimeout(() => listener?.({docs:Object.entries(friendData()).filter(([,data])=>data.members.includes(auth.currentUser.uid)).map(([id,data])=>({id,data:()=>data}))}),0);
export const getDoc = async ref => snapshot(ref);
export const setDoc = async (ref,data) => {window.__cloud = {ref,data};if(ref.name==='roulette')window.__roulette=data.text;if(ref.name==='plans'){window.__plans||={};window.__plans[ref.id]=data;}};
export const addDoc = async (ref,data) => {window.__saved = data; return {id:'saved'};};
export const deleteDoc = async ref => {window.__deleted=ref;if(ref.name==='plans')delete (window.__plans||{})[ref.id]; if(ref.name === 'friendships'){delete friendData()[ref.id];notify();}};
export const updateDoc = async (ref,data) => {
 if(ref.name === 'profiles') profileData()[ref.id] = {...profileData()[ref.id],...data};
 else if(ref.name === 'friendships'){friendData()[ref.id]={...friendData()[ref.id],...data};notify();}
 else if(ref.name==='movies'){window.__updated={ref,data};window.__movies=(window.__movies||[]).map(m=>m.id===ref.id?{...m,...data}:m);}
 else throw new Error('Чтение не должно менять базу');
};
export const runTransaction = async (db, callback) => {
 const writes=[];
 const result=await callback({get:async ref=>snapshot(ref),set:(ref,data)=>writes.push([ref,data])});
 if(window.__transactionFailOnce){window.__transactionFailOnce=false;throw new Error('Проверка атомарности');}
 writes.forEach(([ref,data])=>{if(ref.name === 'profiles')profileData()[ref.id]=data;else if(ref.name === 'friendships')friendData()[ref.id]=data;else if(ref.name==='jointRatings'){window.__jointRecords||={};window.__jointRecords[ref.id]=data;}else if(ref.name==='movies'){window.__movies||=[];const index=window.__movies.findIndex(m=>m.id===ref.id);if(index>=0)window.__movies[index]={...data,id:ref.id};else window.__movies.push({...data,id:ref.id});}else if(ref.name==='roulette'){window.__roulette=data.text;window.__cloud={ref,data};}});
 notify();return result;
};
export const onSnapshot = (q,next,error) => {listener=next;notify();return ()=>{listener=null;};};
export const serverTimestamp = () => 'SERVER_TIMESTAMP';
`;

const server = createServer(async (req, res) => {
    try {
        const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
        if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
        if (path.endsWith('/assets/js/firebase-init.js')) { res.setHeader('Content-Type', 'text/javascript'); res.end(firebase); return; }
        res.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png'})[extname(path)] || 'text/plain');
        res.end(await readFile(path));
    } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath:process.env.BROWSER_PATH || undefined, headless:true, args:['--no-sandbox']});
const context = await browser.newContext({reducedMotion:'reduce'});
context.setDefaultTimeout(5000);
const errors = [];
context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
let slowRelease, slowStarted;
await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    if (url.hostname === 'api.themoviedb.org') {
        let body;
        if (url.searchParams.get('query') === 'Старый') {
            slowStarted?.();
            await new Promise(resolve => {slowRelease = resolve;});
        }
        if (url.pathname.endsWith('/external_ids')) body = {imdb_id:'tt0133093'};
        else if (url.pathname.endsWith('/videos')) body = {results:[{type:'Trailer',site:'YouTube',key:'abcdefghijk'}]};
        else if (/\/season\//.test(url.pathname)) body = {episodes:[{episode_number:1},{episode_number:2}]};
        else if (/\/(movie|tv)\/\d+$/.test(url.pathname)) body = {id:123,title:'Тест',name:'Тест',original_language:'ru',poster_path:'/test.jpg',genres:[],vote_average:8,seasons:[{season_number:1}],overview:'Тест'};
        else body = {results:[{id:123,title:url.searchParams.get('query') || 'Тест',name:'Сериал',media_type:url.pathname.includes('/tv/') ? 'tv':'movie',poster_path:'/test.jpg',genre_ids:[],vote_average:8}],total_pages:2};
        return route.fulfill({json:body});
    }
    return route.abort();
});

try {
    await test('Ссылка с HTML не создаёт плеер или обработчики событий', async () => {
        const page = await context.newPage();
        await page.goto(`${base}/pages/watch.html?id=${encodeURIComponent('1" onload="window.__xss=1')}&type=movie`);
        await page.waitForFunction(() => document.getElementById('movie-title').textContent.includes('Ошибка'));
        assert.equal(await page.locator('#kodik-player iframe').count(), 0);
        assert.equal(await page.evaluate(() => window.__xss), undefined);
        await page.close();
    });
    await test('Плеер по умолчанию открывает русскоязычный источник и передаёт серию', async () => {
        const page = await context.newPage();
        await page.goto(`${base}/pages/watch.html?id=123&type=tv&title=Тест`);
        await page.waitForFunction(() => document.querySelector('#kodik-player iframe')?.src.includes('/imdb/tt0133093'));
        assert.equal(await page.locator('#source-select').inputValue(),'collaps');
        await page.locator('#episode-select').selectOption('2');
        await page.waitForFunction(() => new URL(document.querySelector('#kodik-player iframe').src).searchParams.get('episode') === '2');
        assert.match(await page.locator('#audio-hint').textContent(),/Рус. Дублированный/);
        await page.locator('#source-select').selectOption('vidlink');
        await page.waitForFunction(() => document.querySelector('#kodik-player iframe')?.src.includes('vidlink.pro/tv/123/1/2'));
        await page.locator('#kodik-player iframe').evaluate(frame => frame.dataset.previous = 'yes');
        await page.locator('#reload-player').click();
        assert.equal(await page.locator('#kodik-player iframe').getAttribute('data-previous'),null);
        await page.close();
    });
    await test('Запоздалый ответ IMDb не переключает выбранный пользователем сервер', async () => {
        const page = await context.newPage();
        let release, started;
        const pending = new Promise(resolve=>{started=resolve;});
        await page.route('**/external_ids?**',async route => {started(); await new Promise(resolve=>{release=resolve;}); await route.fulfill({json:{imdb_id:'tt0133093'}});});
        await page.goto(`${base}/pages/watch.html?id=123&type=movie&title=Тест`);
        await pending;
        await page.locator('#source-select').selectOption('vidsrc');
        await page.waitForFunction(() => document.querySelector('#kodik-player iframe')?.src.includes('vidsrc.me'));
        release();
        await page.waitForTimeout(100);
        assert.match(await page.locator('#kodik-player iframe').getAttribute('src'),/vidsrc.me/);
        await page.close();
    });
    await test('Архив безопасно выводит старые данные и загружает следующую страницу', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {window.__movies = Array.from({length:49}, (_,i)=>({id:'m'+i,userId:'owner',title:'Тест',poster:'x" onerror="window.__xss=1',score:7,genres:i ? 'Драма':{},stats:{script:'7'},type:'series'}));});
        await page.goto(`${base}/pages/list.html`);
        await page.waitForFunction(() => document.querySelectorAll('.movie-card').length === 48);
        assert.equal(await page.locator('[onerror]').count(), 0);
        assert.equal(await page.evaluate(() => window.__xss), undefined);
        assert.deepEqual(await page.evaluate(() => window.__queries[0].constraints[0].where), ['userId','==','owner']);
        await page.getByRole('button', {name:'Загрузить ещё',exact:true}).click();
        await page.waitForFunction(() => document.querySelectorAll('.movie-card').length === 49);
        await page.locator('.movie-card').first().click();
        await page.locator('#am-watch-btn').click();
        await page.waitForURL('**/watch.html?**');
        assert.equal(new URL(page.url()).searchParams.get('type'), 'tv');
        assert.equal(new URL(page.url()).searchParams.get('id'), '123');
        await page.close();
    });
    await test('Архив показывает скелетоны и прокручивает жанры колёсиком, стрелками и клавиатурой', async () => {
        const page = await context.newPage();
        await page.setViewportSize({width:1000,height:800});
        await page.addInitScript(() => {
            window.__archiveDelay = 500;
            window.__movies = Array.from({length:49}, (_,i)=>({id:'s'+i,userId:'owner',title:'Фильм '+i,score:7,genres:'Жанр '+String(i).padStart(2,'0'),type:'movie'}));
        });
        await page.goto(`${base}/pages/list.html`);
        await page.waitForSelector('.skeleton');
        assert.equal(await page.locator('#movies-grid').getAttribute('aria-busy'), 'true');
        await page.waitForFunction(() => document.querySelectorAll('.movie-card:not(.skeleton)').length === 48);
        assert.equal(await page.locator('.skeleton').count(), 0);
        assert.equal(await page.getByText('Поиск, фильтры и статистика учитывают загруженные записи.', {exact:false}).count(), 0);
        const rail = page.locator('#genre-filters');
        await rail.scrollIntoViewIfNeeded();
        const box = await rail.boundingBox();
        await page.mouse.move(box.x+box.width/2, box.y+box.height/2);
        await page.mouse.wheel(0,250);
        await page.waitForFunction(() => document.getElementById('genre-filters').scrollLeft > 100);
        const before = await rail.evaluate(element=>element.scrollLeft);
        await page.locator('#genre-next').click();
        await page.waitForFunction(value => document.getElementById('genre-filters').scrollLeft > value, before);
        await rail.focus();
        await page.keyboard.press('Home');
        await page.waitForFunction(() => document.getElementById('genre-filters').scrollLeft === 0);
        await page.locator('#archive-load-more').click();
        await page.waitForSelector('.skeleton');
        assert.equal(await page.locator('.movie-card:not(.skeleton)').count(),48);
        assert.equal(await page.locator('#archive-load-more').isDisabled(),true);
        await page.waitForFunction(() => document.querySelectorAll('.movie-card:not(.skeleton)').length === 49);
        assert.equal(await page.locator('#archive-load-more').isVisible(),false);
        await page.close();
    });
    await test('Кнопка скрыта при ровно одной странице, а ошибку загрузки можно повторить', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {
            window.__archiveFailOnce = true;
            window.__movies = Array.from({length:48}, (_,i)=>({id:'e'+i,userId:'owner',title:'Тест',score:7,genres:'Драма'}));
        });
        await page.goto(`${base}/pages/list.html`);
        await page.getByRole('button',{name:'Повторить загрузку',exact:true}).click();
        await page.waitForFunction(() => document.querySelectorAll('.movie-card:not(.skeleton)').length === 48);
        assert.equal(await page.locator('#archive-load-more').isVisible(),false);
        assert.equal(await page.locator('.skeleton').count(),0);
        assert.equal(await page.locator('#archive-load-status').textContent(),'');
        await page.close();
    });
    await test('Каталог сохраняет последний запрос и пагинацию поиска', async () => {
        const page = await context.newPage();
        await page.goto(`${base}/pages/catalog.html`);
        await page.waitForSelector('.catalog-card');
        const started = new Promise(resolve => {slowStarted=resolve;});
        await page.locator('#catalog-search').fill('Старый');
        await started;
        await page.locator('#catalog-search').fill('Новый');
        await page.waitForFunction(() => document.querySelector('.cat-title')?.textContent === 'Новый');
        slowRelease();
        await page.locator('#load-more-btn').click();
        await page.waitForFunction(() => document.querySelectorAll('.catalog-card').length === 2);
        assert.deepEqual(await page.locator('.cat-title').allTextContents(), ['Новый','Новый']);
        await page.close();
    });
    await test('Переход из плеера выбирает точный тайтл и сохраняет без confetti', async () => {
        const page = await context.newPage();
        await page.goto(`${base}/pages/rate.html?id=123&type=tv&title=Тест`);
        await page.waitForFunction(() => !document.getElementById('movie-preview').classList.contains('hidden'));
        await page.locator('#media-type-selected').click();
        await page.locator('#media-type-options [data-value="anime"]').click();
        await page.locator('#save-btn').click();
        await page.waitForFunction(() => !!window.__saved);
        const data = await page.evaluate(() => window.__saved);
        assert.equal(data.tmdbId,123); assert.equal(data.mediaType,'tv'); assert.equal(data.type,'anime');
        assert.equal(data.score,7.2); assert.equal(data.schemaVersion,2);
        await page.close();
    });
    await test('Рулетка центрирует победителя на мобильном экране и после изменения размера', async () => {
        const page = await context.newPage();
        await page.setViewportSize({width:390,height:844});
        await page.addInitScript(() => {window.__roulette='Первый\nВторой';});
        await page.goto(`${base}/pages/roulette.html`);
        await page.waitForFunction(() => !document.getElementById('spin-btn').disabled);
        await page.locator('[data-mode="elimination"]').click();
        await page.locator('#spin-btn').click();
        await page.waitForFunction(() => !document.getElementById('result-modal').classList.contains('hidden'));
        const offset = () => page.evaluate(() => {
            const winner = [...document.querySelectorAll('.slot-item')].find(item=>item.querySelector('img')?.style.border);
            const w=winner.getBoundingClientRect(), frame=document.querySelector('.slot-window').getBoundingClientRect();
            return Math.abs(w.top+w.height/2-frame.top-frame.height/2);
        });
        assert.ok(await offset() < 1, 'Победитель должен находиться в центре окна');
        await page.setViewportSize({width:1200,height:900});
        await page.waitForTimeout(100);
        assert.ok(await offset() < 1, 'Победитель должен находиться в центре окна');
        await page.waitForFunction(() => !!window.__cloud);
        assert.equal(await page.evaluate(() => window.__cloud.data.text.split('\n').length),1);
        await page.close();
    });
    await test('Профиль редактируется, друг находится по коду, заявка отправляется и отменяется', async () => {
        const page = await context.newPage();
        await page.setViewportSize({width:390,height:844});
        await page.addInitScript(() => {window.__profiles = {friend:{displayName:'Друг <img onerror=alert(1)>',bio:'Люблю кино',photoURL:'javascript:alert(1)'}};});
        await page.goto(`${base}/pages/profile.html`);
        await page.waitForFunction(() => !document.getElementById('own-profile').hidden);
        assert.equal(await page.locator('#profile-form').isVisible(),false);
        await page.locator('#edit-profile').click();
        await page.locator('#profile-display-name').fill('Новое имя');
        await page.locator('#profile-description').fill('Люблю фантастику');
        await page.locator('#save-profile').click();
        await page.waitForFunction(() => document.getElementById('profile-name').textContent === 'Новое имя');
        if (process.env.PROFILE_PREVIEW) { await page.evaluate(() => scrollTo(0,0)); await page.screenshot({path:process.env.PROFILE_PREVIEW,fullPage:true}); await page.setViewportSize({width:1280,height:900}); await page.screenshot({path:process.env.PROFILE_PREVIEW.replace('.png','-desktop.png'),fullPage:true}); await page.setViewportSize({width:390,height:844}); }
        await page.locator('#open-friend-search').click();
        await page.locator('#friend-code').fill('friend');
        await page.locator('#find-friend').click();
        await page.getByRole('button',{name:'Добавить в друзья',exact:true}).click();
        await page.waitForFunction(() => document.querySelector('#outgoing-list .friend-row'));
        assert.equal(await page.evaluate(() => window.__friendRecords['friend:owner'].status),'pending');
        assert.equal(await page.locator('#outgoing-list img').count(),0);
        assert.equal(await page.locator('#outgoing-list [onerror]').count(),0);
        await page.getByRole('button',{name:'Закрыть поиск друзей',exact:true}).click();
        await page.locator('#requests-tab').click();
        await page.locator('#outgoing-list').getByRole('button',{name:'Отменить',exact:true}).click();
        await page.waitForFunction(() => !document.querySelector('#outgoing-list .friend-row'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.locator('#open-friend-search').click();
        await page.locator('#friend-code').fill('owner');
        await page.locator('#find-friend').click();
        await page.waitForFunction(() => document.getElementById('friend-search-result').textContent.includes('Это твой профиль'));
        await page.close();
    });
    await test('Свой профиль не показывает оценки и не запрашивает архив, в том числе по прямой ссылке', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {window.__movies=[{id:'own-rating',userId:'owner',title:'Мой фильм',score:9}];});
        for (const suffix of ['', '?user=owner']) {
            await page.goto(`${base}/pages/profile.html${suffix}`);
            await page.waitForFunction(() => !document.getElementById('own-profile').hidden);
            assert.equal(await page.locator('#profile-ratings').isVisible(),false);
            assert.equal(await page.locator('.profile-rating-card').count(),0);
            assert.equal(await page.evaluate(() => (window.__queries || []).filter(query=>query.name==='movies').length),0);
            assert.equal(await page.getByRole('link',{name:'Мой киноархив ↗',exact:true}).getAttribute('href'),'list.html');
        }
        await page.close();
    });
    await test('Друг открывает оценки с пагинацией и отзывом, удаление дружбы закрывает доступ', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {
            window.__profiles={owner:{displayName:'Я',bio:'',photoURL:''},friend:{displayName:'Друг',bio:'',photoURL:''}};
            window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};
            window.__movies=Array.from({length:26},(_,i)=>({id:'rating'+i,userId:'friend',title:'Фильм '+i,score:8.5,review:'Отзыв друга <img onerror=alert(1)>',stats:{script:'8.0'},type:'movie'}));
        });
        await page.goto(`${base}/pages/profile.html?user=friend`);
        await page.waitForFunction(() => document.querySelectorAll('.profile-rating-card').length === 24);
        const query = await page.evaluate(() => window.__queries.find(q=>q.name==='movies'));
        assert.deepEqual(query.constraints[0].where,['userId','==','friend']);
        await page.locator('.profile-rating-card').first().click();
        assert.equal(await page.locator('#rating-detail-review').textContent(),'Отзыв друга <img onerror=alert(1)>');
        assert.equal(await page.locator('#rating-detail-review img').count(),0);
        assert.equal(await page.locator('#rating-detail-dialog button').count(),1);
        await page.getByRole('button',{name:'Закрыть оценку',exact:true}).click();
        await page.locator('#profile-ratings-more').click();
        await page.waitForFunction(() => document.querySelectorAll('.profile-rating-card').length === 26);
        assert.equal(await page.locator('#profile-ratings-more').isVisible(),false);
        page.once('dialog',dialog=>dialog.accept());
        await page.locator('#friend-action').click();
        await page.waitForFunction(() => !document.querySelector('.profile-rating-card'));
        assert.equal(await page.locator('#ratings-controls').isVisible(),false);
        assert.match(await page.locator('#profile-ratings-status').textContent(),/друзьям/);
        await page.close();
    });
    await test('Посторонний видит профиль, но запрос чужих оценок не отправляется', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {window.__profiles={owner:{displayName:'Я',bio:'',photoURL:''},friend:{displayName:'Друг',bio:'',photoURL:''}};});
        await page.goto(`${base}/pages/profile.html?user=friend`);
        await page.waitForFunction(() => document.getElementById('profile-ratings-status').textContent.includes('друзьям'));
        assert.equal(await page.evaluate(() => (window.__queries || []).filter(query=>query.name==='movies').length),0);
        await page.close();
    });
    await test('Аватар и баннер загружаются, предпросматриваются и сохраняются только после подтверждения', async () => {
        const page = await context.newPage();
        await page.goto(`${base}/pages/profile.html`);
        await page.locator('#edit-profile').click();
        const png = await page.evaluate(() => {
            const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 600;
            const context = canvas.getContext('2d'); context.fillStyle='#34aabb';context.fillRect(0,0,900,600);
            return canvas.toDataURL('image/png').split(',')[1];
        });
        const file = {name:'photo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')};
        await page.locator('#profile-avatar-file').setInputFiles(file);
        await page.locator('#profile-banner-file').setInputFiles(file);
        await page.waitForFunction(() => document.querySelector('#edit-avatar-preview img')?.src.startsWith('data:image/') && document.querySelector('#edit-banner-preview img')?.src.startsWith('data:image/'));
        assert.equal(await page.locator('#profile-cover img').count(),0);
        await page.locator('#save-profile').click();
        await page.waitForFunction(() => document.querySelector('#profile-avatar img')?.src.startsWith('data:image/') && document.querySelector('#profile-cover img')?.src.startsWith('data:image/'));
        const saved = await page.evaluate(() => window.__profiles.owner);
        assert.ok(saved.photoURL.length <= 100000); assert.ok(saved.bannerURL.length <= 350000);
        await page.locator('#edit-profile').click();
        await page.locator('#remove-profile-banner').click();
        await page.getByRole('button',{name:'Закрыть редактирование',exact:true}).click();
        assert.equal(await page.locator('#profile-cover img').count(),1);
        await page.locator('#edit-profile').click();
        await page.locator('#remove-profile-banner').click();
        await page.locator('#remove-profile-avatar').click();
        await page.locator('#save-profile').click();
        await page.waitForFunction(() => !document.querySelector('#profile-avatar img') && !document.querySelector('#profile-cover img'));
        await page.close();
    });
    await test('Получатель принимает заявку, открывает профиль друга и удаляет дружбу', async () => {
        const page = await context.newPage();
        await page.addInitScript(() => {
            window.__profiles={owner:{displayName:'Получатель',bio:'',photoURL:''},friend:{displayName:'Отправитель',bio:'О себе',photoURL:''}};
            window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'pending'}};
        });
        await page.goto(`${base}/pages/profile.html`);
        await page.locator('#requests-tab').click();
        await page.locator('#incoming-list').getByRole('button',{name:'Принять',exact:true}).click();
        await page.waitForFunction(() => document.getElementById('friends-count').textContent === '1');
        assert.equal(await page.locator('#incoming-list .friend-row').count(),0);
        await page.locator('#friends-tab').click();
        await page.locator('#friends-list a').click();
        await page.waitForFunction(() => document.getElementById('profile-name').textContent === 'Отправитель');
        assert.equal(await page.locator('#own-profile').isVisible(),false);
        await page.getByRole('button',{name:'Принять заявку',exact:true}).click();
        await page.waitForFunction(() => document.getElementById('friend-action').textContent === 'Удалить из друзей');
        page.once('dialog',dialog=>dialog.accept());
        await page.locator('#friend-action').click();
        await page.waitForFunction(() => document.getElementById('friend-action').textContent === 'Добавить в друзья');
        await page.close();
    });
    await test('Максимальная оценка явно выделяется в сетке, списке и окне архива',async()=>{
        const page=await context.newPage();let poster='';if(process.env.MASTERPIECE_PREVIEW){poster=await readFile('/tmp/plus-masterpiece-poster.txt','utf8');await page.route('https://image.tmdb.org/**',route=>route.continue());}
        await page.addInitScript(poster=>{window.__movies=[{id:'perfect',userId:'owner',title:'Сталкер',score:10,poster,genres:'Фантастика',authorName:'Киноман',date:'01.11.2026'},{id:'almost',userId:'owner',title:'Почти максимум',score:9.9,genres:'Драма'}];},poster);
        await page.goto(`${base}/pages/list.html`);await page.waitForSelector('.movie-card.masterpiece');assert.equal(await page.locator('.movie-card.masterpiece').count(),1);assert.equal(await page.locator('.masterpiece-banner-title').textContent(),'Шедевр');assert.equal(await page.locator('.masterpiece-banner-caption').textContent(),'Максимальная оценка');assert.match(await page.locator('.masterpiece .card-score-pill').textContent(),/10.0.*10/);assert.equal(await page.locator('#stat-masterpieces').textContent(),'1');
        if(process.env.MASTERPIECE_PREVIEW){for(const width of [1280,390]){await page.setViewportSize({width,height:900});await page.locator('.movie-card.masterpiece').evaluate(el=>el.scrollIntoView({block:'center'}));await page.waitForTimeout(200);await page.screenshot({path:`/tmp/plus-masterpiece-${width}.png`,fullPage:false});}}
        await page.locator('#archive-view-list').click();assert.equal(await page.locator('.masterpiece-list-label').isVisible(),true);await page.locator('.movie-card.masterpiece').click();assert.equal(await page.locator('#am-distinction').isVisible(),true);await page.locator('#close-archive-modal').click();await page.locator('.movie-card:not(.masterpiece)').click();assert.equal(await page.locator('#am-distinction').isVisible(),false);await page.close();
    });
    await test('Шедевр виден в оценках друга и в подробностях',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__profiles={owner:{displayName:'Я',bio:'',photoURL:''},friend:{displayName:'Друг',bio:'',photoURL:''}};window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};window.__movies=[{id:'perfect-friend',userId:'friend',title:'Шедевр друга',tmdbId:123,mediaType:'movie',score:10}];});await page.goto(`${base}/pages/profile.html?user=friend`);await page.locator('.profile-rating-card.masterpiece').click();assert.equal(await page.locator('#rating-detail-distinction').isVisible(),true);assert.equal(await page.locator('.profile-rating-score.is-perfect').textContent(),'10.0 / 10');await page.close();
    });
    await test('Меню скрыто от клавиатуры до открытия и возвращает фокус по Escape',async()=>{
        const page=await context.newPage();await page.goto(`${base}/pages/catalog.html`);assert.equal(await page.locator('#sidebar').evaluate(el=>el.inert),true);await page.locator('#burger-btn').click();assert.equal(await page.locator('#sidebar').evaluate(el=>el.inert),false);await page.locator('#sidebar a').first().press('Shift+Tab');assert.equal(await page.locator('#sidebar-logout').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.locator('#sidebar').evaluate(el=>el.inert),true);assert.equal(await page.locator('#burger-btn').evaluate(el=>el===document.activeElement),true);await page.close();
    });
    await test('Очистка поиска возвращает выбранный раздел каталога',async()=>{
        const page=await context.newPage();await page.goto(`${base}/pages/catalog.html`);await page.locator('[data-type="tv"]').click();await page.locator('#catalog-search').fill('Новый');const request=page.waitForRequest(r=>new URL(r.url()).pathname.endsWith('/tv/popular'));await page.locator('#enable-catalog-filters').click();await request;assert.equal(await page.locator('[data-type="tv"]').evaluate(el=>el.classList.contains('active')),true);await page.close();
    });
    await test('Сортировка архива и выбор результата оценки работают с клавиатуры',async()=>{
        const page=await context.newPage();await page.goto(`${base}/pages/list.html`);await page.locator('#dropdown-selected').press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#dropdown-selected').getAttribute('aria-expanded'),'false');assert.equal(await page.locator('#dropdown-options .active').getAttribute('data-value'),'high');await page.goto(`${base}/pages/rate.html`);await page.locator('#movie-title').fill('Матрица');await page.waitForSelector('.suggestion-item');await page.locator('#movie-title').press('ArrowDown');await page.keyboard.press('Enter');assert.equal(await page.locator('#movie-preview').isVisible(),true);await page.close();
    });
    await test('Атмосферная тема сохраняет компоновку и отключает движение по системной настройке',async()=>{
        const page=await context.newPage();await page.setViewportSize({width:1280,height:900});await page.emulateMedia({reducedMotion:'no-preference'});await page.goto(`${base}/index.html`);await page.waitForFunction(()=>!document.getElementById('app-menu').hidden);
        assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::after').animationName),'forest-breath');assert.match(await page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage),/misty-pines.webp/);assert.equal(await page.locator('.home-shortcuts > a').count(),4);
        if(process.env.STYLE_PREVIEW){await page.screenshot({path:'/tmp/plus-atmosphere-desktop.png'});await page.setViewportSize({width:390,height:900});await page.waitForTimeout(150);await page.screenshot({path:'/tmp/plus-atmosphere-mobile.png',fullPage:true});}
        await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.evaluate(()=>getComputedStyle(document.body,'::after').animationName),'none');await page.goto(`${base}/pages/catalog.html`);await page.waitForSelector('.catalog-card');await page.locator('.catalog-card').first().hover();assert.equal(await page.locator('.catalog-card').first().evaluate(el=>getComputedStyle(el).transform),'none');await page.close();
    });
    await test('Главная не показывает форму входа во время проверки сохранённой сессии',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__authDelay=1000;window.__sawLogin=false;new MutationObserver(()=>{const login=document.getElementById('login-section');if(login&&!login.hidden&&login.getClientRects().length)window.__sawLogin=true;}).observe(document,{subtree:true,childList:true,attributes:true});});await page.goto(`${base}/index.html`);assert.equal(await page.locator('#login-section').isVisible(),false);assert.equal(await page.locator('#auth-loading').isVisible(),true);await page.waitForFunction(()=>!document.getElementById('app-menu').hidden);assert.equal(await page.evaluate(()=>window.__sawLogin),false);assert.equal(await page.locator('#auth-loading').isVisible(),false);await page.close();
    });
    await test('Форма входа появляется после подтверждения отсутствия сессии и помещается на телефоне',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__signedOut=true;window.__authDelay=700;});await page.goto(`${base}/index.html`);assert.equal(await page.locator('#login-section').isVisible(),false);await page.waitForFunction(()=>!document.getElementById('login-section').hidden);assert.equal(await page.locator('#app-menu').isVisible(),false);for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.waitForTimeout(120);if(process.env.CINEMA_PREVIEW)await page.screenshot({path:`/tmp/plus-login-${width}.png`,fullPage:true});}await page.close();
    });
    await test('Окно архива разделяет парные баллы и возвращает фокус после закрытия',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__movies=[{id:'duo',userId:'owner',tmdbId:123,mediaType:'movie',title:'Левит',genres:'Ужасы, мелодрама',poster:'',score:7.1,date:'31.10.2026',isDuo:true,review:'Разные впечатления — одно обсуждение.',stats:{script:'6.0/6.0',actors:'6.0/5.9',directing:'5.1/6.5',chars:'6.0/5.0',idea:'10.0/10.0',atmosphere:'5.0/4.2',impression:'5.0/5.0'}}];});await page.goto(`${base}/pages/list.html`);await page.locator('.movie-card').first().focus();await page.locator('.movie-card').first().press('Enter');assert.equal(await page.locator('#am-script .archive-stat-value').count(),2);assert.equal(await page.locator('#am-duo-legend').isVisible(),true);assert.equal(await page.locator('#am-review').textContent(),'Разные впечатления — одно обсуждение.');for(const width of [1280,390]){await page.setViewportSize({width,height:900});assert.ok(await page.locator('.archive-detail-box').evaluate(e=>e.scrollWidth<=e.clientWidth+1));const inside=await page.locator('#close-archive-modal').evaluate(el=>{const button=el.getBoundingClientRect(),box=el.closest('.modal-box').getBoundingClientRect();return button.left>=box.left&&button.right<=box.right;});assert.equal(inside,true);await page.waitForTimeout(120);if(process.env.CINEMA_PREVIEW)await page.screenshot({path:`/tmp/plus-archive-detail-${width}.png`});}await page.keyboard.press('Escape');assert.equal(await page.locator('#archive-modal').isVisible(),false);assert.equal(await page.locator('.movie-card').first().evaluate(e=>e===document.activeElement),true);await page.close();
    });
    await test('Главная открывает точную оценку из поиска на первом экране', async () => {
        const page=await context.newPage();await page.goto(`${base}/index.html`);
        await page.waitForFunction(()=>!document.getElementById('app-menu').hidden);
        await page.locator('#home-movie-search').fill('Матрица');
        await page.waitForSelector('#home-suggestions a');
        const above=await page.locator('#home-rate-form').evaluate(element=>element.getBoundingClientRect().bottom<innerHeight);
        assert.equal(above,true);await page.locator('#home-suggestions a').first().click();await page.waitForURL('**/rate.html?**');
        assert.equal(new URL(page.url()).searchParams.get('id'),'123');await page.close();
    });
    await test('Внешние рейтинги отсутствуют на постерах, в фильтрах и карточке фильма',async()=>{
        const page=await context.newPage();await page.goto(`${base}/pages/catalog.html`);await page.waitForSelector('.catalog-card');
        assert.equal(await page.locator('.cat-score,[name="ratingMin"],[name="ratingMax"],[name="votes"],select[name="sort"] option[value^="vote_"]').count(),0);
        assert.equal(await page.locator('.cat-plan-toggle').first().isVisible(),true);await page.locator('.cat-details-trigger').first().click();await page.waitForFunction(()=>!document.getElementById('detail-watch-btn').disabled);assert.equal(await page.locator('#detail-rating').count(),0);assert.equal(await page.locator('#detail-own-rating').isVisible(),true);await page.close();
    });
    await test('Фильтры каталога и следующая страница используют один и тот же подбор', async () => {
        const page=await context.newPage();await page.goto(`${base}/pages/catalog.html`);await page.waitForSelector('.catalog-card');
        await page.locator('[data-type="movie"]').click();
        await page.locator('#filter-genre').selectOption('18');await page.locator('[name="yearFrom"]').fill('2000');
        await page.locator('.filter-more').evaluate(element=>element.open=true);
        await page.locator('[name="runtimeMax"]').fill('120');await page.locator('[name="country"]').selectOption('FR');
        const first=page.waitForRequest(request=>request.url().includes('/discover/movie'));
        await page.locator('#catalog-filter-form button[type="submit"]').click();
        const request=await first;const url=new URL(request.url());assert.equal(url.searchParams.get('with_genres'),'18');assert.equal(url.searchParams.get('with_runtime.lte'),'120');assert.equal(url.searchParams.get('with_origin_country'),'FR');
        await page.waitForFunction(()=>!document.getElementById('load-more-btn').disabled);
        const next=page.waitForRequest(request=>request.url().includes('/discover/movie')&&new URL(request.url()).searchParams.get('page')==='2');
        await page.locator('#load-more-btn').click();assert.equal(new URL((await next).url()).searchParams.get('with_genres'),'18');
        await page.locator('#catalog-search').fill('Новый');assert.equal(await page.locator('#catalog-filter-fields').evaluate(element=>element.disabled),true);
        await page.locator('#enable-catalog-filters').click();assert.equal(await page.locator('#catalog-filter-fields').evaluate(element=>element.disabled),false);await page.close();
    });
    await test('Оценка по критериям сохраняет точный ввод и восстанавливает черновик', async () => {
        const page=await context.newPage();await page.goto(`${base}/pages/rate.html?id=123&type=movie&title=Тест`);
        await page.waitForFunction(()=>!document.getElementById('movie-preview').classList.contains('hidden'));
        assert.equal(await page.locator('#rating-mode-quick').count(),0);
        await page.locator('#val-script-1').fill('9.5');await page.locator('#val-script-1').press('Tab');
        await page.locator('#review-text').fill('Мой черновик');
        await page.waitForFunction(()=>JSON.parse(localStorage.getItem('ratingDraft:owner')||'null')?.review==='Мой черновик');
        await page.reload();await page.getByRole('button',{name:'Восстановить',exact:true}).click();
        assert.equal(await page.locator('#val-script-1').inputValue(),'9.5');assert.equal(await page.locator('#review-text').inputValue(),'Мой черновик');
        assert.equal(await page.locator('#script-1').inputValue(),'9.5');
        await page.locator('#save-btn').click();await page.waitForFunction(()=>!!window.__saved);
        const saved=await page.evaluate(()=>window.__saved);assert.equal(saved.ratingMode,'detailed');assert.equal(saved.stats.script,'9.5');assert.equal(saved.review,'Мой черновик');
        assert.equal(await page.evaluate(()=>localStorage.getItem('ratingDraft:owner')),null);await page.close();
    });
    await test('Рулетка убирает дубли, импортирует список, исключает историю и возвращает выбывший фильм', async () => {
        const page=await context.newPage();await page.addInitScript(()=>{window.__roulette='Первый\nПервый\nВторой';localStorage.setItem('rouletteHistory:owner',JSON.stringify(['Более поздний выбор']));localStorage.setItem('rouletteSeen:owner',JSON.stringify(['Первый']));Math.random=()=>0;});
        await page.goto(`${base}/pages/roulette.html`);await page.waitForFunction(()=>!document.getElementById('spin-btn').disabled);
        await page.locator('#roulette-dedupe').click();assert.equal(await page.locator('#movie-list').inputValue(),'Первый\nВторой');
        await page.locator('#roulette-import').setInputFiles({name:'movies.txt',mimeType:'text/plain',buffer:Buffer.from('Второй\nТретий')});
        await page.waitForFunction(()=>document.getElementById('roulette-count').textContent==='3');
        await page.locator('[data-mode="no-repeat"]').click();await page.locator('#spin-btn').click();await page.waitForFunction(()=>!document.getElementById('result-modal').classList.contains('hidden'));
        assert.equal(await page.locator('#winner-name').textContent(),'Второй');await page.locator('#close-modal').click();
        await page.locator('[data-mode="elimination"]').click();await page.locator('#spin-btn').click();await page.waitForFunction(()=>!document.getElementById('result-modal').classList.contains('hidden'));
        assert.equal(await page.locator('#movie-list').inputValue(),'Второй\nТретий');await page.locator('#close-modal').click();await page.locator('#roulette-undo').click();
        assert.match(await page.locator('#movie-list').inputValue(),/Первый/);
        const downloading=page.waitForEvent('download');await page.locator('#roulette-export').click();const download=await downloading;assert.equal(download.suggestedFilename(),'plus-plus-movies.txt');
        assert.match(await readFile(await download.path(),'utf8'),/Третий/);await page.close();
    });
    await test('Планы добавляются из каталога, отмечают карточку и фильтруются на отдельной странице', async () => {
        const page=await context.newPage();await page.goto(`${base}/pages/catalog.html`);await page.locator('.cat-plan-toggle').first().click();await page.waitForFunction(()=>!!Object.keys(window.__plans||{}).length);assert.equal(await page.locator('#detail-modal').isVisible(),false);await page.locator('.cat-plan-toggle').first().click();await page.waitForFunction(()=>!Object.keys(window.__plans||{}).length);await page.locator('.catalog-card').first().click();
        await page.waitForFunction(()=>!document.getElementById('detail-plan-btn').disabled);
        await page.locator('#detail-plan-btn').click();await page.waitForFunction(()=>document.getElementById('detail-plan-btn').textContent.includes('В планах'));
        assert.equal(await page.locator('.library-badge').first().textContent(),'♡ В планах');
        const plans=await page.evaluate(()=>window.__plans);assert.equal(Object.values(plans)[0].tmdbId,123);
        await page.addInitScript(plans=>window.__plans=plans,plans);await page.goto(`${base}/pages/plans.html`);await page.waitForFunction(()=>document.querySelectorAll('.plan-card').length===1);
        if(process.env.CINEMA_PREVIEW){await page.screenshot({path:'/tmp/plus-plans-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/plus-plans-mobile.png',fullPage:true});await page.setViewportSize({width:1280,height:900});}
        await page.locator('#plans-type').selectOption('tv');assert.equal(await page.locator('.plan-card').count(),0);
        await page.locator('#plans-type').selectOption('movie');assert.equal(await page.locator('.plan-card').count(),1);
        await page.getByRole('button',{name:'Убрать',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.plan-card').length===0);await page.close();
    });
    await test('Все планы добавляются в рулетку одной кнопкой без потери списка и повторов',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{localStorage.removeItem('roulettePending:owner');localStorage.removeItem('rouletteList:owner');window.__roulette='Сталкер\nМатрица';window.__plans={'owner:movie:1':{userId:'owner',tmdbId:1,mediaType:'movie',title:'Сталкер',genres:'Драма'},'owner:movie:2':{userId:'owner',tmdbId:2,mediaType:'movie',title:'  матрица  ',genres:'Фантастика'},'owner:movie:3':{userId:'owner',tmdbId:3,mediaType:'movie',title:'Тоторо',genres:'Мультфильм'}};});await page.goto(`${base}/pages/plans.html`);await page.waitForFunction(()=>!document.getElementById('plans-to-roulette').disabled);await page.locator('#plans-to-roulette').click();await page.waitForFunction(()=>document.getElementById('plans-transfer-status').textContent.includes('Добавлено: 1'));assert.equal(await page.evaluate(()=>window.__roulette),'Сталкер\nМатрица\nТоторо');await page.locator('#plans-to-roulette').click();await page.waitForFunction(()=>document.getElementById('plans-transfer-status').textContent.includes('Все фильмы уже'));assert.equal(await page.locator('.plan-card').count(),3);assert.equal(await page.locator('#plans-open-roulette').isVisible(),true);await page.close();
    });
    await test('Выбор друга отправляет совместную оценку, подтверждение создаёт вторую копию',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__profiles={owner:{displayName:'Первый',bio:'',photoURL:''},friend:{displayName:'Второй',bio:'',photoURL:''}};window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};window.__movies=[];});await page.goto(`${base}/pages/rate.html?id=123&type=movie`);await page.waitForFunction(()=>!document.getElementById('movie-preview').classList.contains('hidden'));await page.locator('#is-duo-checkbox').check();await page.waitForSelector('#joint-friend-select option[value="friend"]',{state:'attached'});await page.locator('#joint-friend-select').selectOption('friend');await page.locator('#val-script-1').fill('9');await page.locator('#val-script-1').press('Tab');await page.locator('#val-script-2').fill('5');await page.locator('#val-script-2').press('Tab');await page.locator('#review-text').fill('Наш общий отзыв');if(process.env.JOINT_PREVIEW)await page.locator('.rating-editor').screenshot({path:'/tmp/plus-joint-editor.png'});await page.locator('#save-btn').click();await page.waitForFunction(()=>Object.keys(window.__jointRecords||{}).length===1);const state=await page.evaluate(()=>({joint:window.__jointRecords,movies:window.__movies}));assert.equal(state.movies.length,1);assert.equal(state.movies[0].jointPartnerId,'friend');assert.equal(Object.values(state.joint)[0].status,'pending');await page.close();
        const recipient=await context.newPage();await recipient.addInitScript(state=>{window.__viewer='friend';window.__profiles={owner:{displayName:'Первый',bio:'',photoURL:''},friend:{displayName:'Второй',bio:'',photoURL:''}};window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};window.__jointRecords=state.joint;window.__movies=state.movies;},state);await recipient.goto(`${base}/pages/profile.html`);if(process.env.JOINT_PREVIEW){await recipient.locator('#joint-inbox-list .joint-invite').waitFor();await recipient.locator('#joint-inbox').screenshot({path:'/tmp/plus-joint-invitation.png'});}await recipient.getByRole('button',{name:'Подтвердить',exact:true}).click();await recipient.waitForFunction(()=>Object.values(window.__jointRecords)[0].status==='accepted');const records=await recipient.evaluate(()=>window.__movies);assert.equal(records.length,2);const copy=records.find(m=>m.userId==='friend');assert.equal(copy.review,'Наш общий отзыв');assert.deepEqual(copy.stats,state.movies[0].stats);assert.equal(copy.score,state.movies[0].score);assert.equal(copy.jointPartnerId,'owner');assert.equal(copy.jointFirstId,'owner');assert.equal(await recipient.getByRole('button',{name:'Подтвердить',exact:true}).count(),0);await recipient.close();
        const edit=await context.newPage();await edit.addInitScript(records=>{window.__viewer='friend';window.__profiles={friend:{displayName:'Второй',bio:'',photoURL:''},owner:{displayName:'Первый',bio:'',photoURL:''}};window.__movies=records;},records);await edit.goto(`${base}/pages/rate.html?edit=${encodeURIComponent(copy.id)}`);await edit.waitForFunction(()=>document.querySelector('.rate-page-heading h1').textContent==='Изменить оценку');assert.equal(await edit.locator('#val-script-1').inputValue(),'5.0');assert.equal(await edit.locator('#val-script-2').inputValue(),'9.0');assert.equal(await edit.locator('#joint-friend-select').isDisabled(),true);await edit.locator('#save-btn').click();await edit.waitForFunction(()=>!!window.__updated);assert.equal(await edit.evaluate(()=>window.__updated.data.stats.script),'5.0/9.0');assert.equal(await edit.evaluate(()=>Object.keys(window.__jointRecords||{}).length),0);await edit.close();
    });
    await test('Удалённый друг и ошибка транзакции не оставляют половину совместной оценки',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__profiles={owner:{displayName:'Я'},friend:{displayName:'Друг'}};window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};window.__movies=[];});await page.goto(`${base}/pages/rate.html?id=123&type=movie`);await page.waitForFunction(()=>!document.getElementById('movie-preview').classList.contains('hidden'));await page.locator('#is-duo-checkbox').check();await page.waitForSelector('#joint-friend-select option[value="friend"]',{state:'attached'});await page.locator('#joint-friend-select').selectOption('friend');await page.evaluate(()=>{window.__transactionFailOnce=true;});await page.locator('#save-btn').click();await page.waitForFunction(()=>!document.getElementById('save-btn').disabled);assert.equal(await page.evaluate(()=>window.__movies.length),0);assert.equal(await page.evaluate(()=>Object.keys(window.__jointRecords||{}).length),0);await page.evaluate(()=>{window.__friendRecords={};});await page.locator('#save-btn').click();await page.waitForFunction(()=>!document.getElementById('save-btn').disabled);assert.equal(await page.evaluate(()=>window.__movies.length),0);await page.close();
    });
    await test('Сохранённая оценка редактируется без новой записи и без смены даты', async () => {
        const page=await context.newPage();await page.addInitScript(()=>{window.__movies=[{id:'existing',userId:'owner',tmdbId:123,mediaType:'movie',type:'movie',title:'Тест',score:7.2,poster:'',genres:'Драма',timestamp:{seconds:100},date:'01.01.2026',review:'Раньше',isDuo:false,stats:{script:'7.0',actors:'7.0',directing:'7.0',chars:'7.0',idea:'7.0',atmosphere:'4.0',impression:'4.0'}}];});
        await page.goto(`${base}/pages/rate.html?edit=existing`);await page.waitForFunction(()=>document.querySelector('.rate-page-heading h1').textContent==='Изменить оценку');
        await page.locator('#val-script-1').fill('9.5');await page.locator('#val-script-1').press('Tab');await page.locator('#review-text').fill('Новое мнение');await page.locator('#save-btn').click();await page.waitForFunction(()=>!!window.__updated);
        const state=await page.evaluate(()=>({updated:window.__updated,saved:window.__saved}));assert.equal(state.saved,undefined);assert.equal(state.updated.ref.id,'existing');assert.equal(state.updated.data.stats.script,'9.5');assert.equal(state.updated.data.date,'01.01.2026');assert.equal(state.updated.data.timestamp.seconds,100);assert.equal(state.updated.data.review,'Новое мнение');await page.close();
    });
    await test('Повторная оценка предлагает обновление, чужая запись не редактируется', async () => {
        const page=await context.newPage();await page.addInitScript(()=>{window.__movies=[{id:'old',userId:'owner',tmdbId:123,mediaType:'movie',title:'Тест',timestamp:{seconds:10},date:'Раньше'},{id:'other',userId:'friend',tmdbId:123,mediaType:'movie',title:'Чужое'}];});
        page.on('dialog',dialog=>dialog.accept());await page.goto(`${base}/pages/rate.html?id=123&type=movie`);await page.waitForFunction(()=>!document.getElementById('movie-preview').classList.contains('hidden'));await page.locator('#save-btn').click();await page.waitForFunction(()=>!!window.__updated);assert.equal(await page.evaluate(()=>window.__updated.ref.id),'old');assert.equal(await page.evaluate(()=>window.__saved),undefined);
        await page.goto(`${base}/pages/rate.html?edit=other`);await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('Не удалось открыть'));assert.equal(await page.locator('#movie-preview').isVisible(),false);await page.close();
    });
    await test('Сравнение друга сопоставляет точные тайтлы, считает разницу и закрывается после удаления дружбы', async () => {
        const page=await context.newPage();await page.addInitScript(()=>{window.__profiles={owner:{displayName:'Я',bio:'',photoURL:''},friend:{displayName:'Друг',bio:'',photoURL:''}};window.__friendRecords={'friend:owner':{members:['friend','owner'],senderId:'friend',status:'accepted'}};window.__movies=[{id:'mine',userId:'owner',tmdbId:123,mediaType:'movie',title:'Общий фильм',score:9,timestamp:{seconds:20}},{id:'friend-rating',userId:'friend',tmdbId:123,mediaType:'movie',title:'Общий фильм',score:7,timestamp:{seconds:20}},{id:'same-name',userId:'friend',tmdbId:999,mediaType:'movie',title:'Общий фильм',score:1}];});
        await page.goto(`${base}/pages/profile.html?user=friend`);await page.locator('#compare-friend').click();await page.waitForFunction(()=>document.querySelectorAll('.comparison-row').length===1);assert.match(await page.locator('#compare-metrics').textContent(),/1 общих тайтлов.*2.0/);assert.match(await page.locator('.comparison-scores').textContent(),/Ты 9.0.*Друг 7.0/);
        if(process.env.CINEMA_PREVIEW){await page.screenshot({path:'/tmp/plus-comparison-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/plus-comparison-mobile.png'});await page.setViewportSize({width:1280,height:900});}
        await page.locator('#compare-close').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#friend-action').click();await page.waitForFunction(()=>document.getElementById('compare-friend').hidden);await page.close();
    });
    await test('Рулетка не содержит удалённого подбора, а одиночный список можно прокрутить',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__roulette='Единственный фильм';localStorage.removeItem('roulettePending:owner');localStorage.removeItem('rouletteList:owner');});await page.goto(`${base}/pages/roulette.html`);await page.waitForFunction(()=>!document.getElementById('spin-btn').disabled);
        assert.equal(await page.locator('#roulette-pool-source,#roulette-friends,#roulette-prepare').count(),0);assert.equal(await page.evaluate(()=>(window.__queries||[]).filter(q=>['plans','friendships'].includes(q.name)).length),0);await page.locator('#spin-btn').click();await page.waitForFunction(()=>!document.getElementById('result-modal').classList.contains('hidden'));assert.equal(await page.locator('#winner-name').textContent(),'Единственный фильм');await page.keyboard.press('Escape');assert.equal(await page.locator('#result-modal').isVisible(),false);await page.close();
    });
    await test('Компактный архив показывает отзыв, открывает редактирование и сохраняет выбранный вид',async()=>{
        const page=await context.newPage();await page.addInitScript(()=>{window.__movies=[{id:'my-rating',userId:'owner',tmdbId:123,mediaType:'movie',type:'movie',title:'Тест',genres:'Драма',score:8.5,poster:'',review:'Этот отзыв виден в списке',date:'01.11.2026'}];});await page.goto(`${base}/pages/list.html`);await page.locator('#archive-view-list').click();assert.equal(await page.locator('#movies-grid').evaluate(e=>e.classList.contains('archive-list')),true);assert.equal(await page.locator('.archive-list-review').isVisible(),true);await page.locator('.movie-card').press('Enter');assert.equal(await page.locator('#am-edit-btn').getAttribute('href'),'rate.html?edit=my-rating');await page.locator('#close-archive-modal').click();await page.reload();await page.waitForFunction(()=>document.getElementById('movies-grid').classList.contains('archive-list'));await page.close();
    });
    await test('Продолжение просмотра восстанавливает источник и серию, главная показывает сохранённый тайтл', async () => {
        const page=await context.newPage();await page.goto(`${base}/pages/watch.html?id=123&type=tv&title=Тест`);await page.locator('#episode-select').selectOption('2');await page.locator('#source-select').selectOption('vidlink');await page.waitForFunction(()=>JSON.parse(localStorage.getItem('watchHistory:owner'))?.[0]?.episode===2);await page.goto(`${base}/index.html`);await page.locator('#continue-list a').first().click();await page.waitForFunction(()=>document.querySelector('#kodik-player iframe')?.src.includes('/tv/123/1/2'));assert.equal(await page.locator('#source-select').inputValue(),'vidlink');await page.close();
    });
    await test('Аниме-источник находит точный релиз и передаёт настоящие эпизоды и качество', async () => {
        const page=await context.newPage();await page.route('https://aniliberty.top/api/v1/**',route=>{const url=new URL(route.request().url());return route.fulfill({json:url.pathname.includes('/search/')?[{id:413,name:{main:'Наруто'},year:2007,type:{description:'ТВ'}}]:{id:413,name:{main:'Наруто'},episodes:[{ordinal:1,hls_720:'https://cache.libria.fun/first.m3u8',hls_480:'https://cache.libria.fun/first-low.m3u8',duration:1000},{ordinal:2,hls_720:'https://cache.libria.fun/second.m3u8',duration:1000}]}});});
        await page.goto(`${base}/pages/watch.html?id=123&type=tv&title=Наруто`);await page.locator('#source-select').selectOption('aniliberty');await page.locator('#anime-search-form button').click();await page.locator('.anime-result').first().click();await page.waitForFunction(()=>!!document.querySelector('#kodik-player video'));assert.equal(await page.locator('#anime-episode option').count(),2);
        await page.locator('video').evaluate(video=>{Object.defineProperty(video,'currentTime',{value:230,writable:true,configurable:true});video.dispatchEvent(new Event('seeked'));});
        assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('watchHistory:owner'))[0].position),230);
        await page.goto(`${base}/pages/watch.html?id=123&type=tv&title=Наруто&resume=1`);await page.locator('video').waitFor();await page.locator('video').evaluate(video=>{Object.defineProperty(video,'duration',{value:1000,configurable:true});Object.defineProperty(video,'currentTime',{value:0,writable:true,configurable:true});video.dispatchEvent(new Event('loadedmetadata'));});assert.equal(await page.locator('video').evaluate(video=>video.currentTime),230);
        await page.locator('#anime-episode').selectOption('2');assert.equal(await page.locator('#anime-quality option').count(),1);assert.equal(await page.locator('#season-group').isVisible(),false);await page.locator('#source-select').selectOption('collaps');await page.waitForFunction(()=>!!document.querySelector('#kodik-player iframe'));assert.equal(await page.locator('#anime-panel').isVisible(),false);await page.close();
    });
    await test('Информация о фильме помещается на экране и все действия доступны', async () => {
        const page = await context.newPage();
        if (process.env.CINEMA_PREVIEW) {
            const movies = JSON.parse(await readFile(process.env.CINEMA_PREVIEW,'utf8'));
            await page.route('https://api.themoviedb.org/**',route => {
                const url = new URL(route.request().url());
                if (url.pathname.includes('trending/')) return route.fulfill({json:movies});
                const movie = movies.results.find(item=>String(item.id)===url.pathname.split('/').at(-1)) || movies.results[0];
                return route.fulfill({json:{...movie,runtime:120,number_of_seasons:3,genres:[{name:'Драма'},{name:'Приключения'}]}});
            });
            await page.route('https://image.tmdb.org/**',route=>route.continue());
        }
        for (const width of [1280,768,390]) {
            await page.setViewportSize({width,height:900});
            await page.goto(`${base}/pages/catalog.html`);
            await page.waitForSelector('.catalog-card');
            if (process.env.CINEMA_PREVIEW) {
                await page.waitForTimeout(1200);
                await page.screenshot({path:`/tmp/plus-cinema-catalog-${width}.png`,fullPage:false});
            }
            await page.locator('.catalog-card').first().click();
            await page.waitForFunction(()=>!document.getElementById('detail-watch-btn').disabled);
            const overflow = await page.locator('.detail-content').evaluate(element=>element.scrollWidth-element.clientWidth);
            assert.ok(overflow<=1,`Окно фильма не должно прокручиваться по горизонтали: ${width}, ${overflow}`);
            for (const id of ['detail-watch-btn','detail-play-btn','detail-add-btn']) {
                await page.locator('#'+id).scrollIntoViewIfNeeded();
                const inside = await page.locator('#'+id).evaluate(button=>{
                    const rect=button.getBoundingClientRect(),frame=document.querySelector('.detail-box').getBoundingClientRect();
                    return rect.left>=frame.left && rect.right<=frame.right && rect.width>40;
                });
                assert.equal(inside,true,`Кнопка ${id} должна помещаться при ширине ${width}`);
            }
            if (process.env.CINEMA_PREVIEW) await page.screenshot({path:`/tmp/plus-cinema-detail-${width}.png`});
            await page.keyboard.press('Escape');
            await page.waitForFunction(()=>document.getElementById('detail-modal').classList.contains('hidden'));
            assert.equal(await page.evaluate(()=>document.body.classList.contains('has-catalog-modal')),false);
        }
        await page.close();
    });
    await test('Общий стиль не создаёт горизонтальную прокрутку, видео расположено перед настройками', async () => {
        const page = await context.newPage();
        for (const width of [1280,390]) {
            await page.setViewportSize({width,height:900});
            for (const path of ['/index.html','/pages/list.html','/pages/plans.html','/pages/rate.html','/pages/roulette.html','/pages/profile.html','/pages/watch.html?id=123&type=movie&title=Тест']) {
                await page.goto(base+path);
                await page.waitForTimeout(100);
                assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Страница ${path} должна помещаться при ширине ${width}`);
                if (path.includes('watch.html')) {
                    const order = await page.evaluate(()=>!!(document.querySelector('.player-wrapper').compareDocumentPosition(document.getElementById('player-controls-panel')) & Node.DOCUMENT_POSITION_FOLLOWING));
                    assert.equal(order,true);
                }
                if (process.env.CINEMA_PREVIEW) await page.screenshot({path:`/tmp/plus-cinema-${path.split('/').at(-1).split('.')[0]}-${width}.png`,fullPage:false});
            }
        }
        await page.close();
    });
    assert.deepEqual(errors, [], `Ошибки браузера: ${errors.join('; ')}`);
} finally { await context.close(); await browser.close(); server.close(); }
