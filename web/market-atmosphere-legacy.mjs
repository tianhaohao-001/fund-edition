// A small orthogonal world projected through one camera. Prices are seeded
// illustration coordinates, independent of the product's financial data.
const TAU = Math.PI * 2;
const tracks = [
  {seed:12, offset:-.82, floor:-.10, curve:.04, contrast:.34, loose:true},
  {seed:29, offset:-.96, floor:.68, curve:.24, contrast:1, loose:false},
  {seed:45, offset:.20, floor:.48, curve:.01, contrast:.45, loose:true},
];
const up=['#75a99e','#47796f','#cce5da'];
const down=['#c79190','#9c666b','#f5d5cd'];
const clamp=(value,min,max)=>Math.min(max,Math.max(min,value));

function noise(seed){
  const v=Math.sin(seed*12.9898+78.233)*43758.5453;
  return v-Math.floor(v);
}

function price(i,seed){
  return 34*Math.sin(i*.28+seed)+16*Math.sin(i*.77+seed*.44)+11*Math.cos(i*1.45-seed);
}

function polygon(ctx,points,color){
  ctx.beginPath();
  ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.closePath();
  ctx.fillStyle=color;
  ctx.fill();
}

function line(ctx,start,end,color,width){
  ctx.beginPath();
  ctx.moveTo(...start);
  ctx.lineTo(...end);
  ctx.strokeStyle=color;
  ctx.lineWidth=width;
  ctx.stroke();
}

function clearOfCopy(x,y,ink){
  let strength=1;
  for(const box of ink){
    const dx=Math.max(box.left-x,0,x-box.right);
    const dy=Math.max(box.top-y,0,y-box.bottom);
    const distance=dx*dx/2600+dy*dy/1250;
    if(distance<7)strength=Math.min(strength,.035+.965*(1-Math.exp(-distance)));
  }
  return strength;
}

function paintTrack(ctx,size,track,elapsed){
  const {width,height,scale,ink}=size;
  const mobile=width<720;
  const horizonX=width*(mobile?.93:.91)+Math.sin(elapsed*.075)*width*.007;
  const horizonY=height*.27+Math.cos(elapsed*.061)*height*.006;
  const unit=Math.max(.67,scale);
  const gap=mobile?.071:.053;
  const scroll=elapsed*.25;
  const tick=Math.floor(scroll);
  const remainder=scroll-tick;
  const projection=(z,side,altitude)=>{
    // The candles and the line recede toward one horizon. The principal
    // ribbon dips below the portraits and rises back into the distant fog.
    const fx=horizonX/width+track.offset/z;
    const dip=track.curve*Math.exp(-Math.pow((fx-.57)/.32,2));
    const depth=z-altitude*unit*.00016;
    return [horizonX+(width*track.offset+side*unit)/depth,
      horizonY+(height*(track.floor+dip*z)-altitude*unit)/depth];
  };
  let farther=null;
  // Back to front gives the raised front faces real occlusion.
  for(let n=Math.ceil(6/gap);n>=0;n--){
    const z=.61+(n-remainder)*gap;
    const i=n+tick;
    const open=price(i-1,track.seed);
    const close=price(i,track.seed)+7.5*Math.sin(elapsed*.9+i*.48+track.seed);
    const middle=projection(z,0,(open+close)*.5);
    if(middle[0]<-65||middle[0]>width+65)continue;
    const distanceFade=clamp((5.25-z)/2.8,0,1);
    const legibility=clearOfCopy(...middle,ink);
    const edge=clamp(Math.abs(middle[0]/width-.5)*2,0,1);
    const strength=track.contrast*distanceFade*(.32+edge*.45)*legibility;
    const at=p=>projection(z,0,p);
    if(farther){
      ctx.globalAlpha=strength*.40;
      line(ctx,at(open),farther,'#879799',.8);
    }
    farther=at(open);
    if(strength<.012)continue;
    const color=close>=open?up:down;
    const high=Math.max(open,close),low=Math.min(Math.min(open,close),high-6.6);
    const dz=gap*.24;
    const halfWidth=mobile?3.4:5.9;
    const corner=(back,side,altitude)=>projection(z+back*dz,side*halfWidth,altitude);
    const wick=9+noise(i+track.seed)*17;
    ctx.globalAlpha=strength;
    line(ctx,at(high+wick),at(low-wick*.8),color[1],clamp(unit*1.6/z,.65,2));
    const a=corner(-1,-1,high),b=corner(-1,1,high),c=corner(1,1,high),e=corner(1,-1,high);
    polygon(ctx,[b,c,corner(1,1,low),corner(-1,1,low)],color[1]);
    polygon(ctx,[a,b,corner(-1,1,low),corner(-1,-1,low)],color[0]);
    polygon(ctx,[a,b,c,e],color[2]);
    ctx.globalAlpha=strength*.6;
    line(ctx,a,b,'#ffffff',.65);
  }
  ctx.globalAlpha=1;
}

