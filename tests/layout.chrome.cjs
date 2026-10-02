// Chromium DevTools pipe keeps the viewport exact, including widths below 500px.
const {spawn}=require('node:child_process'),fs=require('node:fs');
const [width,height,page,png,profile]=process.argv.slice(2);
const chrome=spawn('google-chrome',['--headless','--no-sandbox','--disable-gpu','--remote-debugging-pipe',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let id=0,buffer='',waiting=new Map();
chrome.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const msg=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id);}}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;waiting.set(n,m=>m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result));chrome.stdio[3].write(JSON.stringify({id:n,method,params,sessionId})+'\0');});}
(async()=>{try{
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await call('Emulation.setDeviceMetricsOverride',{width:+width,height:+height,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Page.navigate',{url:page},sessionId);
 let result;
 for(let attempt=0;attempt<100;attempt++){
  result=await call('Runtime.evaluate',{expression:"document.getElementById('layoutResult')?.textContent",returnByValue:true},sessionId);
  if(result.result.value)break;await new Promise(r=>setTimeout(r,50));
 }
 if(!result.result.value)throw new Error('Layout fixture did not finish');
 const shot=await call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(png,Buffer.from(shot.data,'base64'));
 const data=JSON.parse(result.result.value);
 if(!data.loading){
  const check=await call('Runtime.evaluate',{expression:`(async()=>{
   const buttons=[...document.querySelectorAll('#schedule button')], times=[...document.querySelectorAll('#schedule tbody th')].map(e=>e.textContent);
   const date=buttons[0].getAttribute('aria-label').split(' ')[0], time=times[0];buttons[0].click();
   const selected=document.querySelector('#schedule button[aria-pressed="true"]');
   const highlighted=!!selected, pendingDisabled=selected?.disabled && document.getElementById('toCustomer').disabled;
   const pendingLabel=document.getElementById('toCustomer').textContent;
   const datetimeOnly=document.getElementById('selectionStatus').textContent==='選択中：'+date+' '+time;
   await new Promise(r=>setTimeout(r,20));
   return {highlighted,pendingDisabled,pendingLabel,datetimeOnly,confirmedLabel:document.getElementById('toCustomer').textContent,times,noModal:!document.querySelector('[role="dialog"]'),confirmed:document.getElementById('date').value===date && document.getElementById('time').value===time && !document.getElementById('toCustomer').disabled};
  })()`,awaitPromise:true,returnByValue:true},sessionId);
  if(check.exceptionDetails)throw new Error(JSON.stringify(check.exceptionDetails));
  data.interaction=check.result.value;
 }
 process.stdout.write(JSON.stringify(data));
}finally{chrome.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
