const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(process.env.FRONTEND_SOURCE || require('node:path').join(__dirname,'../index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
class Element {
 constructor(text='',value=''){this.textContent=text;this.value=value;this.disabled=false;this.style={};this.children=[];this.events={};}
 replaceChildren(...children){this.children=children;this.value=children[0]?.value||'';}
 appendChild(child){this.children.push(child);child.parent=this;}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(item=>item!==this);}
 addEventListener(event,fn){this.events[event]=fn;}
 focus(){}
 setAttribute(name,value){(this.attributes ||= {})[name]=value;}
}
const menu={id:'m1',category:'分類',name:'マスター名',price:'¥1,234〜',durationMinutes:70,webBookingEnabled:true,bookable:true};
function setup(hash=''){
 const els=Object.fromEntries(['date','menu','time','name','submitBtn','loadingMsg','notice','calendar','calendarDays','monthLabel','selectedDate','menuDetails','timeButtons','timeStatus','prevMonth','nextMonth'].map(id=>[id,new Element()]));
 els.phone=new Element('', '09012345678');
 const location={hash,pathname:'/reservation/',search:''};const window={events:{},addEventListener:(e,f)=>window.events[e]=f};const history={replaceState:(a,b,url)=>{location.hash=url.slice(url.indexOf('#'));}};
 const requests=[];const ctx={location,history,window,URLSearchParams,console,Intl,Date,Set,Map,AbortController,Option:Element,encodeURIComponent,setTimeout:()=>1,clearTimeout:()=>{},
 document:{getElementById:id=>(els[id] ||= new Element()),createElement:()=>new Element()},fetch:(url,options={})=>new Promise((resolve,reject)=>requests.push({url,options,resolve:data=>resolve({ok:true,json:async()=>data}),reject}))};
 vm.createContext(ctx);vm.runInContext(script,ctx);
 return {els,requests,run:s=>vm.runInContext(s,ctx)};
}
async function ready(s,entries=[menu]){s.requests.shift().resolve({status:'success',slotMinutes:10,menus:entries});await new Promise(setImmediate);}
function availability(s,date='2099-01-06') {s.els.date.value=date;s.els.menu.value='m1';return s.run('loadAvailability()');}
const response=(date='2099-01-06',times=['10:40','11:20'])=>({status:'success',slotMinutes:10,date,menuId:'m1',isClosed:false,availableStartTimes:times});
test('initial state empty time and disabled submit, only menus GET',async()=>{const s=setup();assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true);assert.equal(s.requests.length,1);assert.match(s.requests[0].url,/action=menus/);await ready(s);assert.equal(s.els.time.disabled,true);assert.equal(s.els.menu.value,'')});
test('only master labels shown, OFF hidden and null time disabled',async()=>{const s=setup();await ready(s,[menu,{...menu,id:'off',webBookingEnabled:false},{...menu,id:'unset',bookable:false,unavailableReason:'duration_not_set',durationMinutes:null}]);const options=s.els.menu.children[1].children;assert.equal(options.length,2);assert.equal(options[0].textContent,'マスター名 ¥1,234〜 / 70分');assert.equal(options[1].disabled,true)});
test('only availableStartTimes become options; explicit selection and name required',async()=>{const s=setup();await ready(s);const p=availability(s);assert.equal(s.els.submitBtn.disabled,true);s.requests.shift().resolve(response());await p;assert.deepEqual(s.els.time.children.map(x=>x.value),['','10:40','11:20']);assert.equal(s.els.time.value,'');s.els.time.value='10:40';s.run('updateSubmit()');assert.equal(s.els.submitBtn.disabled,true);s.els.name.value='テスト';s.run('updateSubmit()');assert.equal(s.els.submitBtn.disabled,false)});
test('date input immediately invalidates old availability',async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().resolve(response());await p;s.els.date.value='2099-01-07';s.els.date.events.input();assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true)});
test('stale response cannot replace newer availability',async()=>{const s=setup();await ready(s);const first=availability(s);const old=s.requests.shift();const second=availability(s,'2099-01-07');s.requests.shift().resolve(response('2099-01-07',['12:10']));await second;old.resolve(response());await first;assert.deepEqual(s.els.time.children.map(x=>x.value),['','12:10'])});
for(const [label,data] of [['closed',{...response(),isClosed:true}],['full',response(undefined,[])],['missing times',{...response(),availableStartTimes:undefined}],['off grid',response(undefined,['10:45'])],['old API',{status:'success',reservedTimes:[]}],['error',{status:'configuration_error',message:'未準備'}]])test('fail closed '+label,async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().resolve(data);await p;assert.equal(s.els.time.disabled,true);assert.equal(s.els.submitBtn.disabled,true)});
test('GET network failure disables booking',async()=>{const s=setup();await ready(s);const p=availability(s);s.requests.shift().reject(new Error('offline'));await p;assert.equal(s.els.submitBtn.disabled,true)});
test('POST sends ID only, disables controls, no duplicate submission, completes',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='テスト';s.run('openReview()');p=s.run('submitReservation()');assert.equal(s.els.menu.disabled,true);assert.equal(s.els.date.disabled,true);assert.equal(s.els.submitBtn.disabled,true);const post=s.requests.shift();assert.equal(post.options.method,'POST');assert.deepEqual(JSON.parse(post.options.body),{sourceType:'WEB_PAGE',requestVersion:2,menuId:'m1',date:'2099-01-06',time:'10:40',name:'テスト',phone:'09012345678'});await s.run('submitReservation()');assert.equal(s.requests.length,0);post.resolve({status:'success',reservationId:'R1'});await p;assert.equal(s.requests.length,0);assert.equal(s.els.time.value,'');assert.equal(s.els.submitBtn.disabled,true);assert.equal(s.els.completedDetails.children[0].children[1].textContent,'R1')});
test('uncertain POST never automatically retries',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='テスト';s.run('openReview()');p=s.run('submitReservation()');s.requests.shift().reject(new Error('lost response'));await new Promise(setImmediate);assert.match(s.requests[0].url,/action=availability/);s.requests.shift().resolve(response());await p;assert.match(s.els.notice.textContent,/登録済みの可能性/);assert.equal(s.els.submitBtn.disabled,true)});

