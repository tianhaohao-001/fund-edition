(() => {
  'use strict';
  const records=window.judgeRecords;
  const el=id=>document.getElementById(id);
  const params=new URLSearchParams(location.search);
  let english=params.get('lang')?.startsWith('en') || false;
  const t=(zh,en)=>english?en:zh;
  const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
  const {blueprint,studio,allocation}=records;
  const weights=allocation.targets.map(target=>target.symbol+' '+target.bps/100+'%').join(' / ');
  const stamp=value=>value.slice(0,19).replace('T',' ')+' UTC';
  const durations=[12,19,18,23,18];
  let index=0, elapsed=0, start=0, timer, playing=false, ended=false;
  function presentation() {
    return [
      {art:'manager',context:t('产品导览 · 90 秒','Product tour · 90 seconds'),
       title:t('和 Maya 经营一支模拟基金。','Run a paper fund with Maya.'),
       copy:t('先看一句投资想法怎样变成团队草稿，再看同一天一支主动基金如何提出下一期配置。你可以播放，也可以自己逐幕翻看。','See an investing idea become a team brief. Then watch an active fund propose its next allocation. Play the tour or step through at your own pace.'),
       imageLabel:'Maya',imageValue:t('你的 AI 基金经理','Your AI fund manager'),imageNote:t('本地保存的运行回执','Locally saved run receipts')},
      {art:'blueprint',context:t('我的工作室 · 建团验收 · 11 月 18 日','My Studio · Team design · November 18'),
       title:t('先让 Maya 拟一份团队草稿。','Start with a team brief.'),
       copy:t('一位测试访客提出长期价值策略。接待经理识别了建团意图，随后基金经理拟出五个席位。页面停在确认按钮，访客可以继续修改。','A test visitor described a long-term value strategy. The concierge routed the request to Studio, where the manager proposed five seats. The visitor could edit the plan before confirming.'),
       imageLabel:t('团队蓝图','Team blueprint'),imageValue:blueprint.seats+t(' 个拟议席位',' proposed seats'),imageNote:t('状态　等待用户确认','Status　Awaiting confirmation'),record:blueprint,route:'studio'},
      {art:'room',context:t('我的工作室 · 独立审议场次','My Studio · Separate committee session'),
       title:t('这场会议决定持有现金。','This committee held cash.'),
       copy:t('另一支测试团队在合成市场情景中开会。五份真实模型回执留下了十七条活动记录。独立模拟引擎记录了持有，账户现金前后相同。','A separate test team met over a synthetic market scenario. Five genuine model receipts produced seventeen activity records. The paper engine recorded a hold. Cash stayed unchanged.'),
       imageLabel:t('审议后的模拟现金','Paper cash after review'),imageValue:money(studio.after),imageNote:t('审议前 ','Before review ')+money(studio.before),record:studio,route:'studio'},
      {art:'fund',context:'VWELX · 2026-11-18',
       title:t('下一期，团队选择了 60 / 40。','For the next period, the team chose 60 / 40.'),
       copy:t('研究席和风险席核查公开授权与截至当时的收盘记录。风险席指出信用债风险集中在单只 ETF。Maya 接受这项取舍，选取股息股票授权区间的下限，封存决定。','Research and risk reviewed the public mandate and closing data available at the time. Risk flagged reliance on one credit ETF. Maya accepted that trade-off and sealed an allocation at the low end of the permitted equity range.'),
       imageLabel:t('VWELX 方法 · AI 的目标配置','VWELX approach · AI target weights'),imageValue:weights,imageNote:t('VYM 股息股票　·　VCIT 信用债','VYM dividend equity　·　VCIT corporate credit'),record:allocation,route:'research'},
      {art:'fund-close',context:t('VWELX · 11 月 18 日的账本快照','VWELX · Ledger snapshot on November 18'),
       title:t('已批准，仍在等收盘。','Approved and awaiting the close.'),
       copy:t('用户批准了该次调仓。按授权，下一个完整美股交易日 11 月 19 日的收盘数据发布后才能核账。这份 11 月 18 日回执里成交为零，仍然持有全部现金。','The user approved the allocation. Pricing requires the close of the next full US session on November 19. The November 18 receipt records zero fills and the full cash balance.'),
       imageLabel:t('回执时点的模拟现金','Paper cash at the receipt time'),imageValue:money(allocation.cash),imageNote:t('成交 ','Fills ')+allocation.fills+'　·　'+t('持仓 ','Positions ')+allocation.positions,record:allocation,route:'funds'}
    ];
  }
  function liveRoute(kind) {
    const base=location.protocol==='file:'?'http://127.0.0.1:3365/':new URL('/',location.href).href;
    const lang=english?'en-US':'zh-CN';
    if(kind==='studio') return base+'?lang='+lang+'#/fund';
    if(kind==='research') return base+'?catalog=wellington&lang='+lang+'#/lab';
    const url=new URL('fund-operator.html',base);
    url.search=new URLSearchParams({fund:'wellington',lang:english?'en-US':'zh-CN'});
    return url.href;
  }
  function makeButton(label,style,invoke) {
    const b=document.createElement('button');b.type='button';b.className=style;b.textContent=label;b.addEventListener('click',invoke);return b;
  }
  function paint(focus=false) {
    const scene=presentation()[index];
    document.documentElement.lang=english?'en-US':'zh-CN';document.title=t('Fund Edition · 产品导览','Fund Edition · Product tour');document.querySelector('[data-brand-text]').textContent=t('Fund Edition','Fund Edition');
    el('tour').setAttribute('aria-label',t('产品导览','Product tour'));
    el('locale').textContent=english?'中文':'English';el('locale').setAttribute('aria-label',english?'切换到中文':'Switch to English');
    el('context').textContent=scene.context;el('title').textContent=scene.title;el('copy').textContent=scene.copy;
    el('visual').className='visual '+scene.art;
    const lines=['small','strong','p'].map((tag,i)=>{const child=document.createElement(tag);child.textContent=[scene.imageLabel,scene.imageValue,scene.imageNote][i];return child;});
    const plate=document.createElement('div');
    plate.className='plate';
    const staticField=(label,value)=>{
      const row=document.createElement('div'),labelEl=document.createElement('span'),valueEl=document.createElement('b');
      labelEl.textContent=label;valueEl.textContent=value;row.append(labelEl,valueEl);plate.append(row);
    };
    if(index===1){
      staticField(t('接待经理','Concierge'),'01');
      staticField(t('团队草稿','Team brief'),String(blueprint.seats).padStart(2,'0'));
      staticField(t('基金状态','Fund status'),t('待确认','Draft'));
    } else if(index===2){
      staticField(t('活动记录','Activity records'),String(studio.events));
      staticField(t('模型回执','Model receipts'),String(studio.replies).padStart(2,'0'));
      staticField(t('执行','Execution'),t('持有','Hold'));
    } else if(index===3){
      allocation.targets.forEach(target=>staticField(target.symbol,target.bps/100+'%'));
      const ratio=document.createElement('div');ratio.className='ratio';ratio.setAttribute('aria-hidden','true');
      allocation.targets.forEach(target=>{const mark=document.createElement('i');mark.style.flexGrow=String(target.bps);ratio.append(mark);});plate.append(ratio);
    } else if(index===4){
      staticField(t('封存日','Sealed'),allocation.sealedAt.slice(0,10));
      staticField(t('待核收盘','Pricing date'),allocation.pricingDate);
      staticField(t('成交笔数','Fills'),String(allocation.fills));
    }
    el('visual-content').replaceChildren(...lines);
    el('visual').querySelector('.plate')?.remove();
    if(index)el('visual').prepend(plate);
    const play=makeButton(playing?t('暂停播放','Pause'):ended?t('重播导览','Replay tour'):t('播放导览','Play tour'),'primary',toggle);
    play.setAttribute('aria-pressed',String(playing));
    const buttons=[play];
    if(scene.record) buttons.push(makeButton(t('看这场回执','View receipt'),'quiet',()=>openSource(scene.record)));
    if(scene.route) {
      const link=document.createElement('a');link.className='quiet';link.href=liveRoute(scene.route);
      link.textContent=(scene.route==='studio'?t('进入真实工作室','Open Studio'):scene.route==='research'?t('打开基金资料','Open fund research'):t('进入 VWELX 运营','Open VWELX'))+' ↗';
      buttons.push(link);
    }
    el('actions').replaceChildren(...buttons);
    el('prev').textContent=t('← 上一幕','← Previous');el('prev').disabled=index===0;
    el('next').textContent=t('下一幕 →','Next →');el('next').disabled=index===durations.length-1;
    el('counter').textContent=(index+1)+' / '+durations.length;
    if(focus) el('title').focus({preventScroll:true});
    progress();
  }
  function openSource(receipt) {
    if(playing) pause();
    el('source-title').textContent=t('本场运行回执','Session receipt');el('close').textContent=t('关闭','Close');
    const rows=receipt===blueprint ? [[t('记录时间','Recorded at'),stamp(receipt.at)],[t('实际请求','Recorded actions'),receipt.actions.join(' → ')],[t('模型','Model'),receipt.model],[t('等待确认','Awaiting confirmation'),t('是','Yes')]] :
      receipt===studio ? [[t('会议请求','Meeting request'),receipt.receipt],[t('模型回执 / 活动数','Model receipts / events'),receipt.replies+' / '+receipt.events],[t('执行结果','Engine result'),receipt.decision],[t('模拟现金','Paper cash'),money(receipt.before)+' → '+money(receipt.after)]] :
      [[t('信息截至','Evidence cutoff'),stamp(receipt.cutoff)],[t('动议与封存时刻','Decision and seal time'),receipt.action+' · '+stamp(receipt.sealedAt)],[t('用户授权','User approval'),stamp(receipt.authorizedAt)],[t('预定收盘日','Pricing date'),receipt.pricingDate],[t('决定指纹','Decision seal'),receipt.seal],[t('成交 / 当前持仓','Fills / positions'),receipt.fills+' / '+receipt.positions]];
    rows.push([t('本地记录文件','Local source file'),receipt.source.file],['SHA-256',receipt.source.sha256]);
    const list=document.createElement('dl');
    for(const [label,value] of rows) {const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;list.append(dt,dd);}
    el('source-body').replaceChildren(list);el('source').showModal();
  }
  function progress() {
    const prior=durations.slice(0,index).reduce((a,b)=>a+b,0);
    const current=playing ? elapsed+(performance.now()-start)/1000 : elapsed;
    el('progress').style.width=(100*Math.min(90,prior+Math.min(current,durations[index]))/90)+'%';
  }
  function stopTimer(){clearInterval(timer);timer=undefined;}
  function pause(){if(playing)elapsed+=(performance.now()-start)/1000;playing=false;stopTimer();paint();}
  function move(next,focus=false){
    if(next<0 || next>=durations.length)return;
    index=next;elapsed=0;start=performance.now();ended=false;paint(focus);
  }
  function toggle(){
    if(playing){pause();return;}
    if(ended){move(0);ended=false;}
    playing=true;start=performance.now();paint();
    timer=setInterval(()=>{
      if(elapsed+(performance.now()-start)/1000>=durations[index]) {
        if(index===durations.length-1){playing=false;ended=true;elapsed=durations[index];stopTimer();paint();return;}
        move(index+1);
      } else progress();
    },200);
  }
  el('locale').addEventListener('click',()=>{english=!english;paint();});
  el('prev').addEventListener('click',()=>move(index-1,true));el('next').addEventListener('click',()=>move(index+1,true));
  el('close').addEventListener('click',()=>el('source').close());
  document.addEventListener('keydown',event=>{if(el('source').open||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key==='ArrowRight'){event.preventDefault();move(index+1,true);}if(event.key==='ArrowLeft'){event.preventDefault();move(index-1,true);}
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden && playing)pause();});
  paint();
})();

