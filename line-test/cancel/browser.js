'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let credentials=null;
  try {credentials=PepelSelfCancel.takeCredentials(location,history);}catch(_){/* fixed unavailable UI */}
  // Only an explicitly supplied transport can connect the standalone page.
  const transport=globalThis.PepelCancelTransport;
  const labels={loading:'予約を確認しています',preview:'予約の内容をご確認ください',confirm:'キャンセルの最終確認',
    sending:'キャンセルを送信しています',checking:'予約の状態を確認しています',unknown:'キャンセル結果を確認中です',
    done:'キャンセルが完了しました',deadline:'店舗へご連絡ください',unavailable:'予約を確認できません',read_error:'予約を取得できませんでした'};
  const messages={loading:'しばらくお待ちください。',preview:'キャンセルは予約日前日まで受け付けています。',
    confirm:'内容を確認して、下のボタンを押してください。',sending:'画面を閉じずにお待ちください。',checking:'取消は再送せず、状態だけを確認しています。',
    unknown:'結果がまだ確定していません。取消は再送していません。予約の状態を確認するか、店舗へご連絡ください。',
    done:'この予約のキャンセルを確認しました。',deadline:'当日のキャンセルはLINEまたはお電話でご連絡ください。',
    unavailable:'保存したキャンセルリンクから開き直すか、店舗へお問い合わせください。',read_error:'通信状況を確認して、予約の状態を再確認してください。'};
  function render(state){
    const phase=state.phase;
    $('phaseTitle').textContent=state.alreadyCancelled?'この予約はキャンセル済みです':labels[phase];
    $('notice').textContent=messages[phase];
    $('entry').hidden=phase!=='preview';
    $('confirmation').hidden=phase!=='confirm';
    $('inspectButton').hidden=!['unknown','read_error'].includes(phase);
    $('contact').hidden=!['unknown','deadline','unavailable','read_error'].includes(phase);
    $('phone').disabled=phase!=='preview';$('reason').disabled=phase!=='preview';
    $('confirmButton').disabled=phase!=='confirm';$('backButton').disabled=phase!=='confirm';
    $('reviewButton').disabled=phase!=='preview' || !$('phone').value.trim();
    $('details').replaceChildren();$('details').hidden=!state.details;
    const rows=state.details?[['ご予約日',state.details.date],['時刻',state.details.time],['メニュー',state.details.menu]]:[];
    if(phase==='confirm' && $('reason').value.trim())rows.push(['取消理由',$('reason').value]);
    for(const [label,value] of rows){
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('details').appendChild(row);
    }
    if(['unknown','done','deadline','unavailable'].includes(phase)){$('phone').value='';$('reason').value='';}
    if(!['loading','checking','sending'].includes(phase))$('phaseTitle').focus();
  }
  const controller=PepelSelfCancel.createController({credentials,transport,onChange:render});
  credentials=null;
  $('phone').addEventListener('input',()=>{$('reviewButton').disabled=!$('phone').value.trim() || controller.getState().phase!=='preview';});
  const fields=()=>({phone:$('phone').value,reason:$('reason').value});
  $('reviewButton').addEventListener('click',()=>controller.review(fields()));
  $('backButton').addEventListener('click',()=>controller.back());
  $('confirmButton').addEventListener('click',()=>controller.cancel(fields()));
  $('inspectButton').addEventListener('click',()=>controller.inspect());
  controller.inspect();
})();
