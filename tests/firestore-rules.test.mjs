import test from 'node:test';
import assert from 'node:assert/strict';

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = 'demo-plus-test';
const enabled = !!host;
if (host && !/^(127\.0\.0\.1|localhost):\d+$/.test(host)) throw new Error('Проверки разрешены только на локальном эмуляторе');
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;
const name = path => `projects/${project}/databases/(default)/documents/${path}`;
function token(uid) {
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    return `${encode({alg:'none',typ:'JWT'})}.${encode({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'custom',identities:{}}})}.`;
}
const string = value => ({stringValue:value});
async function request(path, uid, options = {}) {
    return fetch(base + path, { ...options, headers: {'Content-Type':'application/json', ...(uid ? {Authorization:`Bearer ${token(uid)}`} : {})} });
}
function write(path, fields, create = false) {
    return {update:{name:name(path),fields}, ...(create ? {currentDocument:{exists:false}} : {}),updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}, ...(create ? [{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}] : [])]};
}
async function commit(uid, writes) {
    return request(':commit', uid, {method:'POST',body:JSON.stringify({writes})});
}
async function ok(response) { assert.ok(response.ok, `${response.status}: ${await response.text()}`); }
async function denied(response) { assert.equal(response.status,403,await response.text()); }
const profile = displayName => ({displayName:string(displayName),bio:string(''),photoURL:string('')});
const relation = (first, second, sender = first, status = 'pending') => ({members:{arrayValue:{values:[string(first),string(second)]}},senderId:string(sender),status:string(status)});

