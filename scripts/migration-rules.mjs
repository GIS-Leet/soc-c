// 적용 전 운영 규칙이 기존 공개 쓰기와 평문 암호 쓰기를 막았는지 강제로 확인한다.
const teacher = "auth != null && auth.token.email === 'leetae712@gmail.com' && auth.token.email_verified === true";
export function requireMigrationRules(document) {
  const rules=document?.rules;
  if (!rules || (rules['.write'] !== undefined && rules['.write'] !== false)) throw Error('Migration requires closed legacy writes');
  for (const board of ['questions','feedback','support']) {
    const branch=rules[board];
    const checkChildren=node=>{for(const [key,value] of Object.entries(node||{})){if(key==='.write' && value!==false)throw Error('Migration rejects descendant write overrides');if(value && typeof value==='object')checkChildren(value);}};
    for(const [key,value] of Object.entries(branch||{}))if(!key.startsWith('.') && value && typeof value==='object')checkChildren(value);
    if (branch?.['.write'] !== teacher || branch?.$id?.password?.['.validate'] !== false) throw Error('Migration requires closed legacy writes');
  }
}
