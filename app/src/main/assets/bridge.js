(function(){
  if (window.__DEEPSEEK_AGENT_BRIDGE_V2__) return;
  window.__DEEPSEEK_AGENT_BRIDGE_V2__ = true;

  const SERVER = 'http://127.0.0.1:8790';
  const state = { activeTask:null, busy:false, injectedAt:new Date().toISOString() };

  function log(){ try { console.log('[AgentBridge]', ...arguments); } catch(e){} }
  function sleep(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }
  function visible(el){ if(!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4; }
  function candidates(sel){ return Array.from(document.querySelectorAll(sel)).filter(visible); }

  async function nativeGet(path){
    const url = SERVER + path;
    if (window.TermuxAgentBridge && typeof window.TermuxAgentBridge.get === 'function') {
      return JSON.parse(window.TermuxAgentBridge.get(url));
    }
    const r = await fetch(url, { cache:'no-store' });
    return await r.json();
  }

  async function nativePost(path, data){
    const url = SERVER + path;
    const payload = JSON.stringify(data || {});
    if (window.TermuxAgentBridge && typeof window.TermuxAgentBridge.post === 'function') {
      const raw = window.TermuxAgentBridge.post(url, payload);
      try { return JSON.parse(raw); } catch(e) { return { ok:true, raw:raw }; }
    }
    const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:payload });
    try { return await r.json(); } catch(e) { return { ok:r.ok }; }
  }

  function findInput(){
    const areas = candidates('textarea, [contenteditable="true"], div[role="textbox"]');
    return areas.find(el => /message|chat|deepseek|send|اكتب|رسالة/i.test(el.getAttribute('placeholder') || el.getAttribute('aria-label') || '')) || areas[areas.length - 1] || null;
  }

  function findSendButton(){
    const buttons = candidates('button, div[role="button"], [aria-label]');
    return buttons.find(el => /send|submit|إرسال|ارسال/i.test(el.getAttribute('aria-label') || el.textContent || '')) || buttons.reverse().find(el => {
      const text = (el.textContent || '').trim();
      const r = el.getBoundingClientRect();
      return r.bottom > window.innerHeight * 0.55 && text.length < 20;
    }) || null;
  }

  function setNativeValue(el, value){
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const setter = Object.getOwnPropertyDescriptor(el.__proto__, 'value') && Object.getOwnPropertyDescriptor(el.__proto__, 'value').set;
      if (setter) setter.call(el, value); else el.value = value;
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:value }));
      el.dispatchEvent(new Event('change', { bubbles:true }));
    } else {
      el.textContent = value;
      el.dispatchEvent(new InputEvent('input', { bubbles:true, inputType:'insertText', data:value }));
    }
  }

  function tryTogglePowerModes(){
    const nodes = Array.from(document.querySelectorAll('button, div[role="button"], label')).filter(visible);
    for (const el of nodes) {
      const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
      if (/deepthink|deep think|think|تفكير|search|بحث|expert/.test(text) && !/on|enabled|مفعل/.test(text)) {
        try { el.click(); } catch(e) {}
      }
    }
  }

  async function sendPrompt(prompt){
    tryTogglePowerModes();
    const input = findInput();
    if (!input) return { ok:false, error:'input_not_found', url:location.href };
    setNativeValue(input, prompt);
    await sleep(300);
    const button = findSendButton();
    if (button) { button.click(); return { ok:true, method:'button' }; }
    input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', code:'Enter', bubbles:true, cancelable:true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { key:'Enter', code:'Enter', bubbles:true, cancelable:true }));
    return { ok:true, method:'enter' };
  }

  function responseNodes(){
    return Array.from(document.querySelectorAll('[class*="markdown"], [class*="answer"], [class*="message"], .ds-markdown, article, main div')).filter(el => visible(el) && (el.innerText || '').trim().length > 20);
  }

  function latestResponseText(){
    const nodes = responseNodes();
    const texts = nodes.map(n => (n.innerText || '').trim()).filter(Boolean);
    return (texts[texts.length - 1] || document.body.innerText || '').trim();
  }

  function isStreaming(){
    return /stop generating|generating response|writing answer|جاري الرد|يكتب الآن/i.test(document.body.innerText || '');
  }

  async function waitForAnswer(timeoutMs){
    const started = Date.now();
    let stable = 0;
    let last = '';
    while (Date.now() - started < timeoutMs) {
      await sleep(1200);
      const text = latestResponseText();
      if (text && text === last && !isStreaming()) stable++; else stable = 0;
      last = text;
      if (stable >= 2 && text.length > 10) return { ok:true, text:text, complete:true, url:location.href };
    }
    return { ok:false, text:last, complete:false, error:'response_timeout', url:location.href };
  }

  async function runTask(task){
    state.busy = true;
    state.activeTask = task.id;
    log('task', task.id);
    const sent = await sendPrompt(task.payload || 'Reply with JSON only: {"kind":"chat_only","say":"OK","steps":[]}');
    if (!sent.ok) {
      await nativePost('/bridge/submit-response', { id:task.id, ok:false, error:sent.error, url:location.href, rawOutput:JSON.stringify({kind:'needs_more_info', say:'Bridge failed: '+sent.error, steps:[]}) });
      state.busy = false;
      return;
    }
    const answer = await waitForAnswer(180000);
    await nativePost('/bridge/submit-response', { id:task.id, ok:answer.ok, rawOutput:answer.text || '', text:answer.text || '', url:location.href, complete:answer.complete, error:answer.error || null });
    state.busy = false;
  }

  async function loop(){
    while(true){
      try {
        await nativeGet('/bridge/status');
        if (!state.busy) {
          const task = await nativeGet('/bridge/next-task');
          if (task && task.action === 'PROMPT') runTask(task);
        }
      } catch(error) {
        log('loop error', error && error.message);
      }
      await sleep(state.busy ? 2000 : 1500);
    }
  }

  loop();
  log('installed', state.injectedAt, window.TermuxAgentBridge ? 'native-bridge' : 'fetch-fallback');
})();
