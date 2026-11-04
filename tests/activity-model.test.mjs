import test from 'node:test';
import assert from 'node:assert/strict';
import {advancePlayback,dayKey,streakAfter,mediaMetadata} from '../assets/js/activity-model.js';
test('Часы не включают перемотку, паузу, разрыв событий и другую серию',()=>{
 const old={key:'a',now:1000,position:10,playing:true,rate:1};
 assert.equal(advancePlayback(old,{key:'a',now:6000,position:15}).seconds,5);
 assert.equal(advancePlayback(old,{key:'a',now:6000,position:500}).seconds,0);
 assert.equal(advancePlayback(old,{key:'a',now:30000,position:39}).seconds,0);
 assert.equal(advancePlayback({...old,playing:false},{key:'a',now:6000,position:15}).seconds,0);
 assert.equal(advancePlayback(old,{key:'b',now:6000,position:15}).seconds,0);
 assert.equal(advancePlayback(old,{key:'a',now:6000,position:15,seeking:true}).seconds,0);
 assert.equal(advancePlayback({...old,rate:2},{key:'a',now:6000,position:20}).seconds,5);
});
test('Дни и серии не зависят от UTC-полуночи и перехода на летнее время',()=>{
 assert.equal(dayKey(new Date('2026-11-02T23:30:00Z'),'Europe/Kyiv'),'2026-11-03');
 assert.equal(streakAfter('2026-03-28','2026-03-29'),1);
 assert.equal(streakAfter('2026-11-01','2026-11-01'),0);
 assert.equal(streakAfter('2026-10-30','2026-11-02'),3);
});
test('Сведения сохраняют людей по ID, страны и год, без выдуманной длительности сериалов',()=>{
 const data={first_air_date:'2020-01-02',created_by:[{id:1,name:'Автор'}],origin_country:['JP'],production_countries:[{iso_3166_1:'JP'},{iso_3166_1:'US'}],credits:{cast:[{id:3,name:'Актёр'},{id:3,name:'Актёр'}],crew:[{id:2,name:'Режиссёр',job:'Director'}]}};
 const result=mediaMetadata(data,'tv');assert.equal(result.year,2020);assert.equal(result.runtime,0);assert.equal(result.actors.length,1);assert.equal(result.creators[0].id,1);assert.deepEqual(result.countries,['JP','US']);
});