function paintDust(context,size,time) {
  const {width,height} = size;
  const count = Math.round(clamp(width * height / 6800,45,170));
  for(let n=0;n<count;n++){
    const depth = noise(n+82), phase = noise(n+7) * TAU;
    const x = noise(n+106)*width + Math.sin(phase+time*.15)*4;
    const y = noise(n+369)*height + Math.sin(phase+time*(.22+depth*.09))*(3+depth*8);
    const wing=clamp(Math.abs(x/width-.5)*2,0,1);
    context.fillStyle = 'rgba(89,98,112,' + (.11+depth*.22)*(.65+wing*.35) + ')';
    context.beginPath();
    context.arc(x,y,.5+depth*depth*1.45,0,TAU);
    context.fill();
    if(depth>.92){
      context.fillStyle = 'rgba(111,118,131,.05)';
      context.beginPath();
      context.arc(x,y,3.8,0,TAU);
      context.fill();
    }
  }
}

export function animateMarket(canvas, toggle, text) {
  const context = canvas.getContext('2d', {alpha:true});
  if (!context) {toggle.hidden=true; return () => {};}
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false, visible = true, disposed = false, frame = 0, last = null, elapsed = 0;
  let size = {width:0,height:0,scale:1,ratio:1};
  const haze=document.createElement('canvas');
  const distant=haze.getContext('2d');
  function draw(){
    context.setTransform(size.ratio,0,0,size.ratio,0,0);
    context.clearRect(0,0,size.width,size.height);
    paintDust(context,size,elapsed);
    if(distant){
      const layerScale=.55;
      distant.setTransform(layerScale,0,0,layerScale,0,0);
      distant.clearRect(0,0,size.width,size.height);
      for(const track of tracks.filter(track=>track.loose))paintTrack(distant,size,track,elapsed);
      context.save();context.filter='blur(1.45px)';
      context.drawImage(haze,0,0,size.width,size.height);context.restore();
    }
    paintTrack(context,size,tracks[1],elapsed);
  }
  function active(){return !disposed && visible && !document.hidden && !reduced.matches && !paused;}
  function loop(now) {
    frame=0;
    if(!active() || !canvas.isConnected)return;
    const interval = size.width < 720 ? 1000/24 : 1000/30;
    if(last===null){last=now; draw();}
    else if(now-last>=interval-.5){
      elapsed+=Math.min((now-last)/1000,.12);
      last=now;
      draw();
    }
    frame=requestAnimationFrame(loop);
  }
  function schedule(){
    if(frame)cancelAnimationFrame(frame);
    frame=0; last=null;
    toggle.hidden=reduced.matches;
    toggle.setAttribute('aria-label',paused?text.resume:text.pause);
    toggle.title=paused?text.resume:text.pause;
    toggle.dataset.paused=String(paused);
    if(active())frame=requestAnimationFrame(loop);
  }
  function resize(){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    const ratio=Math.min(devicePixelRatio||1,rect.width<720?1.35:1.5);
    const ink=[...canvas.closest('.ed-lobby').querySelectorAll('.ed-invitation,.ed-person,.ed-title,.ed-description,.ed-action')].map(node=>{
      const b=node.getBoundingClientRect();
      return {left:b.left-rect.left,right:b.right-rect.left,top:b.top-rect.top,bottom:b.bottom-rect.top};
    });
    size={width:rect.width,height:rect.height,scale:Math.max(.62,Math.min(1.38,rect.width/1120)),ratio,ink};
    canvas.width=Math.round(size.width*ratio);canvas.height=Math.round(size.height*ratio);
    haze.width=Math.ceil(size.width*.55);haze.height=Math.ceil(size.height*.55);
    draw();schedule();
  }
  const observer=new IntersectionObserver(entries=>{visible=entries[0]?.isIntersecting??false;schedule();});
  const watchSize=new ResizeObserver(resize);
  const onToggle=()=>{paused=!paused;schedule();};
  toggle.addEventListener('click',onToggle);
  reduced.addEventListener('change',schedule);
  document.addEventListener('visibilitychange',schedule);
  watchSize.observe(canvas);
  observer.observe(canvas);
  return ()=>{
    disposed=true;
    if(frame)cancelAnimationFrame(frame);
    observer.disconnect();watchSize.disconnect();
    toggle.removeEventListener('click',onToggle);
    reduced.removeEventListener('change',schedule);
    document.removeEventListener('visibilitychange',schedule);
  };
}
