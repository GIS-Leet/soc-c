// 마이그레이션의 REST 페이지 커서와 OAuth 전달·오류 노출 범위를 검사함.
import test from 'node:test';import assert from 'node:assert/strict';import {migrationRestStore} from '../scripts/migration-rest-store.mjs';
test('포함 커서를 제거해 다음 페이지를 중복 없이 읽는다',async()=>{
 let target,options;const store=migrationRestStore({credential:{getAccessToken:async()=>({access_token:'fixture'})},databaseURL:'https://fixture.invalid',fetcher:async(url,opt)=>{target=url;options=opt;return {ok:true,json:async()=>({b:{},c:{},a:{}})}}});
 assert.deepEqual((await store.page('questions',{after:'a',limit:2})).map(x=>x[0]),['b','c']);assert.equal(target.searchParams.get('limitToFirst'),'3');assert.equal(options.headers.Authorization,'Bearer fixture');
});
test('원격 오류 원문을 로그용 오류 메시지로 전달하지 않는다',async()=>{
 const store=migrationRestStore({credential:{getAccessToken:async()=>({access_token:'fixture'})},databaseURL:'https://fixture.invalid',fetcher:async()=>({ok:false,status:403,text:async()=>'PRIVATE'})});await assert.rejects(store.get('questions'),e=>e.code==='migration-http-403'&&!e.message.includes('PRIVATE'));
});
import {requireMigrationRules} from '../scripts/migration-rules.mjs';
import {readFile} from 'node:fs/promises';
test('공개 쓰기 또는 암호 갱신이 가능한 운영 규칙이면 apply를 막는다',async()=>{
 const rules=JSON.parse(await readFile(new URL('../database.rules.json',import.meta.url)));
 assert.doesNotThrow(()=>requireMigrationRules(rules));
 const open=structuredClone(rules);open.rules.questions['.write']=true;assert.throws(()=>requireMigrationRules(open));
 const password=structuredClone(rules);delete password.rules.support.$id.password;assert.throws(()=>requireMigrationRules(password));
 const child=structuredClone(rules);child.rules.questions.$id['.write']=true;assert.throws(()=>requireMigrationRules(child));
 const deep=structuredClone(rules);deep.rules.questions.$id.replies={'.write':'auth != null'};assert.throws(()=>requireMigrationRules(deep));
 const parent=structuredClone(rules);parent.rules['.write']=true;assert.throws(()=>requireMigrationRules(parent));
});
