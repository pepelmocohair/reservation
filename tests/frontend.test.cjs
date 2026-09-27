const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.FRONTEND_SOURCE || require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(text='',value=''){this.textContent=text;this.value=value;this.disabled=false;this.style={};this.children=[];this.events={};}
 replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
 appendChild(child){this.children.push(child);}
 addEventListener(event,fn){this.events[event]=fn;}
}
const menu={id:'m1',category:'分類',name:'マスター名',price:'¥1,234〜',durationMinutes:70,webBookingEnabled:true,bookable:true};
function setup(){
 const els=Object.fromEntries(['date','menu','time','name','submitBtn','loadingMsg','notice'].map(id=>[id,new Element()]));
 const requests=[];const ctx={console,Intl,Date,Set,Map,AbortController,Option:Element,encodeURIComponent,setTimeout:()=>1,clearTimeout:()=>{},
 document:{getElementById:id=>els[id],createElement:()=>new Element()},fetch:(url,options={})=>new Promise((resolve,reject)=>requests.push({url,options,resolve:data=>resolve({ok:true,json:async()=>data}),reject}))};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {els,requests,run:s=>vm.runInContext(s,ctx)};
}
async function ready(s,entries=[menu]){s.requests.shift().resolve({status:'success',slotMinutes:10,menus:entries});await new Promise(setImmediate);}
function availability(s,date='2099-01-06') {s.els.date.value=date;s.els.menu.value='m1';return s.run('loadAvailability()');}
const response=(date='2099-01-06',times=['10:40','11:20'])=>({status:'success',slotMinutes:10,date,menuId:'m1',isClosed:false,availableStartTimes:times});
test('initial state empty time and disabled submit, only menus GET',async()=>{const s=setup();assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true);assert.equal(s.requests.length,1);assert.match(s.requests[0].url,/action=menus/);await ready(s);assert.equal(s.els.time.disabled,true);assert.equal(s.els.menu.value,'')});
test('only master labels shown, OFF hidden and null time disabled',async()=>{const s=setup();await ready(s,[menu,{...menu,id:'off',webBookingEnabled:false},{...menu,id:'unset',bookable:false,unavailableReason:'duration_not_set',durationMinutes:null}]);const options=s.els.menu.children[1].children;assert.equal(options.length,2);assert.equal(options[0].textContent,'マスター名 ¥1,234〜');assert.equal(options[1].disabled,true)});
test('only availableStartTimes become options; explicit selection and name required',async()=>{const s=setup();await ready(s);const p=availability(s);assert.equal(s.els.submitBtn.disabled,true);s.requests.shift().resolve(response());await p;assert.deepEqual(s.els.time.children.map(x=>x.value),['','10:40','11:20']);assert.equal(s.els.time.value,'');s.els.time.value='10:40';s.run('updateSubmit()');assert.equal(s.els.submitBtn.disabled,true);s.els.name.value='テスト';s.run('updateSubmit()');assert.equal(s.els.submitBtn.disabled,false)});
test('date input immediately invalidates old availability',async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().resolve(response());await p;s.els.date.value='2099-01-07';s.els.date.events.input();assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true)});
test('stale response cannot replace newer availability',async()=>{const s=setup();await ready(s);const first=availability(s);const old=s.requests.shift();const second=availability(s,'2099-01-07');s.requests.shift().resolve(response('2099-01-07',['12:10']));await second;old.resolve(response());await first;assert.deepEqual(s.els.time.children.map(x=>x.value),['','12:10'])});
for(const [label,data] of [['closed',{...response(),isClosed:true}],['full',response(undefined,[])],['missing times',{...response(),availableStartTimes:undefined}],['off grid',response(undefined,['10:45'])],['old API',{status:'success',reservedTimes:[]}],['error',{status:'configuration_error',message:'未準備'}]])test('fail closed '+label,async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().resolve(data);await p;assert.equal(s.els.time.disabled,true);assert.equal(s.els.submitBtn.disabled,true)});
test('GET network failure disables booking',async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().reject(new Error('offline'));await p;assert.equal(s.els.submitBtn.disabled,true)});
test('POST sends ID only, disables controls, no duplicate submission, refreshes',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='テスト';p=s.run('submitReservation()');assert.equal(s.els.menu.disabled,true);assert.equal(s.els.date.disabled,true);assert.equal(s.els.submitBtn.disabled,true);const post=s.requests.shift();assert.equal(post.options.method,'POST');assert.deepEqual(JSON.parse(post.options.body),{sourceType:'WEB_PAGE',menuId:'m1',date:'2099-01-06',time:'10:40',name:'テスト'});await s.run('submitReservation()');assert.equal(s.requests.length,0);post.resolve({status:'success',reservationId:'R1'});await new Promise(setImmediate);s.requests.shift().resolve(response());await p;assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true);assert.match(s.els.notice.textContent,/R1/)});
test('uncertain POST never automatically retries',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='テスト';p=s.run('submitReservation()');s.requests.shift().reject(new Error('lost response'));await new Promise(setImmediate);assert.match(s.requests[0].url,/action=availability/);s.requests.shift().resolve(response());await p;assert.match(s.els.notice.textContent,/登録済みの可能性/);assert.equal(s.els.submitBtn.disabled,true)});
