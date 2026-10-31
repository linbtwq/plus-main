import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const firebase = `
export const auth = { currentUser: { uid: 'owner', displayName: 'Тест', photoURL: null } }, db = {}, provider = {};
export const onAuthStateChanged = (auth, callback) => setTimeout(() => callback(auth.currentUser), 0);
export const signOut = async () => {}, signInWithPopup = async () => {};
export const collection = (db, name) => ({name}), doc = (db, name, id) => ({name,id});
export const where = (...args) => ({where:args}), orderBy = (...args) => ({orderBy:args}), limit = n => ({limit:n}), startAfter = d => ({cursor:d.id});
export const query = (ref, ...constraints) => ({...ref, constraints});
export const getDocs = async q => {
 window.__queries = [...(window.__queries || []), q];
 await new Promise(resolve => setTimeout(resolve, window.__archiveDelay || 0));
 if (window.__archiveFailOnce) {window.__archiveFailOnce=false; throw new Error('Проверка повторной загрузки');}
 const cursor = q.constraints.find(c => c.cursor)?.cursor;
 let data = window.__movies || [];
 if(cursor) data = data.slice(data.findIndex(d => d.id === cursor)+1);
 data = data.slice(0, q.constraints.find(c => c.limit)?.limit || 48);
 const docs = data.map(d => ({id:d.id, data:()=>d}));
 return {docs, size:docs.length, forEach:fn=>docs.forEach(fn)};
};
export const getDoc = async ref => ({exists:()=>true, data:()=>({text: window.__roulette || ''})});
export const setDoc = async (ref,data) => {window.__cloud = {ref,data};};
export const addDoc = async (ref,data) => {window.__saved = data; return {id:'saved'};};
export const deleteDoc = async ref => {window.__deleted=ref;};
export const updateDoc = async () => {throw new Error('Чтение не должно менять базу');};
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
        if (url.pathname.endsWith('/videos')) body = {results:[{type:'Trailer',site:'YouTube',key:'abcdefghijk'}]};
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
    assert.deepEqual(errors, [], `Ошибки браузера: ${errors.join('; ')}`);
} finally { await context.close(); await browser.close(); server.close(); }
