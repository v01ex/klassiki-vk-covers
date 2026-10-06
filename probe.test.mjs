import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCoverAPI, safeError } from './public/probe.js';
import { server } from './server.mjs';

test('probe only requests upload server, does not write, omits group_id and redacts secrets', async () => {
  const calls=[];
  const bridge={send:async (method,args) => {
    calls.push([method,args]);
    if(method==='VKWebAppGetAuthToken') return {access_token:'secret-token'};
    return {response:{upload_url:'https://upload.vk.com/?secret=value'}};
  }};
  const result=await probeCoverAPI(bridge,123);
  assert.equal(calls.length,2);
  assert.equal(calls[0][1].scope,'photos');
  assert.equal(calls[1][1].method,'photos.getOwnerCoverPhotoUploadServer');
  assert.equal('group_id' in calls[1][1].params,false);
  assert.equal(result.upload_url_received,true);
  assert.equal(result.profile_installation_confirmed,false);
  assert.doesNotMatch(JSON.stringify(result),/secret/);
});
test('authorization cancellation never calls API',async () => {
  let calls=0;
  await assert.rejects(probeCoverAPI({send:async () => {calls++;throw Error('cancel');}},123));
  assert.equal(calls,1);
});
test('invalid app IDs are rejected before authorization',async () => {
  await assert.rejects(probeCoverAPI({send:() => assert.fail()},0));
});
test('API errors preserve code without token or request parameters',async () => {
  const bridge={send:async method => method==='VKWebAppGetAuthToken' ? {access_token:'secret'} : {error:{error_code:100,request_params:[{value:'secret'}]}}};
  try {await probeCoverAPI(bridge,123);assert.fail();} catch(error) {assert.deepEqual(safeError(error),{status:'failed',error_code:100});}
});
test('static preview serves all covers and protects files outside public',async () => {
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {
    const page=await fetch(base); assert.equal(page.status,200);
    for (const id of [1,2,3,6,7,8,9,11,12,13,14,17]) {
      const res=await fetch(`${base}/covers/${id}.png`,{method:'HEAD'});
      assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'image/png');
    }
    assert.equal((await fetch(`${base}/..%2fpackage.json`)).status,403);
    assert.equal((await fetch(`${base}/package.json`)).status,404);
  } finally {await new Promise(resolve => server.close(resolve));}
});
