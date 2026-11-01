// Названия сравниваются без регистра и лишних пробелов; исходный порядок сохраняется.
export function mergeRouletteTitles(text,titles){
    const key=value=>value.normalize('NFKC').replace(/\s+/g,' ').trim().toLocaleLowerCase('ru');
    const existing=String(text||'').split(/\r?\n/).map(value=>value.trim()).filter(Boolean),seen=new Set(existing.map(key));
    const additions=[];let skipped=0;
    for(const raw of titles){const title=String(raw||'').replace(/[\r\n]+/g,' ').trim();if(!title)continue;const normalized=key(title);if(seen.has(normalized)){skipped++;continue;}seen.add(normalized);additions.push(title);}
    const merged=[...existing,...additions].join('\n');if(merged.length>100000)throw new Error('Список рулетки слишком длинный. Освободи место и повтори.');
    return {text:merged,added:additions.length,skipped};
}
