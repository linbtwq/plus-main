import test from 'node:test';
import assert from 'node:assert/strict';
import {findRating} from '../assets/js/rating-match.js';
const poster='https://image.tmdb.org/t/p/w500/michael.jpg';
const target={id:123,mediaType:'movie',title:'Майкл',poster,year:'2026'};
test('Старый фильм с украшением в названии находится по постеру другого размера',()=>{
 const movie={id:'old',title:'Майкл 💕',type:'movie',poster:poster.replace('w500','original'),score:10};
 assert.equal(findRating([movie],target),movie);
});
test('Известные ID и тип важнее одинаковых названий и постеров',()=>{
 assert.equal(findRating([{tmdbId:999,mediaType:'movie',title:'Майкл',poster}],target),undefined);
 assert.equal(findRating([{tmdbId:123,mediaType:'tv',title:'Майкл',poster}],target),undefined);
 const movie={tmdbId:123,mediaType:'movie',title:'Другое название'};
 assert.equal(findRating([movie],target),movie);
});
test('Название без постера допускает старую запись, но не другой год или постер',()=>{
 const movie={title:'Майкл 💕',type:'movie'};
 assert.equal(findRating([movie],target),movie);
 assert.equal(findRating([{...movie,year:1996}],target),undefined);
 assert.equal(findRating([{...movie,poster:poster.replace('michael','other')}],target),undefined);
});
