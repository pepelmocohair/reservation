// Offline local preview with the prepared GAS source and in-memory Sheets.
// BACKEND_SOURCE=/path/to/prepared/コード.js node tests/local-preview.cjs
const http=require('node:http'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const backendPath=process.env.BACKEND_SOURCE;
if(!backendPath)throw new Error('Set BACKEND_SOURCE to the prepared GAS source (never deploy from this tool).');
const code=fs.readFileSync(backendPath,'utf8');
if(!code.includes('MAX_CUSTOMER_REQUESTS_LENGTH'))throw new Error('Use the prepared GAS source with customerRequests support.');
const sheets={};
function sheet(name,values){return {
 getName:()=>name,getDataRange:()=>({getValues:()=>values}),getLastRow:()=>values.length,
 appendRow:row=>values.push(row),getRange:(r,c)=>({setNumberFormat:()=>{},setValue:v=>{values[r-1][c-1]=v;}})
};}
sheets['シート1']=sheet('シート1',[['予約ID','お客様名','LINEアカウント','予約日','開始時間','メニュー','ステータス','メニューID','予約時料金表記','予約時所要時間（分）','予約時メニュー明細JSON','電話番号','キャンセルトークンSHA-256','ご要望']]);
sheets['メニュー設定']=sheet('メニュー設定',[
 ['ID','分類','メニュー名','料金表記','所要時間（分）','WEB予約受付','表示順'],
 ['cut','カット','カット','¥3,800',60,true,1],
 ['color','カラー','フルカラー','¥7,000',110,true,2],
 ['child','カット','幼〜小学生カット','¥2,500',50,true,3]
]);
sheets['営業日設定']=sheet('営業日設定',[['日付','区分','メモ']]);
let locked=false;
const ctx={console,Set,SpreadsheetApp:{getActiveSpreadsheet:()=>({getSheetByName:n=>sheets[n],getSheets:()=>Object.values(sheets)}),flush:()=>{}},
 LockService:{getScriptLock:()=>({tryLock:()=>locked?false:(locked=true),hasLock:()=>locked,releaseLock:()=>{locked=false;}})},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(a,v)=>Array.from(crypto.createHash(a).update(v).digest()),formatDate:(d,z,f)=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:z,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  const date=`${p.year}-${p.month}-${p.day}`,time=`${p.hour}:${p.minute}`;
  return f==='yyyy-MM-dd HH:mm'?date+' '+time:f==='yyyy-MM-dd'?date:time;
 }},ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>JSON.parse(text)})}};
vm.createContext(ctx);vm.runInContext(code,ctx);
const source=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const page=source.replace(/const GAS_WEB_APP_URL =\s*'[^']+';/,"const GAS_WEB_APP_URL = location.origin + '/api';")
 .replace('RESERVATION / ご予約','ローカル確認用 / 予約は本番に保存されません');
const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/api'){
  let data;
  if(req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){res.writeHead(413);res.end();return;}}
   data=ctx.doPost({postData:{contents:body}});
  }else if(req.method==='GET')data=ctx.doGet({parameter:Object.fromEntries(url.searchParams)});
  else{res.writeHead(405);res.end();return;}
  res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify(data));return;
 }
 if(url.pathname!=='/' && url.pathname!=='/index.html'){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);
});
const host=process.env.PREVIEW_HOST||'0.0.0.0',port=Number(process.env.PREVIEW_PORT||4173);
server.listen(port,host,()=>console.log(`Local preview on ${host}:${port}. In-memory demo data only; no Google/production requests. Restart to reset.`));
