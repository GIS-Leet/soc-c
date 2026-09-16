// 공개 사이트의 로컬 연결, 실행 문법과 검색 메타를 배포 전에 검사한다.
import {readFile,readdir,stat} from 'node:fs/promises';
import {resolve,dirname,join,extname,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
export const PUBLIC_PAGES=['index.html','library.html','progress.html','simulators.html','climate_3d.html','climate_solar.html','climate_itcz.html','terrain.html','dynamic_earth.html','world_landforms.html','seoul.html','ai_dashboard.html','project_guide.html'];
export async function checkSite(root,{publicPages=PUBLIC_PAGES}={}) {
 root=resolve(root);const errors=[];const files=(await readdir(root)).filter(x=>x.endsWith('.html'));
 for(const file of files){const html=await readFile(join(root,file),'utf8');let index=0;
  for(const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
   if(/\bsrc\s*=/.test(script[1])||/type=["'](?:application\/ld\+json|application\/json)["']/.test(script[1]))continue;
   const result=spawnSync(process.execPath,['--check','--input-type',/type=["']module["']/.test(script[1])?'module':'commonjs'],{input:script[2],encoding:'utf8'});
   if(result.status!==0)errors.push(`${file}: script ${++index} syntax: ${result.stderr.split('\n').slice(0,5).join(' ')}`);else index++;
  }
  const markup=html.replace(/<!--[^]*?-->/g,'').replace(/<(script|style)\b[^>]*>[^]*?<\/\1>/gi,'');
  // src 자체는 외부 스크립트에도 로컬 검사 대상이므로 여는 태그를 별도로 모은다.
  const attributes=markup+'\n'+[...html.matchAll(/<script\b[^>]*>/gi)].map(x=>x[0]).join('\n');
  for(const match of attributes.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)){
   const raw=match[1];if(/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(raw)||raw.includes('${'))continue;
   let url;try{url=new URL(raw,'https://local.invalid/'+file);}catch{errors.push(`${file}: invalid URL ${raw}`);continue;}
   let local;try{local=resolve(root,'.'+decodeURIComponent(url.pathname));}catch{errors.push(`${file}: invalid path ${raw}`);continue;}
   if(relative(root,local).startsWith('..')){errors.push(`${file}: outside root ${raw}`);continue;}
   try{if((await stat(local)).isDirectory())local=join(local,'index.html');await stat(local);}catch{errors.push(`${file}: missing ${raw}`);continue;}
   // Desk의 확인된 실행 시점 경로 외에는 실제 앵커가 있어야 한다.
   if(url.hash && extname(local)==='.html' && !(relative(root,local)==='desk.html' && url.hash==='#study')) {const target=await readFile(local,'utf8');const hash=decodeURIComponent(url.hash.slice(1));if(hash&&!new RegExp(`\\bid=["']${hash.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}["']`).test(target))errors.push(`${file}: missing anchor ${raw}`);}
  }
  if(publicPages.includes(file))for(const [name,pattern] of Object.entries({description:/<meta\s+name=["']description["']\s+content=["'][^"']+["']/i,canonical:/<link\s+rel=["']canonical["']\s+href=["']https:\/\/nyuheatgis\.com\/[^"']*["']/i,'og:title':/<meta\s+property=["']og:title["']\s+content=["'][^"']+["']/i,'og:description':/<meta\s+property=["']og:description["']\s+content=["'][^"']+["']/i,'og:url':/<meta\s+property=["']og:url["']\s+content=["']https:\/\/nyuheatgis\.com\/[^"']*["']/i}))if(!pattern.test(html))errors.push(`${file}: missing ${name}`);
 }
 for(const file of publicPages)if(!files.includes(file))errors.push(`missing public page ${file}`);
 for(const directory of ['assets','scripts','design-system']){let entries;try{entries=await readdir(join(root,directory));}catch{continue;}for(const file of entries.filter(x=>/\.(?:mjs|js)$/.test(x))){const result=spawnSync(process.execPath,['--check',join(root,directory,file)],{encoding:'utf8'});if(result.status!==0)errors.push(`${directory}/${file}: syntax ${result.stderr.split('\n').slice(0,5).join(' ')}`);}}
 return errors;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const errors=await checkSite(resolve(dirname(fileURLToPath(import.meta.url)),'..'));if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Site links, JavaScript syntax and public metadata passed.');}
