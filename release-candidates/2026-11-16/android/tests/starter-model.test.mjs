import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../ui/src/app.js',import.meta.url),'utf8');
const launch=source.slice(source.indexOf('async function launchModelDownload('),source.indexOf('let modelStatus=null;'));
const starter={id:'litert-community/SmolLM2-360M-Instruct',bytes:373719040,license:'apache-2.0',installed:false,gated:false};
async function run(status,online=true){
 const calls=[],downloaded=[],nodes=new Map();
 const context=vm.createContext({native:async(command,args)=>{calls.push([command,args]);return command==='models'?status:{files:[]}},notice:()=>{},navigator:{onLine:online},$:key=>{if(!nodes.has(key))nodes.set(key,{});return nodes.get(key)},startModelDownload:(...args)=>downloaded.push(args)});
 vm.runInContext('let modelStatus,launchDownloadRunning=false,pickerBusy=false;'+launch,context);
 await vm.runInContext('launchModelDownload()',context);
 return {calls,downloaded,nodes};
}
test('starter installs automatically below 500 MB without prompting',async()=>{
 const result=await run({models:[starter],selected:'other',autoResume:true});
 assert.equal(result.downloaded[0][0],starter.id);
 assert.ok(result.calls.some(([name])=>name==='scanDownloadsModels'));
});
test('working selected model is retained and shared folder is still scanned',async()=>{
 const result=await run({models:[starter,{id:'working',installed:true}],selected:'working'});
 assert.equal(result.downloaded.length,0);
 assert.ok(result.calls.some(([name])=>name==='scanDownloadsModels'));
});
test('offline or paused setup waits without starting a transfer',async()=>{
 for(const [online,autoResume] of [[false,true],[true,false]]){
  const result=await run({models:[starter],autoResume},online);
  assert.equal(result.downloaded.length,0);
  assert.ok(result.nodes.get('#downloadStatus').textContent);
 }
});
