// 배포 시 공개 저장소의 자료 목록을 생성함. 학생 요청에는 GitHub API가 필요 없음.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { PUBLIC_FOLDERS } from '../assets/materials.mjs';
export function buildIndex(tree, generatedAt = new Date().toISOString()) {
  if (tree.truncated || !Array.isArray(tree.tree) || !/^[0-9a-f]{40}$/.test(tree.sha)) throw new Error('Incomplete materials tree');
  const items = tree.tree.filter(item => PUBLIC_FOLDERS.includes(item.path.split('/')[0]) &&
    !item.path.split('/').some(p => p.startsWith('.')) && ['tree','blob'].includes(item.type) && item.mode !== '120000')
    .map(item => ({name:item.path.split('/').at(-1),path:item.path,type:item.type === 'tree' ? 'dir' : 'file',...(item.type === 'blob' ? {size:item.size ?? 0} : {})}));
  return {version:1,source:'GIS-Leet/kgghs-soc-c',sourceSha:tree.sha,generatedAt,items};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const headers = {Accept:'application/vnd.github+json'};
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch('https://api.github.com/repos/GIS-Leet/kgghs-soc-c/git/trees/HEAD?recursive=1',{headers});
  if (!response.ok) throw new Error(`Materials API HTTP ${response.status}`);
  const index=buildIndex(await response.json());
  await writeFile(new URL('../assets/materials-index.json',import.meta.url),JSON.stringify(index,null,2)+'\n');
  console.log(`Published index: ${index.items.length} entries, ${index.sourceSha}`);
}
