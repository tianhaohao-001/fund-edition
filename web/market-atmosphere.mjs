// Decorative prices are generated on the device. No quote endpoint is involved.
const tau = Math.PI * 2;
const clamp = (x, low, high) => Math.min(high, Math.max(low, x));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const up = ['#548c80', '#315f57', '#bad9cd', '#417c6d'];
const down = ['#bc777d', '#8a555e', '#eed0ca', '#a5636b'];
const drift = .68;
const ticksPerBar = 7;

// Interpolate between deterministic trades, never across closed candles.
// The bounded price waves create rallies and losses around a rising baseline.
function tradeClose(index, seed) {
  return drift * index + 4.8 * Math.sin(index * .183 + seed)
    + 2.75 * Math.sin(index * .458 + seed * .61)
    + 1.85 * Math.sin(index * 1.04 - seed * .27)
    + 1.24 * Math.cos(index * 2.27 + seed * .83);
}
function random(n) {
  const hash = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return hash - Math.floor(hash);
}
function trades(index, seed) {
  const open = tradeClose(index - 1, seed), close = tradeClose(index, seed);
  const values = [open];
  for (let j = 1; j < ticksPerBar; j++) {
    const fraction = j / ticksPerBar;
    const swing = (random(index * 73 + seed * 23 + j) - .5) * 5.1 * Math.sin(Math.PI * fraction);
    values.push(mix(open, close, fraction) + swing);
  }
  values.push(close);
  return values;
}
function barAt(samples, progress) {
  const at = clamp(progress, 0, 1) * ticksPerBar;
  const seen = Math.floor(at);
  const close = mix(samples[seen], samples[Math.min(seen + 1, ticksPerBar)], smooth(at - seen));
  let high = Math.max(samples[0], close), low = Math.min(samples[0], close);
  for (let i = 1; i <= seen; i++) {
    high = Math.max(high, samples[i]);
    low = Math.min(low, samples[i]);
  }
  return { open:samples[0], high, low, close };
}
export function candleAt(index, progress, seed = 11) {
  return barAt(trades(index, seed), progress);
}