test('calendar gates dates until menu selection, marks today and blocks past dates',async()=>{
 const s=setup();await ready(s);assert.equal(s.els.calendar.disabled,true);
 s.els.menu.value='m1';s.run('renderCalendar()');assert.equal(s.els.calendar.disabled,false);
 const days=s.els.calendarDays.children.filter(x=>x.type==='button');
 const today=days.find(x=>x.attributes['aria-current']==='date');assert.ok(today);assert.equal(today.disabled,false);
 assert.ok(days.filter(x=>Number(x.textContent)<Number(today.textContent)).every(x=>x.disabled));
 assert.equal(s.els.prevMonth.disabled,true);assert.match(s.els.menuDetails.textContent,/70分/);
});
test('calendar next and previous month, year rollover, selected date retained',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';s.run("calendarMonth='2099-12';renderCalendar();moveMonth(1)");
 assert.equal(s.els.monthLabel.textContent,'2100年1月');s.run('moveMonth(-1)');assert.equal(s.els.monthLabel.textContent,'2099年12月');
 s.els.date.value='2099-12-15';s.run('renderCalendar()');assert.equal(s.els.calendarDays.children.find(x=>x.textContent==='15').attributes['aria-pressed'],'true');
});
test('calendar click requests selected date, time buttons reflect only API and require explicit click',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';s.run("calendarMonth='2099-01';renderCalendar()");
 s.els.calendarDays.children.find(x=>x.textContent==='6').events.click();assert.match(s.requests[0].url,/date=2099-01-06/);
 s.requests.shift().resolve(response());await new Promise(setImmediate);
 assert.deepEqual(s.els.timeButtons.children.map(x=>x.textContent),['10:40','11:20']);assert.equal(s.els.time.value,'');
 s.els.name.value='名前';s.els.timeButtons.children[0].events.click();assert.equal(s.els.time.value,'10:40');assert.equal(s.els.submitBtn.disabled,false);
 assert.equal(s.els.timeButtons.children[0].attributes['aria-pressed'],'true');
});
test('menu change clears time buttons and old response cannot restore them',async()=>{
 const s=setup();await ready(s,[menu,{...menu,id:'m2'}]);let p=availability(s);s.requests.shift().resolve(response());await p;
 s.els.timeButtons.children[0].events.click();s.els.menu.value='m2';s.els.menu.events.change();
 assert.equal(s.els.timeButtons.children.length,0);assert.equal(s.els.time.value,'');assert.equal(s.els.date.value,'');
 assert.equal(s.requests.length,0);assert.match(s.els.menuDetails.textContent,/マスター名/);
 s.els.toDate.events.click();const req=s.requests.shift();assert.match(req.url,/menuId=m2/);
 req.resolve(weekResponse(req,['13:10']));await new Promise(setImmediate);
 assert.equal(s.run('weekMenuId'),'m2');
});

