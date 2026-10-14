import test from 'node:test';
import assert from 'node:assert/strict';
import {ideaCatalog,ideaCategories,selectIdeas} from '../static/ideas.mjs';

test('sixteen distinct ideas have usable prompts, previews and known categories',()=>{
  assert.equal(ideaCatalog.length,16);
  assert.equal(new Set(ideaCatalog.map(i=>i.id)).size,16);
  for(const idea of ideaCatalog){
    assert.ok(idea.title&&idea.description&&idea.preview&&idea.view);
    assert.ok(idea.prompt.length>30&&idea.prompt.length<4000);
    assert.ok(ideaCategories.some(([id])=>id===idea.category));
  }
});
test('topic filters select the matching ideas and expansion reveals the full gallery',()=>{
  assert.equal(selectIdeas().length,8);
  assert.equal(selectIdeas('all',true).length,16);
  for(const [category] of ideaCategories.slice(1)){
    const subset=selectIdeas(category);
    assert.ok(subset.length>0);
    assert.ok(subset.every(i=>i.category===category));
  }
});
test('offline availability is explicit and original demo ideas remain available',()=>{
  const demo=ideaCatalog.filter(i=>i.demo).map(i=>i.id);
  assert.deepEqual(demo,['tangent','integral','geometry','function','circle','matrix','equation']);
});
