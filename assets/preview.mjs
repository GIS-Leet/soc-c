// 비공개 자료의 새 탭 경로와 Blob 출처 검증.
export function previewLocation(blobURL,extension) {
  return extension === 'pdf' ? blobURL : 'material-viewer.html#'+encodeURIComponent(blobURL);
}
export function allowedBlobURL(hash,origin) {
  try {const url=new URL(decodeURIComponent(hash.replace(/^#/,'')));return url.protocol==='blob:' && url.origin===origin ? url.href : null;}catch{return null;}
}