test('cards use master fields, hide OFF and disable unbookable',async()=>{const s=setup();await ready(s,[menu,{...menu,id:'off',webBookingEnabled:false},{...menu,id:'unset',bookable:false,durationMinutes:null}]);const cards=s.els.menuCards.children[0].children.slice(1);assert.equal(cards.length,2);assert.equal(cards[1].disabled,true);cards[0].events.click();assert.equal(s.els.menu.value,'m1');assert.equal(s.els.toDate.disabled,false);assert.equal(s.els.customerPanel.hidden,true);s.els.toDate.events.click();assert.equal(s.els.datePanel.hidden,false);});
test('review displays exact data and POST cannot bypass review or use changed name',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='確認名';await s.run('submitReservation()');assert.equal(s.requests.length,0);s.run('openReview()');assert.equal(s.els.reviewPanel.hidden,false);assert.deepEqual(s.els.reviewDetails.children.map(row=>row.children[1].textContent),['マスター名','¥1,234〜','70分','2099-01-06　10:40','確認名','09012345678']);s.els.name.value='変更名';await s.run('submitReservation()');assert.equal(s.requests.length,0);});
test('changing date invalidates reviewed booking and closes customer path',async()=>{const s=setup();await ready(s);let p=availability(s);s.requests.shift().resolve(response());await p;s.els.time.value='10:40';s.els.name.value='確認名';s.run('openReview()');s.els.editDate.events.click();s.run('invalidateWeek()');s.requests.shift().reject(new Error('cancelled'));p=availability(s,'2099-01-07');assert.equal(s.els.toCustomer.disabled,true);assert.equal(s.els.reviewPanel.hidden,true);s.requests.shift().resolve(response('2099-01-07',[]));await p;await s.run('submitReservation()');assert.equal(s.requests.length,0);});

function weekResponse(req,times=['10:40']) {
 const params=new URL(req.url).searchParams,start=params.get('startDate'),menuId=params.get('menuId');
 const dates=params.has('dates')?params.get('dates').split(','):Array.from({length:7},(_,i)=>{const d=new Date(start+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
 return {status:'success',slotMinutes:10,startDate:start,menuId,days:Object.fromEntries(dates.map(date=>[date,{...response(date,times),menuId,openingTime:'10:30',closingTime:'11:00'}]))};
}
async function weekReady(s,times=['10:40']) {
 const p=s.run('loadWeek()'),req=s.requests.shift();req.resolve(weekResponse(req,times));await p;
}
test('week grid uses single API for circles, black for unavailable and unknown while loading',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';
 const p=s.run('loadWeek()');assert.equal(s.requests.length,1);const req=s.requests.shift();assert.match(req.url,/action=availabilityWeek/);
 assert.equal(s.els.schedule.children[1].children[0].children[1].className,'unknown');
 req.resolve(weekResponse(req));await p;assert.equal(s.requests.length,0);
 const rows=s.els.schedule.children[1].children;assert.deepEqual(rows.map(r=>r.children[0].textContent),['10:30','10:40','10:50']);
 assert.equal(rows[0].children[1].className,'unavailable');assert.equal(rows[1].children[1].children[0].textContent,'◎');assert.equal(rows[2].children[1].className,'unavailable');
});
test('week cell revalidates with API and selects exact date and time',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const button=s.els.schedule.children[1].children[1].children[1].children[0];const p=button.events.click();
 const req=s.requests.shift();const date=new URL(req.url).searchParams.get('date');req.resolve(response(date,['10:40']));await p;
 assert.equal(s.els.time.value,'10:40');assert.equal(s.els.date.value,date);assert.equal(s.els.toCustomer.disabled,false);
});
test('failed days never appear black; stale weekly response cannot overwrite',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';const p=s.run('loadWeek()');const old=s.requests.shift();s.run('invalidateWeek()');old.resolve(response());await p;assert.equal(s.els.schedule.children.length,0);
 const q=s.run('loadWeek()');s.requests.shift().reject(new Error('offline'));await q;
 assert.equal(s.els.schedule.children[1].children[0].children[1].className,'unknown');assert.equal(s.els.retryWeek.hidden,false);
});

