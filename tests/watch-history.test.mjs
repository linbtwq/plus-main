import test from 'node:test';
import assert from 'node:assert/strict';
import { readWatchHistory,saveWatchProgress,resumeUrl,removeWatchProgress } from '../assets/js/watch-history.js';
import { safeAnimeStream } from '../assets/js/anime-player.js';

test('Продолжение просмотра изолировано по аккаунтам и обновляет один тайтл',()=>{
    const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value)};
    const movie={tmdbId:123,mediaType:'tv',title:'Название',source:'aniliberty',season:1,episode:2,animeRelease:413,animeEpisode:2,position:620};
    saveWatchProgress('alice',movie);saveWatchProgress('alice',{...movie,position:640});
    assert.equal(readWatchHistory('bob').length,0);assert.equal(readWatchHistory('alice').length,1);assert.equal(readWatchHistory('alice')[0].position,640);
    const url=new URL(resumeUrl(movie),'https://example.com');assert.equal(url.pathname,'/pages/watch.html');assert.equal(url.searchParams.get('resume'),'1');
    removeWatchProgress('alice',123,'tv');assert.deepEqual(readWatchHistory('alice'),[]);
    memory.set('watchHistory:alice',JSON.stringify([{...movie,source:'javascript:alert(1)'}]));assert.deepEqual(readWatchHistory('alice'),[]);
    delete globalThis.localStorage;
});
test('Аниме-плеер принимает только HTTPS HLS доверенных серверов',()=>{
    assert.equal(safeAnimeStream('https://cache.libria.fun/video.m3u8?key=abc'),'https://cache.libria.fun/video.m3u8?key=abc');
    for(const url of ['javascript:alert(1)','https://libria.fun.evil.example/video.m3u8','http://cache.libria.fun/video.m3u8','https://evil.example/video.m3u8','https://cache.libria.fun/file.html'])assert.equal(safeAnimeStream(url),'');
});

test('Повреждённый элемент истории не скрывает остальные просмотренные фильмы',()=>{
    const movie={tmdbId:123,mediaType:'movie',source:'collaps',season:1,episode:1};
    globalThis.localStorage={getItem:()=>JSON.stringify([null,movie,42])};
    try {assert.deepEqual(readWatchHistory('owner'),[movie]);}
    finally {delete globalThis.localStorage;}
});
