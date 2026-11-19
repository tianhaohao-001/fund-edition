import { CANDIDATES } from './team.mjs';

const specialisms = {
  'maya-chen': ['基金经理','Portfolio manager',/基金经理|玛雅|\bmanager\b/iu],
  'theo-park': ['基本面研究','Fundamental research',/基本面|企业质量|股票分析|fundamental|equity analyst/iu],
  'inez-rao': ['组合风控','Portfolio risk',/风控|风险分析|risk analyst|risk officer|portfolio risk/iu],
  'eli-morgan': ['交易执行','Trade execution',/交易员|执行交易|执行专家|trader|trade execution|execution specialist/iu],
  'leah-kim': ['量化配置','Quantitative allocation',/量化|组合构建|仓位配置|quant|position siz|portfolio construct/iu],
  'jules-bennett': ['盈利与事件研究','Earnings and catalysts',/财报|事件驱动|催化剂|earnings|catalyst/iu],
  'avery-khan': ['压力测试','Stress testing',/压力测试|尾部风险|stress test|tail risk/iu],
  'riley-diaz': ['流动性与再平衡','Liquidity and rebalancing',/流动性|再平衡|liquidity|rebalanc/iu],
  'nora-bell': ['宏观经济研究','Macroeconomics',/宏观|经济学家|macro|economist/iu],
  'owen-reed': ['债券与久期','Fixed income and duration',/固收|债券|久期|fixed.income|bond|duration/iu],
};
export const seatSpecialism=(id,t)=>specialisms[id]?t(specialisms[id][0],specialisms[id][1]):'';
export const additiveStaffing=text=>!/(?:重新组|替换全部|全队换|replace (?:the whole|all)|start over)/iu.test(text)&&/(?:招|聘|再(?:加|补)|\b(?:add|hire|recruit|another|additional|bring in)\b)/iu.test(text);
export const staffingOnlyTurn=text=>/^\s*(?:(?:请|再|现在|帮我|我想|我们|然后|多|先|麻烦你)\s*)*(?:招|聘|加[一二两三四五六名个位人\d]|补[一二两三四五六名个位人\d]|移除|撤下|去掉|解聘|把.{0,35}换成)|^\s*(?:please |can you |could you |let.s )?(?:hire|add|recruit|swap|replace|remove|dismiss|drop|bring in)\b/iu.test(text);
export function openDraftCandidates(roster){
  const held=new Set(roster.map(s=>(s.name??CANDIDATES.find(p=>p.id===s.id)?.name??'').toLowerCase()));
  return CANDIDATES.filter(p=>p.role!=='manager'&&!roster.some(s=>s.id===p.id)&&!held.has(p.name.toLowerCase()));
}
function identify(text,list){
  const normal=text.trim().toLowerCase();
  const words=normal.match(/[\p{L}\p{N}]+/gu)??[];
  return list.find(seat=>{
    const person=CANDIDATES.find(c=>c.id===seat.id)??seat;
    if(!person.name)return false;
    const name=person.name.toLowerCase(),first=name.split(' ')[0];
    return normal.includes(name)||words.includes(first)||(/\p{Script=Han}/u.test(normal)&&normal.includes(first));
  })??list.find(seat=>specialisms[seat.id]?.[2].test(normal));
}
export function spokenDraftChange(text,roster){
  const spoken=String(text).trim();
  if(/[?？]|不招|不要|别招|\b(?:don.t|do not|could we consider|what if)\b/iu.test(spoken))return null;
  const idle=openDraftCandidates(roster);
  const swap=spoken.match(/(?:把|将)?(.+?)(?:换成|换为|替换成)(.+)/u)??spoken.match(/(?:replace|swap|exchange)\s+(.+?)\s+(?:with|for)\s+(.+)/iu);
  if(swap){const from=identify(swap[1],roster),to=identify(swap[2],idle);return from&&to?{operation:'replace',memberId:from.id,candidateId:to.id}:null;}
  if(/(?:移除|撤下|去掉|解聘|\bremove\b|\bdrop\b|\bdismiss\b)/iu.test(spoken)){
    const from=identify(spoken,roster);return from?{operation:'remove',memberId:from.id}:null;
  }
  if(!/(?:招|聘|加入|再加|加一|加个|补一|\b(?:hire|recruit|add|bring in)\b)/iu.test(spoken))return null;
  const quantity=spoken.match(/(?:招(?:募)?|招聘|加|补|聘请)\s*([两二三四五六七八九十\d]+)\s*[名位个]/u)?.[1]??
    spoken.match(/\b(?:hire|add|recruit|bring in)\s+(?:(?:another|about)\s+)?(two|three|four|five|six|seven|eight|nine|ten|\d+)\b/iu)?.[1];
  const numbers={两:2,二:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9,十:10,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  const n=numbers[quantity?.toLowerCase()]??Number(quantity);
  const mentioned=idle.filter(person=>identify(spoken,[person]));
  if(n>1||mentioned.length>1){
    const count=Number.isInteger(n)?n:mentioned.length;
    const unknownName=(spoken.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/gu)??[]).some(name=>!CANDIDATES.some(p=>p.name===name));
    const namedAssignment=/(?:[，、,]|和)\s*(?!一个|一位|一名|另一|分别)[\p{Script=Han}]{2,4}负责/u.test(spoken);
    if(unknownName||namedAssignment||(/(?:名叫|名字叫|分别叫|叫做|负责|\bnamed\b|\bcalled\b|assigned to)/iu.test(spoken)&&mentioned.length<count))return null;
    if(mentioned.length<count){
      const recommends=/(?:你(?:来)?(?:推荐|选|决定)|你看着办|you (?:choose|pick|recommend)|your choice)/iu.test(spoken);
      const generic=/^(?:请|帮我|再|多|继续|我想|另外|\s)*(?:招(?:募)?|招聘|加|补|聘请)\s*[两二三四五六七八九十\d]+\s*(?:名|位|个)?(?:新)?(?:人|成员|同事|专家|员工)?[。！!.,\s]*$/u.test(spoken)||
        /^(?:please |can you |could you )?(?:add|hire|recruit|bring in)\s+(?:another\s+)?(?:two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:(?:more|additional|new)\s+)?(?:people|employees|teammates|specialists|staff|members)[.!?\s]*$/iu.test(spoken);
      if(!recommends&&!generic)return null;
    }
    if(count>idle.length||mentioned.length>count)return {operation:'suggest'};
    const ranked=['leah-kim','eli-morgan','nora-bell','owen-reed','avery-khan','jules-bennett','riley-diaz'];
    const rest=ranked.map(id=>idle.find(p=>p.id===id)).filter(p=>p&&!mentioned.includes(p));
    const picks=[...new Set([...mentioned,...rest,...idle])].slice(0,count);
    return {operation:'batch-add',candidateIds:picks.map(p=>p.id)};
  }
  const dutyAt=spoken.match(/(?:[，,；;]\s*)?(?:负责|职责是|to focus on|to cover|responsible for)\s*(.+)$/iu);
  const request=dutyAt?spoken.slice(0,dutyAt.index):spoken;
  if(/(?:以及|并且|还有|、|\band\s+an?\b)/iu.test(request))return null;
  const role=/风控|风险分析|risk analyst|risk officer/iu.test(request)?'risk':
    /研究员|研究专家|researcher|research analyst/iu.test(request)?'research':
    /交易员|trader/iu.test(request)?'trader':null;
  const candidate=identify(request,idle)??idle.find(p=>p.role===role);
  return candidate?{operation:'add',candidateId:candidate.id,...(dutyAt?{duty:dutyAt[1].trim().slice(0,500)}:{})}:null;
}
