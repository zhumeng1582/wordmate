import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pendingReferral,referralFromLaunch,validPendingReferral} from '../src/services/referral.ts';
test('launch accepts the scene from a mini-program code and existing share links',()=>{
 assert.equal(referralFromLaunch({scene:'0123456789ABCDEF'}),'0123456789abcdef');
 assert.equal(referralFromLaunch({ref:'0123456789abcdef'}),'0123456789abcdef');
 assert.equal(referralFromLaunch({scene:'%E0%A4%A'}),'');
 assert.equal(referralFromLaunch({scene:'../../secrets'}),'');
});

test('pending referrals expire after seven days and foregrounding does not extend them',()=>{
 const first=pendingReferral('0123456789abcdef',null,1000);
 assert.equal(validPendingReferral(first,1001),'0123456789abcdef');
 assert.equal(pendingReferral(first.code,first,2000).capturedAt,1000);
 assert.equal(validPendingReferral(first,1000+7*24*60*60*1000),'');
 assert.equal(validPendingReferral('0123456789abcdef',1001),'');
 assert.equal(pendingReferral('fedcba9876543210',first,2000).code,'fedcba9876543210');
});
