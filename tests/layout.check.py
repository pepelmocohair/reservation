"""Offline Chrome layout regression: python3 tests/layout.check.py.
Uses only fixture responses; never contacts the booking API.
"""
import json, re, subprocess, tempfile
from pathlib import Path
source = (Path(__file__).resolve().parent.parent / 'index.html').read_text()
fixture = '''window.fetch = async (url) => ({ok:true,json:async()=>{
 const p=new URL(url).searchParams;
 if(p.get('action')==='menus')return {status:'success',slotMinutes:10,menus:[{id:'m1',category:'カット',name:'カット',price:'¥3,800',durationMinutes:60,bookable:true,webBookingEnabled:true}]};
 if(window.keepLoading)return await new Promise(()=>{});
 const start=p.get('startDate'), times=Array.from({length:16},(_,i)=>{const n=600+i*30;return String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')});
 if(p.get('action')==='availability')return {status:'success',slotMinutes:10,startIntervalMinutes:30,date:p.get('date'),menuId:'m1',isClosed:false,availableStartTimes:times,openingTime:'10:00',closingTime:'19:00'};
 return {status:'success',slotMinutes:10,startIntervalMinutes:30,startDate:start,menuId:'m1',days:Object.fromEntries(Array.from({length:7},(_,i)=>{const date=addDays(start,i);return [date,{status:'success',slotMinutes:10,date,menuId:'m1',isClosed:i===3,availableStartTimes:i===3?[]:times,openingTime:'10:00',closingTime:'19:00'}]}))};
}});
'''
measure = '''setTimeout(()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,height:r.height,width:r.width}};
 const region=document.getElementById('calendarRegion'), headers=[...document.querySelectorAll('#schedule thead th')].slice(1), rows=[...document.querySelectorAll('#schedule tbody tr')];
 const at16=rows.find(r=>r.firstChild.textContent==='16:00');
 const data={width:innerWidth,height:innerHeight,region:rect(region),headers:headers.map(rect),at16:at16?rect(at16):null,dock:rect(document.querySelector('.date-dock')),loading:!document.getElementById('calendarLoading').hidden,button:rect(document.querySelector('#schedule button')||document.getElementById('nextWeek')),overflow:document.documentElement.scrollWidth>innerWidth};
 const out=document.createElement('pre');out.id='layoutResult';out.textContent=JSON.stringify(data);out.hidden=true;document.body.appendChild(out);
},100);
'''
with tempfile.TemporaryDirectory(prefix='calendar-layout-') as folder:
 root=Path(folder)
 for width,height in [(320,740),(390,844),(430,932),(768,1024)]:
  measurements={}
  for state in ['loaded','loading']:
   html=source.replace('<script>','<script>window.keepLoading='+str(state=='loading').lower()+';'+fixture,1)
   html=html.replace("else { resetTimes('日付とメニューを選択してください'); renderCalendar(); loadMenus(); }", "else (async()=>{await loadMenus();selectMenu('m1');showStep('date',false);"+measure+"})();")
   page=root/f'{width}-{state}.html';page.write_text(html)
   png=f'/tmp/calendar-{width}-{state}.png'
   result=subprocess.run(['node',str(Path(__file__).with_name('layout.chrome.cjs')),str(width),str(height),page.as_uri(),png,str(root / (str(width)+state))],capture_output=True,text=True,check=True,timeout=30)
   data=json.loads(result.stdout);measurements[state]=data
   assert len(data['headers'])==7
   assert not data['overflow']
   if width>=390:
    assert all(h['x']>=0 and h['right']<=width for h in data['headers'])
   assert data['region']['y']<=230, data
   assert data['loading']==(state=='loading')
   if state=='loaded':
    assert data['interaction']['highlighted'] and data['interaction']['pendingDisabled']
    assert data['interaction']['confirmed'] and data['interaction']['noModal']
    assert all(re.fullmatch(r'\d{2}:(00|30)', t) for t in data['interaction']['times'])
    assert data['button']['height']>=36 and data['button']['width']>=38
    if width>=390: assert data['at16']['bottom']<=min(data['region']['bottom'],data['dock']['y']),data
   print(width,state,json.dumps(data,ensure_ascii=False))
  assert measurements['loaded']['region']==measurements['loading']['region']
print('PASS: four widths, seven headers, compact top, target coverage, loading geometry, tap size')
