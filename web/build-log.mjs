const query = new URLSearchParams(location.search);
const chinese = query.get('lang') === 'zh-CN' || location.hash === '#zh';
const active = chinese ? 'zh-CN' : 'en-US';
document.documentElement.lang = active;
document.documentElement.dataset.language = chinese ? 'zh' : 'en';
document.title = chinese ? 'Fund Edition · Maya 在公网沉默的那一晚' : "Fund Edition · How the AI teams and paper-trading system work";
document.querySelector('.language a[lang="' + active + '"]').setAttribute('aria-current', 'true');
document.querySelector('.brand').href = '/?lang=' + active;
const small = window.matchMedia('(max-width: 620px)');
function setImageLinks() {
  for (const anchor of document.querySelectorAll('[data-mobile-image]')) {
    anchor.href = small.matches ? anchor.dataset.mobileImage : anchor.querySelector('img').getAttribute('src');
  }
}
setImageLinks();
small.addEventListener('change', setImageLinks);
