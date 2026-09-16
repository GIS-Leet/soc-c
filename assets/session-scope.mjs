// 로그인 세션이 끝난 뒤 늦게 도착하는 콜백과 구독을 정리함.
export function createSessionScope() {
  let epoch=0;
  const disposers=new Set();
  return {
    guard(callback){const generation=epoch;return (...args)=>{if(generation===epoch)return callback(...args)};},
    track(dispose){disposers.add(dispose);return ()=>{disposers.delete(dispose);dispose()};},
    clear(){epoch++;for(const dispose of disposers){try{dispose()}catch{}}disposers.clear();},
    generation(){return epoch;}
  };
}
