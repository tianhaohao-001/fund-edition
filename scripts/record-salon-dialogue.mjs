import {writeFile} from 'node:fs/promises';

const origin = 'http://127.0.0.1:3365';
const questions = {
  'zh-CN': ['好公司也可能太贵吗？请用两三句话说明。', '那怎样留出安全边际？', '什么证据会让这个团队改变想法？'],
  'en-US': ['Can a great business cost too much? Explain in a few sentences.', 'How would the team allow a margin of safety?', 'What evidence would change the team’s mind?']
};

async function record(language) {
  const initial = await fetch(origin+'/api/state?language='+language);
  if (!initial.ok) throw Error('Local workspace unavailable');
  const cookie = initial.headers.getSetCookie().map(v=>v.split(';')[0]).join('; ');
  const rows = [];
  for (const question of questions[language]) {
    const result = await fetch(origin+'/api/action',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json',Origin:origin},
      body:JSON.stringify({action:'catalogChat',catalogId:'buffett',provider:'harnessrouter',language,message:question,requestId:crypto.randomUUID()})});
    const data = await result.json();
    if (!result.ok) throw Error('Manager '+result.status+' '+String(data.error || '').slice(0,160));
    const reply = data.catalogChats?.buffett?.at(-1);
    if (!reply?.responseId || !reply.harnessId || reply.role!=='assistant') throw Error('Real provider receipt required');
    rows.push({question,answer:reply.text,responseId:reply.responseId,harnessId:reply.harnessId,recordedAt:reply.timestamp});
  }
  return [language,rows];
}
const records = Object.fromEntries(await Promise.all(Object.keys(questions).map(record)));
await writeFile(new URL('../web/salon-recordings.mjs',import.meta.url),'// Recorded, product-owned research questions. Replies and IDs are preserved verbatim.\nexport const recordedBuffett = '+ JSON.stringify(records,null,2)+';\n');
console.log('Saved two isolated three-turn Buffett-style research conversations.');

