import test from 'node:test';
import assert from 'node:assert/strict';
import { playerUrl, resolvePlayerImdb } from '../assets/js/player-sources.js';

test('Русскоязычный плеер получает IMDb, сезон и серию без подмены идентификаторов', () => {
    const url = new URL(playerUrl('collaps',{tmdbId:'1396',imdbId:'tt0903747',mediaType:'tv',season:1,episode:2}));
    assert.equal(url.origin,'https://api.delivembd.ws');
    assert.equal(url.pathname,'/embed/imdb/tt0903747');
    assert.equal(url.searchParams.get('season'),'1'); assert.equal(url.searchParams.get('episode'),'2');
    assert.throws(() => playerUrl('collaps',{tmdbId:'603',mediaType:'movie'}),/IMDb/);
    assert.throws(() => playerUrl('collaps',{tmdbId:'603',imdbId:'tt1" onload="alert(1)',mediaType:'movie'}),/IMDb/);
    assert.throws(() => playerUrl('vidlink',{tmdbId:'1&x=2',mediaType:'movie'}));
    assert.throws(() => playerUrl('vidsrc',{tmdbId:'603',mediaType:'tv',season:-1}));
    const alternative = new URL(playerUrl('vidlink',{tmdbId:'603',mediaType:'movie'}));
    assert.equal(alternative.searchParams.has('lang'),false); assert.equal(alternative.searchParams.has('sub'),false);
});

test('IMDb определяется через external_ids и проверяется перед подключением плеера', async () => {
    const original = globalThis.fetch;
    try {
        globalThis.fetch = async url => {
            assert.match(url,/tv\/1396\/external_ids/);
            return {ok:true,json:async()=>({imdb_id:'tt0903747'})};
        };
        assert.equal(await resolvePlayerImdb('1396','tv'),'tt0903747');
        assert.equal(await resolvePlayerImdb('603','movie','tt0133093'),'tt0133093');
        globalThis.fetch = async () => ({ok:true,json:async()=>({imdb_id:'bad'})});
        assert.equal(await resolvePlayerImdb('1396','tv'),'');
    } finally { globalThis.fetch = original; }
});
