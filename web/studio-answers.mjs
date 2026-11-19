import { getLanguage } from './i18n.mjs';

const answers={
  follow:[
    ['请解释一下这个判断的依据。','What evidence supports that conclusion?'],
    ['下一步需要我决定什么？','What should I decide next?']
  ],
  clarify:[
    ['能给我举个例子，帮我理解这个问题吗？','Could you give me an example so I can answer?'],
    ['有哪些做法可以选？请说说各自的取舍。','What are my options, and what would each involve?']
  ],
  name:[
    ['就叫「远见基金」。','Name it Long View.'],
    ['就叫「长青基金」。','Name it Evergreen.']
  ],
  goal:[
    ['我想找现金流持续增长的企业。','I want to find businesses with growing cash flow.'],
    ['我还没想好，能从稳一点的方案聊起吗？','I’m not sure yet. Could we start with a steadier approach?'],
    ['我想用指数基金分散投资。','I want to diversify using index funds.']
  ],
  horizon:[
    ['我想先观察六个月。','I want to follow this for six months.'],
    ['我打算持有三年。','I plan to hold for three years.'],
    ['我可以等五年以上。','I can stay invested for at least five years.']
  ],
  risk:[
    ['我比较保守，希望控制回撤。','I prefer a conservative approach with small drawdowns.'],
    ['我接受适中波动。','I am comfortable with moderate fluctuations.'],
    ['我愿意承受较大波动。','I am willing to tolerate large drawdowns.']
  ],
  decline:[
    ['我倾向稳健；如果回撤这么多，我会想先降低仓位。','I prefer a conservative approach. At that drawdown I would trim exposure.'],
    ['我能接受适中波动。如果现金流判断没变，我会继续持有。','I can accept moderate fluctuations. I would hold if the cash-flow thesis still stands.']
  ],
  concentration:[
    ['我希望单只股票上限为 5%。','I want a cap at 5% per stock.'],
    ['我希望单只股票上限为 10%。','I want a cap at 10% per stock.']
  ]
};

const topics=[
  ['name',/什么名|叫什么|取名|起名|命名|名字|\bname\b|\bcall (?:it|the fund|your fund|this fund|your paper fund)\b/iu],
  ['concentration',/单只|单一持仓|仓位上限|集中度|position limit|position cap|per (?:stock|position)|concentration/iu],
  ['horizon',/期限|多久|多长时间|持有多少|持有期|几年|几个月|多长周期|horizon|how long|holding period|time frame|timeframe|months? or years?/iu],
  ['risk',/风险|波动|回撤|跌幅|亏损|保守|risk|volatil|drawdown|downside|losses?/iu],
  ['goal',/目标|方向|行业|主题|投资什么|研究什么|goal|sector|theme|what.*(?:invest|research)|which.*industr/iu]
];
const declineWords=/下跌|跌去|跌了|缩水|回落|下挫|跌至|\b(?:fall|fell|falls|drop(?:s|ped)?|declin(?:e|ed|es)|shrank|shrink(?:s)?|lost|loses?)\b/iu;
const reactionWords=/不安|继续持有|持有等待|减(?:少|轻|持).*仓|降低仓位|能否接受|能接受|怎么应对|如何应对|会怎么做|\b(?:worr\w*|uneasy|anxious|uncomfortable|comfortable|hold|trim|reduce|sell|react|respond|tolerate|feel)\b/iu;

export function suggestedAnswers(guide, language=getLanguage()) {
  if(!guide || guide.phase!=='discovery' || guide.draft) return [];
  const last=guide.messages?.at(-1);
  if(last && last.role!=='assistant') return [];
  let topic;
  if(!last || last.id==='welcome') topic='goal';
  else {
    // Her recap can mention another topic. Match the last question only.
    const sentences=String(last.text ?? '').match(/[^。.!！?？\n]+[?？]/gu);
    const question=sentences?.at(-1) ?? '';
    if(/授权|确认创建|确认雇用|提交订单|approve|authori[sz]e|confirm|place an order/iu.test(question||last.text))return [];
    if (question && last.language === language && last.suggestedReplies?.length === 2) return last.suggestedReplies;
    if(!question)return last.text?.trim()?answers.follow.map(pair=>pair[language==='en-US'?1:0]):[];
    const matches=topics.filter(([,pattern])=>pattern.test(question));
    const missing=matches.find(([key])=>!guide.profile?.[key]);
    topic=(missing ?? matches[0])?.[0];
    if ((!topic || topic==='risk') && declineWords.test(question) && reactionWords.test(question)) topic='decline';
    topic ||= 'clarify';
  }
  return (answers[topic] ?? []).map(pair=>pair[language==='en-US'?1:0]);
}

