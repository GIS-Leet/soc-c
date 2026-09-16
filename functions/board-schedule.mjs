// 서버 전용 진행점과 임대로 정기 정리를 제한하며 학생 내용은 기록하지 않음.
import {randomUUID} from 'node:crypto';
export async function scheduledMaintenance({store,run,now=Date.now,send=null}){
 const path='boardMaintenanceState/scheduled',lease=randomUUID();
 const lock=await store.transaction(path,state=>state?.leaseUntil>now()?undefined:{...state,lease,leaseUntil:now()+360000});
 if(!lock.committed)return {skipped:true};
 try{
  const result=await run({limit:50,cursors:lock.value?.cursors||{},notificationsEnabled:!!send,send});
  await store.transaction(path,state=>state?.lease===lease?{cursors:result.cursors,leaseUntil:0,completedAt:now(),failed:result.failed||0}:undefined);
  return {skipped:false,failed:result.failed||0};
 }catch(error){
  await store.transaction(path,state=>state?.lease===lease?{...state,leaseUntil:0}:undefined);throw error;
 }
}
