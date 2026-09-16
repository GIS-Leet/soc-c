// 서버가 허용한 게시판 스냅샷을 기존 화면의 제한된 구독 API에 연결함.
const clone=value=>value == null ? null : structuredClone(value);
const at=(tree,path)=>path.split('/').filter(Boolean).reduce((value,key)=>value?.[key],tree) ?? null;
const snapshot=(key,value)=>({key,val:()=>clone(value),exists:()=>value!=null});
export class BoardStore {
  constructor(fetchPage){this.fetchPage=fetchPage;this.data={};this.listeners=new Set();this.states=new Set();this.epoch=0;this.ready=false;this.pending=null;this.state={status:'loading',complete:false};}
  publishState(value){this.state=value;for(const callback of this.states)callback(value);if(value.status==='error')for(const listener of this.listeners)listener.error?.(value.error);}
  onState(callback){this.states.add(callback);callback(this.state);return()=>this.states.delete(callback);}
  listen(path,event,callback,error,options={}) {
    const listener={path,event,callback,error,options,previous:null,initialized:false};this.listeners.add(listener);this.schedule();return()=>this.listeners.delete(listener);
  }
  schedule(){
    if(this.scheduled)return;this.scheduled=true;const epoch=this.epoch;
    queueMicrotask(()=>{this.scheduled=false;if(epoch!==this.epoch||!this.ready)return;
      const listeners=[...this.listeners].sort((a,b)=>b.path.split('/').length-a.path.split('/').length);
      for(const listener of listeners){
        if(!this.listeners.has(listener))continue;
        if(listener.event==='value' && listener.options.onlyOnce && !this.state.complete)continue;
        const value=at(this.data,listener.path);const previous=listener.previous;const initial=!listener.initialized;
        listener.previous=clone(value);listener.initialized=true;
        if(listener.event==='value') {
          if(initial||JSON.stringify(value)!==JSON.stringify(previous))listener.callback(snapshot(listener.path.split('/').at(-1)||null,value));
          if(listener.options.onlyOnce)this.listeners.delete(listener);
        } else {
          const before=previous||{},after=value||{};
          for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
            const added=!(key in before)&&key in after,removed=key in before&&!(key in after);
            const changed=key in before&&key in after&&JSON.stringify(before[key])!==JSON.stringify(after[key]);
            if((listener.event==='added'&&added)||(listener.event==='removed'&&removed)||(!initial&&listener.event==='changed'&&changed))listener.callback(snapshot(key,removed?before[key]:after[key]));
          }
        }
        // 삭제된 부모의 중첩 구독은 마지막 제거 이벤트 뒤 해제함.
        if(listener.path&&previous!=null&&value==null&&at(this.data,listener.path.split('/').slice(0,-1).join('/'))==null)this.listeners.delete(listener);
      }
    });
  }
  async refresh(){
    if(this.pending)return this.pending;
    const epoch=this.epoch;
    const work=(async()=>{
      const next={};let cursor;const visited=new Set();
      try {
        do {
          const page=await this.fetchPage({cursor,limit:50});if(epoch!==this.epoch)return;
          if(!Array.isArray(page.items))throw Error('목록 응답을 확인할 수 없습니다.');
          for(const item of page.items){if(!/^[A-Za-z0-9_-]+$/.test(item.id))throw Error('목록 식별자 오류');next[item.id]=item;}
          if(!page.hasMore)break;
          if(!page.cursor||visited.has(page.cursor)||visited.size>=10000)throw Error('목록 페이지를 완료할 수 없습니다.');
          cursor=page.cursor;visited.add(cursor);
        } while(true);
        if(epoch!==this.epoch)return;
        this.data=next;this.ready=true;this.publishState({status:'ready',complete:true});this.schedule();
      } catch(error){if(epoch===this.epoch)this.publishState({status:'error',complete:false,error});throw error;}
    })();
    this.pending=work;
    try{return await work;}finally{if(this.pending===work)this.pending=null;}
  }
  setItem(item){this.data={...this.data,[item.id]:clone(item)};this.ready=true;this.schedule();}
  removeItem(id){const next={...this.data};delete next[id];this.data=next;this.ready=true;this.schedule();}
  reset(){this.epoch++;this.pending=null;this.scheduled=false;this.data={};this.ready=true;this.schedule();this.publishState({status:'loading',complete:false});}
}
