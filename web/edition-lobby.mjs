const svgNS = 'http://www.w3.org/2000/svg';
let returningTo;

// Removing the lobby during SPA navigation also stops its camera loop.
class MarketScene extends HTMLElement {
  async connectedCallback(){
    const generation=this.generation=Symbol();
    const previous=new URL(location.href).searchParams.get('scene')==='previous';
    const {animateMarket}=previous?await import('./market-atmosphere-legacy.mjs'):await import('./market-atmosphere.mjs');
    if(this.generation!==generation||!this.isConnected)return;
    this.stopScene=animateMarket(this.querySelector('canvas'),this.playback,this.labels);
  }
  disconnectedCallback(){
    this.generation=null;
    this.stopScene?.();
    this.stopScene=null;
  }
}
if(!customElements.get('edition-market-scene'))customElements.define('edition-market-scene',MarketScene);

export function editionReviewMode(){
  const value=new URL(location.href).searchParams.get('lobby');
  return ['motion','static','original'].includes(value)?value:'motion';
}

export function syncEditionBrand(){
  const value=editionReviewMode();
  const preview=value==='static'||value==='motion';
  const previous=preview&&new URL(location.href).searchParams.get('scene')==='previous';
  document.documentElement.dataset.identity=!preview?'original':previous?'fold':'signature';
  document.documentElement.toggleAttribute('data-edition-fold',preview);
  const favicon=document.querySelector('link[rel="icon"]');
  if(favicon)favicon.href=!preview?'/assets/fund-editions-mark.svg':previous?'/assets/edition-fold.svg':'/assets/signature-mark.svg';
  return preview?value:null;
}

function reviewMode(t,root,atmosphere){
  const value=syncEditionBrand();
  if(!value)return;
  root.dataset.look=value;
  const controls=element('nav','ed-review-controls');
  controls.setAttribute('aria-label',t('比较大厅背景','Compare lobby backgrounds'));
  for(const [mode,label] of [['static',t('静景','Still')],['motion',t('动景','Motion')]]){
    const option=element('a','ed-review-option',label);
    const url=new URL(location.href);
    url.searchParams.set('lobby',mode);
    option.href=url.href;
    if(value===mode)option.setAttribute('aria-current','page');
    controls.append(option);
  }
  if(value==='motion'){
    const playback=element('button','ed-playback');
    playback.type='button';
    const icon=document.createElementNS(svgNS,'svg');
    icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('aria-hidden','true');
    for(const [name,shape] of [['pause','M7 5h3v14H7zm7 0h3v14h-3z'],['play','M8 4.5 19 12 8 19.5z']]){
      const path=document.createElementNS(svgNS,'path');
      path.setAttribute('class',name);path.setAttribute('d',shape);icon.append(path);
    }
    playback.append(icon);
    const scene=element('edition-market-scene','ed-market');
    scene.playback=playback;
    scene.labels={pause:t('暂停背景动画','Pause background animation'),resume:t('继续背景动画','Resume background animation')};
    playback.setAttribute('aria-label',scene.labels.pause);
    scene.append(element('canvas'));
    atmosphere.append(scene);
    controls.append(playback);
  }
  root.append(controls);
}

syncEditionBrand();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function arrow() {
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svgNS, 'path');
  path.setAttribute('d', 'M4.5 12h14.5m-6-6 6 6-6 6');
  svg.append(path);
  return svg;
}

function destination(t, key, url, enter) {
  const studio = key === 'studio';
  const link = element('a', 'ed-door ed-' + key);
  link.href = url;
  link.dataset.edition = key;
  link.dataset.command = studio ? 'open-studio' : 'browse';
  const lens = element('div', 'ed-stage');
  lens.setAttribute('aria-hidden', 'true');
  const portrait = element('span', 'ed-portrait');
  const ring = element('span', 'ed-ring');
  lens.append(portrait, ring);
  const name = element('span','ed-person', studio ? 'Maya Chen' : t('沃伦·巴菲特','Warren Buffett'));
  const heading = element('h2','ed-title', studio ? t('自建 AI 基金','Build an AI fund') : t('挑选 AI 基金','Explore AI funds'));
  const description = element('p','ed-description', studio
    ? t('和 Maya 聊聊你的想法，一起组建基金团队。','Turn your idea into a fund with Maya and your own team.')
    : t('体验巴菲特等名家的风格基金，看 AI 怎样重建热门主动基金的策略。','Buffett-inspired funds and AI reconstructions of popular active funds.'));
  const action = element('span','ed-action');
  action.append(element('span','',studio ? t('见见 Maya','Meet Maya') : t('走进基金馆','Enter the fund gallery')),arrow());
  heading.id = 'ed-title-' + key;
  description.id = 'ed-desc-' + key;
  link.setAttribute('aria-labelledby',heading.id);
  link.setAttribute('aria-describedby',description.id);
  link.append(lens, name, heading, description, action);
  link.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bounds = link.getBoundingClientRect();
    link.style.setProperty('--tilt', ((event.clientX - bounds.left) / bounds.width - .5) * 4 + 'deg');
    link.style.setProperty('--glint', Math.round(100*(event.clientX - bounds.left)/bounds.width) + '%');
  }, {passive:true});
  link.addEventListener('pointerleave', () => link.style.removeProperty('--tilt'));
  link.addEventListener('click', event => {
    if (!enter || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    returningTo = key;
    const from = portrait.getBoundingClientRect();
    const target = enter();
    if (!target || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (studio) {
      const arrival = target.querySelector('.receiver-photo') || target;
      const to = arrival.getBoundingClientRect();
      if (to.width > 0) {
        const dx = from.left + from.width/2 - to.left - to.width/2;
        const dy = from.top + from.height/2 - to.top - to.height/2;
        arrival.animate([
          {transform:'translate('+dx+'px,'+dy+'px) scale('+from.width/to.width+')',filter:'blur(.2px)'},
          {filter:'blur(3px)',offset:.38},
          {transform:'none',filter:'blur(0px)'}
        ],{duration:480,easing:'cubic-bezier(.22,.72,.23,1)'});
      }
    } else {
      target.animate([{opacity:.25,filter:'blur(5px)',transform:'translateY(8px)'},{opacity:1,filter:'blur(0px)',transform:'none'}],
        {duration:400,easing:'cubic-bezier(.2,.68,.2,1)'});
    }
  });
  return link;
}

export function createEditionLobby({t,studioURL,fundsURL,onStudio,onFunds}) {
  const root = element('section','ed-lobby');
  const title = element('h1','ed-invitation');
  title.append(element('span','ed-phrase',t('你想让 AI 团队','What should ')),element('span','ed-phrase',t('做什么？','your AI team do?')));
  title.id = 'edition-invitation';
  root.setAttribute('aria-labelledby',title.id);
  const atmosphere = element('div','ed-atmosphere');
  atmosphere.setAttribute('aria-hidden','true');
  atmosphere.append(element('span','ed-light-maya'),element('span','ed-light-folio'));
  const spread = element('div','ed-spread');
  spread.append(destination(t,'studio',studioURL,onStudio),destination(t,'funds',fundsURL,onFunds));
  root.append(atmosphere,title,spread);
  reviewMode(t,root,atmosphere);
  if (returningTo) {
    const previous = spread.querySelector('[data-edition="'+returningTo+'"]');
    returningTo = null;
    queueMicrotask(() => { if (previous?.isConnected) previous.focus({preventScroll:true}); });
  }
  return root;
}
