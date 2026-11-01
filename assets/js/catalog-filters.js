import { TMDB_API_KEY } from './shared.js';
export const FILTER_DEFAULTS = {genre:'',exclude:'',yearFrom:'',yearTo:'',runtimeMin:'',runtimeMax:'',originalLanguage:'',country:'',sort:'popularity.desc',provider:'',region:'US',status:'',network:'',released:false};
export function buildDiscoverUrl(type, values = {}, page = 1) {
    const f = {...FILTER_DEFAULTS,...values};
    const tv = ['tv','anime'].includes(type);
    const mediaType = tv ? 'tv' : 'movie';
    const params = new URLSearchParams({api_key:TMDB_API_KEY,language:'ru-RU',page:String(page),include_adult:'false'});
    const numeric = (name, value, min, max) => {
        if (value === '' || value === undefined) return;
        const number = Number(value);
        if (!Number.isFinite(number) || number < min || number > max) throw new Error('Проверьте числовые фильтры');
        params.set(name,String(number));
    };
    for (const [from,to,label] of [['yearFrom','yearTo','годы'],['runtimeMin','runtimeMax','длительность']]) {
        if (f[from] !== '' && f[to] !== '' && Number(f[from]) > Number(f[to])) throw new Error(`Неверный диапазон: ${label}`);
    }
    const genres = String(f.genre || '').split(',').filter(value=>/^\d+$/.test(value));
    if (type === 'anime' && !genres.includes('16')) genres.push('16');
    if (genres.length) params.set('with_genres',genres.join(','));
    if (/^\d+$/.test(String(f.exclude))) params.set('without_genres',f.exclude);
    for (const [key,param] of [['runtimeMin','with_runtime.gte'],['runtimeMax','with_runtime.lte']]) numeric(param,f[key],0,1000);
    const dateField = tv ? 'first_air_date' : 'primary_release_date';
    for (const [key,suffix,date] of [['yearFrom','gte','01-01'],['yearTo','lte','12-31']]) {
        if (f[key] !== '') { const year=Number(f[key]); if(!Number.isInteger(year)||year<1870||year>2100)throw new Error('Год должен быть от 1870 до 2100'); params.set(`${dateField}.${suffix}`,`${year}-${date}`); }
    }
    if (f.released) {
        const today = new Date().toISOString().slice(0,10);
        const key=`${dateField}.lte`; if(!params.has(key)||params.get(key)>today)params.set(key,today);
    }
    if (type === 'anime') params.set('with_original_language','ja');
    else if (/^[a-z]{2}$/.test(f.originalLanguage)) params.set('with_original_language',f.originalLanguage);
    if (/^[A-Z]{2}$/.test(f.country)) params.set('with_origin_country',f.country);
    let sort = f.sort;
    if (tv) sort = sort.replace('primary_release_date','first_air_date');
    const allowed = ['popularity.desc','popularity.asc',`${dateField}.desc`,`${dateField}.asc`];
    if (!allowed.includes(sort)) throw new Error('Неизвестный порядок сортировки');
    params.set('sort_by',sort);
    if (/^\d+$/.test(f.provider)) {params.set('with_watch_providers',f.provider);params.set('watch_region',/^[A-Z]{2}$/.test(f.region)?f.region:'US');}
    if (tv && /^[0-5]$/.test(f.status)) params.set('with_status',f.status);
    if (tv && /^\d+$/.test(f.network)) params.set('with_networks',f.network);
    return `https://api.themoviedb.org/3/discover/${mediaType}?${params}`;
}
export function hasCatalogFilters(values) {
    return Object.entries(FILTER_DEFAULTS).some(([key,value]) => String(values[key] ?? value) !== String(value));
}
