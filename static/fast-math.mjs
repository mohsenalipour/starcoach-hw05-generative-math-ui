// Bounded arithmetic interpreter for interactive exploration. No eval/Function.
// The accepted lesson and its symbolic verification remain server-owned.
export class UnsupportedMath extends Error {}
export class DomainError extends Error {}
const symbols = new Set(['x','a','b','c','y','z','t','n']);
const functions = new Set(['sin','cos','tan','exp','log','ln','sqrt','abs']);
const cache = new Map();
const finite = n => Number.isFinite(n) && Math.abs(n) <= 1e5;
const cleanNumber = n => String(Number(n.toFixed(6)));
const dual = (v,d=0) => ({v,d});

export function parseMath(source) {
  if (typeof source !== 'string' || !source.trim() || source.length>400) throw new UnsupportedMath('Expression length');
  const text=source.replace(/[۰-۹٠-٩]/g,c=>String('۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩'.indexOf(c)%10)).replace(/\^/g,'**').replace(/−/g,'-').replace(/×/g,'*').replace(/÷/g,'/');
  if(cache.has(text))return cache.get(text);
  const tokens=[];let cursor=0;
  while(cursor<text.length){if(/\s/.test(text[cursor])){cursor++;continue;}const rest=text.slice(cursor);
    const match=/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)||/^[A-Za-z_][A-Za-z_0-9]*/.exec(rest)||/^(?:\*\*|[+*/()\-,])/.exec(rest);
    if(!match)throw new UnsupportedMath('Unsupported token');tokens.push(match[0]);cursor+=match[0].length;
    if(tokens.length>150)throw new UnsupportedMath('Too many tokens');
  }
  let index=0,nodes=0;
  const peek=()=>tokens[index],take=()=>tokens[index++];
  function node(op,args=[],value=null){if(++nodes>100)throw new UnsupportedMath('Too many nodes');return {op,args,value};}
  function atom(depth){if(depth>15)throw new UnsupportedMath('Expression depth');const token=take();
    if(token==='('){const result=sum(depth+1);if(take()!==')')throw new UnsupportedMath('Missing parenthesis');return result;}
    if(token && /^(?:\d|\.)/.test(token)){const value=Number(token);if(!Number.isFinite(value)||Math.abs(value)>1e6)throw new UnsupportedMath('Number range');return node('num',[],value);}
    if(token==='pi'||token==='e'||token==='E')return node('num',[],token==='pi'?Math.PI:Math.E);
    if(symbols.has(token))return node('var',[],token);
    if(functions.has(token)&&take()==='('){const child=sum(depth+1);if(take()!==')')throw new UnsupportedMath('Function arguments');return node(token,[child]);}
    throw new UnsupportedMath('Unsupported name');
  }
  function power(depth){let left=atom(depth);if(peek()==='**'){take();left=node('pow',[left,unary(depth+1)]);}return left;}
  function unary(depth){if(depth>15)throw new UnsupportedMath('Expression depth');if(peek()==='+'||peek()==='-'){const sign=take();const child=unary(depth+1);return sign==='-'?node('neg',[child]):child;}return power(depth);}
  function product(depth){let left=unary(depth);while(peek()==='*'||peek()==='/'){const op=take();left=node(op==='*'?'mul':'div',[left,unary(depth)]);}return left;}
  function sum(depth){let left=product(depth);while(peek()==='+'||peek()==='-'){const op=take();left=node(op==='+'?'add':'sub',[left,product(depth)]);}return left;}
  const tree=sum(0);if(index!==tokens.length)throw new UnsupportedMath('Trailing expression');
  // Validate the tree depth too: long left-associative sums do not nest parser calls.
  function validate(n,depth=0){if(depth>15)throw new UnsupportedMath('Expression depth');for(const child of n.args)validate(child,depth+1);}
  validate(tree);if(cache.size>=64)cache.delete(cache.keys().next().value);cache.set(text,tree);return tree;
}

