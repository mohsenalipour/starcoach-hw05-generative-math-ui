import test from 'node:test';
import assert from 'node:assert/strict';
import {mathSegments,normalizeAscii,insertMath,resultEquation}from '../static/math-text.mjs';
import {convertAsciiMathToLatex}from 'mathlive';
import katex from 'katex';

test('mixed Persian and LaTeX preserves prose and renders inline/block mathematics',()=>{
  const s=mathSegments('مقدار \\(\\frac{1}{2}\\) را در نظر بگیر.\n\\[\\int_0^2 x^2\\,dx\\]');
  assert.equal(s.filter(p=>p.kind==='math').length,2);
  assert.equal(s.find(p=>p.display).text,'\\int_0^2 x^2\\,dx');
  assert.equal(s.map(p=>p.text).join(''),'مقدار \\frac{1}{2} را در نظر بگیر.\n\\int_0^2 x^2\\,dx');
  for(const p of s.filter(p=>p.kind==='math'))assert.doesNotThrow(()=>katex.renderToString(p.text,{throwOnError:true}));
});

test('final answers show the actual operation and equality without altering the result',()=>{
  const derivative=resultEquation('3*x**2 + 2',{operation:'differentiate',expression:'x**3+2*x',variable:'x'},convertAsciiMathToLatex);
  assert.ok(derivative.startsWith('\\frac{d}{dx}'));
  assert.ok(derivative.includes(' = '));
  const html=katex.renderToString(derivative,{throwOnError:true,displayMode:true});
  assert.match(html,/class="mrel">=<\/span>/);
  const partial=resultEquation('2*x',{operation:'differentiate',expression:'x**2+y',variable:'x'},convertAsciiMathToLatex);
  assert.ok(partial.startsWith('\\frac{\\partial}{\\partial x}'));
  assert.doesNotThrow(()=>katex.renderToString(partial,{throwOnError:true}));
  const integral=resultEquation('8/3',{operation:'integrate',expression:'x**2',variable:'x',lower_bound:'0',upper_bound:'2'},convertAsciiMathToLatex);
  assert.ok(integral.startsWith('\\int_{0}^{2}'));
  assert.doesNotThrow(()=>katex.renderToString(integral,{throwOnError:true}));
  const simplified=resultEquation('2*x',{operation:'simplify',expression:'x+x',variable:'x'},convertAsciiMathToLatex);
  assert.ok(simplified.includes(' = '));
  const determinant=resultEquation('-2',{operation:'determinant',expression:'[[1,2],[3,4]]'},convertAsciiMathToLatex);
  assert.equal(determinant,'\\det\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix} = -2');
  assert.doesNotThrow(()=>katex.renderToString(determinant,{throwOnError:true}));
});

test('root sets are not labelled as a scalar equality and existing equations are preserved',()=>{
  const roots=resultEquation('[-1,1]',{operation:'solve',variable:'x'},convertAsciiMathToLatex);
  assert.ok(roots.includes('\\in'));
  assert.ok(!roots.includes('='));
  assert.doesNotThrow(()=>katex.renderToString(roots,{throwOnError:true}));
  const equation=resultEquation('x=2',{operation:'solve',variable:'x'},convertAsciiMathToLatex);
  assert.equal((equation.match(/=/g)||[]).length,1);
  assert.ok(resultEquation('2',{operation:'solve',variable:'y'},convertAsciiMathToLatex).startsWith('y = '));
  assert.equal(resultEquation('3',null,convertAsciiMathToLatex),'3');
});
test('legacy powers and fractions are math; normal prose and HTML stay text',()=>{
  for(const text of ['مشتق x**3 + 2*x را حساب کن','مقدار 1/2 را ببین','رابطه f(x)=x^2 است']){
    const math=mathSegments(text).find(p=>p.kind==='math');assert.ok(math,text);
    assert.doesNotThrow(()=>katex.renderToString(convertAsciiMathToLatex(normalizeAscii(math.text)),{throwOnError:true}));
  }
  const unicode=mathSegments('تابع f(x)=x³+2x را ببین').find(p=>p.kind==='math');
  assert.equal(unicode.text,'f(x)=x³+2x');
  assert.equal(normalizeAscii('x²+x₀'),'x^(2)+x_(0)');
  assert.doesNotThrow(()=>katex.renderToString(convertAsciiMathToLatex(normalizeAscii(unicode.text)),{throwOnError:true}));
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
