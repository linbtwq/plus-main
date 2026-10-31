import test from 'node:test';
import assert from 'node:assert/strict';
import { safeProfileImage, prepareProfileImage, AVATAR_LIMIT } from '../assets/js/profile-images.js';

test('Изображения профиля отклоняют SVG, опасные адреса и слишком длинные данные', async () => {
    assert.equal(safeProfileImage('data:image/webp;base64,UklGRg=='),'data:image/webp;base64,UklGRg==');
    assert.equal(safeProfileImage('https://example.com/avatar.jpg'),'https://example.com/avatar.jpg');
    for (const value of ['javascript:alert(1)','data:image/svg+xml;base64,PHN2Zz4=','data:text/html;base64,AAAA','http://example.com/a.jpg','data:image/png;base64,'+'a'.repeat(AVATAR_LIMIT)]) assert.equal(safeProfileImage(value,AVATAR_LIMIT),'');
    await assert.rejects(prepareProfileImage({type:'image/svg+xml',size:100},'avatar'),/JPG/);
    await assert.rejects(prepareProfileImage({type:'image/png',size:11*1024*1024},'banner'),/10 МБ/);
});
