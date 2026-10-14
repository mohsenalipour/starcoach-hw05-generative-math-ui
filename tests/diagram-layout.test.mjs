import test from 'node:test';
import assert from 'node:assert/strict';
import {diagramLayout} from '../static/diagram-layout.mjs';

test('a two-coin tree keeps both first tosses before their own outcomes',()=>{
  const nodes=Array.from({length:6},()=>({})),edges=[{start:0,end:2},{start:0,end:3},{start:1,end:4},{start:1,end:5}];
  const {positions,height}=diagramLayout(nodes,edges);
  assert.equal(positions[0][0],positions[1][0]);
  assert.equal(positions[2][0],positions[5][0]);
  assert.ok(positions[0][0]>positions[2][0]);
  for(const [x,y] of positions){assert.ok(x>=75&&x<=525);assert.ok(y>=44&&y<=height-44);}
  for(let i=2;i<5;i++)assert.ok(positions[i+1][1]-positions[i][1]>88);
});
test('a linear relationship follows dependency order even when nodes are shuffled',()=>{
  const {positions}=diagramLayout([{}, {}, {}],[{start:2,end:0},{start:0,end:1}]);
  assert.ok(positions[2][0]>positions[0][0]&&positions[0][0]>positions[1][0]);
});
test('long chains and cycles have bounded positions without an endless layout loop',()=>{
  for(const edges of [[{start:0,end:1},{start:1,end:0}],Array.from({length:5},(_,i)=>({start:i,end:i+1}))]){
    const nodes=Array.from({length:edges.length===2?2:6},()=>({}));
    const {positions,height}=diagramLayout(nodes,edges);
    assert.equal(positions.length,nodes.length);
    assert.ok(positions.every(([x,y])=>Number.isFinite(x)&&Number.isFinite(y)&&y>=44&&y<=height-44));
  }
});
