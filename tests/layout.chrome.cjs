// Chromium DevTools pipe keeps the viewport exact, including widths below 500px.
const {spawn}=require('node:child_process'),fs=require('node:fs');
const [width,height,page,png,profile,mode='calendar']=process.argv.slice(2);
const chrome=spawn('google-chrome',['--headless','--no-sandbox','--disable-gpu','--remote-debugging-pipe',`--user-data-dir=${profile}`],{stdio:['ignore','ignore','ignore','pipe','pipe']});
let id=0,buffer='',waiting=new Map();
chrome.stdio[4].on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\0'))>=0){const msg=JSON.parse(buffer.slice(0,end));buffer=buffer.slice(end+1);if(waiting.has(msg.id)){waiting.get(msg.id)(msg);waiting.delete(msg.id);}}});
function call(method,params={},sessionId){return new Promise((resolve,reject)=>{const n=++id;waiting.set(n,m=>m.error?reject(new Error(JSON.stringify(m.error))):resolve(m.result));chrome.stdio[3].write(JSON.stringify({id:n,method,params,sessionId})+'\0');});}
(async()=>{try{
 const {targetId}=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
 await call('Emulation.setDeviceMetricsOverride',{width:+width,height:+height,deviceScaleFactor:1,mobile:false},sessionId);
 await call('Page.navigate',{url:page},sessionId);
 if(mode==='menu-loading'){
  const result=await call('Runtime.evaluate',{expression:`(async()=>{
   await new Promise(r=>setTimeout(r,100));const loading=document.getElementById('menuLoading');
   return {text:loading.textContent,visible:!loading.hidden,font:getComputedStyle(loading).fontSize,background:getComputedStyle(loading).backgroundColor,border:getComputedStyle(loading).borderWidth,children:[...loading.children].map(e=>e.tagName),cards:document.getElementById('menuCards').children.length,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`,awaitPromise:true,returnByValue:true},sessionId);
  const shot=await call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(png,Buffer.from(shot.data,'base64'));
  process.stdout.write(JSON.stringify(result.result.value));return;
 }
 let result;
 for(let attempt=0;attempt<100;attempt++){
  result=await call('Runtime.evaluate',{expression:"document.getElementById('layoutResult')?.textContent",returnByValue:true},sessionId);
  if(result.result.value)break;await new Promise(r=>setTimeout(r,50));
 }
 if(!result.result.value)throw new Error('Layout fixture did not finish');
 if(mode==='customer'){
  const check=await call('Runtime.evaluate',{expression:`(async()=>{
   document.querySelector('#schedule button').click();await new Promise(r=>setTimeout(r,20));document.getElementById('toCustomer').click();
   const name=document.getElementById('name'),phone=document.getElementById('phone'),notes=document.getElementById('customerRequests'),policy=document.getElementById('cancelPolicy'),review=document.getElementById('reviewBtn');
   name.value='確認テスト';phone.value='09012345678';notes.value='静かに過ごしたいです'+String.fromCharCode(10)+'カラーの相談を希望します';
   notes.dispatchEvent(new Event('input',{bubbles:true}));review.click();
   const rect=notes.getBoundingClientRect();
   return {unchecked:!policy.checked,blocked:review.disabled && document.getElementById('reviewPanel').hidden,customerVisible:!document.getElementById('customerPanel').hidden,textareaHeight:rect.height,textareaFont:getComputedStyle(notes).fontSize,checkboxHeight:document.querySelector('.policy-check').getBoundingClientRect().height,overflow:document.documentElement.scrollWidth>innerWidth,notesRight:rect.right};
  })()`,awaitPromise:true,returnByValue:true},sessionId);
  if(check.exceptionDetails)throw new Error(JSON.stringify(check.exceptionDetails));
  const shot=await call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(png,Buffer.from(shot.data,'base64'));
  const policyPosition=await call('Runtime.evaluate',{expression:`(()=>{
   const label=document.querySelector('.policy-check');label.scrollIntoView({block:'center'});
   return {bottom:label.getBoundingClientRect().bottom,actionsTop:document.querySelector('#customerPanel .actions').getBoundingClientRect().top};
  })()`,returnByValue:true},sessionId);
  const policyShot=await call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(png.replace('.png','-policy.png'),Buffer.from(policyShot.data,'base64'));
  const review=await call('Runtime.evaluate' ,{expression:`(()=>{
   document.getElementById('cancelPolicy').click();document.getElementById('reviewBtn').click();
   const rows=[...document.querySelectorAll('#reviewDetails div')],notes=rows.find(r=>r.querySelector('dt').textContent==='ご要望など');
   return {visible:!document.getElementById('reviewPanel').hidden,requests:notes?.querySelector('dd').textContent,confirmEnabled:!document.getElementById('submitBtn').disabled,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`,returnByValue:true},sessionId);
  await call('Runtime.evaluate',{expression:"document.querySelector('#reviewDetails div:last-child').scrollIntoView({block:'center'})"},sessionId);
  const reviewShot=await call('Page.captureScreenshot',{format:'png'},sessionId);fs.writeFileSync(png.replace('.png','-review.png'),Buffer.from(reviewShot.data,'base64'));
  process.stdout.write(JSON.stringify({customer:check.result.value,policyPosition:policyPosition.result.value,review:review.result.value}));return;
 }
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
