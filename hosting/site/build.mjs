import { mkdir,readFile,writeFile,cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join,resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const here=fileURLToPath(new URL('.',import.meta.url)),root=resolve(here,'../..');
const checkout=process.argv[2];if(!checkout)throw Error('Supply the registered Sites checkout directory');
const stage=resolve(checkout),directBuild=process.argv.includes('--direct');
const manifest=directBuild?{}:JSON.parse(await readFile(join(stage,'.openai/hosting.json'),'utf8'));
if(!directBuild&&manifest.project_id!=='appgprj_6afd70a330b881919678eeae88979ecf')throw Error('Unexpected Site identity');
const assets={};
assets['/full-app-link.mjs']=['text/javascript; charset=utf-8',await readFile(join(here,'full-app-link.mjs'),'utf8'),false];
assets['/cloud-team.js']=['text/javascript; charset=utf-8',await readFile(join(here,'cloud-team.js'),'utf8'),false];
assets['/buffett-dossier.css']=['text/css; charset=utf-8',await readFile(join(root,'web/buffett-dossier.css'),'utf8'),false];
for(const [route,file,type] of [
 ['/app.html','hosting/site/app.html','text/html'],
 ['/manifest.webmanifest','web/manifest.webmanifest','application/manifest+json'],['/manifest-en.webmanifest','web/manifest-en.webmanifest','application/manifest+json'],
 ['/favicon.ico','web/favicon.ico','image/x-icon'],
 ['/studio-floor.css','web/studio-floor.css','text/css'],['/assets/studio-interior.jpg','web/assets/studio-interior.jpg','image/jpeg'],['/assets/studio/team-portraits.png','web/assets/studio/team-portraits.png','image/png'],
 ['/brand.css','web/brand.css','text/css'],['/assets/signature-mark.svg','web/assets/signature-mark.svg','image/svg+xml'],
 ['/language-picker.mjs','web/language-picker.mjs','text/javascript'],
 ['/membership.html','web/membership.html','text/html'],['/membership.css','web/membership.css','text/css'],
 ['/membership-view.mjs','web/membership-view.mjs','text/javascript'],['/membership-plan.mjs','web/membership-plan.mjs','text/javascript'],
 ['/one-time-membership.mjs','web/one-time-membership.mjs','text/javascript'],
 ['/i18n.mjs','web/i18n.mjs','text/javascript'],
 ['/assets/lynch-research-study.jpg','web/assets/lynch-research-study.jpg','image/jpeg'],['/assets/gill-research-study.jpg','web/assets/gill-research-study.jpg','image/jpeg'],
 ['/strategy-salon.mjs','web/strategy-salon.mjs','text/javascript'],['/strategy-salon.css','web/strategy-salon.css','text/css'],['/salon-recordings.mjs','web/salon-recordings.mjs','text/javascript'],
 ['/assets/buffett-selectusa-2015.jpg','web/assets/buffett-selectusa-2015.jpg','image/jpeg'],['/assets/cathie-wood-salon.webp','web/assets/cathie-wood-salon.webp','image/webp'],['/assets/ray-dalio-salon.webp','web/assets/ray-dalio-salon.webp','image/webp'],
 ['/assets/meeting-room.jpg','web/assets/meeting-room.jpg','image/jpeg'],
 ['/recorded-team.mjs','web/recorded-team.mjs','text/javascript'],['/recorded-team.css','web/recorded-team.css','text/css'],
 ['/edition-lobby.mjs','web/edition-lobby.mjs','text/javascript'],['/edition-lobby.css','web/edition-lobby.css','text/css'],
 ['/market-atmosphere.mjs','web/market-atmosphere.mjs','text/javascript'],['/assets/edition-fold.svg','web/assets/edition-fold.svg','image/svg+xml'],
 ['/market-atmosphere-legacy.mjs','web/market-atmosphere-legacy.mjs','text/javascript'],
 ['/assets/edition-studio.webp','web/assets/edition-studio.webp','image/webp'],['/assets/edition-research.webp','web/assets/edition-research.webp','image/webp'],
 ['/assets/fund-editions-mark.svg','web/assets/fund-editions-mark.svg','image/svg+xml'],
 ['/reception.mjs','web/reception.mjs','text/javascript'],['/reception.css','web/reception.css','text/css'],
 ['/voice.mjs','web/voice.mjs','text/javascript'],['/voice-worklet.js','web/voice-worklet.js','text/javascript'],
 ['/device-dictation.mjs','web/device-dictation.mjs','text/javascript'],
 ['/device-dictation-worker.mjs','web/device-dictation-worker.mjs','text/javascript'],
 ['/device-dictation-files.mjs','web/device-dictation-files.mjs','text/javascript'],
 ['/device-dictation-licenses.txt','web/device-dictation-licenses.txt','text/plain'],
 ['/assets/maya-opening-zh.wav','web/assets/maya-opening-zh.wav','audio/wav'],
 ['/assets/maya-opening-en.wav','web/assets/maya-opening-en.wav','audio/wav'],
 ['/assets/type/instrument-sans-latin.woff2','web/assets/type/instrument-sans-latin.woff2','font/woff2'],['/assets/type/OFL-Instrument-Sans.txt','web/assets/type/OFL-Instrument-Sans.txt','text/plain'],['/room-primitives.css','web/room-primitives.css','text/css'],['/cloud.css','hosting/site/cloud.css','text/css'],
 ['/cloud.js','hosting/site/cloud.js','text/javascript'],['/judges.html','web/judges.html','text/html'],
 ['/judges.css','web/judges.css','text/css'],['/judges.js','web/judges.js','text/javascript'],
 ['/judge-records.js','web/judge-records.js','text/javascript'],['/icon-192.png','web/icon-192.png','image/png'],
 ['/assets/maya-at-table.jpg','web/assets/maya-at-table.jpg','image/jpeg'],['/assets/funds-sculpture.jpg','web/assets/funds-sculpture.jpg','image/jpeg'],
 ['/assets/studio/workstations.webp','web/assets/studio/workstations.webp','image/webp'],
 ['/assets/fund-tell-mark.svg','web/assets/fund-tell-mark.svg','image/svg+xml'],['/icon-512.png','web/icon-512.png','image/png'],
 ['/tour.mp4','release/review-web/Morrowfolio-judge-tour-zh-en.mp4','video/mp4'],
 ['/reception.mp4','release/design-review/reception/candidate-reception-motion.mp4','video/mp4'],
 ['/reception-live.mp4','release/review-web/reception-live-mobile.mp4','video/mp4'],
 ['/fund-editions-tour.mp4','release/review-web/fund-editions-tour.mp4','video/mp4'],
 ['/fund-edition-salon.mp4','release/review-web/fund-edition-salon.mp4','video/mp4']]){
 const freezeDir=directBuild?null:process.argv[3];
 let bytes;
 if(freezeDir&&['/app.html','/cloud.css','/cloud.js'].includes(route))bytes=await readFile(join(resolve(freezeDir),route.slice(1)));
 else if(freezeDir&&['/reception.css','/reception.mjs'].includes(route)){
  try{bytes=await readFile(join(resolve(freezeDir),route.slice(1)));}
  catch(error){if(error.code!=='ENOENT')throw error;}
 }
 bytes??=await readFile(join(root,file));const binary=!type.startsWith('text/');
 let val=binary?bytes.toString('base64'):bytes.toString('utf8');
 if(route==='/judges.js'){
  const start=val.indexOf('    const base=location.protocol'),end=val.indexOf('    return url.href;',start);
  if(start<0||end<0)throw Error('Check the guided tour routes before releasing');
  val=val.slice(0,start)+"    return (kind==='studio'?'/studio?lang=':'/funds?id=wellington&lang=')+(english?'en-US':'zh-CN');"+val.slice(end+'    return url.href;'.length);
 }
 if(route==='/judges.html')val=val.replace('</body>',`<footer class="tour-videos"><a href="/fund-edition-salon.mp4"><span lang="zh-CN">观看手机实录 · 56 秒</span><span lang="en-US">Watch the mobile walkthrough · 56 sec</span></a><a href="/fund-editions-tour.mp4"><span lang="zh-CN">上版双入口实录 · 50 秒</span><span lang="en-US">Earlier two-path tour · 50 sec</span></a><a href="/tour.mp4"><span lang="zh-CN">比赛导览 · 75 秒</span><span lang="en-US">Competition tour · 75 sec</span></a></footer></body>`);
 if(route==='/judges.css')val+="\n.tour-videos{max-width:1200px;margin:0 auto;padding:0 20px 16px;display:flex;flex-wrap:wrap;gap:2px 20px}.tour-videos a{font:inherit;font-size:.9rem;color:inherit;display:inline-flex;align-items:center;min-height:44px}.tour-videos a:focus-visible{outline:2px solid currentColor;outline-offset:2px}html:lang(zh) .tour-videos [lang|=en],html:lang(en) .tour-videos [lang|=zh]{display:none}\n";
 assets[route]=[type+(binary?'':'; charset=utf-8'),val,binary];
}
const buffettArchive=await readFile(join(root,'web/data/buffett-ai-study.json'),'utf8');
if(!JSON.parse(buffettArchive).decisions?.length)throw Error('Missing Buffett study decisions.');
assets['/data/buffett-ai-study.json']=['application/json; charset=utf-8',buffettArchive,false];
function bundle(input, output) {
  const args=['dlx','esbuild@0.25.12',input,'--bundle','--platform=browser','--format=esm','--target=es2022','--minify-whitespace','--outfile='+output];
  if(process.platform==='win32'){
    const quote=(arg)=>'"'+arg.replaceAll('"','""')+'"';
    execFileSync('cmd.exe',['/d','/s','/c','pnpm.cmd '+args.map(quote).join(' ')],{stdio:'inherit',windowsVerbatimArguments:true});
  }else execFileSync('pnpm',args,{stdio:'inherit'});
}
const guest=join(here,'generated-guest.mjs');
const gallery=join(here,'generated-gallery.mjs');
bundle(join(root,'web/strategy-salon.mjs'),gallery);
assets['/strategy-salon.mjs']=['text/javascript; charset=utf-8',await readFile(gallery,'utf8'),false];
bundle(join(here,'guest.mjs'),guest);
assets['/guest.js']=['text/javascript; charset=utf-8',await readFile(guest,'utf8'),false];
await writeFile(join(here,'generated-assets.mjs'),'export const assets='+JSON.stringify(assets)+';\n');
await mkdir(join(stage,'dist/server'),{recursive:true});
bundle(join(here,'worker.mjs'),join(stage,'dist/server/index.js'));
await cp(join(here,'drizzle'),join(stage,'drizzle'),{recursive:true});
if(directBuild)process.exit(0);
delete manifest.static;manifest.d1='DB';manifest.r2=null;
const manifestText=JSON.stringify(manifest,null,2)+'\n';await mkdir(join(stage,'dist/.openai'),{recursive:true});
await writeFile(join(stage,'.openai/hosting.json'),manifestText);await writeFile(join(stage,'dist/.openai/hosting.json'),manifestText);
