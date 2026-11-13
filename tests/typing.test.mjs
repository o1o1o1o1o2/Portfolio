import test from 'node:test';
import assert from 'node:assert/strict';
import {typingCounts,typingDuration} from '../src/motion/typing-math.ts';
test('caption matches 40 characters per second and a five-character scrambling tail',()=>{
 assert.deepEqual(typingCounts(0,100),{settled:0,visible:0});
 assert.deepEqual(typingCounts(.25,100),{settled:5,visible:10});
 assert.deepEqual(typingCounts(1,100),{settled:35,visible:40});
 assert.deepEqual(typingCounts(typingDuration(200),200),{settled:200,visible:200});
});
