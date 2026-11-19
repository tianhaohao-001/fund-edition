const languages = [
  ['zh-CN', '中文', '简体中文'],
  ['en-US', 'EN', 'English'],
];

export function paintLanguagePicker(host, current, change) {
  if (!host) return;
  host.classList.add('brand-language');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', current === 'en-US' ? 'Interface language' : '界面语言');
  for (const [id, label, name] of languages) {
    let button = host.querySelector('[lang="' + id + '"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.lang = id;
      button.textContent = label;
      button.setAttribute('aria-label', name);
      host.append(button);
    }
    button.setAttribute('aria-pressed', String(id === current));
    button.onclick = () => { if (id !== current) change(id); };
  }
}