test('recheck turns newly filled cell black and refuses selection',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const p=s.els.schedule.children[1].children[1].children[1].children[0].events.click();
 const req=s.requests.shift(),date=new URL(req.url).searchParams.get('date');
 req.resolve({...response(date,[]),openingTime:'10:30',closingTime:'11:00'});await p;
 assert.equal(s.els.time.value,'');assert.equal(s.els.toCustomer.disabled,true);
 assert.equal(s.els.schedule.children[1].children[1].children[1].className,'unavailable');
});

test('all 25 cards can be selected individually with synchronized details and zero menu-screen GETs',async()=>{
 const s=setup(),entries=Array.from({length:25},(_,i)=>({...menu,id:'PM'+String(i+1).padStart(4,'0'),name:'メニュー'+i,price:'¥'+(1000+i),durationMinutes:30+i*10,category:'分類'+Math.floor(i/5)}));await ready(s,entries);
 for(const entry of entries){const cards=s.els.menuCards.children.flatMap(g=>g.children.slice(1));const card=cards.find(c=>c.children[0].textContent===entry.name);assert.equal(card.disabled,false);card.events.click();assert.equal(s.els.menu.value,entry.id);assert.match(s.els.menuDetails.textContent,new RegExp(entry.durationMinutes+'分'));assert.ok(s.els.menuDetails.textContent.includes(entry.price));assert.equal(s.els.menuCards.children.flatMap(g=>g.children.slice(1)).filter(c=>c.attributes['aria-pressed']==='true').length,1);s.run('selectMenu('+JSON.stringify(entry.id)+',true)');assert.equal(s.els.toDate.disabled,true);}
 assert.equal(s.requests.length,0);
});
test('partial week success survives failed-days-only retry',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';let p=s.run('loadWeek()'),req=s.requests.shift(),data=weekResponse(req);const dates=Object.keys(data.days);data.days[dates[2]]={status:'error',date:dates[2]};req.resolve(data);await p;
 assert.equal(s.run('weekDays.filter(d=>d.data).length'),6);assert.equal(s.els.retryWeek.hidden,false);
 p=s.run('loadWeek(true)');req=s.requests.shift();assert.equal(new URL(req.url).searchParams.get('dates'),dates[2]);assert.equal(s.run('weekDays.filter(d=>d.data).length'),6);
 req.resolve(weekResponse(req));await p;assert.equal(s.run('weekDays.filter(d=>d.data).length'),7);assert.equal(s.els.retryWeek.hidden,true);
});
test('duplicate week load is deduplicated and rapid menu change aborts stale week',async()=>{
 const s=setup();await ready(s,[menu,{...menu,id:'m2'}]);s.run("selectMenu('m1')");const p=s.run('loadWeek()'),old=s.requests.shift();await s.run('loadWeek()');assert.equal(s.requests.length,0);
 s.run("selectMenu('m2')");assert.equal(old.options.signal.aborted,true);const q=s.run('loadWeek()'),req=s.requests.shift();req.resolve(weekResponse(req));await q;old.resolve(weekResponse(old));await p;assert.equal(s.run('weekMenuId'),'m2');assert.equal(s.run('weekDays[0].data.menuId'),'m2');
});

