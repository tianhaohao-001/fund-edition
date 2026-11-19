import {closingMinute,marketDay,timeZone} from './market-freshness-calendar.mjs';

const minutes=60_000;
export const watchGraceMs=20*minutes;
const firstDay='2026-01-01',lastDay='2028-12-31';
const dayMs=86_400_000;
const nyOffset=new Intl.DateTimeFormat('en-US',{timeZone,timeZoneName:'shortOffset'});
function epoch(day,minute){
  const noon=Date.parse(day+'T16:00:00Z'),name=nyOffset.formatToParts(noon).find(p=>p.type==='timeZoneName')?.value;
  const offset=Number(name?.replace('GMT',''));if(![-4,-5].includes(offset)) throw Error('Unsupported New York offset');
  return Date.parse(day+'T00:00:00Z')+(minute-offset*60)*minutes;
}
export function nextWatchSlot(after,{marketOnly=false,interval=60}={}){
  if(![30,60,120].includes(interval))throw new RangeError('Unsupported observation interval');
  const {date}=marketDay(after);
  if(date<firstDay||date>lastDay)return null;
  for(let i=0;i<=10;i++){
    const day=new Date(Date.parse(date+'T12:00:00Z')+i*dayMs).toISOString().slice(0,10);
    if(day>lastDay)return null;
    const slots=marketOnly?[]:[{minute:510,type:'news'}];
    const close=closingMinute(day);
    if(close!==null){
      for(let minute=570;minute<close;minute+=interval)slots.push({minute,type:minute===570?'open':'market'});
    }
    for(const slot of slots){
      const at=epoch(day,slot.minute);
      if(at>after)return {at,kind:slot.type};
    }
  }
  return null;
}
export const watchDay = now=>marketDay(now).date;
