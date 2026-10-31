export const AVATAR_LIMIT = 100000;
export const BANNER_LIMIT = 350000;

// Принимаем только растровые изображения, без SVG и исполняемых схем адресов.
export function safeProfileImage(value, maxLength = BANNER_LIMIT) {
    if (typeof value !== 'string' || value.length > maxLength) return '';
    if (/^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) return value;
    try {
        const url = new URL(value);
        return url.protocol === 'https:' && !url.username && !url.password && value.length <= 2000 ? url.href : '';
    } catch { return ''; }
}

export async function prepareProfileImage(file, kind) {
    if (!['avatar', 'banner'].includes(kind)) throw new Error('Неизвестный тип изображения');
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите изображение JPG, PNG или WebP');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Размер исходного файла должен быть не больше 10 МБ');
    let bitmap;
    try { bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('Не удалось прочитать изображение. Выберите другой файл.'); }
    try {
        if (bitmap.width * bitmap.height > 40000000) throw new Error('Изображение слишком большое. Выберите файл до 40 мегапикселей.');
        const avatar = kind === 'avatar';
        const width = avatar ? 320 : 1440;
        const height = avatar ? 320 : 480;
        const ratio = width / height;
        const sourceWidth = Math.min(bitmap.width, bitmap.height * ratio);
        const sourceHeight = sourceWidth / ratio;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Браузер не поддерживает обработку изображений');
        context.drawImage(bitmap, (bitmap.width - sourceWidth) / 2, (bitmap.height - sourceHeight) / 2, sourceWidth, sourceHeight, 0, 0, width, height);
        const max = avatar ? AVATAR_LIMIT : BANNER_LIMIT;
        // Уменьшаем качество и размеры, чтобы профиль оставался компактным.
        for (let pass = 0; pass < 3; pass++) {
            for (const quality of [0.86, 0.72, 0.56, 0.4]) {
                const result = canvas.toDataURL('image/webp', quality);
                if (result.length <= max && safeProfileImage(result, max)) return result;
            }
            const smaller = document.createElement('canvas');
            smaller.width = Math.round(canvas.width * 0.75); smaller.height = Math.round(canvas.height * 0.75);
            smaller.getContext('2d').drawImage(canvas, 0, 0, smaller.width, smaller.height);
            canvas.width = smaller.width; canvas.height = smaller.height;
            context.drawImage(smaller, 0, 0);
        }
        throw new Error('Не удалось сжать изображение. Попробуйте другой файл.');
    } finally { bitmap.close(); }
}
