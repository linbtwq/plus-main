export const TMDB_API_KEY = '4ff5ea09116c72aed9a95dd1b65183c4';
export const NO_POSTER = '../assets/img/no-poster.svg';
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// Разрешаем только изображения с доверенного сервера.
export function posterUrl(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && url.hostname === 'image.tmdb.org' && !url.username && !url.password ? url.href : NO_POSTER;
    } catch { return NO_POSTER; }
}

export function validId(value) { return /^[1-9]\d{0,9}$/.test(String(value ?? '')); }

export async function fetchJson(url, options = {}) {
    const { signal, ...rest } = options;
    const timeout = AbortSignal.timeout(15000);
    const response = await fetch(url, { ...rest, signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.ok) throw new Error(`Ошибка HTTP: ${response.status}`);
    return response.json();
}

export async function tmdb(path, params = {}, signal) {
    const query = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'ru-RU', ...params });
    return fetchJson(`https://api.themoviedb.org/3/${path}?${query}`, { signal });
}

// Для старых записей ищем идентификатор без изменения сохранённой оценки.
export async function resolveMedia(movie) {
    const mediaType = movie.mediaType === 'tv' || ['anime', 'series'].includes(movie.type) ? 'tv' : 'movie';
    if (validId(movie.tmdbId)) return { id: movie.tmdbId, mediaType };
    const data = await tmdb(`search/${mediaType}`, { query: movie.title });
    const matches = (data.results || []).filter(item => validId(item.id));
    const title = String(movie.title).trim().toLocaleLowerCase();
    const match = matches.find(item => String(item.title || item.name).trim().toLocaleLowerCase() === title) || matches[0];
    if (!match) throw new Error('Тайтл не найден в каталоге');
    return { id: match.id, mediaType };
}

export function watchUrl(id, mediaType, title, imdb = '') {
    if (!validId(id) || !['movie', 'tv'].includes(mediaType)) throw new Error('Неверный идентификатор тайтла');
    return `watch.html?${new URLSearchParams({ id, type: mediaType, title, imdb: /^tt\d+$/.test(imdb) ? imdb : '' })}`;
}

export async function trailerUrl(id, mediaType) {
    for (const language of ['ru-RU', 'en-US']) {
        const data = await tmdb(`${mediaType}/${id}/videos`, { language });
        const video = (data.results || []).find(item => item.site === 'YouTube' && item.type === 'Trailer' && /^[\w-]{11}$/.test(item.key));
        if (video) return `https://www.youtube.com/embed/${video.key}?autoplay=1`;
    }
    throw new Error('Трейлер не найден');
}

export function rouletteKey(uid) { return `rouletteList:${uid}`; }
export function readRoulette(uid) {
    if (!uid) return '';
    try { return localStorage.getItem(rouletteKey(uid)) || ''; } catch { return ''; }
}
export function writeRoulette(uid, value) {
    if (!uid) throw new Error('Сначала войдите в аккаунт');
    localStorage.setItem(rouletteKey(uid), value);
    localStorage.setItem(`roulettePending:${uid}`, '1');
}
