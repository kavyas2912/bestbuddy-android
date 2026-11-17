// Automated checks of the installed DEBUG APK through its actual native bridge.
// Requires Node 22+ and an Android device authorized in adb (USB or wireless).
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
const options=process.argv.slice(2),value=key=>options[options.indexOf(key)+1];
const adb=options.includes('--adb')?value('--adb'):'adb';
const devices=execFileSync(adb,['devices'],{encoding:'utf8',windowsHide:true}).split(/\r?\n/).filter(line=>/\sdevice$/.test(line)).map(line=>line.split(/\s/)[0]);
const serial=options.includes('--serial')?value('--serial'):devices.length===1?devices[0]:null;
if(!serial||!devices.includes(serial))throw Error('Connect and authorize one device in adb, or pass --serial DEVICE. Link to Windows alone is not an adb connection.');
const command=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8',windowsHide:true,timeout:30000}).trim();
const packageId='app.vce.buddy',report={test:'BestBuddy installed Android native checks',started:new Date().toISOString(),checks:[],physicalVoiceAcceptance:'pending'};
const check=(name,ok,details)=>{report.checks.push({name,passed:!!ok,details});console.log(`${ok?'PASS':'FAIL'} ${name}`);};
const packageInfo=command('shell','dumpsys','package',packageId);
check('installed version',/versionName=1\.11\.9\b/.test(packageInfo),packageInfo.match(/versionName=\S+/)?.[0]);
report.androidApi=command('shell','getprop','ro.build.version.sdk');
command('shell','monkey','-p',packageId,'-c','android.intent.category.LAUNCHER','1');
await new Promise(resolve=>setTimeout(resolve,3000));
const pid=command('shell','pidof',packageId).split(' ')[0];
const sockets=command('shell','cat','/proc/net/unix');
const socket=sockets.split(/\r?\n/).map(line=>line.match(/@(webview_devtools_remote_\d+)/)?.[1]).find(name=>name.endsWith('_'+pid));
if(!socket)throw Error('The debug WebView is not available. Use the supplied debug test APK, keep Buddy open and unlock the device.');
const reservation=net.createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
command('forward',`tcp:${port}`,`localabstract:${socket}`);
let ws;
try{
 const targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();const target=targets.find(t=>t.type==='page'&&t.url.includes('localhost'))||targets.find(t=>t.type==='page');
 if(!target)throw Error('Buddy page is not ready. Wait for first-run preparation and try again.');
 const url=new URL(target.webSocketDebuggerUrl);url.hostname='127.0.0.1';url.port=String(port);ws=new WebSocket(url);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});let sequence=0;const pending=new Map();
 ws.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const task=pending.get(data.id);if(!task)return;pending.delete(data.id);clearTimeout(task.timeout);data.error?task.reject(Error(JSON.stringify(data.error))):task.resolve(data.result);}};
 const call=(method,params)=>new Promise((resolve,reject)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('Native test timed out after four minutes'));},240000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params}));});
 const invoke=async(command,args={})=>{const result=await call('Runtime.evaluate',{expression:`window.__TAURI_INTERNALS__.invoke('vce_platform',${JSON.stringify({command,args})})`,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+(result.result.description||''));return result.result.value;};
 const prepared=await invoke('prepareBundled');check('included resources prepared offline',prepared?.resourcesReady===true,prepared);
 const models=await invoke('models');const selected=models.models?.find(model=>model.id===models.selected);check('selected model is installed',selected?.installed,{id:models.selected,installed:selected?.installed});
 const began=Date.now();const answer=await invoke('generate',{text:'Reply with one short sentence containing the word BLUE. This is a diagnostic test.',context:'Public diagnostic only. No personal information is requested.',chatter:false});
 check('actual on-device language-model inference',/blue/i.test(answer?.text||''),{reply:answer?.text?.slice(0,300),backend:answer?.backend,elapsedMs:Date.now()-began,initializeMs:answer?.initializeMs,firstTokenMs:answer?.firstTokenMs,generationMs:answer?.generationMs});
 const speech=await invoke('status');check('included offline speech available',speech?.bundledSpeech===true,{ttsReady:speech?.ttsReady,onDeviceRecognition:speech?.onDeviceRecognition,bundledSpeech:speech?.bundledSpeech});
 if(options.includes('--voice')){
  await invoke('speak',{text:'Hello. This is Buddy’s offline speech test. Please say: blue sky.',language:'en-US',rate:1});
  const heard=await invoke('listen',{language:'en-US'});check('actual microphone and recognizer',/blue|sky/i.test(heard?.text||''),{transcript:heard?.text?.slice(0,200)});
 }
}catch(error){check('native test execution',false,String(error));}
finally{
 ws?.close();command('forward','--remove',`tcp:${port}`);
 report.finished=new Date().toISOString();const output=options.includes('--output')?value('--output'):'BestBuddy-Android-test-results.json';fs.writeFileSync(output,JSON.stringify(report,null,2));console.log('Results: '+output);if(report.checks.some(test=>!test.passed))process.exitCode=1;
}
