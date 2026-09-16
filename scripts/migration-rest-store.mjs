// CLI OAuth 자격으로 REST만 사용하여 마이그레이션 읽기·쓰기의 대기 시간을 제한함.
import {createFirebaseStore} from '../functions/firebase-store.mjs';
export function migrationRestStore({credential,databaseURL,fetcher=fetch}){
 async function request(method,path,value,query={}){
  const url=new URL(path.split('/').map(encodeURIComponent).join('/')+'.json',databaseURL+'/');
  for(const [name,v]of Object.entries(query))url.searchParams.set(name,JSON.stringify(v));
  const response=await fetcher(url,{method,headers:{Authorization:'Bearer '+(await credential.getAccessToken()).access_token,'Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){const error=Error('Migration database request failed');error.code='migration-http-'+response.status;throw error;}return response.json();
 }
 return {
  get:path=>request('GET',path),set:(path,value)=>request('PUT',path,value),update:patch=>request('PATCH','',patch),
  async page(path,{after='',limit=50}={}){
   const values=await request('GET',path,undefined,{orderBy:'$key',limitToFirst:limit+(after?1:0),...(after?{startAt:after}:{})});
   return Object.entries(values||{}).sort(([a],[b])=>a<b?-1:a>b?1:0).filter(([key])=>!after||key>after).slice(0,limit);
  },
  transaction:createFirebaseStore({database:null,credential,databaseURL}).transaction,
 };
}
