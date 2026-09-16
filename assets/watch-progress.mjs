// 실제 재생 구간은 중복 없이 합치고 이어보기 위치와 별도로 기록함.
export class WatchProgress {
 constructor(previous={}) {
  this.previous=previous;this.position=Number(previous.sec)||0;this.last=null;
  this.intervals=Array.isArray(previous.intervals)?previous.intervals.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&p[0]>=0&&p[1]>p[0]).map(p=>[...p]):[];
  this.legacyDone=previous.legacyDone===true||(previous.done===true&&previous.progressVersion!==2);
 }
 sample(position,now,playing,rate=1){
  if(!Number.isFinite(position)||position<0)return;
  const last=this.last;this.position=position;
  if(last?.playing){
   const seconds=(now-last.now)/1000,delta=position-last.position;
   // 정지 탭의 큰 간격·탐색 이동은 시청 시간으로 추정하지 않음.
   if(seconds>0&&seconds<=3&&delta>0&&delta<=seconds*Math.max(rate,last.rate)*1.25+0.25)this.intervals.push([last.position,position]);
  }
  this.last={position,now,playing,rate};this.merge();
 }
 merge(){
  const merged=[];for(const p of this.intervals.sort((a,b)=>a[0]-b[0])){const tail=merged.at(-1);if(tail&&p[0]<=tail[1]+0.05)tail[1]=Math.max(tail[1],p[1]);else merged.push([...p]);}this.intervals=merged;
 }
 record(duration){
  const dur=Math.max(0,Number(duration)||Number(this.previous.dur)||0);
  const intervals=this.intervals.map(([a,b])=>[Math.min(a,dur),Math.min(b,dur)]).filter(([a,b])=>b>a);
  const watchedSec=Math.floor(intervals.reduce((n,[a,b])=>n+b-a,0));
  return {sec:Math.round(Math.min(this.position,dur)),dur:Math.round(dur),watchedSec,intervals,progressVersion:2,legacyDone:this.legacyDone,done:this.legacyDone||(dur>0&&watchedSec/dur>=.9)};
 }
}
// 한 경로의 전송 중 스냅샷을 고정하여 이전 응답이 새 저장을 지우지 않게 함.
export class LatestWrites {
 constructor(send){this.send=send;this.pending=new Map();this.running=null;}
 get size(){return this.pending.size;}
 put(key,value){this.pending.set(key,structuredClone(value));}
 flush(){
  if(this.running)return this.running;
  const work=(async()=>{while(this.pending.size){const [key,value]=this.pending.entries().next().value;await this.send(key,value);if(this.pending.get(key)===value)this.pending.delete(key);}})();
  this.running=work;return work.finally(()=>{if(this.running===work)this.running=null});
 }
 clear(){this.pending.clear();}
}
