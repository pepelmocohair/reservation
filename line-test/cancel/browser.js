'use strict';
(function(){
  const $=id=>document.getElementById(id);
  let credentials=null;
  try {credentials=PepelSelfCancel.takeCredentials(location,history);}catch(_){/* fixed unavailable UI */}
  // Only an explicitly supplied transport can connect the standalone page.
  const transport=globalThis.PepelCancelTransport;
  const labels={loading:'予約を確認しています',preview:'予約の内容をご確認ください',confirm:'キャンセルの最終確認',
    sending:'キャンセルを送信しています',checking:'予約の状態を確認しています',unknown:'キャンセル結果を確認中です',
    done:'キャンセルが完了しました',deadline:'店舗へご連絡ください',unavailable:'予約を確認できません',read_error:'予約を取得できませんでした',
    pending:'ご予約の申請中（店舗の確認待ち）',withdrawConfirm:'申請の取り下げの最終確認',withdrawing:'取り下げを送信しています',
    withdrawn:'申請の取り下げが完了しました',declined:'ご予約をお受けできませんでした'};
  const messages={loading:'しばらくお待ちください。',preview:'キャンセルは予約日前日まで受け付けています。',
    confirm:'内容を確認して、下のボタンを押してください。',sending:'画面を閉じずにお待ちください。',checking:'取消は再送せず、状態だけを確認しています。',
    unknown:'結果がまだ確定していません。取消は再送していません。予約の状態を確認するか、店舗へご連絡ください。',
    done:'この予約のキャンセルを確認しました。',deadline:'当日のキャンセルは公式LINEでご連絡ください。',
    unavailable:'保存したキャンセルリンクから開き直すか、店舗へお問い合わせください。',read_error:'通信状況を確認して、予約の状態を再確認してください。',
    pending:'このご予約はまだ確定していません。店舗が確認後、確定のご連絡をします。申請を取り下げる場合は、予約時の電話番号を入力してください。',
    withdrawConfirm:'内容を確認して、下のボタンを押してください。',withdrawing:'画面を閉じずにお待ちください。',
    withdrawn:'この申請の取り下げを確認しました。',declined:'ご希望の日時でのご予約をお受けできませんでした。お手数ですが、別の日時で改めてご予約ください。'};
  const notices={confirmed_meanwhile:'店舗の確認が済み、ご予約は確定しました。取り下げはしていません。',changed_meanwhile:'ご予約の状態が変わりました。取り下げはしていません。'};
  function render(state){
    const phase=state.phase;
    $('phaseTitle').textContent=state.alreadyCancelled?'この予約はキャンセル済みです':state.alreadyWithdrawn?'この申請は取り下げ済みです':labels[phase];
    $('notice').textContent=(state.notice&&notices[state.notice]?notices[state.notice]+' ':'')+messages[phase];
    const pending=phase==='pending';
    $('entry').hidden=phase!=='preview'&&!pending;
    $('reasonFields').hidden=pending;$('reviewButton').hidden=pending;$('withdrawReviewButton').hidden=!pending;
    $('withdrawReviewButton').disabled=!pending || !$('phone').value.trim();
    $('confirmation').hidden=phase!=='confirm';
    $('withdrawConfirmation').hidden=phase!=='withdrawConfirm';
    $('withdrawButton').disabled=phase!=='withdrawConfirm';$('withdrawBackButton').disabled=phase!=='withdrawConfirm';
    $('inspectButton').hidden=!['unknown','read_error'].includes(phase);
    $('contact').hidden=!['unknown','deadline','unavailable','read_error'].includes(phase);
    $('phone').disabled=phase!=='preview'&&!pending;$('reason').disabled=phase!=='preview';
    $('confirmButton').disabled=phase!=='confirm';$('backButton').disabled=phase!=='confirm';
    $('reviewButton').disabled=phase!=='preview' || !$('phone').value.trim();
    $('details').replaceChildren();$('details').hidden=!state.details;
    const rows=state.details?[['ご予約日',state.details.date],['時刻',state.details.time],['メニュー',state.details.menu],
      ['状態',{confirmed:'確定',pending:'申請中（店舗の確認待ち）',declined:'お受けできませんでした',withdrawn:'申請を取り下げました',cancelled:'キャンセル済み'}[state.details.bookingState]||'']]:[];
    if(phase==='confirm' && $('reason').value.trim())rows.push(['取消理由',$('reason').value]);
    for(const [label,value] of rows){
      const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
      dt.textContent=label;dd.textContent=value;row.append(dt,dd);$('details').appendChild(row);
    }
    if(['unknown','done','deadline','unavailable','withdrawn','declined'].includes(phase)){$('phone').value='';$('reason').value='';}
    if(!['loading','checking','sending','withdrawing'].includes(phase))$('phaseTitle').focus();
  }
  const controller=PepelSelfCancel.createController({credentials,transport,onChange:render});
  credentials=null;
  $('phone').addEventListener('input',()=>{$('reviewButton').disabled=!$('phone').value.trim() || controller.getState().phase!=='preview';
    $('withdrawReviewButton').disabled=!$('phone').value.trim() || controller.getState().phase!=='pending';});
  const fields=()=>({phone:$('phone').value,reason:$('reason').value});
  $('reviewButton').addEventListener('click',()=>controller.review(fields()));
  $('backButton').addEventListener('click',()=>controller.back());
  $('confirmButton').addEventListener('click',()=>controller.cancel(fields()));
  $('inspectButton').addEventListener('click',()=>controller.inspect());
  $('withdrawReviewButton').addEventListener('click',()=>controller.reviewWithdraw(fields()));
  $('withdrawBackButton').addEventListener('click',()=>controller.back());
  $('withdrawButton').addEventListener('click',()=>controller.withdraw(fields()));
  controller.inspect();
})();
