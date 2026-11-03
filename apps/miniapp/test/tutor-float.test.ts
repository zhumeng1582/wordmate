import {test} from 'node:test';import assert from 'node:assert/strict';
import {constrainTutorFloat,snapTutorFloat} from '../src/components/tutor-float-geometry.ts';
const bounds={width:375,height:700,size:44,bottomInset:34};
test('floating tutor stays inside the visible area and respects the bottom safe area',()=>{assert.deepEqual(constrainTutorFloat({x:-100,y:10000},bounds),{x:8,y:614});});
test('floating tutor snaps to the closest side and keeps its height',()=>{assert.deepEqual(snapTutorFloat({x:30,y:220},bounds),{x:8,y:220});assert.deepEqual(snapTutorFloat({x:240,y:220},bounds),{x:323,y:220});});
