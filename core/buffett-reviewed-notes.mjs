const letters='https://www.berkshirehathaway.com/letters/1986.html';
const annualRelease='https://www.sec.gov/Archives/edgar/data/866787/000117184317005596/exh_991.htm';
const capexZh='E08 把总资本支出从经营现金流中扣除。其他条件相同且成长性支出非负时，这个数值小于或等于只扣维持性支出的结果。估算巴菲特所说的所有者盈余还需考虑正常维持业务所需的投资和营运资本，无法据此确定上限。';
const capexEn='E08 subtracts total capital spending from operating cash flow. With other items equal and nonnegative growth spending, this yields no more than subtracting maintenance spending alone. Estimating Buffett’s owner earnings also requires normalized investment and working-capital needs. E08 establishes no upper bound.';
const scopeZh='有关利息或债务期限的资料缺口仅指送给席位的 12 项财务摘要。模型没有读取整份财报。';
const scopeEn='References to missing interest or debt-maturity information describe the 12 financial measures supplied to the seats. The model did not read the full filings.';

// Each note attaches to an exact original provider receipt, after all investment decisions were signed.
const notes=[
  ['resp_50910ce3152a43b4871163c4b42b1b84','capex-1',['E06','E07','E08'],capexZh,capexEn,letters],
  ['resp_50910ce3152a43b4871163c4b42b1b84','multiples',['E04','E05','E08','E13'],'首场风控混用了两个倍数。789.79 美元除以每股现金流代理约 39.81 美元，约为 19.84 倍。除以稀释每股收益 41.82 美元才约为 18.89 倍。','The risk brief combined two different multiples. USD 789.79 divided by about USD 39.81 of cash-flow proxy per share is 19.84×. Dividing by diluted EPS of USD 41.82 gives 18.89×.'],
  ['resp_44cfb978c92a4bc39c72a423e2dc1fe4','coverage-1',['E09'],scopeZh,scopeEn],
  ['resp_4c736e2dacaa466fa7753356941b1b02','capex-2',['E06','E07','E08'],capexZh,capexEn,letters],
  ['resp_ba41186c31a74b6a8071ae2c1c0fb011','capex-3',['E06','E07','E08'], '本场经理及风控原文的「偏上限」判断方向有误。'+capexZh, 'The manager and risk briefs incorrectly described E08 as an upper bound. '+capexEn, letters],
  ['resp_ba41186c31a74b6a8071ae2c1c0fb011','coverage-3',['E09','E11'],scopeZh+' 同期季报列有净利息费用。研究席还漏看了 E11，最近 36 个财周收入同比增长 1.923%。',scopeEn+' The quarter’s filing reports net interest expense. The research brief also overlooked E11, which records 1.923% year-over-year sales growth for the latest 36 fiscal weeks.','https://www.sec.gov/Archives/edgar/data/866787/000119312517203540/d382576d10q.htm'],
  ['resp_69b3f221a739482295f58812a115e9a1','pe-4',['E05','E11','E13'],'经理英文简报把市盈率的分子、分母写反。595.11 美元股价除以每股盈利 44.07 美元为 13.50 倍；扣去每股 1.03 美元税务收益后约为 13.83 倍。','The manager’s English brief reversed the P/E wording. Price of USD 595.11 divided by EPS of USD 44.07 is 13.50×, or about 13.83× after removing the USD 1.03 per-share tax benefit.'],
  ['resp_69b3f221a739482295f58812a115e9a1','coverage-4',['E07','E11','E12'],scopeZh+' 9 月 19 日公告列有利息费用，E12 的现金流数据沿用六月值，资本支出低于净利本身也不足以证明当期现金流。E11 的每股 1.03 美元是本期税务影响，未来能否重现未定。',scopeEn+' The September 19 release included interest expense. E12 carries June cash-flow data forward; capital spending below net income does not establish current cash flow. The USD 1.03 tax item in E11 describes this year; future recurrence is unknown.',annualRelease],
];

export function addBuffettReviewNotes(study) {
  for(const decision of study.decisions) {
    const receipts=new Set(decision.seats.map(s=>s.responseId));
    decision.corrections=notes.filter(([responseId])=>receipts.has(responseId)).map(([responseId,id,evidenceRefs,text,textEn,sourceUrl])=>({
      id,responseId,evidenceRefs,text,textEn,...(sourceUrl?{sourceUrl}:{}),reviewedAt:'2026-11-19',kind:'post-decision-editorial-review',
    }));
  }
  return study;
}
