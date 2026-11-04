// Старые записи сопоставляем осторожно: известный ID всегда важнее названия.
const kind = movie => ['movie','tv'].includes(movie.mediaType) ? movie.mediaType : (['series', 'anime'].includes(movie.type) ? 'tv' : movie.type === 'movie' ? 'movie' : '');
export const normalizeMediaTitle = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ru').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s+/g, ' ').trim();
export function mediaPosterKey(value) {
    try {
        const url = new URL(value);
        return url.hostname === 'image.tmdb.org' ? url.pathname.replace(/^\/t\/p\/[^/]+\//, '') : '';
    } catch { return ''; }
}
export function findRating(records, target) {
    const type = target.mediaType;
    const exact = records.find(movie => Number(movie.tmdbId) === Number(target.id) && kind(movie) === type);
    if (exact) return exact;
    const legacy = records.filter(movie => !(Number(movie.tmdbId) > 0) && (!kind(movie) || kind(movie) === type));
    const poster = mediaPosterKey(target.poster);
    if (poster) {
        const found = legacy.filter(movie => mediaPosterKey(movie.poster) === poster);
        if (found.length) return found[0];
    }
    const title = normalizeMediaTitle(target.title);
    if (!title) return undefined;
    const candidates = legacy.filter(movie => normalizeMediaTitle(movie.title) === title && (!movie.year || !target.year || String(movie.year) === String(target.year)));
    // Не угадываем между разными постерами одноимённых фильмов.
    if (candidates.length && candidates.every(movie => !mediaPosterKey(movie.poster))) return candidates[0];
    return undefined;
}