test('multiple cards toggle, total duration and unchanged price strings, clearing all disables booking',async()=>{
 const s=setup();await ready(s,[menu,{...menu,id:'m2',name:'カラー',price:'¥5,000〜',durationMinutes:90}]);
 s.run("selectMenu('m1',true);selectMenu('m2',true)");
 assert.deepEqual(JSON.parse(s.els.menu.value),['m1','m2']);assert.match(s.els.menuDetails.textContent,/160分/);
 assert.ok(s.els.menuDetails.textContent.includes('¥1,234〜 ＋ ¥5,000〜'));
 assert.equal(s.els.menuCards.children[0].children.slice(1).filter(c=>c.attributes['aria-pressed']==='true').length,2);
 s.run("selectMenu('m1',true)");assert.equal(s.els.menu.value,'m2');assert.match(s.els.menuDetails.textContent,/90分/);
 s.run("selectMenu('m2',true)");assert.equal(s.els.menu.value,'');assert.equal(s.els.toDate.disabled,true);assert.equal(s.els.submitBtn.disabled,true);
});
test('combined week and daily use IDs only, review and POST preserve selection and prevent double submit',async()=>{
 const s=setup();await ready(s,[menu,{...menu,id:'m2',name:'カラー',durationMinutes:90}]);s.run("selectMenu('m1',true);selectMenu('m2',true)");
 const ids=['m1','m2'];let p=s.run('loadWeek()'),req=s.requests.shift();let params=new URL(req.url).searchParams;
 assert.deepEqual(JSON.parse(params.get('menuIds')),ids);assert.equal(params.has('menuId'),false);assert.equal(s.requests.length,0);
 let data=weekResponse(req);delete data.menuId;data.menuIds=ids;Object.values(data.days).forEach(d=>{delete d.menuId;d.menuIds=ids});req.resolve(data);await p;
 p=s.els.schedule.children[1].children[1].children[1].children[0].events.click();req=s.requests.shift();params=new URL(req.url).searchParams;
 assert.deepEqual(JSON.parse(params.get('menuIds')),ids);const date=params.get('date'),daily={...response(date,['10:40']),menuIds:ids};delete daily.menuId;
 req.resolve(daily);await p;s.els.name.value='複数テスト';s.run('openReview()');assert.equal(s.els.reviewDetails.children[2].children[1].textContent,'160分');
 p=s.run('submitReservation()');const post=s.requests.shift();assert.deepEqual(JSON.parse(post.options.body),{sourceType:'WEB_PAGE',requestVersion:2,menuIds:ids,date,time:'10:40',name:'複数テスト',phone:'09012345678'});
 await s.run('submitReservation()');assert.equal(s.requests.length,0);post.resolve({status:'success',reservationId:'MULTI'});await p;assert.equal(s.els.completedPanel.hidden,false);
});
test('changing combination aborts old weekly response and clears reviewed date and time',async()=>{
 const s=setup();await ready(s,[menu,{...menu,id:'m2'}]);s.run("selectMenu('m1',true);selectMenu('m2',true)");const p=s.run('loadWeek()'),old=s.requests.shift();
 s.els.time.value='10:40';s.els.date.value='2099-01-06';s.run("selectMenu('m2',true)");assert.equal(old.options.signal.aborted,true);assert.equal(s.els.date.value,'');assert.equal(s.els.time.value,'');
 old.resolve(weekResponse(old));await p;assert.equal(s.run('weekDays.length'),0);assert.equal(s.els.submitBtn.disabled,true);
});

async function reviewReady(s,phone='09012345678') {
 await ready(s);const p=availability(s);s.requests.shift().resolve(response());await p;
 s.els.time.value='10:40';s.els.name.value='電話テスト';s.els.phone.value=phone;s.run('openReview()');
}
for(const phone of ['090-1234-5678','09012345678','03-1234-5678','０９０－１２３４－５６７８']) test('phone accepted and POST normalized: '+phone,async()=>{
 const s=setup();await reviewReady(s,phone);const p=s.run('submitReservation()');const req=s.requests.shift();
 assert.equal(JSON.parse(req.options.body).phone,phone.startsWith('03')?'0312345678':'09012345678');
 req.resolve({status:'success',reservationId:'PHONE'});await p;assert.equal(s.els.completedPanel.hidden,false);
});
for(const phone of ['', ' ', 'abc', '123', '090000000000', '00000000000']) test('invalid phone blocks review and POST: '+JSON.stringify(phone),async()=>{
 const s=setup();await reviewReady(s,phone);assert.equal(s.els.reviewBtn.disabled,true);await s.run('submitReservation()');assert.equal(s.requests.length,0);assert.equal(s.els.completedPanel.hidden,true);
});
test('success displays submitted details, hides entire form and cannot start another reservation',async()=>{
 const s=setup();await reviewReady(s);const p=s.run('submitReservation()');s.requests.shift().resolve({status:'success',reservationId:'DONE'});await p;
 assert.equal(s.els.bookingForm.hidden,true);assert.equal(s.els.completedPanel.hidden,false);
 for(const step of ['menu','date','customer','review']) assert.equal(s.els[step+'Panel'].hidden,true);
 assert.deepEqual(s.els.completedDetails.children.map(row=>row.children[1].textContent),['DONE','マスター名','2099-01-06　10:40']);
 assert.equal(s.els.phone.disabled,true);assert.equal(s.els.submitBtn.disabled,true);
 await s.run("showStep('menu');selectMenu('m1');loadAvailability();loadWeek();loadMenus();submitReservation()");assert.equal(s.requests.length,0);assert.equal(s.els.bookingForm.hidden,true);
 assert.match(html,/ご予約を承りました。/);assert.match(html,/予約手続きは完了しました。この画面は閉じていただいて大丈夫です。/);
 assert.match(html, /type="tel" id="phone" inputmode="tel" autocomplete="tel"/);
});
test('phone change after review cannot bypass reconfirmation',async()=>{
 const s=setup();await reviewReady(s);s.els.phone.value='08012345678';await s.run('submitReservation()');assert.equal(s.requests.length,0);
});
test('conflict POST keeps form and error, never displays completion',async()=>{
 const s=setup();await reviewReady(s);const p=s.run('submitReservation()');s.requests.shift().resolve({status:'conflict',message:'すでに予約されています'});
 await new Promise(setImmediate);s.requests.shift().resolve(response(undefined,[]));await p;
 assert.equal(s.els.completedPanel.hidden,true);assert.equal(s.els.bookingForm.hidden,false);assert.match(s.els.notice.textContent,/すでに予約/);assert.equal(s.els.phone.disabled,false);
});