test('Правила профилей и друзей запрещают подмену владельца и самоподтверждение заявки', {skip:!enabled}, async t => {
    await fetch(`http://${host}/emulator/v1/projects/${project}/databases/(default)/documents`,{method:'DELETE'});
    await t.test('Создание личных профилей и запрет чужой записи, лишних полей и перечисления пользователей', async () => {
        await ok(await commit('alice',[write('profiles/alice',profile('Алиса'),true)]));
        await ok(await commit('bob',[write('profiles/bob',profile('Боб'),true)]));
        await ok(await commit('carol',[write('profiles/carol',profile('Кэрол'),true)]));
        await denied(await commit('alice',[write('profiles/bob',profile('Подмена'),true)]));
        await denied(await commit('dave',[write('profiles/dave',{...profile('Дэйв'),email:string('private@example.test')},true)]));
        await denied(await request('/profiles','alice'));
        await denied(await request('/profiles/alice',null));
        await ok(await request('/profiles/bob','alice'));
    });
    await t.test('Редактирование своего профиля и запрет редактирования чужого', async () => {
        const update = {update:{name:name('profiles/alice'),fields:{displayName:string('Новое имя'),bio:string('Кино')}},updateMask:{fieldPaths:['displayName','bio']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]};
        await ok(await commit('alice',[update]));
        await denied(await commit('bob',[update]));
    });
    await t.test('Собственные изображения разрешены, SVG, превышение размера и чужое изменение запрещены', async () => {
        const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1kAAAAASUVORK5CYII=';
        const update = value => ({update:{name:name('profiles/alice'),fields:{photoURL:string(image),bannerURL:string(value)}},updateMask:{fieldPaths:['photoURL','bannerURL']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]});
        await ok(await commit('alice',[update(image)]));
        await denied(await commit('bob',[update(image)]));
        await denied(await commit('alice',[update('data:image/svg+xml;base64,PHN2Zz4=')]));
        await denied(await commit('alice',[update('data:image/png;base64,'+'a'.repeat(350000))]));
        await ok(await commit('alice',[update('')]));
    });
    await t.test('Чтение отсутствующей пары участником, создание заявки и запрет обратного дубля', async () => {
        assert.equal((await request('/friendships/alice:bob','alice')).status,404);
        await denied(await request('/friendships/alice:bob','carol'));
        await ok(await commit('alice',[write('friendships/alice:bob',relation('alice','bob'),true)]));
        await denied(await commit('bob',[write('friendships/bob:alice',relation('bob','alice'),true)]));
        await denied(await commit('carol',[write('friendships/alice:carol',relation('alice','carol','carol','accepted'),true)]));
        await denied(await request('/friendships/alice:bob','carol'));
    });
    await t.test('Заявку принимает только получатель, участники и отправитель неизменяемы', async () => {
        const accept = {update:{name:name('friendships/alice:bob'),fields:{status:string('accepted')}},updateMask:{fieldPaths:['status']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]};
        await denied(await commit('alice',[accept]));
        await denied(await commit('carol',[accept]));
        await denied(await commit('bob',[write('friendships/alice:bob',relation('alice','carol','alice','accepted'))]));
        await ok(await commit('bob',[accept]));
        const response = await request('/friendships/alice:bob','alice');
        assert.equal((await response.json()).fields.status.stringValue,'accepted');
    });
    await t.test('Список дружбы доступен только участнику, удаление доступно обоим участникам', async () => {
        const query = {structuredQuery:{from:[{collectionId:'friendships'}],where:{fieldFilter:{field:{fieldPath:'members'},op:'ARRAY_CONTAINS',value:string('alice')}}}};
        await ok(await request(':runQuery','alice',{method:'POST',body:JSON.stringify(query)}));
        await denied(await request(':runQuery','carol',{method:'POST',body:JSON.stringify(query)}));
        await denied(await commit('carol',[{delete:name('friendships/alice:bob')}]));
        await ok(await commit('bob',[{delete:name('friendships/alice:bob')}]));
        await ok(await commit('alice',[write('friendships/alice:bob',relation('alice','bob'),true)]));
        await ok(await commit('alice',[{delete:name('friendships/alice:bob')}]));
    });
    await t.test('Быстрый и подробный режимы сохраняются без изменения прав на оценки', async () => {
        const number=value=>({doubleValue:value});
        const stats={mapValue:{fields:Object.fromEntries(['script','actors','directing','chars','idea','atmosphere','impression'].map(key=>[key,string(['atmosphere','impression'].includes(key)?'4.0':'8.0')]))}};
        const fields={userId:string('alice'),title:string('Тест'),score:number(8),type:string('movie'),poster:string(''),genres:string('Драма'),authorName:string('Алиса'),authorPhoto:{nullValue:null},date:string('01.11.2026'),stats,review:{nullValue:null},isDuo:{booleanValue:false},tmdbId:{integerValue:'123'},mediaType:string('movie'),schemaVersion:{integerValue:'2'}};
        const movieWrite=(id,mode)=>({update:{name:name('movies/'+id),fields:{...fields,...(mode?{ratingMode:string(mode)}:{})}},updateTransforms:[{fieldPath:'timestamp',setToServerValue:'REQUEST_TIME'}]});
        await ok(await commit('alice',[movieWrite('quick-rating','quick')]));
        await ok(await commit('alice',[movieWrite('detailed-rating','detailed')]));
        await ok(await commit('alice',[movieWrite('legacy-rating','')]));
        await denied(await commit('alice',[movieWrite('invalid-mode','invalid')]));
        await denied(await commit('bob',[movieWrite('forged-owner','quick')]));
    });
    await t.test('Оценки видны владельцу и подтверждённому другу, но не постороннему или ожидающей заявке', async () => {
        await ok(await fetch(base+'/movies/private-movie',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{userId:string('alice'),title:string('Оценка Алисы'),timestamp:{timestampValue:new Date().toISOString()}}})}));
        await ok(await request('/movies/private-movie','alice'));
        await denied(await request('/movies/private-movie','bob'));
        await ok(await commit('alice',[write('friendships/alice:bob',relation('alice','bob'),true)]));
        await denied(await request('/movies/private-movie','bob'));
        await ok(await commit('bob',[{update:{name:name('friendships/alice:bob'),fields:{status:string('accepted')}},updateMask:{fieldPaths:['status']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]));
        await ok(await request('/movies/private-movie','bob'));
        await denied(await request('/movies/private-movie','carol'));
        const ratingsQuery = {structuredQuery:{from:[{collectionId:'movies'}],where:{fieldFilter:{field:{fieldPath:'userId'},op:'EQUAL',value:string('alice')}},orderBy:[{field:{fieldPath:'timestamp'},direction:'DESCENDING'}]}};
        await ok(await request(':runQuery','bob',{method:'POST',body:JSON.stringify(ratingsQuery)}));
        await denied(await request(':runQuery','carol',{method:'POST',body:JSON.stringify(ratingsQuery)}));
        await denied(await commit('bob',[{delete:name('movies/private-movie')}]));
        await denied(await commit('bob',[{update:{name:name('movies/private-movie'),fields:{title:string('Подмена')}},updateMask:{fieldPaths:['title']}}]));
        await ok(await commit('bob',[{delete:name('friendships/alice:bob')}]));
        await denied(await request('/movies/private-movie','bob'));
        await denied(await request(':runQuery','bob',{method:'POST',body:JSON.stringify(ratingsQuery)}));
        // Проверяем оба направления идентификатора дружбы и доступ к оценкам второго участника.
        await ok(await commit('bob',[write('friendships/bob:alice',relation('bob','alice'),true)]));
        await ok(await commit('alice',[{update:{name:name('friendships/bob:alice'),fields:{status:string('accepted')}},updateMask:{fieldPaths:['status']},updateTransforms:[{fieldPath:'updatedAt',setToServerValue:'REQUEST_TIME'}]}]));
        await ok(await request('/movies/private-movie','bob'));
        await ok(await fetch(base+'/movies/bob-movie',{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer owner'},body:JSON.stringify({fields:{userId:string('bob'),title:string('Оценка Боба')}})}));
        await ok(await request('/movies/bob-movie','alice'));
    });
    await t.test('Планы принадлежат владельцу, доступны друзьям и закрываются при удалении дружбы',async()=>{
        const fields={userId:string('alice'),tmdbId:{integerValue:'123'},mediaType:string('movie'),title:string('План'),poster:string(''),genres:string('Драма'),year:string('2026'),createdAt:{integerValue:'100'}};
        const planWrite={update:{name:name('plans/alice:movie:123'),fields}};
        await ok(await commit('alice',[planWrite]));
        await ok(await request('/plans/alice:movie:123','alice'));
        await ok(await request('/plans/alice:movie:123','bob'));
        await denied(await request('/plans/alice:movie:123','carol'));
        await denied(await commit('bob',[planWrite]));
        await denied(await commit('alice',[{update:{name:name('plans/alice:movie:999'),fields}}]));
        await denied(await commit('alice',[{update:{name:name('plans/alice:movie:123'),fields:{...fields,extra:string('Запрещено')}}}]));
        const q={structuredQuery:{from:[{collectionId:'plans'}],where:{fieldFilter:{field:{fieldPath:'userId'},op:'EQUAL',value:string('alice')}}}};
        await ok(await request(':runQuery','bob',{method:'POST',body:JSON.stringify(q)}));
        await denied(await request(':runQuery','carol',{method:'POST',body:JSON.stringify(q)}));
        await ok(await commit('bob',[{delete:name('friendships/bob:alice')}]));
        await denied(await request('/plans/alice:movie:123','bob'));
        await denied(await commit('bob',[{delete:name('plans/alice:movie:123')}]));
        await ok(await commit('alice',[{delete:name('plans/alice:movie:123')}]));
    });
    await t.test('Изменение оценки сохраняет владельца и исходную дату создания',async()=>{
        await ok(await commit('alice',[{update:{name:name('movies/detailed-rating'),fields:{review:string('Новое мнение'),score:{doubleValue:9}}},updateMask:{fieldPaths:['review','score']}}]));
        await denied(await commit('bob',[{update:{name:name('movies/detailed-rating'),fields:{score:{doubleValue:1}}},updateMask:{fieldPaths:['score']}}]));
        await denied(await commit('alice',[{update:{name:name('movies/detailed-rating'),fields:{timestamp:{timestampValue:new Date().toISOString()}}},updateMask:{fieldPaths:['timestamp']}}]));
    });

});
