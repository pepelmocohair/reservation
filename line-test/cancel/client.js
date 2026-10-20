(function(root,factory){
  'use strict';
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.PepelSelfCancel=factory();
})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  function takeCredentials(location,history) {
    const params=new URLSearchParams(location.hash.slice(1));
    // Scrub immediately, before any transport/DOM rendering. Never persist a credential.
    history.replaceState(null,'',location.pathname+'#cancel');
    if(params.getAll('cancel').length!==1 || params.getAll('token').length!==1 ||
       [...params.keys()].some(k=>!['cancel','token'].includes(k)))return null;
    const reservationId=params.get('cancel'),cancelToken=params.get('token');
    if(!reservationId || reservationId.length>100 || !/^[a-f0-9]{64}$/.test(cancelToken || ''))return null;
    return Object.freeze({reservationId,cancelToken});
  }
  function createController({credentials,transport,onChange=()=>{}}) {
    let state={phase:'idle'}, busy=false, uncertain=false, finished=false;
    const emit=(phase,extra={})=>{state=Object.freeze({phase,...extra});onChange(state);return state;};
    const view=data=>data && data.status==='success' && typeof data.date==='string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date) &&
      typeof data.time==='string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(data.time) && typeof data.menu==='string' && typeof data.cancelled==='boolean'
      ? {date:data.date,time:data.time,menu:data.menu,cancelled:data.cancelled} : null;
    const request=(action,extra={})=>transport({sourceType:'WEB_PAGE',action,...credentials,...extra});
    async function inspect() {
      if(busy || finished)return state;
      if(!credentials || typeof transport!=='function')return emit('unavailable');
      busy=true;emit(uncertain?'checking':'loading');
      try {
        const data=await request('cancelPreview'),details=view(data);
        if(details?.cancelled){finished=true;return emit('done',{details,alreadyCancelled:true});}
        // An active read cannot prove that an earlier cancellation will never commit.
        if(uncertain)return emit('unknown');
        if(data?.status==='cancel_deadline_passed')return emit('deadline');
        if(data?.status==='cancel_unavailable')return emit('unavailable');
        if(!details)return emit('read_error');
        return emit('preview',{details});
      } catch (_) { return emit(uncertain?'unknown':'read_error'); }
      finally {busy=false;}
    }
    function review({phone,reason=''}) {
      if(busy || uncertain || finished || state.phase!=='preview' || typeof phone!=='string' || !phone.trim())return false;
      // Phone/reason stay in the form until submission, never in public controller state.
      emit('confirm',{details:state.details});return true;
    }
    function back() {if(!busy && state.phase==='confirm')emit('preview',{details:state.details});}
    async function cancel({phone,reason=''}={}) {
      if(busy || uncertain || finished || state.phase!=='confirm' || typeof phone!=='string' || !phone.trim() || typeof reason!=='string')return state;
      busy=true;const details=state.details;emit('sending',{details});
      // Mark uncertainty before invoking transport, which may fail after starting a commit.
      uncertain=true;
      try {
        const data=await request('cancelReservation',{phone,...(reason.trim()?{reason}: {})});
        if(data?.status==='success' && typeof data.alreadyCancelled==='boolean') {
          finished=true;uncertain=false;return emit('done',{details,alreadyCancelled:data.alreadyCancelled});
        }
        if(data?.status==='cancel_deadline_passed'){uncertain=false;return emit('deadline');}
        if(data?.status==='cancel_unavailable'){uncertain=false;return emit('unavailable');}
        return emit('unknown');
      } catch (_) {return emit('unknown');}
      finally {busy=false;}
    }
    return Object.freeze({inspect,review,back,cancel,getState:()=>state});
  }
  // Same-origin POST-only binding. Caller can instead supply Claude's existing API adapter.
  function httpTransport({endpoint,fetchImpl=globalThis.fetch,base=globalThis.location?.href,timeoutMs=15000}) {
    if(typeof endpoint!=='string' || !endpoint || typeof fetchImpl!=='function')throw Error('cancel endpoint unavailable');
    const url=new URL(endpoint,base),origin=new URL(base).origin;
    if(!['http:','https:'].includes(url.protocol) || url.origin!==origin || url.search || url.hash || url.username || url.password)throw Error('cancel endpoint unavailable');
    return async body=>{
      const abort=new AbortController();
      const timer=setTimeout(()=>abort.abort(),timeoutMs);
      try {
        const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:abort.signal});
        if(!response.ok)throw Error('cancel transport unavailable');
        return await response.json();
      } finally {clearTimeout(timer);}
    };
  }
  return Object.freeze({takeCredentials,createController,httpTransport});
});
