import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDiscoverUrl,hasCatalogFilters,FILTER_DEFAULTS} from '../assets/js/catalog-filters.js';
test('Подбор фильмов передаёт диапазоны, жанры, страну, сервис и сортировку в TMDB',()=>{
 const url=new URL(buildDiscoverUrl('movie',{genre:'18',exclude:'27',yearFrom:'2000',yearTo:'2020',runtimeMax:'120',country:'FR',originalLanguage:'fr',provider:'8',region:'UA',sort:'primary_release_date.desc'},2));
 assert.equal(url.pathname,'/3/discover/movie');
 for(const [key,value] of Object.entries({with_genres:'18',without_genres:'27','primary_release_date.gte':'2000-01-01','primary_release_date.lte':'2020-12-31','with_runtime.lte':'120',with_origin_country:'FR',with_original_language:'fr',with_watch_providers:'8',watch_region:'UA',page:'2'}))assert.equal(url.searchParams.get(key),value);
 assert.equal(url.searchParams.get('include_adult'),'false');
});
test('Сериалы используют свои даты и сети, а аниме сохраняет японский язык и анимацию',()=>{
 const tv=new URL(buildDiscoverUrl('tv',{yearFrom:'2010',status:'3',network:'49',sort:'primary_release_date.asc'}));
 assert.equal(tv.searchParams.get('first_air_date.gte'),'2010-01-01');assert.equal(tv.searchParams.get('sort_by'),'first_air_date.asc');assert.equal(tv.searchParams.get('with_status'),'3');assert.equal(tv.searchParams.get('with_networks'),'49');
 const anime=new URL(buildDiscoverUrl('anime',{genre:'35',originalLanguage:'fr'}));
 assert.equal(anime.searchParams.get('with_genres'),'35,16');assert.equal(anime.searchParams.get('with_original_language'),'ja');
 assert.equal(hasCatalogFilters(FILTER_DEFAULTS),false);assert.equal(hasCatalogFilters({genre:'18'}),true);
 assert.throws(()=>buildDiscoverUrl('movie',{yearFrom:'2025',yearTo:'1990'}),/диапазон/);
 assert.throws(()=>buildDiscoverUrl('movie',{runtimeMax:'1001'}));
});

test('Каталог не использует внешние оценки и голосования',()=>{
 const url=new URL(buildDiscoverUrl('movie',{ratingMin:'7',ratingMax:'9',votes:'500'}));
 assert.equal(Array.from(url.searchParams.keys()).some(key=>key.startsWith('vote_')),false);
 assert.equal(hasCatalogFilters({ratingMin:'7',votes:'500'}),false);
 assert.throws(()=>buildDiscoverUrl('movie',{sort:'vote_average.desc'}));
});
