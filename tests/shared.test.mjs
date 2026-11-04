import test from 'node:test';
import assert from 'node:assert/strict';
import { posterUrl, NO_POSTER, escapeHtml, validId, watchUrl, resolveMedia, fetchJson, readRoulette, writeRoulette } from '../assets/js/shared.js';

test('Отклоняет опасные адреса изображений и идентификаторы', () => {
    for (const value of ['javascript:alert(1)', 'https://evil.test/a.jpg', 'https://image.tmdb.org.evil.test/a', 'x" onerror="alert(1)', null]) assert.equal(posterUrl(value), NO_POSTER);
    assert.equal(posterUrl('https://image.tmdb.org/t/p/w500/test.jpg'), 'https://image.tmdb.org/t/p/w500/test.jpg');
    for (const value of ['', '0', '-1', '1" onload="alert(1)', '1&x=2', null]) assert.equal(validId(value), false);
    assert.equal(validId(123), true);
    assert.equal(escapeHtml('<img src="x" onerror=\'a\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;a&#39;&gt;&amp;');
    assert.throws(() => watchUrl('bad', 'movie', 'Test'));
    assert.throws(() => watchUrl(1, 'person', 'Test'));
    const url = new URL(watchUrl(123, 'tv', 'Тест & #1', 'tt123'), 'http://localhost/');
    assert.equal(url.searchParams.get('title'), 'Тест & #1');
    assert.equal(url.searchParams.get('id'), '123');
});

test('Старые сериалы ищутся среди сериалов без перезаписи оценки', async () => {
    const original = globalThis.fetch;
    const movie = { title: 'Тест', type: 'series', score: 7.2 };
    try {
        globalThis.fetch = async url => {
            assert.match(url, /search\/tv\?/);
            return { ok: true, json: async () => ({ results: [{ id: 99, name: 'Тест' }] }) };
        };
        assert.deepEqual(await resolveMedia(movie), { id: 99, mediaType: 'tv' });
        assert.equal(movie.score, 7.2);
        globalThis.fetch = async () => ({ ok: false, status: 429 });
        await assert.rejects(fetchJson('https://example.test'), /429/);
    } finally { globalThis.fetch = original; }
});

test('Списки разных аккаунтов изолированы', () => {
    const data = new Map([['rouletteList', 'Старый общий список']]);
    globalThis.localStorage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
    try {
        assert.equal(readRoulette('a'), '');
        writeRoulette('a', 'Фильм A'); writeRoulette('b', 'Фильм B');
        assert.equal(readRoulette('a'), 'Фильм A'); assert.equal(readRoulette('b'), 'Фильм B');
        assert.equal(data.get('rouletteList'), 'Старый общий список');
        assert.throws(() => writeRoulette(null, 'Test'));
    } finally { delete globalThis.localStorage; }
});

test('Старые записи не открывают случайный результат поиска или одноимённый ремейк', async () => {
    const original=globalThis.fetch;
    try {
        globalThis.fetch=async url=>{
            assert.equal(new URL(url).searchParams.get('query'),'майкл');
            return {ok:true,json:async()=>({results:[{id:1,title:'Майкл',poster_path:'/old.jpg',release_date:'1996-01-01'},{id:2,title:'Майкл',poster_path:'/new.jpg',release_date:'2026-01-01'}]})};
        };
        assert.deepEqual(await resolveMedia({title:'Майкл 💕',poster:'https://image.tmdb.org/t/p/w500/new.jpg'}),{id:2,mediaType:'movie'});
        await assert.rejects(resolveMedia({title:'Майкл'}),/однозначно/);
        assert.deepEqual(await resolveMedia({title:'Майкл',year:1996}),{id:1,mediaType:'movie'});
        globalThis.fetch=async()=>({ok:true,json:async()=>({results:[{id:3,title:'Совсем другое'}]})});
        await assert.rejects(resolveMedia({title:'Майкл'}),/однозначно/);
    } finally { globalThis.fetch=original; }
});
