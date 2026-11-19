import { getLanguage, setLanguage, t, LANGUAGES } from './i18n.mjs';
function render() {
  document.documentElement.lang = getLanguage();
  document.title = t('Fund Edition · 暂时离线', 'Fund Edition · Offline');
  document.querySelector('main > img').alt = t('Fund Edition', 'Fund Edition');
  document.querySelector('h1').textContent = t('工作台暂时离线', 'Your workspace is offline');
  document.querySelector('main > p').textContent = t('连接网络或重新启动本机服务后，就能继续和团队对话、读取模拟账户。', 'Connect to the network or restart the local service to return to your team and simulated accounts.');
  document.querySelector('.install-retry').textContent = t('重新打开', 'Try again');
  document.querySelector('[data-offline-languages]').replaceChildren(...LANGUAGES.map(({id,label}) => {
    const button = document.createElement('button');
    button.className = 'install-control'; button.textContent = label; button.type = 'button';
    button.setAttribute('aria-pressed', String(getLanguage() === id));
    button.onclick = () => { setLanguage(id); render(); };
    return button;
  }));
}
render();