function evaluate(n,x,params){
  if(n.op==='num')return dual(n.value);
  if(n.op==='var'){if(n.value==='x')return dual(x,1);if(!Object.hasOwn(params,n.value))throw new UnsupportedMath('Missing parameter');return dual(params[n.value]);}
  const a=evaluate(n.args[0],x,params),b=n.args[1]?evaluate(n.args[1],x,params):null;
  switch(n.op){
    case 'neg':return dual(-a.v,-a.d);
    case 'add':return dual(a.v+b.v,a.d+b.d);
    case 'sub':return dual(a.v-b.v,a.d-b.d);
    case 'mul':return dual(a.v*b.v,a.d*b.v+a.v*b.d);
    case 'div':return dual(a.v/b.v,(a.d*b.v-a.v*b.d)/(b.v*b.v));
    case 'pow':{
      if(b.d!==0 || !Number.isFinite(b.v) || Math.abs(b.v)>12)throw new UnsupportedMath('Exponent');
      if(hasVariable(n.args[1]))throw new UnsupportedMath('Variable exponent');
      const value=Math.pow(a.v,b.v);return dual(value,b.v===0||a.d===0?0:b.v*Math.pow(a.v,b.v-1)*a.d);
    }
    case 'sin':return dual(Math.sin(a.v),Math.cos(a.v)*a.d);
    case 'cos':return dual(Math.cos(a.v),-Math.sin(a.v)*a.d);
    case 'tan':return dual(Math.tan(a.v),a.d/(Math.cos(a.v)**2));
    case 'exp':return dual(Math.exp(a.v),Math.exp(a.v)*a.d);
    case 'ln':case 'log':return dual(Math.log(a.v),a.d/a.v);
    case 'sqrt':return dual(Math.sqrt(a.v),a.d===0?0:a.d/(2*Math.sqrt(a.v)));
    case 'abs':return dual(Math.abs(a.v),a.v===0&&a.d!==0?NaN:Math.sign(a.v)*a.d);
    default:throw new UnsupportedMath('Operation');
  }
}
function hasVariable(n){return n.op==='var'||n.args.some(hasVariable);}
function hasX(n){return n.op==='var'&&n.value==='x'||n.args.some(hasX);}
function polynomial(n,params){
  if(!hasX(n)){const v=evaluate(n,0,params).v;return Number.isFinite(v)?[v]:null;}
  if(n.op==='var')return [0,1];
  const a=polynomial(n.args[0],params),b=n.args[1]?polynomial(n.args[1],params):null;
  if(!a)return null;
  if(n.op==='neg')return a.map(v=>-v);
  if((n.op==='add'||n.op==='sub')&&b){const out=Array(Math.max(a.length,b.length)).fill(0);return out.map((_,i)=>(a[i]||0)+(n.op==='add'?1:-1)*(b[i]||0));}
  if(n.op==='mul'&&b)return multiply(a,b);
  if(n.op==='div'&&b?.length===1&&b[0]!==0)return a.map(v=>v/b[0]);
  if(n.op==='pow'&&b?.length===1&&Number.isInteger(b[0])&&b[0]>=0&&b[0]<=12){let out=[1];for(let i=0;i<b[0];i++){out=multiply(out,a);if(!out)return null;}return out;}
  return null;
}
function multiply(a,b){if(a.length+b.length>50)return null;const out=Array(a.length+b.length-1).fill(0);for(let i=0;i<a.length;i++)for(let j=0;j<b.length;j++)out[i+j]+=a[i]*b[j];return out;}
function zeros(n,params){const p=polynomial(n,params);if(!p)throw new UnsupportedMath('Non-polynomial singularity');while(p.length>1&&Math.abs(p.at(-1))<1e-14)p.pop();
  if(p.length===1){if(p[0]===0)throw new DomainError('این پارامتر تابع را تعریف‌نشده می‌کند.');return [];}
  if(p.length===2)return [-p[0]/p[1]];
  if(p.length===3){const delta=p[1]**2-4*p[2]*p[0];return delta<0?[]:[(-p[1]-Math.sqrt(delta))/(2*p[2]),(-p[1]+Math.sqrt(delta))/(2*p[2])];}
  throw new UnsupportedMath('Higher order singularity');
}
function poles(n,params){let found=[];
  if(n.op==='div')found.push(...zeros(n.args[1],params));
  if(n.op==='pow'&&!hasVariable(n.args[1])&&evaluate(n.args[1],0,params).v<0)found.push(...zeros(n.args[0],params));
  if(n.op==='tan')throw new UnsupportedMath('Trigonometric singularities');
  for(const child of n.args)found.push(...poles(child,params));return found;
}
function tex(n,params){if(n.op==='num')return cleanNumber(n.value);if(n.op==='var')return n.value==='x'?'x':cleanNumber(params[n.value]);const a=tex(n.args[0],params),b=n.args[1]?tex(n.args[1],params):'';
  if(n.op==='neg')return `-\\left(${a}\\right)`;
  if(n.op==='add'||n.op==='sub')return `\\left(${a}${n.op==='add'?'+':'-'}${b}\\right)`;
  if(n.op==='mul')return `${a}\\cdot ${b}`;
  if(n.op==='div')return `\\frac{${a}}{${b}}`;
  if(n.op==='pow')return `\\left(${a}\\right)^{${b}}`;
  if(n.op==='sqrt')return `\\sqrt{${a}}`;
  if(n.op==='abs')return `\\left|${a}\\right|`;
  return `\\${n.op==='log'?'ln':n.op}\\left(${a}\\right)`;
}