const token='a'.repeat(64),cancelHash='#cancel=WEB-TEST&token='+token;
async function cancellationReady(s,cancelled=false) {
 assert.equal(s.requests.length,1);const request=s.requests.shift();assert.equal(request.options.method,'POST');assert.equal(JSON.parse(request.options.body).action,'cancelPreview');
 assert.equal(request.url.includes(token),false);request.resolve({status:'success',date:'2099-01-06',time:'10:40',menu:'カット ＋ カラー',cancelled});await new Promise(setImmediate);
}
test('v2 POST shows fragment cancel link without phone after booking success',async()=>{
 const s=setup();await reviewReady(s);const p=s.run('submitReservation()'),req=s.requests.shift();assert.equal(JSON.parse(req.options.body).requestVersion,2);
 req.resolve({status:'success',reservationId:'WEB-TEST',cancelToken:token,canCancel:true});await p;
 assert.equal(s.els.cancelLink.hidden,false);assert.equal(s.els.cancelLink.href,cancelHash);assert.equal(s.els.cancelLink.href.includes('09012345678'),false);assert.equal(s.els.cancelLinkHint.hidden,false);
});
test('opening cancel link only previews, hides booking form, scrubs address and exposes no name/phone',async()=>{
 const s=setup(cancelHash);assert.equal(s.run('location.hash'),'#cancel');assert.equal(s.els.bookingForm.hidden,true);await cancellationReady(s);
 assert.deepEqual(s.els.cancelDetails.children.map(r=>r.children[1].textContent),['2099-01-06　10:40','カット ＋ カラー']);assert.equal(s.requests.length,0);assert.equal(s.els.cancelSubmit.disabled,true);assert.equal(s.els.completedPanel.hidden,true);
});
test('explicit cancellation sends token ID phone, blocks double click and shows completed only on success',async()=>{
 const s=setup(cancelHash);await cancellationReady(s);s.els.cancelPhone.value='090-1234-5678';s.els.cancelPhone.events.input();
 const p=s.run('submitCancellation()'),req=s.requests.shift();assert.deepEqual(JSON.parse(req.options.body),{sourceType:'WEB_PAGE',action:'cancelReservation',reservationId:'WEB-TEST',cancelToken:token,phone:'09012345678'});
 assert.equal(s.els.cancelSubmit.disabled,true);await s.run('submitCancellation()');assert.equal(s.requests.length,0);
 req.resolve({status:'success',alreadyCancelled:false});await p;assert.match(s.els.cancelNotice.textContent,/予約をキャンセルしました/);assert.equal(s.els.cancelControls.hidden,true);assert.equal(s.els.cancelPhone.value,'');
 await s.run('submitCancellation()');assert.equal(s.requests.length,0);
});
for(const failure of ['wrong credentials','network']) test('failed cancellation never completes or auto-retries: '+failure,async()=>{
 const s=setup(cancelHash);await cancellationReady(s);s.els.cancelPhone.value='09012345678';const p=s.run('submitCancellation()'),req=s.requests.shift();
 if(failure==='network')req.reject(new Error('lost'));else req.resolve({status:'cancel_unavailable',message:'denied'});await p;
 assert.doesNotMatch(s.els.cancelNotice.textContent,/予約をキャンセルしました/);assert.equal(s.els.cancelControls.hidden,false);assert.equal(s.requests.length,0);assert.equal(s.els.completedPanel.hidden,true);
});
test('cancelled preview disables cancellation and never POSTs mutation',async()=>{
 const s=setup(cancelHash);await cancellationReady(s,true);assert.match(s.els.cancelNotice.textContent,/キャンセル済み/);s.els.cancelPhone.value='09012345678';await s.run('submitCancellation()');assert.equal(s.requests.length,0);assert.equal(s.els.cancelControls.hidden,true);
});
test('invalid link or failed preview cannot submit cancellation',async()=>{
 const broken=setup('#cancel=WEB-TEST');await new Promise(setImmediate);assert.equal(broken.requests.length,0);assert.match(broken.els.cancelNotice.textContent,/予約を確認できません/);
 const s=setup(cancelHash);s.requests.shift().resolve({status:'cancel_unavailable',message:'denied'});await new Promise(setImmediate);s.els.cancelPhone.value='09012345678';await s.run('submitCancellation()');assert.equal(s.requests.length,0);
});
test('empty or invalid cancellation phone cannot submit',async()=>{
 const s=setup(cancelHash);await cancellationReady(s);
 for(const value of ['','abc','123']){s.els.cancelPhone.value=value;await s.run('submitCancellation()');assert.equal(s.requests.length,0);assert.equal(s.els.cancelSubmit.disabled,true);}
});
test('completion remains hidden if async booking render runs on cancellation screen',async()=>{
 const s=setup(cancelHash);await cancellationReady(s);s.run('renderFlow()');assert.equal(s.els.completedPanel.hidden,true);assert.equal(s.els.bookingForm.hidden,true);
});
test('saved completion link opens preview in same page via hashchange without another booking',async()=>{
 const s=setup();await reviewReady(s);const p=s.run('submitReservation()');s.requests.shift().resolve({status:'success',reservationId:'WEB-TEST',cancelToken:token,canCancel:true});await p;
 s.run("location.hash='"+cancelHash+"';window.events.hashchange()");await cancellationReady(s);assert.equal(s.els.completedPanel.hidden,true);assert.equal(s.els.bookingForm.hidden,true);
});

