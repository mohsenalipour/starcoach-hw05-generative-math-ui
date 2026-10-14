import test from 'node:test';
import assert from 'node:assert/strict';
import {mathSegments,normalizeAscii,insertMath}from '../static/math-text.mjs';
import {convertAsciiMathToLatex}from 'mathlive';
import katex from 'katex';

test('mixed Persian and LaTeX preserves prose and renders inline/block mathematics',()=>{
  const s=mathSegments('مقدار \\(\\frac{1}{2}\\) را در نظر بگیر.\n\\[\\int_0^2 x^2\\,dx\\]');
  assert.equal(s.filter(p=>p.kind==='math').length,2);
  assert.equal(s.find(p=>p.display).text,'\\int_0^2 x^2\\,dx');
  assert.equal(s.map(p=>p.text).join(''),'مقدار \\frac{1}{2} را در نظر بگیر.\n\\int_0^2 x^2\\,dx');
  for(const p of s.filter(p=>p.kind==='math'))assert.doesNotThrow(()=>katex.renderToString(p.text,{throwOnError:true}));
});
test('legacy powers and fractions are math; normal prose and HTML stay text',()=>{
  for(const text of ['مشتق x**3 + 2*x را حساب کن','مقدار 1/2 را ببین','رابطه f(x)=x^2 است']){
    const math=mathSegments(text).find(p=>p.kind==='math');assert.ok(math,text);
    assert.doesNotThrow(()=>katex.renderToString(convertAsciiMathToLatex(normalizeAscii(math.text)),{throwOnError:true}));
  }
  assert.equal(mathSegments('This is ordinary prose.').some(p=>p.kind==='math'),false);
  assert.equal(mathSegments('<img src=x onerror=alert(1)>').map(p=>p.text).join(''),'<img src=x onerror=alert(1)>');
  assert.equal(mathSegments('x**2').some(p=>p.kind==='bold'),false);
});
test('formula insertion preserves surrounding text and cursor, including selected replacement',()=>{
  const inserted=insertMath('مشتق  را بگو',5,5,'x^2');
  assert.equal(inserted.text,'مشتق \\(x^2\\) را بگو');
  assert.equal(inserted.cursor,12);
  const replaced=insertMath('abc',1,2,'\\frac{1}{2}',true);
  assert.equal(replaced.text,'a\n\\[\\frac{1}{2}\\]\nc');
  assert.equal(normalizeAscii('۲*x**۳−۱'),'2*x^3-1');
});
