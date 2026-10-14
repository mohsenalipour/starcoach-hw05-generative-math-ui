import {mathSegments} from './math-text.mjs';
// Every view change invalidates older asynchronous loads, including a fresh chat.
export function createViewGuard(){
  let version=0;
  return {next:()=>++version,current:ticket=>ticket===version};
}

export function stepHeading(text){
  // Never clip a fraction or superscript. Keep an atomic first formula and
  // shorten only prose; the complete step is always available when expanded.
  const segments=mathSegments(text), index=segments.findIndex(p=>p.kind==='math');
  const first=String(text).split('\n')[0];
  if(index<0)return first.length>90?first.slice(0,90)+'…':first;
  const prose=segments.slice(0,index).map(p=>p.text).join('').trim();
  if(prose.length>=45)return prose.slice(0,85)+(prose.length>85?'…':'');
  const math=segments[index], token=math.ascii?'`'+math.text+'`':'\\('+math.text+'\\)';
  return `${prose} ${token}${segments.length>index+1?' …':''}`;
}
