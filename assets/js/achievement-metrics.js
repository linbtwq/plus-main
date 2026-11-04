import { normalizeMediaTitle,mediaPosterKey } from './rating-match.js';
const typeOf=movie=>['movie','series','anime'].includes(movie.type)?movie.type:movie.mediaType==='tv'?'series':'movie';
function mediaKey(movie){
 const type=movie.mediaType==='tv'||['series','anime'].includes(movie.type)?'tv':'movie';
 if(/^[1-9]\d{0,9}$/.test(String(movie.tmdbId||'')))return `${type}:${movie.tmdbId}`;
 return `${type}:${mediaPosterKey(movie.poster)||`${normalizeMediaTitle(movie.title)}:${movie.metadata?.year||movie.year||''}`}`;
}
const genres={драма:'drama',комедия:'comedy',триллер:'thriller',ужасы:'horror',фантастика:'scifi',фэнтези:'fantasy',мультфильм:'animation',анимация:'animation',детектив:'detective',приключения:'adventure',боевик:'action',мелодрама:'romance',документальный:'documentary'};
const score=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=10;
export function achievementMetrics(data={}){
 const metrics={},rated=new Map(),history=data.ratingHistory||[],deleted=data.deletedItems||[];
 const pool=[...(data.movies||[]).map(movie=>({...movie,_ratingId:movie.id})),...history.flatMap(row=>[row.before?{...row.before,_ratingId:row.movieId}:null,row.after?{...row.after,_ratingId:row.movieId}:null]),...deleted.filter(row=>row.collectionName==='movies').map(row=>row.snapshot?{...row.snapshot,_ratingId:row.itemId}:null)].filter(movie=>movie&&typeof movie.title==='string'&&movie.title.trim()&&score(movie.score));
 const aliases=new Map();
 const aliasKeys=movie=>{const type=movie.mediaType==='tv'||['series','anime'].includes(movie.type)?'tv':'movie';const poster=mediaPosterKey(movie.poster);return [...(movie._ratingId?[`${type}:record:${movie._ratingId}`]:[]),...(poster?[`${type}:poster:${poster}`]:[]),`${type}:title:${normalizeMediaTitle(movie.title)}:${movie.metadata?.year||movie.year||''}`];};
 for(const movie of pool)if(/^[1-9]\d{0,9}$/.test(String(movie.tmdbId||'')))for(const alias of aliasKeys(movie)){if(!aliases.has(alias))aliases.set(alias,new Set());aliases.get(alias).add(mediaKey(movie));}
 const add=movie=>{let key=mediaKey(movie);if(!movie.tmdbId)for(const alias of aliasKeys(movie)){const possible=aliases.get(alias);if(possible?.size===1){key=[...possible][0];break;}}if(!rated.has(key))rated.set(key,[]);rated.get(key).push(movie);};
 if([data.movies,data.ratingHistory,data.deletedItems].some(Array.isArray)){
  pool.forEach(add);
  const sets={reviews:new Set(),essays:new Set(),masterpieces:new Set(),movies:new Set(),series:new Set(),anime:new Set(),duo:new Set(),classics:new Set(),modern:new Set(),sevens:new Set(),perfectDuo:new Set()},allGenres=new Set(),countries=new Set(),decades=new Set(),directors=new Map(),actors=new Map(),genreTitles=new Map();
  const personTitle=(map,person,key)=>{if(!Number.isSafeInteger(person?.id)||person.id<=0)return;if(!map.has(person.id))map.set(person.id,new Set());map.get(person.id).add(key);};
  for(const [key,versions] of rated)for(const movie of versions){
   const review=typeof movie.review==='string'?movie.review.trim():'';
   if(review)sets.reviews.add(key);if(review.length>=300)sets.essays.add(key);if(movie.score===10)sets.masterpieces.add(key);if(movie.score===7.7)sets.sevens.add(key);
   sets[typeOf(movie)==='movie'?'movies':typeOf(movie)].add(key);if(movie.isDuo)sets.duo.add(key);
   if(movie.isDuo&&['script','actors','directing','chars','idea','atmosphere','impression'].every(stat=>{const parts=String(movie.stats?.[stat]||'').split('/');return parts.length===2&&parts.every(p=>p.trim()!==''&&Number.isFinite(Number(p)))&&Number(parts[0])===Number(parts[1]);}))sets.perfectDuo.add(key);
   for(const raw of typeof movie.genres==='string'?movie.genres.split(','):[]){const genre=raw.trim().toLocaleLowerCase('ru');if(!genre||genre==='жанр неизвестен')continue;allGenres.add(genre);const name=genres[genre];if(name){if(!genreTitles.has(name))genreTitles.set(name,new Set());genreTitles.get(name).add(key);}}
   const metadata=movie.metadata;if(!metadata)continue;
   for(const country of Array.isArray(metadata.countries)?metadata.countries:[])if(typeof country==='string'&&/^[A-Z]{2}$/.test(country))countries.add(country);
   if(Number.isInteger(metadata.year)&&metadata.year>=1870&&metadata.year<=2200){decades.add(Math.floor(metadata.year/10));if(metadata.year<1980)sets.classics.add(key);if(metadata.year>=2020)sets.modern.add(key);}
   for(const person of Array.isArray(metadata.directors)?metadata.directors:[])personTitle(directors,person,key);
   for(const person of Array.isArray(metadata.actors)?metadata.actors:[])personTitle(actors,person,key);
  }
  metrics.rated=rated.size;for(const [name,set] of Object.entries(sets))metrics[name]=set.size;
  metrics.genres=allGenres.size;metrics.countries=countries.size;metrics.decades=decades.size;metrics.director=[...directors.values()].reduce((max,set)=>Math.max(max,set.size),0);metrics.actor=[...actors.values()].reduce((max,set)=>Math.max(max,set.size),0);
  for(const name of Object.values(genres))metrics[`genre_${name}`]=genreTitles.get(name)?.size||0;
 }
 if(Array.isArray(data.ratingHistory))metrics.revisions=new Set(history.filter(row=>row.reason!=='metadata'&&score(row.before?.score)&&score(row.after?.score)&&row.before.score!==row.after.score).map(row=>row.id)).size;
 if(Array.isArray(data.plans)||Array.isArray(data.deletedItems)){const titles=new Set([...(data.plans||[]),...deleted.filter(row=>row.collectionName==='plans').map(row=>row.snapshot)].filter(Boolean).map(mediaKey));metrics.plans=titles.size;}
 if(Array.isArray(data.friendships)||Array.isArray(data.deletedItems)){
  const friends=new Set();for(const relation of [...(data.friendships||[]),...deleted.filter(row=>row.collectionName==='friendships').map(row=>row.snapshot)].filter(Boolean))if(relation.status==='accepted')for(const uid of relation.members||[])if(uid!==data.uid)friends.add(uid);metrics.friends=friends.size;
 }
 if(Array.isArray(data.jointRatings))metrics.confirmedDuo=new Set(data.jointRatings.filter(row=>row.status==='accepted'&&row.movie).map(row=>mediaKey(row.movie))).size;
 if(Array.isArray(data.watchSessions)){
  const repeats=new Map();let completed=0;
  for(const session of data.watchSessions)if(session.completed===true&&['manual','automatic'].includes(session.completionMethod)){completed++;const key=`${mediaKey(session)}:${session.mediaType==='tv'?`${session.animeRelease||0}:${session.season}:${session.episode}`:'film'}`;repeats.set(key,(repeats.get(key)||0)+1);}
  metrics.completed=completed;metrics.rewatches=[...repeats.values()].reduce((sum,count)=>sum+Math.max(0,count-1),0);
 }
 if(data.activityStats){const stats=data.activityStats;metrics.hours=Math.max(0,Number(stats.watchedSeconds)||0)/3600;metrics.completed=Math.max(metrics.completed||0,Number(stats.completions)||0);metrics.activeDays=Math.max(0,Number(stats.activeDays)||0);metrics.streak=Math.max(0,Number(stats.bestStreak)||0);metrics.roulette=Math.max(0,Number(stats.rouletteStarts)||0);}
 if(data.profile)metrics.fullProfile=Number(!!data.profile.photoURL&&!!data.profile.bannerURL&&typeof data.profile.bio==='string'&&data.profile.bio.trim().length>=10);
 return metrics;
}
export function mergeAchievementMetrics(...values){const result={};for(const metrics of values)for(const [key,value] of Object.entries(metrics||{}))if(Number.isFinite(value)&&value>=0)result[key]=Math.max(result[key]||0,value);return result;}
