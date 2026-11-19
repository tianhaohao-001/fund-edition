import assert from 'node:assert/strict';
import test from 'node:test';
import { fullAppPath, fullAppUrl, fullAppOrigin } from '../hosting/site/full-app-link.mjs';

test('Sites doors carry only the public room, archive selection and language',()=>{
  assert.equal(fullAppPath({room:'studio',language:'en-US',fundId:'wellington',decision:'private',draft:'private',next:'https://elsewhere.example'}),'/studio?lang=en-US');
  assert.equal(fullAppPath({room:'funds',language:'zh-CN',fundId:'buffett',decision:'buffett-review-2'}),'/funds?lang=zh-CN&id=buffett&decision=buffett-review-2');
  assert.equal(fullAppPath({room:'funds',fundId:'wellington',decision:'buffett-review-3'}),'/funds?lang=zh-CN&id=wellington');
  assert.equal(fullAppPath({room:'funds',fundId:'buffett',decision:'arbitrary'}),'/funds?lang=zh-CN&id=buffett');
  assert.equal(fullAppPath({room:'funds',fundId:'//outside.example'}),null);
  assert.equal(fullAppPath({room:'https://elsewhere.example'}),null);
});
test('only the original Sites origin can point at the operator-verified HTTPS domain',()=>{
  const route={room:'studio'};
  assert.equal(fullAppUrl('https://test.example',route),null);
  const link=fullAppUrl('https://morrowfolio-team-studio.wavyboot13.chatgpt.site',route);
  assert.equal(new URL(link).origin,fullAppOrigin);
  assert.equal(new URL(link).protocol,'https:');
});
