import { validId } from './shared.js';
const sources=['collaps','vidsrc','2embed','superembed','vidlink','aniliberty'];
export function readWatchHistory(uid){
    if(!uid)return [];
    try{const values=JSON.parse(localStorage.getItem(`watchHistory:${uid}`)||'[]');return Array.isArray(values)?values.filter(m=>validId(m.tmdbId)&&['movie','tv'].includes(m.mediaType)&&sources.includes(m.source)&&Number.isInteger(m.season)&&m.season>0&&Number.isInteger(m.episode)&&m.episode>0).slice(0,20):[];}catch{return [];}
}
export function saveWatchProgress(uid,entry){
    if(!uid||!validId(entry.tmdbId)||!['movie','tv'].includes(entry.mediaType)||!sources.includes(entry.source))return;
    const data={...entry,title:String(entry.title||'Без названия').slice(0,500),updatedAt:Date.now()};
    const records=readWatchHistory(uid).filter(m=>!(String(m.tmdbId)===String(entry.tmdbId)&&m.mediaType===entry.mediaType));
    try{localStorage.setItem(`watchHistory:${uid}`,JSON.stringify([data,...records].slice(0,20)));}catch{}
}
export function resumeUrl(entry,prefix='pages/'){
    return `${prefix}watch.html?${new URLSearchParams({id:entry.tmdbId,type:entry.mediaType,title:entry.title,resume:'1'})}`;
}
export function removeWatchProgress(uid,id,type){try{localStorage.setItem(`watchHistory:${uid}`,JSON.stringify(readWatchHistory(uid).filter(m=>!(String(m.tmdbId)===String(id)&&m.mediaType===type))));}catch{}}
