import { saveWatchSession } from './activity-store.js';
import { advancePlayback } from './activity-model.js';
const outboxKey=uid=>`watchOutbox:${uid}`;
function pending(uid){try{return JSON.parse(localStorage.getItem(outboxKey(uid))||'{}')||{};}catch{return {};}}
export async function flushWatchOutbox(uid){
    const items=pending(uid);
    for(const [id,entry] of Object.entries(items)){
        if(!id.startsWith(uid+':'))continue;
        try{await saveWatchSession(uid,id,entry);const latest=pending(uid);if(JSON.stringify(latest[id])===JSON.stringify(entry)){delete latest[id];localStorage.setItem(outboxKey(uid),JSON.stringify(latest));}}catch{return false;}
    }return true;
}
export function createWatchTracker(uid,media,onStatus=()=>{}){
    let id='',entry,previous=null,elapsed=0,lastFlush=0,lastCache=0,queue=Promise.resolve();
    function start(source,season=1,episode=1,animeRelease=0){
        if(entry)flush();
        id=`${uid}:${crypto.randomUUID()}`;elapsed=0;previous=null;
        entry={...media,source,season,episode,animeRelease,position:0,duration:0,watchedSeconds:0,completed:false,completionMethod:'none'};cache();flush();
    }
    function cache(){lastCache=Date.now();try{const items=pending(uid);items[id]={...entry};localStorage.setItem(outboxKey(uid),JSON.stringify(items));}catch{onStatus('Не удалось сохранить локальную копию истории.');}}
    function flush(){
        if(!entry)return Promise.resolve();cache();lastFlush=Date.now();
        queue=queue.then(()=>flushWatchOutbox(uid)).then(ok=>{onStatus(ok?'История синхронизирована':'История пока в браузере. Синхронизация повторится при подключении.');}).catch(()=>{});return queue;
    }
    function sample(data){
        if(!entry)return;
        const season=Number.isSafeInteger(data.season)&&data.season>0?data.season:entry.season;
        const episode=Number.isSafeInteger(data.episode)&&data.episode>0?data.episode:entry.episode;
        const release=Number.isSafeInteger(data.animeRelease)?data.animeRelease:entry.animeRelease;
        if(season!==entry.season||episode!==entry.episode||release!==entry.animeRelease)start(entry.source,season,episode,release);
        const position=Number(data.position),duration=Number(data.duration);
        if(!Number.isFinite(position)||position<0||position>604800)return;
        const result=advancePlayback(previous,{key:id,now:performance.now(),position,playing:!!data.playing,seeking:!!data.seeking,rate:Number(data.rate)||1});previous=result.previous;elapsed+=result.seconds;
        entry.position=position;entry.duration=Number.isFinite(duration)&&duration>0&&duration<=604800?duration:entry.duration;entry.watchedSeconds=Math.floor(elapsed);
        if(data.ended&&elapsed>=5&&entry.duration>0&&position>=entry.duration-3){entry.completed=true;entry.completionMethod='automatic';}
        if(Date.now()-lastCache>=5000||data.ended)cache();if(Date.now()-lastFlush>=30000||data.ended)flush();
    }
    return {start,sample,flush,isComplete:()=>!!entry?.completed,async complete(){if(!entry)return;if(entry.completed)return;entry.completed=true;entry.completionMethod='manual';await flush();},snapshot:()=>entry?{...entry}:null};
}
