import { validId, tmdb } from './shared.js';

export const PLAYER_SOURCES = ['collaps', 'vidsrc', '2embed', 'superembed', 'vidlink'];
export const validImdb = value => typeof value === 'string' && /^tt\d{5,12}$/.test(value);

// Русскоязычный источник использует IMDb, а не числовой идентификатор TMDB.
export async function resolvePlayerImdb(tmdbId, mediaType, provided = '') {
    if (!validId(tmdbId) || !['movie', 'tv'].includes(mediaType)) throw new Error('Неверный идентификатор тайтла');
    if (validImdb(provided)) return provided;
    const data = await tmdb(`${mediaType}/${tmdbId}/external_ids`);
    return validImdb(data.imdb_id) ? data.imdb_id : '';
}

export function playerUrl(source, { tmdbId, imdbId = '', mediaType, season = 1, episode = 1 }) {
    if (!PLAYER_SOURCES.includes(source) || !validId(tmdbId) || !['movie', 'tv'].includes(mediaType)) throw new Error('Неверные параметры плеера');
    if (!Number.isSafeInteger(season) || season < 1 || !Number.isSafeInteger(episode) || episode < 1) throw new Error('Неверный сезон или серия');
    const tv = mediaType === 'tv';
    switch (source) {
        case 'collaps': {
            if (!validImdb(imdbId)) throw new Error('Для этого тайтла не найден IMDb ID. Попробуйте другой источник.');
            const url = new URL(`https://api.delivembd.ws/embed/imdb/${imdbId}`);
            if (tv) { url.searchParams.set('season', season); url.searchParams.set('episode', episode); }
            return url.href;
        }
        case 'vidsrc': return tv ? `https://vidsrc.me/embed/tv?tmdb=${tmdbId}&season=${season}&episode=${episode}` : `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`;
        case '2embed': return tv ? `https://www.2embed.cc/embedtv/${tmdbId}?s=${season}&e=${episode}` : `https://www.2embed.cc/embed/${tmdbId}`;
        case 'superembed': {
            const url = new URL('https://multiembed.mov/');
            url.searchParams.set('video_id', validImdb(imdbId) ? imdbId : tmdbId);
            url.searchParams.set('tmdb', validImdb(imdbId) ? '0' : '1');
            if (tv) { url.searchParams.set('s', season); url.searchParams.set('e', episode); }
            return url.href;
        }
        case 'vidlink': return tv ? `https://vidlink.pro/tv/${tmdbId}/${season}/${episode}` : `https://vidlink.pro/movie/${tmdbId}`;
    }
}
