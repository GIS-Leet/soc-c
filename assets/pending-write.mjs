// 같은 폼의 저장이 끝날 때까지 중복 실행과 편집을 막음.
export function guardPending(action,fields){
 const pending=new Set();
 return async function(...args){
  const key=args.map(value=>String(value)).join(':');if(pending.has(key))return;
  pending.add(key);const controls=fields(...args).filter(Boolean).map(control=>[control,control.disabled]);
  controls.forEach(([control])=>control.disabled=true);
  try{return await action.apply(this,args)}finally{pending.delete(key);controls.forEach(([control,disabled])=>control.disabled=disabled)}
 };
}
