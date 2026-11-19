// This assigned origin is pinned at build time. Publish the Sites build only
// after testing a real visitor session and manager reply on that exact domain.
export const fullAppOrigin = 'https://fund-edition-web-production.up.railway.app';
const sitesOrigin='https://morrowfolio-team-studio.wavyboot13.chatgpt.site';

export function fullAppPath({room,language,fundId,decision}) {
  if(!['studio','funds'].includes(room))return null;
  const query=new URLSearchParams({lang:language==='en-US'?'en-US':'zh-CN'});
  if(room==='funds' && fundId){
    if(typeof fundId!=='string' || !/^[a-z][a-z0-9-]{0,60}$/u.test(fundId))return null;
    query.set('id',fundId);
    if(fundId==='buffett' && /^buffett-review-[1-4]$/u.test(decision))query.set('decision',decision);
  }
  return '/'+room+'?'+query.toString();
}

export function fullAppUrl(sourceOrigin,selection) {
  if(sourceOrigin!==sitesOrigin)return null;
  const fixed=new URL(fullAppOrigin);
  if(fixed.protocol!=='https:'||fixed.origin!==fullAppOrigin||fixed.origin===sitesOrigin)return null;
  const path=fullAppPath(selection);
  return path?new URL(path,fixed.origin).href:null;
}