test('late preview cannot overwrite a newer cancellation target',async()=>{
 const s=setup(cancelHash),old=s.requests.shift();s.run("location.hash='#cancel=WEB-NEW&token="+'b'.repeat(64)+"';openCancellation()");
 const next=s.requests.shift();next.resolve({status:'success',date:'2099-01-07',time:'11:00',menu:'新しい対象',cancelled:false});await new Promise(setImmediate);
 old.resolve({status:'success',date:'2099-01-06',time:'10:40',menu:'古い対象',cancelled:false});await new Promise(setImmediate);
 assert.deepEqual(s.els.cancelDetails.children.map(r=>r.children[1].textContent),['2099-01-07　11:00','新しい対象']);
});
test('late cancel response cannot mark a different target cancelled',async()=>{
 const s=setup(cancelHash);await cancellationReady(s);s.els.cancelPhone.value='09012345678';const p=s.run('submitCancellation()'),old=s.requests.shift();
 s.run("location.hash='#cancel=WEB-NEW&token="+'b'.repeat(64)+"';openCancellation()");s.requests.shift().resolve({status:'success',date:'2099-01-07',time:'11:00',menu:'新しい対象',cancelled:false});await new Promise(setImmediate);
 old.resolve({status:'success'});await p;assert.doesNotMatch(s.els.cancelNotice.textContent,/予約をキャンセルしました/);assert.equal(s.els.cancelControls.hidden,false);assert.equal(s.els.cancelPhone.disabled,false);
});

