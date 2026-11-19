import { t } from './i18n.mjs';
const footer = document.querySelector('.site-footer');
const standalone = window.matchMedia('(display-mode: standalone)');
let installPrompt;
let installButton;
function helpCopy() {
  return `<h2 id="install-title">${t('安装Fund Edition', 'Install Fund Edition')}</h2>
    <p>${t('把Fund Edition放到主屏幕，下次可直接打开。', 'Add Fund Edition to your home screen for your next visit.')}</p>
    <dl><dt>${t('电脑 Edge', 'Desktop Edge')}</dt><dd>${t('打开浏览器菜单，选择', 'Open the browser menu and choose ')}<strong>${t('应用 → 安装Fund Edition', 'Apps → Install Fund Edition')}</strong>.</dd>
      <dt>Android</dt><dd>${t('在 Chrome 菜单中选择', 'In the Chrome menu, choose ')}<strong>${t('安装应用', 'Install app')}</strong>${t('或', ' or ')}<strong>${t('添加到主屏幕', 'Add to Home screen')}</strong>.</dd>
      <dt>${t('iPhone 或 iPad', 'iPhone or iPad')}</dt><dd>${t('在 Safari 选择', 'In Safari, choose ')}<strong>${t('分享 → 添加到主屏幕', 'Share → Add to Home Screen')}</strong>${t('，如有提示，开启', '. If offered, enable ')}<strong>${t('作为 Web App 打开', 'Open as Web App')}</strong>.</dd>
    </dl><form method="dialog"><button class="install-control" autofocus>${t('知道了', 'Got it')}</button></form>`;
}
function installHelp() {
  const dialog = document.createElement('dialog');
  dialog.className = 'install-help';
  dialog.setAttribute('aria-labelledby', 'install-title');
  dialog.innerHTML = helpCopy();
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  dialog.showModal();
}
if (footer && !standalone.matches && !navigator.standalone) {
  installButton = document.createElement('button');
  installButton.className = 'install-control';
  installButton.type = 'button';
  footer.append(installButton);
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; reflectLanguage(); });
  installButton.addEventListener('click', async () => {
    if (installPrompt) {
      const prompt = installPrompt; installPrompt = null; reflectLanguage();
      try { await prompt.prompt(); } catch { installHelp(); }
      return;
    }
    installHelp();
  });
  window.addEventListener('appinstalled', () => installButton.remove(), { once: true });
}
const networkNotice = document.createElement('p');
networkNotice.className = 'install-network-notice';
networkNotice.setAttribute('role', 'status');
document.querySelector('main')?.prepend(networkNotice);
function reflectLanguage() {
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) manifest.setAttribute('href', t('/manifest.webmanifest', '/manifest-en.webmanifest'));
  if (installButton) installButton.textContent = installPrompt ? t('安装应用', 'Install app') : t('安装到设备', 'Install on device');
  networkNotice.textContent = t('当前离线。连接网络或重新启动本机服务后继续。', 'You are offline. Connect to the network or restart the local service to continue.');
  const dialog = document.querySelector('dialog.install-help');
  if (dialog) dialog.innerHTML = helpCopy();
}
function reflectNetwork() { networkNotice.hidden = navigator.onLine; }
window.addEventListener('morrowfolio-language-change', reflectLanguage);
window.addEventListener('offline', reflectNetwork);
window.addEventListener('online', reflectNetwork);
reflectLanguage(); reflectNetwork();
if (window.isSecureContext && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(() => {});
