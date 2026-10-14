/* Recognise delimiters first; conservative legacy ASCII formulas second. */
export function mathSegments(value) {
  const text=String(value??'');
  const explicit=/(\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|`[^`\n]+`|(?<![\w*])\*\*[^*\n]+\*\*(?![\w*]))/g;
  const out=[];
  function plain(s){
    // ASCII runs cannot swallow Persian words. Prose in English remains prose.
    const run=/[A-Za-z0-9α-ωΑ-Ωπ∞√∫Σ][A-Za-z0-9α-ωΑ-Ωπ∞√∫Σ'′+−–\-*·×/^_=<>≤≥≠±.,()\[\]{}\s]*[A-Za-z0-9π∞()\]}]/g;
    let last=0;
    for(const match of s.matchAll(run)){
      const candidate=match[0].trimEnd();
      if(candidate.length>220||/\b[A-Za-z]{4,}\b/.test(candidate.replace(/\b(?:sqrt|sin|cos|tan|log|exp|lim)\b/g,''))||
          !/[=+*/^_≤≥≠×·]|[a-zα-ω]\s*[-−]\s*\d/.test(candidate))continue;
      if(last<match.index)out.push({kind:'text',text:s.slice(last,match.index)});
      out.push({kind:'math',text:candidate,ascii:true,display:false});last=match.index+candidate.length;
    }
    if(last<s.length)out.push({kind:'text',text:s.slice(last)});
  }
  let last=0;
  for(const m of text.matchAll(explicit)){
    plain(text.slice(last,m.index));const s=m[0];
    if(s.startsWith('**'))out.push({kind:'bold',text:s.slice(2,-2)});
    else if(s.startsWith('`'))out.push({kind:'math',text:s.slice(1,-1),ascii:true,display:false});
    else {const two=s.startsWith('\\')||s.startsWith('$$');out.push({kind:'math',text:s.slice(two?2:1,two?-2:-1),display:s.startsWith('\\[')||s.startsWith('$$'),ascii:false});}
    last=m.index+s.length;
  }
  plain(text.slice(last));return out;
}

export function normalizeAscii(text){
  return text.replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632))
    .replace(/\*\*/g,'^').replace(/[−–]/g,'-').replace(/[·×]/g,'*').replace(/′/g,"'");
}

export function insertMath(text,start,end,latex,display=false){
  const token=display?`\n\\[${latex}\\]\n`:`\\(${latex}\\)`;
  return {text:text.slice(0,start)+token+text.slice(end),cursor:start+token.length};
}
