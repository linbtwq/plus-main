// Даты активности считаем в часовом поясе пользователя, без сдвигов из-за летнего времени.
export function dayKey(date=new Date(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
    const parts=new Intl.DateTimeFormat('en-US',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type).value;return `${get('year')}-${get('month')}-${get('day')}`;
}
export function streakAfter(previous,date){
    const gap=previous?Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(previous+'T00:00:00Z'))/86400000):null;
    return gap;
}
export function mediaMetadata(data,type){
    const people=items=>[...new Map((items||[]).filter(p=>Number.isSafeInteger(p.id)&&p.id>0&&typeof p.name==='string').map(p=>[p.id,{id:p.id,name:p.name.slice(0,200)}])).values()];
    const year=Number(String(data.release_date||data.first_air_date||'').slice(0,4));
    return {year:Number.isInteger(year)&&year>=1870&&year<=2200?year:0,runtime:Number.isFinite(data.runtime)?Math.max(0,Math.min(10000,data.runtime)):0,
        directors:people((data.credits?.crew||[]).filter(p=>p.job==='Director')).slice(0,10),creators:people(type==='tv'?data.created_by:[]).slice(0,10),actors:people(data.credits?.cast).slice(0,20),
        countries:[...new Set([...(data.production_countries||[]).map(p=>p.iso_3166_1),...(data.origin_country||[])].filter(p=>typeof p==='string'&&/^[A-Z]{2}$/.test(p)))].slice(0,30)};
}
// Перемотка и отсутствие событий не превращаются в просмотренные часы.
export function advancePlayback(previous,sample){
    let seconds=0;
    if(previous&&previous.key===sample.key&&previous.playing&&!sample.seeking){
        const wall=(sample.now-previous.now)/1000,delta=sample.position-previous.position,rate=previous.rate||1;
        if(wall>0&&wall<=15&&delta>0&&delta<=wall*rate+2)seconds=Math.min(wall,delta/rate);
    }
    return {seconds,previous:sample};
}