// Camera-space endpoints. Each lane has its own depth, trading speed and head.
// Offscreen tails keep breathing while newly formed bars move across the room.
const lanes = [
  {seed:46, start:[-.28,.43,1.55], end:[.87,.38,2.16], rise:.32, pace:.34, slots:88, phase:.39, strength:.44, far:true},
  {seed:73, start:[.18,.23,1.56], end:[1.29,.23,2.2], rise:.19, pace:.39, slots:94, phase:.74, strength:.38, far:true},
  {seed:38, wideOnly:true, start:[-.15,.74,1.35], end:[1.07,.66,1.87], rise:.32, pace:.37, slots:85, phase:.32, strength:.29, far:true},
  {seed:87, start:[0,.98,1.27], end:[1.21,.83,1.73], rise:.27, pace:.32, slots:83, phase:.79, strength:.50, far:true},
  {seed:12, start:[-.21,.54,1.06], end:[.83,.41,1.63], rise:.32, pace:.30, slots:66, phase:.27, strength:.73},
  {seed:31, wideOnly:true, start:[.24,.98,.94], end:[1.23,.84,1.28], rise:.45, pace:.27, slots:61, phase:.56, strength:.76},
  {seed:53, start:[-.12,1.01,.70], end:[1.11,.85,1.23], rise:.44, pace:.29, slots:58, phase:.245, strength:.88},
];
function laneView(lane, mobile) {
  if (!mobile) return lane;
  return {...lane, slots:Math.round(lane.slots * .67)};
}
function makeTape(lane) {
  const bars = new Map();
  function sample(index) {
    if (!bars.has(index)) {
      const path = trades(index, lane.seed);
      bars.set(index, {path, final:barAt(path, 1)});
    }
    return bars.get(index);
  }
  return {lane, sample, prune(before) { for (const i of bars.keys()) if (i < before) bars.delete(i); }};
}
function polygon(ctx, points, fill) {
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length; i++) ctx.lineTo(...points[i]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function stroke(ctx, a, b, color, width) {
  ctx.beginPath();
  ctx.moveTo(...a);
  ctx.lineTo(...b);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}
function fadeAroundText(x, y, boxes) {
  let nearest = 18;
  for (const b of boxes) {
    const dx = Math.max(b.left - x, 0, x - b.right);
    const dy = Math.max(b.top - y, 0, y - b.bottom);
    nearest = Math.min(nearest, dx * dx / 750 + dy * dy / 500);
  }
  return .055 + .945 * (1 - Math.exp(-nearest * .82));
}
function projectedPoint(lane, view, t, altitude) {
  const [ax, ay, az] = lane.start, [bx, by, bz] = lane.end;
  const z = mix(az, bz, t);
  return [
    view.width * mix(ax * az, bx * bz, t) / z,
    view.height * mix(ay * az, by * bz, t) / z - altitude * view.height * lane.rise / (drift * lane.slots) * bz / z,
    z,
  ];
}
function paintLane(ctx, view, tape, elapsed) {
  const lane = tape.lane, count = lane.slots;
  const headTime = elapsed / lane.pace + lane.phase * count;
  const head = Math.floor(headTime), partial = headTime - head;
  const trail = Math.round(count * (lane.far ? .75 : .62)), first = head - trail;
  tape.prune(first - 2);
  // A tape wraps on its own plane. Positions and OHLC of completed bars stay
  // fixed until the tail fades. Separate cycles never acquire a connecting edge.
  let previous = null, lastClose = null, previousCycle = null, basePrice = 0;
  for (let i = first; i <= head; i++) {
    const slot = ((i % count) + count) % count;
    const cycleStart = i - slot;
    if (cycleStart !== previousCycle) {
      basePrice = tradeClose(cycleStart - 1, lane.seed);
      previousCycle = cycleStart;
    }
    const live = i === head;
    const sample = tape.sample(i);
    const bar = live ? barAt(sample.path, partial) : sample.final;
    const center = (slot + .5) / count;
    const at = p => projectedPoint(lane, view, center, p - basePrice);
    const [x, yClose, z] = at(bar.close);
    const [, yOpen] = at(bar.open);
    const y = (yOpen + yClose) / 2;
    if (x < -30 || x > view.width + 30 || y < -60 || y > view.height + 60) { previous = null; lastClose = null; continue; }
    const read = fadeAroundText(x, y, view.boxes);
    const trailFade = clamp((i - first + 1) / 12, 0, 1);
    const alpha = lane.strength * trailFade * read;
    const color = bar.close >= bar.open ? up : down;
    const nextX = projectedPoint(lane, view, center + 1 / count, 0)[0];
    const gap = nextX - x;
    const half = Math.max(.75, gap * (lane.far ? .23 : .25));
    const depth = Math.max(.65, Math.min(half * .57, 3.1 / z));
    const top = Math.min(yOpen, yClose), bottom = Math.max(top + .85, yOpen, yClose);
    const finish = [x + half * (live ? 2 * partial - 1 : 1), yClose];
    if (slot && previous && alpha > .025) {
      ctx.globalAlpha = alpha * .36;
      stroke(ctx, previous, [x - half, yOpen], '#8b99a9', lane.far ? .55 : .75);
    }
    const fromHead = head - i;
    if (slot && lastClose && fromHead < 16) {
      const shimmer = 1 - fromHead / 16;
      ctx.globalAlpha = alpha * (.42 + .46 * shimmer);
      stroke(ctx, lastClose, finish, color[1], (lane.far ? 1 : 1.65) * shimmer + .35);
    }
    previous = finish;
    lastClose = finish;
    if (alpha < .023) continue;
    ctx.globalAlpha = alpha * .90;
    stroke(ctx, at(bar.high), at(bar.low), color[1], Math.max(.8, 1.35 / z));
    ctx.globalAlpha = alpha;
    polygon(ctx, [[x-half,top],[x+half,top],[x+half,bottom],[x-half,bottom]], color[0]);
    polygon(ctx, [[x+half,top],[x+half+depth,top-depth*.72],[x+half+depth,bottom-depth*.72],[x+half,bottom]], color[1]);
    polygon(ctx, [[x-half,top],[x-half+depth,top-depth*.72],[x+half+depth,top-depth*.72],[x+half,top]], color[2]);
    if (live) {
      // The small terminal light follows the trade that is actually printing.
      const radius = Math.max(2.5, (lane.far ? 4.3 : 5.2) / z);
      ctx.globalAlpha = alpha * .28;
      ctx.beginPath(); ctx.arc(finish[0], finish[1], radius * 2.6, 0, tau);
      ctx.fillStyle = color[0]; ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(finish[0], finish[1], radius, 0, tau);
      ctx.fillStyle = color[3]; ctx.fill();
      ctx.beginPath(); ctx.arc(finish[0], finish[1], radius * .43, 0, tau);
      ctx.fillStyle = '#f9fbfd'; ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function makeDust(width, height) {
  const count = Math.round(clamp(width * height / 2350, 170, 550));
  return Array.from({length:count}, (_, i) => {
    const z = random(i+7);
    return {x:random(i+801)*width, y:random(i+1413)*height, phase:random(i+2241)*tau,
      speed:.18+.51*z, amplitude:2+7*z, radius:.34+z*z*1.16, alpha:.12+z*.23};
  });
}
function paintDust(ctx, dots, time) {
  ctx.fillStyle = '#8391a6';
  for (const d of dots) {
    const phase = d.phase+time*d.speed;
    const x = d.x+Math.sin(phase*.58)*d.amplitude*.52, y=d.y+Math.sin(phase)*d.amplitude;
    ctx.globalAlpha = d.alpha;
    ctx.beginPath(); ctx.arc(x,y,d.radius,0,tau); ctx.fill();
    if (d.radius > 1.31) {
      ctx.globalAlpha = .055;
      ctx.beginPath(); ctx.arc(x,y,d.radius*2.48,0,tau); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function animateMarket(canvas, toggle, text) {
  const ctx = canvas.getContext('2d', {alpha:true});
  if (!ctx) { toggle.hidden = true; return () => {}; }
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const fog = document.createElement('canvas'), distant = fog.getContext('2d');
  let paused = media.matches, visible = true, disposed = false;
  let last = null, frame = 0, elapsed = 0, view = null, tapes = [], dots = [];
  function draw() {
    if (!view) return;
    ctx.setTransform(view.ratio,0,0,view.ratio,0,0);
    ctx.clearRect(0,0,view.width,view.height);
    paintDust(ctx,dots,elapsed);
    if (distant) {
      distant.setTransform(.55,0,0,.55,0,0);
      distant.clearRect(0,0,view.width,view.height);
      for (const tape of tapes) if (tape.lane.far) paintLane(distant,view,tape,elapsed);
      ctx.save();
      ctx.filter='blur(1.05px)';
      ctx.drawImage(fog,0,0,view.width,view.height);
      ctx.restore();
    }
    for (const tape of tapes) if (!tape.lane.far || !distant) paintLane(ctx,view,tape,elapsed);
  }
  function running(){return !disposed && visible && !document.hidden && !paused && view;}
  function loop(now) {
    frame=0;
    if (!running() || !canvas.isConnected) return;
    const interval = view.mobile ? 1000/24 : 1000/30;
    if (last===null) last=now;
    if (now-last >= interval-.5) {
      elapsed += Math.min((now-last)/1000,.2);
      last=now;
      draw();
    }
    frame=requestAnimationFrame(loop);
  }
  function schedule() {
    if (frame) cancelAnimationFrame(frame);
    frame=0; last=null;
    toggle.hidden=false;
    toggle.setAttribute('aria-label',paused?text.resume:text.pause);
    toggle.title=paused?text.resume:text.pause;
    toggle.dataset.paused=String(paused);
    if (running()) frame=requestAnimationFrame(loop);
  }
  function resize() {
    const rect=canvas.getBoundingClientRect();
    if(!rect.width || !rect.height)return;
    const mobile=rect.width<720;
    const ratio=Math.min(devicePixelRatio||1,mobile?1.35:1.5);
    const boxes=[...canvas.closest('.ed-lobby').querySelectorAll('.ed-invitation,.ed-portrait,.ed-person,.ed-title,.ed-description,.ed-action')].map(node=>{
      const b=node.getBoundingClientRect();
      return {left:b.left-rect.left,right:b.right-rect.left,top:b.top-rect.top,bottom:b.bottom-rect.top};
    });
    view={width:rect.width,height:rect.height,mobile,ratio,boxes};
    canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);
    fog.width=Math.ceil(rect.width*.55);fog.height=Math.ceil(rect.height*.55);
    const activeLanes=lanes.filter(lane=>!mobile || !lane.wideOnly);
    tapes=activeLanes.map(lane=>makeTape(laneView(lane,mobile)));
    dots=makeDust(rect.width,rect.height);
    draw();schedule();
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;schedule();});
  const sizeObserver=new ResizeObserver(resize);
  const onToggle=()=>{paused=!paused;schedule();};
  const onPreference=()=>{paused=media.matches;schedule();};
  toggle.addEventListener('click',onToggle);
  media.addEventListener('change',onPreference);
  document.addEventListener('visibilitychange',schedule);
  sizeObserver.observe(canvas);observer.observe(canvas);
  return ()=>{
    disposed=true;
    if(frame)cancelAnimationFrame(frame);
    observer.disconnect();sizeObserver.disconnect();
    toggle.removeEventListener('click',onToggle);
    media.removeEventListener('change',onPreference);
    document.removeEventListener('visibilitychange',schedule);
  };
}
