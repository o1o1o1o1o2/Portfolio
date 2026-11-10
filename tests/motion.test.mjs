import test from 'node:test';
import assert from 'node:assert/strict';
import { expansion, damp, ease, advanceTile, titleProgress, introProgress } from '../src/motion/math.ts';
test('expansion is reversible and bounded, without overshoot at short sections',()=>{
  assert.equal(expansion(100,2000,800),0);
  assert.equal(expansion(-1100,2000,800),1);
  const positions=[0,-100,-200,-400,-600,-900,-1200];
  const progress=positions.map(top=>expansion(top,2000,800));
  assert.deepEqual([...progress].reverse(),[...positions].reverse().map(top=>expansion(top,2000,800)));
  assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(i===0||p>=progress[i-1])));
  assert.ok(Number.isFinite(expansion(-20,800,800)));
});
test('damping converges from either direction and is independent of frame subdivision',()=>{
  let a=0,b=0;
  for(let i=0;i<30;i++)a=damp(a,1,1/30);
  for(let i=0;i<60;i++)b=damp(b,1,1/60);
  assert.ok(Math.abs(a-b)<.001);
  assert.ok(damp(1,0,1/60)<1);
  assert.equal(ease(0),0);assert.equal(ease(1),1);
});

test('footer title completes even when the document ends before its normal reveal point',()=>{
  assert.equal(titleProgress(620,800,2000,2000),1);
  assert.equal(titleProgress(400,800,0,0),1);
  assert.equal(titleProgress(900,800,0,2000),0);
});

test('a thin strip does not start tile playback from either viewport edge',()=>{
  const run={started:false,elapsed:0};
  advanceTile(run,790,1190,800,.5);
  assert.equal(run.started,false);assert.equal(run.elapsed,0);
  advanceTile(run,-390,10,800,.5);
  assert.equal(run.started,false);assert.equal(run.elapsed,0);
});
test('tiles replay on entry from either direction after fully leaving the viewport',()=>{
  const run={started:false,elapsed:0};
  advanceTile(run,600,1000,800,.1);assert.equal(run.started,true);
  advanceTile(run,600,1000,800,3);assert.equal(run.elapsed,2);
  advanceTile(run,-450,-50,800,.1);assert.equal(run.started,false);assert.equal(run.elapsed,0);
  advanceTile(run,-200,200,800,.1);assert.equal(run.started,true);assert.equal(run.elapsed,.1);
  advanceTile(run,850,1250,800,.1);assert.equal(run.started,false);assert.equal(run.elapsed,0);
});

test('first screen has a delayed slow load timeline that completes and stays complete',()=>{
  assert.equal(introProgress(0),0);
  assert.ok(introProgress(.5)>0&&introProgress(.5)<.25);
  assert.ok(introProgress(1.5)<1);
  assert.equal(introProgress(3),1);
  assert.equal(introProgress(30),1);
});
