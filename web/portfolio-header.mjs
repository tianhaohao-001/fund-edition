const link=document.querySelector('[data-portfolio-nav]');
function reflectLanguage(){
  if(!link)return;
  const lang=document.documentElement.lang.startsWith('en')?'en-US':'zh-CN';
  link.href='/portfolio?lang='+lang;
  link.textContent=lang==='zh-CN'?'我的投资组合':'My portfolio';
}
reflectLanguage();
new MutationObserver(reflectLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
