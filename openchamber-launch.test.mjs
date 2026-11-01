import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { startProtectedOpenChamber } from './openchamber-launch.mjs';

test('protected launch passes password only through child environment, never argv', async () => {
  let captured;
  await startProtectedOpenChamber({
    file: new URL('./package.json',import.meta.url),
    runSync: () => ({status:0,stdout:'fixture-secret\n'}),
    launch: (executable,args,options) => {
      captured = {executable,args,options};
      const child=new EventEmitter();child.unref=()=>{};
      queueMicrotask(()=>child.emit('spawn'));return child;
    },
  });
  assert.equal(captured.options.env.OPENCHAMBER_UI_PASSWORD,'fixture-secret');
  assert.ok(!JSON.stringify(captured.args).includes('fixture-secret'));
  assert.ok(!captured.args.includes('--ui-password'));
  assert.equal(captured.options.windowsHide,true);
});
test('missing or undecryptable credentials never launch a server', () => {
  let launched=false;
  assert.throws(()=>startProtectedOpenChamber({file:new URL('./package.json',import.meta.url),runSync:()=>({status:1,stdout:''}),launch:()=>{launched=true;}}),/unavailable/);
  assert.equal(launched,false);
});
