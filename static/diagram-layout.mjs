// Use dependency columns for branching diagrams. Array order alone can make
// an edge pass through a different event and imply the wrong relationship.
export function diagramLayout(nodes,edges){
  const n=nodes.length,incoming=Array(n).fill(0),depth=Array(n).fill(0),out=Array.from({length:n},()=>[]);
  for(const e of edges){incoming[e.end]++;out[e.start].push(e.end);}
  const queue=incoming.map((d,i)=>d===0?i:-1).filter(i=>i>=0),order=[];
  while(queue.length){const i=queue.shift();order.push(i);for(const end of out[i]){depth[end]=Math.max(depth[end],depth[i]+1);if(--incoming[end]===0)queue.push(end);}}
  const maxDepth=Math.max(...depth);
  if(order.length===n&&maxDepth<=2){
    const groups=Array.from({length:maxDepth+1},()=>[]);depth.forEach((d,i)=>groups[d].push(i));
    const height=Math.max(340,(Math.max(...groups.map(g=>g.length))-1)*106+108),positions=Array(n);
    for(let d=0;d<groups.length;d++)groups[d].forEach((id,i)=>{positions[id]=[maxDepth===1?480-d*360:480-d*180,(height-(groups[d].length-1)*106)/2+i*106];});
    return {width:600,height,positions};
  }
  // A long chain folds into two rows; cycles stay finite and bounded too.
  const sequence=order.length===n?order:nodes.map((_,i)=>i),positions=Array(n);
  sequence.forEach((id,i)=>{positions[id]=n<=3?[480-i*180,170]:[i<3?480-i*180:120+(i-3)*180,i<3?90:250];});
  return {width:600,height:340,positions};
}