test('visible menu loading, deduplicated fetch and master cards after completion',async()=>{
 const s=setup();assert.equal(s.els.menuLoading.hidden,false);assert.equal(s.els.menuCards.attributes['aria-busy'],'true');
 await s.run('loadMenus()');assert.equal(s.requests.length,1);await ready(s);
 assert.equal(s.els.menuLoading.hidden,true);assert.equal(s.els.menuCards.attributes['aria-busy'],'false');
 assert.equal(s.els.menuCards.children[0].children[1].children[0].textContent,menu.name);
 assert.match(html,/メニューを読み込んでいます/);
});
test('failed menus offer explicit retry without blank loading or duplicate requests',async()=>{
 const s=setup();s.requests.shift().reject(new Error('offline'));await new Promise(setImmediate);
 assert.equal(s.els.menuLoading.hidden,true);assert.equal(s.els.retryMenus.hidden,false);assert.equal(s.els.toDate.disabled,true);
 const p=s.els.retryMenus.events.click();assert.equal(s.els.menuLoading.hidden,false);assert.equal(s.els.retryMenus.hidden,true);
 await s.run('loadMenus()');assert.equal(s.requests.length,1);await ready(s);await p;assert.equal(s.els.menu.disabled,false);
});
test('circle highlights synchronously, blocks repeated and other taps until revalidation',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const old=s.els.schedule.children[1].children[1].children[1].children[0];const p=old.events.click();
 const selected=s.els.schedule.children[1].children[1].children[1].children[0];
 assert.equal(selected.attributes['aria-pressed'],'true');assert.equal(selected.disabled,true);
 assert.match(s.els.selectionStatus.textContent,/選択中.*再確認中/);assert.equal(s.els.toCustomer.disabled,true);
 await old.events.click();await s.els.schedule.children[1].children[1].children[2].children[0].events.click();
 assert.equal(s.requests.length,1);s.run("showStep('customer')");assert.equal(s.els.customerPanel.hidden,true);
 const req=s.requests.shift(),date=new URL(req.url).searchParams.get('date');req.resolve(response(date));await p;
 assert.equal(s.els.toCustomer.disabled,false);assert.equal(s.els.schedule.children[1].children[1].children[1].children[0].attributes['aria-pressed'],'true');
 assert.doesNotMatch(s.els.selectionStatus.textContent,/再確認中/);
});
test('failed circle recheck clears pending highlight and allows retry while keeping next disabled',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const p=s.els.schedule.children[1].children[1].children[1].children[0].events.click();s.requests.shift().reject(new Error('offline'));await p;
 const button=s.els.schedule.children[1].children[1].children[1].children[0];
 assert.equal(button.disabled,false);assert.equal(button.attributes['aria-pressed'],'false');assert.equal(s.els.toCustomer.disabled,true);
 assert.match(s.els.selectionStatus.textContent,/別の◎/);
});
test('week change during circle recheck never restores an old selection',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const p=s.els.schedule.children[1].children[1].children[1].children[0].events.click(),old=s.requests.shift();
 s.run('moveWeek(1)');const req=s.requests.shift();req.resolve(weekResponse(req));await new Promise(setImmediate);
 old.resolve(response(new URL(old.url).searchParams.get('date')));await p;
 assert.equal(s.els.time.value,'');assert.equal(s.els.toCustomer.disabled,true);assert.equal(s.run('pendingSlot'),null);
});
test('four step indicators follow menu, date, customer, review and back navigation',async()=>{
 const s=setup();await ready(s);s.run("selectMenu('m1');showStep('menu')");assert.equal(s.els['step-menu'].attributes['aria-current'],'step');
 s.els.toDate.events.click();assert.equal(s.els['step-date'].attributes['aria-current'],'step');await readyWeek();
 const p=s.els.schedule.children[1].children[1].children[1].children[0].events.click(),req=s.requests.shift();req.resolve(response(new URL(req.url).searchParams.get('date')));await p;
 s.els.toCustomer.events.click();assert.equal(s.els['step-customer'].attributes['aria-current'],'step');
 s.els.name.value='テスト';s.els.phone.value='03-1234-5678';s.els.phone.events.input();s.els.reviewBtn.events.click();
 assert.equal(s.els['step-review'].attributes['aria-current'],'step');assert.equal(s.els['step-customer'].attributes['aria-current'],'false');
 assert.equal(s.els.reviewDetails.children[5].children[1].textContent,'0312345678');
 s.els.backCustomer.events.click();assert.equal(s.els['step-customer'].attributes['aria-current'],'step');
 async function readyWeek(){const req=s.requests.shift();req.resolve(weekResponse(req));await new Promise(setImmediate);}
});

test('tapping already validated selected circle keeps selection without redundant daily GET',async()=>{
 const s=setup();await ready(s);s.els.menu.value='m1';await weekReady(s);
 const p=s.els.schedule.children[1].children[1].children[1].children[0].events.click(),req=s.requests.shift();
 req.resolve(response(new URL(req.url).searchParams.get('date')));await p;
 await s.els.schedule.children[1].children[1].children[1].children[0].events.click();
 assert.equal(s.requests.length,0);assert.equal(s.els.time.value,'10:40');assert.equal(s.els.toCustomer.disabled,false);
});
