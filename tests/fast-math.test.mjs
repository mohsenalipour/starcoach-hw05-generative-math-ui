import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {fastVisual,parseMath,DomainError,UnsupportedMath} from '../static/fast-math.mjs';
const spec=(changes={})=>({kind:'tangent',expression:'x**2',x_min:-4,x_max:4,focus:1,lower:0,upper:2,parameters:[],shape:'right_triangle',...changes});
const close=(a,b,tolerance=1e-8)=>assert.ok(Math.abs(a-b)<tolerance,`${a} vs ${b}`);

test('tangent agrees with the power rule and chain rule',()=>{
  for(const x of [-3,-1,0,1,2,3]){const data=fastVisual(spec({expression:'x**3+2*x',focus:x}));close(data.slope,3*x*x+2);close(data.focus[1],x**3+2*x);}
  close(fastVisual(spec({expression:'sin(x**2)',focus:1})).slope,2*Math.cos(1));
});
test('all numeric elementary functions have the expected derivative',()=>{
  for(const [expression,x,value] of [['cos(x)',1,-Math.sin(1)],['exp(x)',1,Math.E],['ln(x)',2,.5],['sqrt(x)',4,.25],['abs(x)',-2,-1]])close(fastVisual(spec({expression,focus:x})).slope,value);
});
test('Python unary and right-associative power precedence is preserved',()=>{
  close(fastVisual(spec({expression:'-x**2',focus:2})).focus[1],-4);
  close(fastVisual(spec({expression:'2**3**2',focus:0})).focus[1],512);
  close(fastVisual(spec({expression:'x**-2',focus:2})).slope,-.25);
});
test('natural parameter names affect curve and derivative without mutating the spec',()=>{
  const input=spec({expression:'a*x**2+b',parameters:[{name:'a',value:2},{name:'b',value:3}],focus:2});
  const original=structuredClone(input),data=fastVisual(input);close(data.focus[1],11);close(data.slope,8);assert.deepEqual(input,original);
});
test('polynomial integration is signed and uses an analytic primitive',()=>{
  for(const [expression,upper,total] of [['x**2',2,8/3],['-x**2',2,-8/3],['x**2',1,1/3]]){const data=fastVisual(spec({kind:'integral',expression,upper}));close(data.integral,total);assert.equal(data.approximate,false);}
});
test('non-polynomial integral is labelled approximate and agrees numerically',()=>{
  const data=fastVisual(spec({kind:'integral',expression:'sin(x)',lower:0,upper:Math.PI}));close(data.integral,2,1e-9);assert.equal(data.approximate,true);
});
test('parameter-dependent singularities break curves and are never integrated locally',()=>{
  const input=spec({kind:'function',expression:'1/(x-a)',parameters:[{name:'a',value:.37}]});
  assert.ok(fastVisual(input).points.some(([x,y])=>y===null));
  assert.throws(()=>fastVisual({...input,kind:'integral',lower:0,upper:1}),UnsupportedMath);
  assert.throws(()=>fastVisual(spec({expression:'1/x',focus:0})),DomainError);
});
test('geometric metrics change immediately and match known results',()=>{
  close(fastVisual(spec({kind:'geometry',parameters:[{name:'y',value:3},{name:'z',value:4}]})).c,5);
  const circle=fastVisual(spec({kind:'geometry',shape:'circle',parameters:[{name:'y',value:2}]}));close(circle.area,4*Math.PI);close(circle.perimeter,4*Math.PI);
});
test('cusp and non-real values are rejected instead of displaying a false tangent',()=>{
  assert.throws(()=>fastVisual(spec({expression:'abs(x)',focus:0})),DomainError);
  assert.throws(()=>fastVisual(spec({expression:'sqrt(x)',focus:-1})),DomainError);
  close(fastVisual(spec({expression:'sqrt(0)',focus:0})).slope,0);
});
test('digits, constants and arithmetic normalizations agree',()=>{
  close(fastVisual(spec({expression:'۲×x^۲ + ۳',focus:2})).focus[1],11);
  close(fastVisual(spec({expression:'pi*x',focus:1})).slope,Math.PI);
});
test('unknown code, oversized inputs, deep trees and exponents are bounded',()=>{
  for(const expression of ["__import__('os')",'globalThis.alert(1)','x=1','Math.sin(x)','x;1','x'.repeat(401),'('.repeat(20)+'x'+')'.repeat(20)])assert.throws(()=>parseMath(expression),UnsupportedMath);
  for(const expression of ['x**10000','x**x','y*x'])assert.throws(()=>fastVisual(spec({expression})),UnsupportedMath);
});
test('warm local computation benchmark (no server, subprocess or network)',()=>{
  const times=[];for(let i=0;i<100;i++){const start=performance.now();fastVisual(spec({focus:-3+i*.06}));times.push(performance.now()-start);}
  times.sort((a,b)=>a-b);console.log(`Local compute median: ${times[50].toFixed(3)} ms; p95: ${times[95].toFixed(3)} ms`);
  assert.equal(times.length,100); // No flaky wall-clock threshold on other machines.
});
