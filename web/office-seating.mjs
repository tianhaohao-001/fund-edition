import { t } from './i18n.mjs';

const deskIds = new Set(['management', 'research', 'risk', 'execution', 'bench']);

export function bindOfficeSeating(root, { fundId, onMove, isBusy = () => false, onFirstVisible } = {}) {
  const room = root.matches?.('[data-office-room]') ? root : root.querySelector('[data-office-room]');
  if (!fundId || room?.dataset.fundId !== fundId || typeof onMove !== 'function') return () => {};
  const doc = room.ownerDocument;
  const win = doc.defaultView;
  const events = new AbortController();
  const destinations = [...room.querySelectorAll('button[data-seat-destination]')];
  const cancelButton = room.querySelector('[data-seat-cancel]');
  const announcement = room.querySelector('[data-seat-announcement]');
  let person, pointer, hit, ghost, scrollFrame = 0, posting = false, swallowClick = false;

  function listen(node, type, listener, options = {}) {
    node.addEventListener(type, listener, {...options, signal: events.signal});
  }
  function say(message) { if (announcement) announcement.textContent = message; }
  function belongs(element) {
    return room.isConnected && room.dataset.fundId === fundId && element?.closest('[data-office-room]') === room;
  }
  function eligible(desk) {
    return person && belongs(person) && deskIds.has(desk) && desk !== person.dataset.currentDesk;
  }
  function mark(zone) {
    if (zone === hit) return;
    hit?.classList.remove('is-drop-target');
    hit = zone;
    hit?.classList.add('is-drop-target');
  }
  function clear() {
    const previousPointer = pointer;
    pointer = null;
    if (previousPointer?.handle.hasPointerCapture?.(previousPointer.id)) previousPointer.handle.releasePointerCapture(previousPointer.id);
    if (scrollFrame) win.cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    ghost?.remove();
    ghost = null;
    mark(null);
    person?.classList.remove('is-seat-moving');
    person?.querySelector('[data-seat-handle]')?.setAttribute('aria-pressed', 'false');
    person = null;
    delete room.dataset.seatMode;
    for (const button of destinations) button.hidden = true;
    if (cancelButton) cancelButton.hidden = true;
  }
  function cancel({focus = false, notify = false} = {}) {
    const handle = person?.querySelector('[data-seat-handle]') ?? pointer?.handle;
    if (pointer) swallowClick = true;
    clear();
    if (focus && belongs(handle)) handle.focus({preventScroll:true});
    if (notify) say(t('已取消换岗。','Desk move canceled.'));
  }
  function place(member, mode) {
    person?.classList.remove('is-seat-moving');
    person?.querySelector('[data-seat-handle]')?.setAttribute('aria-pressed', 'false');
    person = member;
    room.dataset.seatMode = mode;
    person.classList.add('is-seat-moving');
    person.querySelector('[data-seat-handle]').setAttribute('aria-pressed', 'true');
    // Pointer targets must stay under the finger; placing controls would move the entire floor.
    if (mode === 'dragging') return;
    for (const button of destinations) button.hidden = !eligible(button.dataset.seatDestination);
    if (cancelButton) cancelButton.hidden = false;
    const name = member.dataset.memberName || member.dataset.officeMember;
    say(t('正在为' + name + '选择工位。', 'Choose a desk for ' + name + '.'));
  }
  async function submit(zone) {
    if (!belongs(zone) || !eligible(zone.dataset.officeDesk) || posting || isBusy()) { cancel({notify:true}); return; }
    const memberId = person.dataset.officeMember, desk = zone.dataset.officeDesk;
    const name = person.dataset.memberName || memberId, label = zone.dataset.deskLabel || desk;
    posting = true;
    clear();
    say(t('正在保存工位…', 'Saving the desk assignment…'));
    try {
      const saved = await onMove(memberId, desk);
      if (belongs(zone) && !events.signal.aborted) {
        if (saved === true) say(t(name + '已调到' + label + '。', name + ' moved to ' + label + '.'));
        if (saved === false) say(t('未能确认新工位，请核对后重试。', 'The move could not be confirmed. Check the desk and try again.'));
      }
    } catch {
      if (belongs(zone) && !events.signal.aborted) say(t('未能确认新工位，请核对后重试。', 'The move could not be confirmed. Check the desk and try again.'));
    } finally { posting = false; }
  }
  function zoneAt(x,y) {
    const zone = doc.elementFromPoint(x,y)?.closest('[data-office-desk]');
    return belongs(zone) && eligible(zone.dataset.officeDesk) ? zone : null;
  }
  function track() {
    if (!pointer || !ghost) return;
    ghost.style.left = pointer.x + 'px';
    ghost.style.top = pointer.y + 'px';
    mark(zoneAt(pointer.x,pointer.y));
  }
  function edgeScroll() {
    scrollFrame = 0;
    if (!pointer || !ghost) return;
    const {x,y} = pointer, height = win.innerHeight;
    const bounds = room.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < 0 || y > height) return;
    const edge = 54;
    const delta = y < edge && bounds.top < 0 ? -Math.ceil((edge-y)/5) :
      y > height-edge && bounds.bottom > height ? Math.ceil((y-height+edge)/5) : 0;
    if (!delta) return;
    const before = win.scrollY;
    win.scrollBy({top:delta, behavior:'instant'});
    track();
    if (win.scrollY !== before) scrollFrame = win.requestAnimationFrame(edgeScroll);
  }
  function makeGhost(handle) {
    ghost = doc.createElement('div');
    ghost.className = 'office-drag-ghost';
    ghost.setAttribute('aria-hidden','true');
    ghost.inert = true;
    const portrait = handle.querySelector('.person-portrait, img')?.cloneNode(true);
    if (portrait) {
      portrait.removeAttribute('id');
      ghost.append(portrait);
    }
    else ghost.textContent = (person.dataset.memberName || person.dataset.officeMember).slice(0,1);
    Object.assign(ghost.style, {position:'fixed', pointerEvents:'none', transform:'translate(-50%,-50%)'});
    doc.body.append(ghost);
  }
  function validHandle(handle) {
    const member = handle?.closest('[data-office-member]');
    return belongs(member) && member.dataset.officeMember && deskIds.has(member.dataset.currentDesk) ? member : null;
  }
  for (const button of destinations) button.hidden = true;
  if (cancelButton) cancelButton.hidden = true;
  listen(room,'dragstart', event => {
    if (event.target.closest('[data-seat-handle]')) event.preventDefault();
  });
  listen(doc,'pointerdown', event => {
    if (pointer && event.pointerId !== pointer.id) { cancel({notify:true}); return; }
    if (!event.isPrimary || event.button !== 0) return;
    swallowClick = false;
    const handle = event.target.closest('[data-seat-handle]');
    const member = validHandle(handle);
    if (!member) {
      if (person && !belongs(event.target)) cancel();
      return;
    }
    if (posting || isBusy() || handle.disabled) return;
    pointer = {id:event.pointerId, handle, member, startX:event.clientX, startY:event.clientY, x:event.clientX, y:event.clientY};
    handle.setPointerCapture?.(event.pointerId);
  }, {capture:true});
  listen(doc,'pointermove',event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (isBusy() || !validHandle(pointer.handle)) { cancel(); return; }
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (!ghost) {
      if (Math.hypot(pointer.x-pointer.startX,pointer.y-pointer.startY) < 6) return;
      place(pointer.member,'dragging');
      makeGhost(pointer.handle);
    }
    if (event.cancelable) event.preventDefault();
    track();
    if (!scrollFrame) scrollFrame = win.requestAnimationFrame(edgeScroll);
  }, {passive:false});
  listen(doc,'pointerup', event => {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (!ghost) { pointer=null; return; }
    const zone = zoneAt(event.clientX,event.clientY);
    swallowClick = true;
    if (event.cancelable) event.preventDefault();
    if (zone) void submit(zone); else cancel({notify:true});
  });
  const pointerCanceled = event => { if (pointer?.id === event.pointerId) cancel({notify:true}); };
  listen(doc,'pointercancel',pointerCanceled);
  listen(room,'lostpointercapture',pointerCanceled);
  listen(win,'blur',() => { if (pointer || person) cancel(); });
  listen(room,'click', event => {
    if (swallowClick && event.detail !== 0) {
      event.preventDefault(); event.stopImmediatePropagation(); swallowClick=false; return;
    }
    const target = event.target.closest('[data-seat-handle],[data-seat-destination],[data-seat-cancel]');
    if (!belongs(target)) return;
    event.preventDefault(); event.stopPropagation();
    if (posting || isBusy()) return;
    if (target.hasAttribute('data-seat-cancel')) { cancel({focus:true, notify:true}); return; }
    if (target.hasAttribute('data-seat-destination')) {
      const zone=target.closest('[data-office-desk]');
      if (!target.hidden && target.dataset.seatDestination === zone?.dataset.officeDesk) void submit(zone);
      return;
    }
    const member=validHandle(target);
    if (!member) return;
    if (member===person) { cancel({focus:true, notify:true}); return; }
    place(member,'placing');
    if (event.detail===0) destinations.find(button=>!button.hidden && !button.disabled)?.focus();
  }, {capture:true});
  listen(doc,'keydown', event => {
    if (event.key==='Escape' && (person || pointer)) {
      event.preventDefault(); cancel({focus:true, notify:true}); return;
    }
    if (!person || !belongs(event.target) || !event.target.matches('[data-seat-destination]')) return;
    const step = {ArrowRight:1, ArrowDown:1, ArrowLeft:-1, ArrowUp:-1}[event.key];
    if (!step) return;
    const buttons = destinations.filter(button => !button.hidden && !button.disabled);
    if (!buttons.length) return;
    event.preventDefault();
    buttons[(buttons.indexOf(event.target)+step+buttons.length)%buttons.length].focus();
  });
  if (typeof onFirstVisible === 'function') {
    const scene = room.querySelector('.crew-scene') ?? room;
    let shown = false;
    const arrive = () => {
      if (shown || events.signal.aborted || !belongs(scene)) return;
      shown = true;
      onFirstVisible(room);
    };
    if (win.IntersectionObserver) {
      const observer = new win.IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.06)) {
          observer.disconnect();
          arrive();
        }
      }, {rootMargin:'0px 0px -5% 0px', threshold:0.06});
      events.signal.addEventListener('abort', () => observer.disconnect(), {once:true});
      observer.observe(scene);
    } else {
      const checkScene = () => {
        if (shown || events.signal.aborted) return;
        const rect = scene.getBoundingClientRect();
        const width = Math.min(win.innerWidth,rect.right)-Math.max(0,rect.left);
        const height = Math.min(win.innerHeight*.95,rect.bottom)-Math.max(0,rect.top);
        if (width > 0 && height > 0 && width*height >= rect.width*rect.height*.06) arrive();
      };
      listen(win,'scroll',checkScene,{passive:true});
      listen(win,'resize',checkScene);
      queueMicrotask(checkScene);
    }
  }
  return () => { events.abort(); clear(); };
}
