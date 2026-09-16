import {imageBytes} from '../functions/board-security.mjs';
// 일부 Samsung JPEG의 EOI 뒤 SEF 메타데이터는 서버용 사본에서만 제외한다.
// 원본 객체는 보존한다. 형식: https://exiftool.org/TagNames/Samsung.html#Trailer
export function legacyImageBytes(bytes,mime){
 try{return imageBytes(bytes.toString('base64'),mime);}catch(original){
  if(mime!=='image/jpeg'||bytes.length<16||bytes.length>5*1024*1024||bytes.toString('ascii',bytes.length-4)!=='SEFT')throw original;
  const eoi=bytes.lastIndexOf(Buffer.from([255,217])),header=bytes.length-8-bytes.readUInt32LE(bytes.length-8);
  if(eoi<2||bytes.length-eoi-2>65536||header<eoi+2||header>bytes.length-12||bytes.toString('ascii',header,header+4)!=='SEFH')throw original;
  return imageBytes(bytes.subarray(0,eoi+2).toString('base64'),mime);
 }
}
