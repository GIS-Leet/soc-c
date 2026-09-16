// 완료 기록과 타이머 세션을 같은 원자 갱신으로 묶고 날짜·회차별 키를 고정함.
export function completionPatch({date,app,slot=0,extraId='',session,record,subjectExists}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(slot)||slot<0||slot>99||!/^[-A-Za-z0-9]*$/.test(extraId))throw Error('완료 기록 식별자가 올바르지 않습니다.');
 const suffix=app?(slot||'x'+extraId):'daily';if(app&&!slot&&!extraId)throw Error('추가 공부 식별자가 없습니다.');
 const patch={['sessions/'+(app?'phone-':'daily-')+date+(app?'-'+suffix:'')]:session,[app?`phone/${date}/${suffix}`:`daily/${date}`]:record};
 if(!subjectExists)patch['subjects/'+(app?'study-phone':'study-review')]={name:app?'폰 공부':'복습',createdAt:session.end};
 return patch;
}
