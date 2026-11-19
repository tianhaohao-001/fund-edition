import { t } from './i18n.mjs';

export const exampleBrief = () => t('我想组建一个长期价值基金，找现金流稳定的企业。我愿意持有五年，风险要保守，单只股票上限 10%。请先给我团队草稿。',
  'I want a long-term value fund focused on businesses with steady cash flow. My horizon is five years, my risk tolerance is conservative, and my cap per stock is 10%. Please draft a team first.');

export function exampleTrigger() {
  return `<button type="button" class="ge-link studio-example-trigger" data-entry="studio-example">${t('看别人怎样开始','See how a fund starts')} <span aria-hidden="true">↗</span></button>`;
}

function scenes() {
  return [
    {
      title:t('从一句投资想法开始。','Start with one investing idea.'),
      name:t('虚构访客','Fictional visitor'),
      quote:t('「我愿意等五年，想找现金流稳定的企业。」','“I can wait five years. I want companies with steady cash flow.”'),
      detail:t('访客先说目标和承受风险的范围。在自己的工作室里，你也可以直接打字。','The visitor describes a goal and their appetite for risk. In your own studio, you can also type.')
    },
    {
      title:t('看看谁负责提出异议。','Give someone the job of challenging the idea.'),
      name:t('Maya · 基金经理','Maya · Fund manager'),
      quote:t('「研究席查现金流，风险席反问：现金流如果下滑，我们还愿意持有吗？」','“Research will examine cash flow. Risk will ask whether we would still hold if it fell.”'),
      detail:t('经理整理职责并提出团队草稿。你可以修改分工、投资期限和持仓上限。','The manager drafts the team’s responsibilities. You can change the roles, time horizon and position limits.')
    },
    {
      title:t('由你决定何时授权。','You decide when to authorize.'),
      name:t('独立模拟账本','Independent paper ledger'),
      quote:t('「先把这份计划留作草稿。」','“Keep this plan as a draft for now.”'),
      detail:t('在产品中，确认团队才会创建模拟基金。模拟交易另按授权和风控核账。你现在可以带走这句话，在编辑框内改成自己的想法。','Confirming the team creates a paper fund. Paper trades have separate authorization and risk checks. Take the example to your editor and make it your own.')
    }
  ];
}

export function openStudioExample({hasDraft, onUse}) {
  const origin = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.className='studio-example-dialog';
  dialog.setAttribute('aria-labelledby','example-heading');
  const frames=scenes();
  let index=0;
  function draw() {
    const item=frames[index];
    const last=index===frames.length-1;
    dialog.innerHTML=`<article><header><span>${t('虚构教学示例','Fictional walkthrough')} · ${index+1} / ${frames.length}</span><button type="button" class="ge-link" data-example="exit">${t('退出示例','Exit example')}</button></header>
      <div class="example-line" aria-hidden="true"></div>
      <h2 id="example-heading" tabindex="-1">${item.title}</h2><p class="example-person">${item.name}</p><blockquote>${item.quote}</blockquote><p>${item.detail}</p>
      <footer>${index ? `<button type="button" class="ge-link" data-example="prev">${t('上一步','Back')}</button>` : ''}
      <button type="button" class="ge-primary" data-example="${last?'use':'next'}">${last ? (hasDraft() ? t('继续我的草稿','Continue my draft') : t('带入我的草稿','Use in my draft')): t('下一步','Next')} <span aria-hidden="true">→</span></button></footer></article>`;
    dialog.querySelector('h2')?.focus({preventScroll:true});
  }
  dialog.addEventListener('click',event=>{
    const action=event.target.closest?.('[data-example]')?.dataset.example;
    if(action==='exit' || event.target===dialog) dialog.close();
    if(action==='next' || action==='prev') {
      index+=action==='next'?1:-1;
      draw();
    }
    if(action==='use') {dialog.close('use');onUse();}
  });
  dialog.addEventListener('close',()=>{
    dialog.remove();
    if(dialog.returnValue!=='use' && origin?.isConnected) origin.focus({preventScroll:true});
  },{once:true});
  // Navigating elsewhere must leave no orphaned top-layer UI.
  const navigate=()=>dialog.open && dialog.close();
  window.addEventListener('popstate',navigate);
  window.addEventListener('hashchange',navigate);
  dialog.addEventListener('close',()=>{
    window.removeEventListener('popstate',navigate);
    window.removeEventListener('hashchange',navigate);
  },{once:true});
  document.body.append(dialog);
  draw(); dialog.showModal(); dialog.querySelector('h2').focus({preventScroll:true});
}

