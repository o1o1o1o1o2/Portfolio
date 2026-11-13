import test from 'node:test';
import assert from 'node:assert/strict';
import { damp, ease, advanceTile, titleProgress, introProgress, tileTilt, glyphReveal,tilePlacement,textEntrance,lineShiftProgress,reelProgress,reelDuration } from '../src/motion/math.ts';

test('scroll entrances start at 15% visibility from either viewport edge',()=>{
 const run={started:false,elapsed:0};
 advanceTile(run,741,1141,800,.1);assert.equal(run.started,false);
 advanceTile(run,740,1140,800,.1);assert.equal(run.started,true);
 advanceTile(run,-410,-10,800,.1);assert.equal(run.started,false);
 advanceTile(run,-341,59,800,.1);assert.equal(run.started,false);
 advanceTile(run,-340,60,800,.1);assert.equal(run.started,true);
});

test('reels use the original cosine phase instead of a left-to-right delay',()=>{
 assert.ok(reelProgress(.5,5,11)>reelProgress(.5,0,11));
 assert.ok(Math.abs(reelProgress(.5,0,11)-reelProgress(.5,10,11))<1e-10);
 for(let i=0;i<11;i++)assert.equal(reelProgress(reelDuration,i,11),1);
});

test('mixed text approaches from distinct sides and contact lines shift in sequence',()=>{
 assert.ok(textEntrance(0,0,4,'mixed').y<0);assert.ok(textEntrance(0,1,4,'mixed').y>0);assert.ok(textEntrance(0,2,4,'mixed').x<0);assert.ok(textEntrance(0,3,4,'mixed').x>0);
 assert.equal(lineShiftProgress(.7,0),0);assert.ok(lineShiftProgress(.8,0)>0);assert.equal(lineShiftProgress(.8,1),0);assert.equal(lineShiftProgress(1.7,1),1);
});

test('CSS cards skew outward symmetrically and finish flat',()=>{
 for(let t=0;t<=2;t+=.05){const left=tilePlacement(t,0,600,470,1400),right=tilePlacement(t,1,600,470,1400);assert.ok(left.x<=0&&right.x>=0);assert.equal(left.x,-right.x);assert.equal(left.skew,-right.skew);assert.ok(Math.abs(left.skew)<=3.2);}
 const end=tilePlacement(2,0,600,470,1400);assert.equal(Math.abs(end.rotation),0);assert.equal(Math.abs(end.skew),0);assert.equal(end.scale,1);
});

test('timed glyph reveal finishes independently of scroll and has a bounded stagger',()=>{
 for(let i=0;i<30;i++){assert.ok(glyphReveal(0,i,30)<.001);assert.equal(glyphReveal(1.4,i,30),1);assert.ok(glyphReveal(.6,i,30)>=0&&glyphReveal(.6,i,30)<=1);}
 assert.ok(Number.isFinite(glyphReveal(.5,0,1)));
});

test('tile tilt remains visible after scale entrance and settles fully without overshoot',()=>{
  assert.ok(tileTilt(.3).z>1&&tileTilt(.3).z<2);
  assert.ok(tileTilt(0).x<=4);
  assert.ok(tileTilt(.3,true).z<tileTilt(.3).z);
  for(const time of [1.25,2,100])assert.deepEqual(tileTilt(time),{z:0,x:0,y:0});
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
  advanceTile(run,600,1000,800,3);assert.equal(run.elapsed,3);
  advanceTile(run,-450,-50,800,.1);assert.equal(run.started,false);assert.equal(run.elapsed,0);
  advanceTile(run,-200,200,800,.1);assert.equal(run.started,true);assert.equal(run.elapsed,.1);
  advanceTile(run,850,1250,800,.1);assert.equal(run.started,false);assert.equal(run.elapsed,0);
});

test('an initially offscreen intro element completes once and keeps its final state',()=>{
  const run={started:false,elapsed:0};
  advanceTile(run,820,1220,800,.1,.9,false);
  assert.equal(run.started,false);
  advanceTile(run,700,1100,800,.1,.9,false);
  advanceTile(run,-500,-100,800,1,.9,false);
  advanceTile(run,700,1100,800,.1,.9,false);
  assert.deepEqual(run,{started:true,elapsed:.9});
});

test('first screen has a delayed slow load timeline that completes and stays complete',()=>{
  assert.equal(introProgress(0),0);
  assert.ok(introProgress(.5)>0&&introProgress(.5)<.25);
  assert.ok(introProgress(1.5)<1);
  assert.equal(introProgress(3),1);
  assert.equal(introProgress(30),1);
});
