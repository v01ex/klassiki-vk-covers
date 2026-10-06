import test from 'node:test';
import assert from 'node:assert/strict';
import { probeCoverAPI, safeError } from './public/probe.js';
import { server } from './server.mjs';

test('probe only requests upload server, does not write, omits group_id and redacts secrets', async () => {
  const calls=[];
  const bridge={send:async (method,args) => {
    calls.push([method,args]);
    if(method==='VKWebAppGetAuthToken') return {access_token:'secret-token'};
    return args.method === 'users.get' ? {response:[{id:123}]} : {response:{upload_url:'https://upload.vk.com/?secret=value'}};
  }};
  const result=await probeCoverAPI(bridge,123);
  assert.equal(calls.length,3);
  assert.equal(calls[0][1].scope,'photos');
  assert.equal(calls[1][1].method,'users.get');
  assert.equal(calls[2][1].method,'photos.getOwnerCoverPhotoUploadServer');
  assert.equal('group_id' in calls[2][1].params,false);
  assert.equal('crop_x2' in calls[2][1].params,false);
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
  try {await probeCoverAPI(bridge,123);assert.fail();} catch(error) {
    const report=safeError(error);
    assert.equal(report.error_code,100);assert.equal(report.error_type,'api_error');
    assert.equal(report.stage,'users.get');assert.doesNotMatch(JSON.stringify(report),/secret|request_params/);
  }
});
test('cover-specific failure distinguishes successful authorization and control call',async () => {
  const bridge={send:async (method,args) => {
    if(method==='VKWebAppGetAuthToken') return {access_token:'secret'};
    if(args.method==='users.get') return {response:[{id:123}]};
    throw {error_type:'api_error',error_data:{error_code:10,error_msg:'secret',request_params:['secret']}};
  }};
  try {await probeCoverAPI(bridge,123);assert.fail();} catch(error) {
    const report=safeError(error);
    assert.equal(report.stage,'photos.getOwnerCoverPhotoUploadServer');
    assert.equal(report.error_type,'api_error');assert.equal(report.error_code,10);
    assert.equal(report.control_api_succeeded,true);assert.equal(report.authorization_succeeded,true);
    assert.doesNotMatch(JSON.stringify(report),/secret/);
  }
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