export function fastVisual(spec){
  const params=Object.fromEntries((spec.parameters||[]).map(p=>[p.name,Number(p.value)]));
  if(Object.values(params).some(v=>!Number.isFinite(v)||Math.abs(v)>50))throw new UnsupportedMath('Parameter value');
  if(spec.kind==='geometry'){
    const a=params.y??3,b=params.z??4;if(a<=0||b<=0)throw new DomainError('طول باید مثبت باشد.');
    if(spec.shape==='circle')return {kind:'geometry',shape:'circle',radius:a,area:Math.PI*a*a,perimeter:2*Math.PI*a,latex:'A=\\pi r^2',metrics:[{label:'مساحت',value:Math.PI*a*a},{label:'محیط',value:2*Math.PI*a}]};
    return {kind:'geometry',shape:'right_triangle',a,b,c:Math.hypot(a,b),latex:'c=\\sqrt{a^2+b^2}',metrics:[{label:'وتر',value:Math.hypot(a,b)},{label:'مساحت',value:a*b/2}]};
  }
  if(!['function','tangent','integral'].includes(spec.kind))throw new UnsupportedMath('Visual kind');
  const tree=parseMath(spec.expression),singularities=poles(tree,params),xMin=Number(spec.x_min),xMax=Number(spec.x_max);
  if(!Number.isFinite(xMin)||!Number.isFinite(xMax)||xMin>=xMax||xMax-xMin>60)throw new UnsupportedMath('Domain');
  const fn=x=>{const v=evaluate(tree,x,params).v;return finite(v)?v:null;};
  const points=[];let previous=null;
  for(let i=0;i<=300;i++){const x=xMin+(xMax-xMin)*i/300;if(previous!==null&&singularities.some(p=>previous<=p&&p<=x))points.push([x,null]);points.push([x,fn(x)]);previous=x;}
  if(!points.some(p=>p[1]!==null))throw new DomainError('در این بازه مقدار حقیقی قابل نمایش وجود ندارد.');
  const result={kind:spec.kind,points,latex:'f(x)='+tex(tree,params),metrics:[],local:true};
  if(spec.kind==='tangent'){
    const x=Number(spec.focus),{v:y,d:slope}=evaluate(tree,x,params);
    if(!finite(y)||!finite(slope))throw new DomainError('مماس در این نقطه تعریف نشده است. نقطه را تغییر بده.');
    Object.assign(result,{focus:[x,y],slope,tangent:[[xMin,y+slope*(xMin-x)],[xMax,y+slope*(xMax-x)]],derivative_latex:`f'(${cleanNumber(x)})=${cleanNumber(slope)}`,metrics:[{label:'شیب مماس',value:slope},{label:'مقدار تابع',value:y}]});
  }
  if(spec.kind==='integral'){
    const a=Number(spec.lower),b=Number(spec.upper);if(!(xMin<=a&&a<b&&b<=xMax))throw new DomainError('کران‌ها باید مرتب و داخل بازه باشند.');
    if(singularities.some(p=>a<=p&&p<=b))throw new UnsupportedMath('Integral crossing a singularity needs the server');
    const coefficients=polynomial(tree,params);let total=0;
    if(coefficients){for(let i=0;i<coefficients.length;i++)total+=coefficients[i]*(b**(i+1)-a**(i+1))/(i+1);}
    else {const N=512,h=(b-a)/N;for(let i=0;i<=N;i++){const v=fn(a+i*h);if(v===null)throw new UnsupportedMath('Improper integral needs the server');total+=(i===0||i===N?1:i%2===0?2:4)*v;}total*=h/3;}
    if(!finite(total))throw new UnsupportedMath('Integral value range');
    Object.assign(result,{integral:total,approximate:!coefficients,integral_latex:`\\int_{${cleanNumber(a)}}^{${cleanNumber(b)}}f(x)\\,dx\\approx ${cleanNumber(total)}`,area:Array.from({length:161},(_,i)=>{const x=a+(b-a)*i/160;return [x,fn(x)];}),metrics:[{label:coefficients?'انتگرال علامت‌دار':'انتگرال · تقریب عددی',value:total}]});
  }
  return result;
}
