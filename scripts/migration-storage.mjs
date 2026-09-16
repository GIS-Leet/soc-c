// CLI 토큰을 명시적으로 전달한다. 라이브러리 버전별 인증 헤더 변환에 의존하지 않는다.
export function migrationStorageBucket({credential,bucket,fetcher=fetch}) {
 async function request(url,{method='GET',value,bytes,mime,raw=false}={}) {
  const response=await fetcher(url,{method,headers:{Authorization:'Bearer '+(await credential.getAccessToken()).access_token,...((value!==undefined||bytes)?{'Content-Type':mime||'application/json'}:{})},...(bytes?{body:bytes}:value!==undefined?{body:JSON.stringify(value)}:{}),signal:AbortSignal.timeout(30000)});
  if(!response.ok){const error=Error('Migration storage request failed');error.code='migration-storage-'+response.status;throw error;}
  return raw?Buffer.from(await response.arrayBuffer()):response.json();
 }
 return {file(path){const object='https://storage.googleapis.com/storage/v1/b/'+encodeURIComponent(bucket)+'/o/'+encodeURIComponent(path);return {
  async getMetadata(){return [await request(object)];},
  async download(){return [await request(object+'?alt=media',{raw:true})];},
  async setMetadata(value){return [await request(object,{method:'PATCH',value})];},
  async save(bytes,{metadata={}}={}){await request('https://storage.googleapis.com/upload/storage/v1/b/'+encodeURIComponent(bucket)+'/o?uploadType=media&name='+encodeURIComponent(path),{method:'POST',bytes,mime:metadata.contentType});await request(object,{method:'PATCH',value:metadata});}
 };}};
}
