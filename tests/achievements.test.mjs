import test from 'node:test';
import assert from 'node:assert/strict';
import {ACHIEVEMENTS,ACHIEVEMENT_BY_ID,eligibleAchievements,achievementLevel} from '../assets/js/achievement-catalog.js';
import {achievementMetrics,mergeAchievementMetrics} from '../assets/js/achievement-metrics.js';
const movie=(id,extra={})=>({tmdbId:id,mediaType:'movie',type:'movie',title:'Фильм '+id,score:8,genres:'Драма',...extra});
test('Каталог содержит 142 уникальных достижения с выполнимыми цепочками',()=>{
 assert.equal(ACHIEVEMENTS.length,142);assert.equal(ACHIEVEMENT_BY_ID.size,142);
 for(const item of ACHIEVEMENTS){assert.ok(item.target>0);assert.ok(item.xp>0);if(item.requires){const previous=ACHIEVEMENT_BY_ID.get(item.requires);assert.equal(previous.chain,item.chain);assert.ok(previous.target<item.target);}}
 const unlocked=eligibleAchievements({rated:100}).map(item=>item.id);assert.deepEqual(unlocked,['archive-1','archive-2','archive-3','archive-4','archive-5','archive-6']);
 assert.deepEqual(eligibleAchievements({rated:100},unlocked),[]);assert.equal(achievementLevel([...unlocked,...unlocked]).xp,achievementLevel(unlocked).xp);
});
test('Редактирование, совместная копия и старый постер не удваивают число тайтлов',()=>{
 const old={title:'Фильм 💕',type:'movie',score:10,poster:'https://image.tmdb.org/t/p/w500/test.jpg'};
 const current=movie(1,{title:'Фильм',poster:old.poster,review:'Хорошо',score:9});
 const metrics=achievementMetrics({movies:[current,{...current,id:'duo-copy'}],ratingHistory:[{id:'r',before:old,after:current,reason:'rating'},{id:'metadata',before:current,after:current,reason:'metadata'}]});
 assert.equal(metrics.rated,1);assert.equal(metrics.masterpieces,1);assert.equal(metrics.reviews,1);assert.equal(metrics.revisions,1);assert.equal(metrics.genre_drama,1);
});
test('Часы берутся только из учтённого времени; следующая серия не считается пересмотром',()=>{
 const sessions=[{...movie(1),completed:true,completionMethod:'manual',id:'a'},{...movie(1),completed:true,completionMethod:'automatic',id:'b'},{...movie(2,{mediaType:'tv'}),season:1,episode:1,completed:true,completionMethod:'manual'},{...movie(2,{mediaType:'tv'}),season:1,episode:2,completed:true,completionMethod:'manual'},{...movie(3),completed:false,completionMethod:'none',duration:7200}];
 const metrics=achievementMetrics({watchSessions:sessions,activityStats:{watchedSeconds:3600,completions:4}});assert.equal(metrics.rewatches,1);assert.equal(metrics.completed,4);assert.equal(metrics.hours,1);
});
test('Снимки удалений сохраняют заслуги, но заявки и изменения метаданных не дают лишних наград',()=>{
 const metrics=achievementMetrics({uid:'owner',deletedItems:[{collectionName:'movies',snapshot:movie(1)},{collectionName:'plans',snapshot:movie(2)},{collectionName:'friendships',snapshot:{members:['owner','friend'],status:'accepted'}},{collectionName:'friendships',snapshot:{members:['owner','stranger'],status:'pending'}}],friendships:[{members:['owner','friend'],status:'accepted'}],ratingHistory:[{id:'metadata',before:movie(1,{score:7}),after:movie(1),reason:'metadata'}],jointRatings:[{status:'pending',movie:movie(1)},{status:'accepted',movie:movie(2)},{status:'accepted',movie:movie(2)}]});
 assert.equal(metrics.rated,1);assert.equal(metrics.plans,1);assert.equal(metrics.friends,1);assert.equal(metrics.revisions,0);assert.equal(metrics.confirmedDuo,1);
});
test('Страны, эпохи и фильмографии используют уникальные тайтлы и сохранённые ID людей',()=>{
 const metadata={year:1979,countries:['US','US'],directors:[{id:1,name:'Автор'}],actors:[{id:2,name:'Актёр'}]};
 const metrics=achievementMetrics({movies:[movie(1,{metadata}),movie(2,{metadata:{...metadata,year:2020,countries:['JP']}}),movie(2,{metadata})]});
 assert.equal(metrics.rated,2);assert.equal(metrics.countries,2);assert.equal(metrics.decades,2);assert.equal(metrics.director,2);assert.equal(metrics.actor,2);assert.equal(metrics.classics,2);assert.equal(metrics.modern,1);
 const merged=mergeAchievementMetrics({rated:100,completed:5},{rated:1,hours:3},{bad:'oops',hours:NaN});assert.equal(merged.rated,100);assert.equal(merged.completed,5);assert.equal(merged.hours,3);assert.equal(merged.bad,undefined);
});

test('Старая версия без постера и с изменённым названием связывается по записи журнала',()=>{
 const before={title:'Старое название',type:'movie',score:8};const after=movie(42,{title:'Новое название'});
 const metrics=achievementMetrics({movies:[{...after,id:'saved'}],ratingHistory:[{id:'event',movieId:'saved',before,after,reason:'rating'}]});assert.equal(metrics.rated,1);
});
