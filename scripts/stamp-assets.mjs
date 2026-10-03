// 로컬 자산 주소에 내용 해시(?v=…)를 붙여 배포 즉시 새 파일을 받게 한다. 파일이 바뀌면 주소도 바뀌고, 안 바뀌면 캐시를 그대로 쓴다.
// 실행: node scripts/stamp-assets.mjs        (파일 갱신)
//       node scripts/stamp-assets.mjs --check (갱신할 것이 있으면 종료 코드 1 — 테스트가 이 모드로 검사)
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';
const ROOT=join(dirname(fileURLToPath(import.meta.url)),'..');
const SKIP_HTML=new Set(['desk.html','material-viewer.html']);   // 서비스 워커 셸: 캐시 열쇠가 주소 그대로라 스탬프를 붙이지 않는다
const check=process.argv.includes('--check');
const hash=s=>createHash('sha1').update(s).digest('hex').slice(0,8);
const strip=s=>s.replace(/\?v=[0-9a-f]{8}/g,'');
// 1) 모듈끼리 부르는 상대 import — 불리는 쪽 해시가 정해져야 부르는 쪽 해시가 정해지므로 안정될 때까지 반복
const modules={};
for(const f of readdirSync(join(ROOT,'assets')).filter(f=>f.endsWith('.mjs')))modules['assets/'+f]=strip(readFileSync(join(ROOT,'assets',f),'utf8'));
for(let pass=0;pass<8;pass++){
  let changed=false;
  for(const key of Object.keys(modules)){
    const next=modules[key].replace(/(from\s*['"])\.\/([^'"?]+\.mjs)(['"])/g,(m,a,name,z)=>modules['assets/'+name]?`${a}./${name}?v=${hash(modules['assets/'+name])}${z}`:m);
    if(next!==modules[key]){modules[key]=next;changed=true;}
  }
  if(!changed)break;
}
const planned=[];
for(const [key,text] of Object.entries(modules)){const path=join(ROOT,key);if(readFileSync(path,'utf8')!==text)planned.push([path,text]);}
// 2) HTML 이 부르는 assets/·design-system/ 파일
const fileHash=rel=>modules[rel]?hash(modules[rel]):existsSync(join(ROOT,rel))?hash(readFileSync(join(ROOT,rel))):null;
const htmlFiles=[...readdirSync(ROOT).filter(f=>f.endsWith('.html')),...(existsSync(join(ROOT,'test'))?readdirSync(join(ROOT,'test')).filter(f=>f.endsWith('.html')).map(f=>'test/'+f):[])];
for(const rel of htmlFiles){
  if(SKIP_HTML.has(rel))continue;
  const path=join(ROOT,rel);const src=readFileSync(path,'utf8');
  const base=rel.includes('/')?'../':'';
  const out=src.replace(/((?:src|href)=")((?:\.\.\/)?(?:assets|design-system)\/[^"?#]+\.(?:mjs|js|css))(?:\?v=[0-9a-f]{8})?(")/g,(m,a,p,z)=>{const h=fileHash(p.replace(/^\.\.\//,''));return h?`${a}${p}?v=${h}${z}`:m;})
    // 인라인 <script type="module"> 의 import "./assets/x.mjs" 도 같은 스탬프
    .replace(/(from\s*['"])((?:\.\.?\/)?assets\/[^'"?#]+\.mjs)(?:\?v=[0-9a-f]{8})?(['"])/g,(m,a,p,z)=>{const h=fileHash(p.replace(/^\.\.?\//,''));return h?`${a}${p}?v=${h}${z}`:m;});
  if(out!==src)planned.push([path,out]);
}
if(check){
  if(planned.length){console.error('자산 스탬프가 오래됐습니다. `npm run stamp` 를 실행하세요:\n'+planned.map(([p])=>' - '+p.replace(ROOT+'/','')).join('\n'));process.exit(1);}
  console.log('자산 스탬프 최신');
}else{
  for(const [p,t] of planned)writeFileSync(p,t);
  console.log(planned.length?`갱신 ${planned.length}개 파일`:'갱신할 파일 없음');
}
