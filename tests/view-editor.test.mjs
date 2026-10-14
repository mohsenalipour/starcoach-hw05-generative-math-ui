import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import {stepHeading,createViewGuard} from '../static/view-state.mjs';
import {mathSegments} from '../static/math-text.mjs';
import {formulaTemplates,keyboardLayouts} from '../static/editor-config.mjs';

test('step headings keep an entire fraction instead of clipping its numerator',()=>{
  const heading=stepHeading('قاعدهٔ مشتق: \\(\\frac{d}{dx}x^n=nx^{n-1}\\) را بررسی کن.');
  const maths=mathSegments(heading).filter(p=>p.kind==='math');
  assert.equal(maths.length,1);
  assert.equal(maths[0].text,'\\frac{d}{dx}x^n=nx^{n-1}');
  assert.doesNotThrow(()=>katex.renderToString(maths[0].text,{throwOnError:true}));
});

test('headings shorten only prose and keep multi-line math atomic',()=>{
  const long='این توضیح آموزشی بسیار طولانی است و فقط برای بررسی عنوان مرحله استفاده می‌شود. '.repeat(3);
  assert.ok(stepHeading(long+'\\(x^2\\)').length<=86);
  const heading=stepHeading('رابطه:\\[\\frac{a}{b}\n=1\\] سپس توضیح');
  assert.equal(mathSegments(heading).filter(p=>p.kind==='math').length,1);
  assert.ok(heading.includes('\\frac{a}{b}\n=1'));
});

test('all visual template icons and keyboard labels are valid mathematical notation',()=>{
  assert.equal(formulaTemplates.length,12);
  assert.equal(keyboardLayouts.length,5);
  for(const template of formulaTemplates){
    assert.ok(template.name && template.insert);
    assert.doesNotThrow(()=>katex.renderToString(template.icon,{throwOnError:true}));
  }
  for(const layout of keyboardLayouts){
    assert.ok(layout.label && layout.tooltip);
    assert.equal(layout.rows.length,4);
    for(const row of layout.rows){
      assert.ok(row.length<=8);
      for(const item of row){
        const label=typeof item==='string'?item:item.latex;
        if(!label.startsWith('['))assert.doesNotThrow(()=>katex.renderToString(label,{throwOnError:true}));
      }
    }
  }
});

test('the keyboard includes every Latin letter and a working uppercase shift mapping',()=>{
  const layout=keyboardLayouts.find(l=>l.id==='milo-letters');
  const letters=layout.rows.flat().filter(k=>typeof k==='object');
  assert.equal(letters.map(k=>k.insert).join(''),'abcdefghijklmnopqrstuvwxyz');
  for(const k of letters)assert.equal(k.shift.insert,k.insert.toUpperCase());
  assert.ok(layout.rows.flat().includes('[shift]'));
});

test('late history responses cannot replace a more recently selected conversation',async()=>{
  const guard=createViewGuard();let resolveOld,resolveNew;const writes=[];
  const oldPromise=new Promise(r=>resolveOld=r),newPromise=new Promise(r=>resolveNew=r);
  const load=async(ticket,promise)=>{const value=await promise;if(guard.current(ticket))writes.push(value);};
  const older=load(guard.next(),oldPromise),newer=load(guard.next(),newPromise);
  resolveNew('geometry');await newer;resolveOld('tangent');await older;
  assert.deepEqual(writes,['geometry']);
});

test('a fresh chat invalidates an outstanding conversation load',async()=>{
  const guard=createViewGuard();let complete;let lab='loading';
  const ticket=guard.next(),pending=new Promise(r=>complete=r);
  const load=(async()=>{const value=await pending;if(guard.current(ticket))lab=value;})();
  guard.next();lab='empty';complete('old-function');await load;
  assert.equal(lab,'empty');
});
