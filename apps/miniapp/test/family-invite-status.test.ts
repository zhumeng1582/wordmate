import {test} from 'node:test';
import assert from 'node:assert/strict';
import {familyInviteStatus} from '../src/services/family-invite-status.ts';

const saved={familyId:'b',name:'家庭 B',account:'account-a'};
test('invite status follows the tracked account and ignores another account’s local notice',()=>{
 const data={families:[{id:'a'}],family_applications:[{family_id:'c',family_name:'家庭 C'}]};
 assert.deepEqual(familyInviteStatus(data,saved,'account-a','a'),{notice:{id:'b',name:'家庭 B',state:'unavailable'}});
 assert.deepEqual(familyInviteStatus(data,saved,'account-b','a'),{notice:{id:'c',name:'家庭 C',state:'waiting'},track:{familyId:'c',name:'家庭 C',account:'account-b'}});
});
test('approval is cleared only after selecting the invited family; incomplete data is not an expiry',()=>{
 const approved={families:[{id:'b',name:'家庭 B'}],family_applications:[]};
 assert.deepEqual(familyInviteStatus(approved,saved,'account-a','a'),{notice:{id:'b',name:'家庭 B',state:'approved'}});
 assert.deepEqual(familyInviteStatus(approved,saved,'account-a','b'),{notice:null,clear:true});
 assert.deepEqual(familyInviteStatus({families:[]},saved,'account-a','a'),{notice:null});
});
