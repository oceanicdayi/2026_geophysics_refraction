'use strict';
// Teaching ray model. Times returned in milliseconds; distances in metres.
const Physics = (() => {
  function paths(x, v1, v2, h, two = true) {
    const direct = 1000 * x / v1;
    if (!two || v2 <= v1) return {direct, head: Infinity, first: direct, critical: Infinity, crossover: Infinity, intercept: null, angle: null};
    const angle = Math.asin(v1 / v2), critical = 2 * h * Math.tan(angle);
    const intercept = 2000 * h * Math.cos(angle) / v1;
    const head = x >= critical ? intercept + 1000 * x / v2 : Infinity;
    return {direct, head, first: Math.min(direct, head), critical, crossover: intercept / (1000 / v1 - 1000 / v2), intercept, angle};
  }
  function fit(points) {
    if (points.length < 2) return null;
    const mx = points.reduce((s,p)=>s+p.x,0)/points.length, mt = points.reduce((s,p)=>s+p.t,0)/points.length;
    const den = points.reduce((s,p)=>s+(p.x-mx)**2,0);
    if (!den) return null;
    const slope = points.reduce((s,p)=>s+(p.x-mx)*(p.t-mt),0)/den;
    return {slope, intercept:mt-slope*mx, velocity:slope>0?1000/slope:null};
  }
  return {paths, fit};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Physics;
if (typeof document !== 'undefined') (() => {
  const $ = id => document.getElementById(id), TRUE = {v1:300,v2:900,h:6};
  const state = {step:0,n:1,recorded:false,full:false,noise:false,picks:{},shot:0,animation:0,rayFrame:0,split:15,fitVisible:false,modelType:'one',v1:300,v2:700,h:4,ray:1};
  const prompts = [
    ['一個訊號，能告訴我們多少？','從一個感測器開始，逐步增加到 2、3、4、5 個。先預測遠近站的差異，再敲擊取得證據。'],
    ['距離和到時，有什麼規律？','標記第一到時，把觀測轉成距離—走時圖。用近距離的規律預測更遠的感測器。'],
    ['更多證據，會改變原來的解釋嗎？','增加到 8、12、16 個感測器。遠處的到時是否仍沿原本的直線？提出可以檢驗的假說。'],
    ['什麼地下模型，能解釋觀測？','先試單一速度，再考慮水平兩層。比較模型預測與觀測，修正你的解釋。'],
    ['我們如何知道看不見的地下？','用主張、證據與推理說明你的模型，並提出下一次檢驗和仍未解決的問題。']
  ];
  const colors = {teal:'#45e0c6',amber:'#ffc365',purple:'#c6a6ff',muted:'#98b4c7',grid:'#254356',text:'#e1edf5'};
  let waveGeom, travelGeom, notes = {}, saveTimer;
  try { const loaded = JSON.parse(localStorage.getItem('seismic-inquiry-notes-v1')||'{}'); if (loaded && typeof loaded==='object' && !Array.isArray(loaded)) notes=loaded; } catch (_) {}
  document.querySelectorAll('[data-note]').forEach(el=>{el.value=typeof notes[el.dataset.note]==='string'?notes[el.dataset.note]:'';el.addEventListener('input',()=>{notes[el.dataset.note]=el.value;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem('seismic-inquiry-notes-v1',JSON.stringify(notes));}catch(_){$('record-status').textContent='瀏覽器未允許儲存；請匯出探究紀錄以保留文字。';}},200);});});
  function truePaths(x) { return Physics.paths(x,TRUE.v1,TRUE.v2,TRUE.h); }
  function modelPaths(x) { return Physics.paths(x,state.v1,state.v2,state.h,state.modelType==='two'); }
  function waveEnd() { return Math.max(90,state.n*10+45); }
  function points() { return state.recorded ? Array.from({length:state.n},(_,i)=>({x:(i+1)*3,t:state.picks[i+1]})).filter(p=>Number.isFinite(p.t)) : []; }
  function setCount(n) {
    n=Number(n);if(!Number.isInteger(n)||n<1||n>16) throw new Error('感測器數量需為 1–16 的整數。');
    cancelAnimationFrame(state.rayFrame); state.animation++;
    state.n=n;state.recorded=false;state.ray=Math.min(state.ray,n);state.fitVisible=false;
    $('strike').disabled=false;$('record-status').textContent='配置已更新，請敲擊取得這組感測器的同步紀錄。先前到時標記會保留於相同測點。';render();
  }
  function setStep(step) {
    state.step=step;
    if (step===1 && state.n<5) setCount(5);
    if (step===2 && state.n<=5) setCount(12);
    document.querySelectorAll('[data-step]').forEach(b=>{const active=Number(b.dataset.step)===step;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current');});
    $('step-number').textContent=`0${step+1} / 05`; $('step-title').textContent=prompts[step][0];$('step-question').textContent=prompts[step][1];
    $('next-step').textContent=step===4?'回到第一步':'下一步';
    $('analysis').hidden=step<1;$('surprise').hidden=step<2;$('model-section').hidden=step<3;$('conclusion').hidden=step<4;$('model-legend').hidden=step<3;
    render();
  }
  function layout() {
    const start=70,end=842,max=Math.max(15,state.n*3), xx=x=>start+(end-start)*x/max;
    let svg='<rect x="28" y="30" width="844" height="95" rx="8" fill="#e2ecef"/><path d="M70 85H842" stroke="#86a4b3" stroke-width="2"/>';
    svg+=`<path d="M${start-8} 52l16 16m-16 0l16-16" stroke="#b2771d" stroke-width="4"/><text x="70" y="30" text-anchor="middle" fill="#926014" font-size="15">敲擊點</text><text x="70" y="151" text-anchor="middle" fill="#4d6879" font-size="14">0 m</text>`;
    for(let i=1;i<=state.n;i++){const x=xx(i*3);svg+=`<circle cx="${x}" cy="85" r="7" fill="#008579"/><path d="M${x} 94v8" stroke="#008579"/><text x="${x}" y="64" text-anchor="middle" fill="#134f4b" font-size="14">S${i}</text><text x="${x}" y="151" text-anchor="middle" fill="#4d6879" font-size="14">${i*3}</text>`;}
    svg+='<text x="865" y="151" fill="#4d6879" font-size="13">m</text>'; $('layout').innerHTML=svg;
  }
  function canvasSetup(id,height) {
    const canvas=$(id),width=Math.max(280,canvas.parentElement.clientWidth),dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.style.height=height+'px';canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.fillStyle='#0c2336';ctx.fillRect(0,0,width,height);
    ctx.font='12px system-ui';return {canvas,ctx,width,height};
  }
  function text(ctx,value,x,y,color=colors.muted,align='left') {ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(value,x,y);}
  function line(ctx,x1,y1,x2,y2,color,width=1,dash=[]) {ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.setLineDash(dash);ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.setLineDash([]);}
  // A causal synthetic onset, not a peak-aligned noncausal wavelet.
  function pulse(dt,freq,amp) {return dt<=0?0:amp*(1-Math.exp(-dt/1.0))*Math.exp(-dt/17)*Math.sin(dt*freq);}
  function sample(t,i) {
    const p=truePaths(i*3),noise=state.noise ? .085*(Math.sin(t*1.71+i*3.2+state.shot)+.55*Math.sin(t*2.79+i*6.7)):0;
    return noise+pulse(t-p.direct,.86,1)+ (Number.isFinite(p.head)?pulse(t-p.head,.71,.72):0);
  }
  function drawWaves() {
    const row=state.n<=5?55:42, height=state.n*row+73;
    const g=canvasSetup('waves',height), {ctx,width}=g, left=width<450?55:76,right=width-20,top=40;
    const max=state.full?20:waveEnd(),x=t=>left+(right-left)*t/max;
    waveGeom={...g,left,right,top,row,max};
    for(let k=0;k<=5;k++){const v=max*k/5;line(ctx,x(v),25,x(v),height-34,colors.grid);text(ctx,state.full?v.toFixed(0):(v).toFixed(0),x(v),height-14,colors.muted,'center');}
    text(ctx,state.full?'記錄時間（s）':'敲擊後（ms）',right,15,colors.muted,'right');
    if(state.full){line(ctx,x(10),25,x(10),height-34,colors.amber,1,[4,4]);text(ctx,'敲擊',x(10)+5,30,colors.amber);}
    for(let i=1;i<=state.n;i++) {
      const y=top+(i-1)*row+row/2, amp=row*.31;
      line(ctx,left,y,right,y,colors.grid);text(ctx,`${i*3} m`,left-10,y+4,colors.text,'right');
      if(!state.recorded) continue;
      // Per-trace normalization is independent of displayed time scale.
      let peak=.01;for(let t=0;t<=waveEnd();t+=.25)peak=Math.max(peak,Math.abs(sample(t,i)));
      ctx.strokeStyle=colors.teal;ctx.lineWidth=1.1;ctx.beginPath();
      if(state.full) {
        // Min/max envelope for each pixel preserves short signals at a 20 s scale.
        const pixels=Math.ceil(right-left),bucket=20000/pixels;
        for(let px=0;px<pixels;px++) {let min=0,maxamp=0;const ta=px*bucket-10000,tb=ta+bucket;
          for(let t=Math.ceil(ta/.25)*.25;t<tb;t+=.25){const val=sample(t,i)/peak;min=Math.min(min,val);maxamp=Math.max(maxamp,val);}
          ctx.moveTo(left+px,y-min*amp);ctx.lineTo(left+px,y-maxamp*amp);
        }
      }else{for(let j=0;j<=Math.ceil(max/.25);j++){const t=j*.25,yy=y-sample(t,i)/peak*amp;if(j===0)ctx.moveTo(x(t),yy);else ctx.lineTo(x(t),yy);}}
      ctx.stroke();
      if(Number.isFinite(state.picks[i])){const val=state.full?10+state.picks[i]/1000:state.picks[i];const px=x(val);line(ctx,px,y-amp-5,px,y+amp+5,colors.amber,1.5);ctx.fillStyle=colors.amber;ctx.beginPath();ctx.arc(px,y,3,0,Math.PI*2);ctx.fill();if(!state.full)text(ctx,state.picks[i].toFixed(2),Math.min(px+6,right-42),y-amp-4,colors.amber);}
    }
    if(!state.recorded){ctx.fillStyle='#0c2336d9';ctx.fillRect(left,28,right-left,height-65);text(ctx,'按「敲擊並記錄」取得波形',width/2,height/2,colors.text,'center');}
  }
  function drawTravel() {
    if($('analysis').hidden)return;
    const g=canvasSetup('travel',330),{ctx,width,height}=g,left=width<450?48:65,right=width-23,top=25,bottom=height-45;
    const ps=points(),fit=Physics.fit(ps.filter(p=>p.x<=state.split)),maxX=Math.max(18,state.n*3+3);
    let maxT=Math.max(80,...ps.map(p=>p.t),fit?Math.max(0,fit.intercept+fit.slope*maxX):0);
    if(state.step>=3)maxT=Math.max(maxT,modelPaths(maxX).first);
    maxT=Math.ceil(maxT/20)*20+20;
    const x=v=>left+(right-left)*v/maxX,y=v=>bottom-(bottom-top)*v/maxT;
    travelGeom={...g,left,right,top,bottom,maxX,maxT};
    for(let k=0;k<=5;k++){const xv=maxX*k/5,tv=maxT*k/5;line(ctx,x(xv),top,x(xv),bottom,colors.grid);line(ctx,left,y(tv),right,y(tv),colors.grid);text(ctx,xv.toFixed(0),x(xv),bottom+20,colors.muted,'center');text(ctx,tv.toFixed(0),left-8,y(tv)+4,colors.muted,'right');}
    text(ctx,'t（ms）',left,15);text(ctx,'x（m）',right,height-8,colors.muted,'right');
    if(fit&&fit.slope>0){line(ctx,x(0),y(fit.intercept),x(maxX),y(fit.intercept+fit.slope*maxX),colors.amber,1.5,[6,5]);}
    if(state.fitVisible){const far=Physics.fit(ps.filter(p=>p.x>state.split));if(far)line(ctx,x(state.split),y(far.intercept+far.slope*state.split),x(maxX),y(far.intercept+far.slope*maxX),colors.teal,1.5,[3,3]);}
    if(state.step>=3){ctx.beginPath();ctx.strokeStyle=colors.purple;ctx.lineWidth=2.5;for(let j=0;j<=400;j++){const v=maxX*j/400,t=modelPaths(v).first;j?ctx.lineTo(x(v),y(t)):ctx.moveTo(x(v),y(t));}ctx.stroke();}
    ps.forEach(p=>{ctx.beginPath();ctx.fillStyle=colors.teal;ctx.arc(x(p.x),y(p.t),4.5,0,Math.PI*2);ctx.fill();});
    if(!ps.length)text(ctx,'先在波形或到時表格標記觀測',width/2,height/2,colors.text,'center');
  }
  function table() {
    $('pick-table').innerHTML=Array.from({length:state.n},(_,i)=>{const s=i+1,p=state.picks[s],has=state.recorded&&Number.isFinite(p);return `<tr><td>S${s}</td><td>${s*3}</td><td><input type="number" aria-label="S${s} 第一到時，毫秒" data-pick="${s}" min="0" max="${waveEnd()}" step="any" ${!state.recorded?'disabled':''} value="${has?p:''}" placeholder="未標記"></td><td id="absolute-${s}">${has?(10+p/1000).toFixed(5):'—'}</td></tr>`;}).join('');
    $('pick-table').querySelectorAll('input').forEach(input=>input.addEventListener('change',()=>{const s=Number(input.dataset.pick),v=Number(input.value);if(input.value==='')delete state.picks[s];else if(Number.isFinite(v)&&v>=0&&v<=waveEnd())state.picks[s]=v;else{input.value=Number.isFinite(state.picks[s])?state.picks[s]:'';input.setCustomValidity(`請填寫 0–${waveEnd()} ms。`);input.reportValidity();return;}input.setCustomValidity('');$(`absolute-${s}`).textContent=Number.isFinite(state.picks[s])?(10+state.picks[s]/1000).toFixed(5):'—';updatePlots();}));
    $('ray-station').innerHTML=Array.from({length:state.n},(_,i)=>`<option value="${i+1}" ${state.ray===i+1?'selected':''}>S${i+1} · ${(i+1)*3} m</option>`).join('');
  }
  function fitMessage() {
    const ps=points(),near=Physics.fit(ps.filter(p=>p.x<=state.split)),far=Physics.fit(ps.filter(p=>p.x>state.split));
    if(!near){$('fit-results').textContent='至少標記兩個近距離到時，才能估算斜率。';return;}
    let html=`近距離斜率 <b>${near.slope.toFixed(3)} ms/m</b>；表觀速度 <b>${near.velocity?near.velocity.toFixed(0)+' m/s':'無法由非正斜率估算'}</b>。<br>t ≈ ${near.intercept.toFixed(2)} + ${near.slope.toFixed(3)}x（ms）。`;
    if(state.fitVisible){if(!far)html+='<br>遠距離至少還需要兩個到時點。';else{html+=`<br>遠距離斜率 <b>${far.slope.toFixed(3)} ms/m</b>；表觀速度 <b>${far.velocity?far.velocity.toFixed(0)+' m/s':'無法由非正斜率估算'}</b>；截距 ${far.intercept.toFixed(2)} ms。`;
      const ti=far.intercept-near.intercept;
      if(far.velocity>near.velocity&&near.velocity>0&&ti>0){const xc=ti/(near.slope-far.slope),h=ti/1000*near.velocity/(2*Math.sqrt(1-(near.velocity/far.velocity)**2));html+=`<br>若假設水平兩層、可靠時間零點與合適分段：交會距離約 <b>${xc.toFixed(2)} m</b>；厚度約 <b>${h.toFixed(2)} m</b>。`;}else html+='<br>這組分段尚不支持高速下層的截距法估厚；檢查標記、分界與模型假設。';}
      html+='<br><span class="small">兩點可定一直線，卻不足以檢查散布。分界選錯會混合不同分支；請與波形和資料點一起判斷。</span>';
    }$('fit-results').innerHTML=html;
  }
  function drawSection(progress=null) {
    if($('model-section').hidden)return;
    const xMax=Math.max(18,state.n*3+3),zMax=20,left=72,right=850,top=45,bottom=286,xx=x=>left+(right-left)*x/xMax,yy=z=>top+(bottom-top)*z/zMax;
    const two=state.modelType==='two',target=state.ray*3,p=modelPaths(target),interfaceY=yy(state.h),endpoint=xx(target);
    let svg=`<rect x="${left}" y="${top}" width="${right-left}" height="${bottom-top}" fill="#d7e7eb"/>`;
    if(two)svg+=`<rect x="${left}" y="${interfaceY}" width="${right-left}" height="${bottom-interfaceY}" fill="#b9d0df"/><path d="M${left} ${interfaceY}H${right}" stroke="#7895ae" stroke-width="2"/><text x="${right-12}" y="${interfaceY+26}" text-anchor="end" fill="#294f6b" font-size="15">下層 v₂ = ${state.v2} m/s</text>`;
    svg+=`<text x="${right-12}" y="${Math.min(top+25,interfaceY-8)}" text-anchor="end" fill="#2f6670" font-size="15">${two?'上層':'均勻介質'} v₁ = ${state.v1} m/s</text>`;
    for(let z=0;z<=20;z+=5){svg+=`<text x="${left-13}" y="${yy(z)+5}" text-anchor="end" fill="#516b7d" font-size="14">${z}</text><path d="M${left-5} ${yy(z)}H${left}" stroke="#718c9f"/>`;}
    for(let x=0;x<=xMax;x+=3){svg+=`<path d="M${xx(x)} ${bottom}v5" stroke="#718c9f"/><text x="${xx(x)}" y="${bottom+24}" text-anchor="middle" fill="#516b7d" font-size="13">${x}</text>`;}
    svg+='<text x="13" y="23" fill="#516b7d" font-size="13">深度（m）</text><text x="850" y="328" text-anchor="end" fill="#516b7d" font-size="13">距離（m）</text>';
    svg+=`<path d="M${left} ${top}H${right}" stroke="#547e85" stroke-width="2"/><text x="${left}" y="29" text-anchor="middle" fill="#936113" font-size="14">敲擊</text><text x="${endpoint}" y="29" text-anchor="middle" fill="#075f57" font-size="14">S${state.ray}</text><circle cx="${endpoint}" cy="${top}" r="5" fill="#008579"/><path d="M${left} ${top-5}l7 10m-7 0l7-10" stroke="#b47b1e" stroke-width="2"/><path d="M${left} ${top+4}H${endpoint}" stroke="#c58b2d" stroke-width="3" fill="none"/>`;
    let headPoints;
    if(two&&Number.isFinite(p.head)){const off=state.h*Math.tan(p.angle);headPoints=[[0,0],[off,state.h],[target-off,state.h],[target,0]];svg+=`<polyline points="${headPoints.map(([x,z])=>`${xx(x)},${yy(z)}`).join(' ')}" stroke="#7957bf" stroke-width="3" fill="none"/>`;}
    if(progress!==null){const directX=target*Math.min(1,progress/p.direct);svg+=`<circle cx="${xx(directX)}" cy="${top+4}" r="7" fill="#ffc365" stroke="#896215"/>`;
      if(headPoints){const off=headPoints[1][0],leg=1000*state.h/Math.cos(p.angle)/state.v1,mid=1000*(target-2*off)/state.v2;let x,z;
        if(progress<=leg){const f=progress/leg;x=off*f;z=state.h*f;}else if(progress<=leg+mid){const f=(progress-leg)/mid;x=off+(target-2*off)*f;z=state.h;}else{const f=Math.min(1,(progress-leg-mid)/leg);x=target-off+off*f;z=state.h*(1-f);}svg+=`<circle cx="${xx(x)}" cy="${yy(z)}" r="7" fill="#c6a6ff" stroke="#7957bf"/>`;}
    }
    $('section').innerHTML=svg;
  }
  function modelMessage() {
    $('v1-label').textContent=state.v1+' m/s';$('v2-label').textContent=state.v2+' m/s';$('depth-label').textContent=state.h+' m';
    const two=state.modelType==='two';$('v2').disabled=!two;$('depth').disabled=!two;
    const ps=points(),rmse=ps.length?Math.sqrt(ps.reduce((s,p)=>s+(p.t-modelPaths(p.x).first)**2,0)/ps.length):null,p=modelPaths(state.ray*3);
    let html=`<div class="metrics"><div class="metric"><span>模型與已標記觀測的 RMSE</span><strong>${rmse===null?'尚無到時':rmse.toFixed(2)+' ms'}</strong></div><div class="metric"><span>S${state.ray} 直達波預測</span><strong>${p.direct.toFixed(2)} ms</strong></div><div class="metric"><span>S${state.ray} 臨界折射波預測</span><strong>${Number.isFinite(p.head)?p.head.toFixed(2)+' ms':'無有效路徑'}</strong></div></div>`;
    if(two&&state.v2>state.v1)html+=`<p style="margin:12px 0 0">你的模型：交會距離 <b>${p.crossover.toFixed(2)} m</b>；截距 <b>${p.intercept.toFixed(2)} ms</b>。${state.ray*3<p.critical?'此站尚未達到臨界折射路徑成立的距離。':p.head<p.direct?'此站由經高速層的路徑先到。':'此站由直達路徑先到。'}</p>`;
    else if(two)html+='<p style="margin:12px 0 0">v₂ ≤ v₁：下層不是高速層，沒有這種臨界折射首波分支。只用這組首波資料可能無法辨識低速下層。</p>';
    html+='<p class="small" style="margin:8px 0 0">RMSE 只比較目前有標記的站；低誤差不代表模型唯一，也不代表已驗證岩性。</p>';$('model-results').innerHTML=html;
  }
  function updatePlots() {drawWaves();drawTravel();fitMessage();modelMessage();drawSection();$('pick-summary').textContent=points().length?`已標記 ${points().length} / ${state.n} 站`:'尚未標記';}
  function render() {
    $('sensor-count').value=state.n;$('count-label').textContent=state.n+' 個';$('line-length').textContent=state.n*3+' m';
    document.querySelectorAll('[data-count]').forEach(b=>{const selected=Number(b.dataset.count)===state.n;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});
    $('zoom-view').classList.toggle('selected',!state.full);$('full-view').classList.toggle('selected',state.full);$('zoom-view').setAttribute('aria-pressed',String(!state.full));$('full-view').setAttribute('aria-pressed',String(state.full));
    $('wave-scale').textContent=state.full?'橫軸：開始記錄後時間（s）；敲擊在第 10 秒':'橫軸：敲擊後時間（ms）；縱向：距離（m）';
    $('wave-help').textContent=state.full?'完整紀錄中的震波擠在第 10 秒附近。切回「到時放大」才能辨識毫秒級差異並點選第一到時。':'在每列波形「最早開始偏離背景」的位置點選第一到時。選波形起點，不是最高波峰；也可用下方表格輸入。';
    $('auto-pick').disabled=!state.recorded;$('clear-picks').disabled=!state.recorded;$('export-csv').disabled=!state.recorded;
    layout();table();updatePlots();
  }
  async function strike() {
    const token=++state.animation;state.shot++;state.recorded=false;$('strike').disabled=true;drawWaves();
    const phases=['0–10 s：同步記錄背景振動……','10 s：鐵鎚敲擊；震波開始傳播……','10–20 s：繼續記錄並停止……'];
    for(const phase of phases){if(token!==state.animation)return;$('record-status').textContent=phase;await new Promise(resolve=>setTimeout(resolve,280));}
    if(token!==state.animation)return;state.recorded=true;$('strike').disabled=false;
    $('record-status').textContent=`已完成 ${state.n} 站的同步模擬紀錄。敲擊時間為 10.000 s。${Object.keys(state.picks).length?'已保留相同測點的先前標記，請檢查。':''}`;render();
  }
  function autoPick() {if(!state.recorded)return;for(let i=1;i<=state.n;i++)state.picks[i]=Number(truePaths(i*3).first.toFixed(3));render();$('record-status').textContent='已顯示模擬真值提示；你的匯出紀錄會註記曾使用提示。';notes.usedHint='是';try{localStorage.setItem('seismic-inquiry-notes-v1',JSON.stringify(notes));}catch(_){} }
  function download(name,content,type) {const url=URL.createObjectURL(new Blob(['\ufeff',content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function exportCSV() {download('震波探究_到時.csv','station,distance_m,travel_time_ms,record_arrival_s,source\n'+points().map(p=>`S${p.x/3},${p.x},${p.t},${(10+p.t/1000).toFixed(6)},teaching_simulation`).join('\n'),'text/csv;charset=utf-8');}
  function exportNotes() {
    document.querySelectorAll('[data-note]').forEach(el=>notes[el.dataset.note]=el.value);
    const sections=[['prediction','敲擊前的預測'],['hypothesis','假說與預測'],['revision','模型修正'],['claim','Claim｜主張'],['evidence','Evidence｜證據'],['reasoning','Reasoning｜推理'],['next-test','下一次檢驗與模型限制'],['exit','Exit Ticket']];
    const ps=points();let md=`# 震波探究學習紀錄\n\n日期：${new Date().toLocaleString('zh-TW')}\n\n本紀錄使用教學模擬資料，非現地觀測。\n\n## 測線配置\n\n- 感測器：${state.n} 站，間距 3 m，第一站 3 m\n- 敲擊時間：紀錄第 10 秒；總長 20 秒；同步取樣率 4,000 Hz\n- 背景雜訊：${state.noise?'有':'無'}\n- 使用到時真值提示：${notes.usedHint||'否'}\n- 目前配置是否已取得紀錄：${state.recorded?'是':'否'}\n\n## 已標記的到時\n\n|站|距離（m）|敲擊後走時（ms）|\n|---|---:|---:|\n${ps.map(p=>`|S${p.x/3}|${p.x}|${p.t}|`).join('\n')||'|尚無標記|—|—|'}\n\n## 目前提出的模型\n\n${state.modelType==='two'?`水平兩層：v₁=${state.v1} m/s、v₂=${state.v2} m/s、h=${state.h} m`:`單一均勻介質：v=${state.v1} m/s`}\n\n`;
    md+=sections.map(([key,title])=>`## ${title}\n\n${notes[key]||'（尚未填寫）'}\n\n`).join('');md+='## 原理與限制\n\n在橫軸 x、縱軸 t 的走時圖，斜率是速度的倒數。兩段首波斜率可支持速度分層模型，但不能單獨確定岩性或唯一地下構造。模型需以新證據檢驗。\n\n參考：https://www.epa.gov/environmental-geophysics/seismic-refraction\n';download('震波探究_學習紀錄.md',md,'text/markdown;charset=utf-8');
  }
  $('sensor-count').addEventListener('input',e=>setCount(e.target.value));document.querySelectorAll('[data-count]').forEach(b=>b.addEventListener('click',()=>setCount(b.dataset.count)));
  document.querySelectorAll('[data-step]').forEach(b=>b.addEventListener('click',()=>setStep(Number(b.dataset.step))));$('next-step').addEventListener('click',()=>setStep((state.step+1)%5));$('strike').addEventListener('click',strike);
  $('noise').addEventListener('change',e=>{state.noise=e.target.checked;drawWaves();});
  $('zoom-view').addEventListener('click',()=>{state.full=false;render();});$('full-view').addEventListener('click',()=>{state.full=true;render();});
  $('waves').addEventListener('click',event=>{
    if(!state.recorded||state.full)return;const r=$('waves').getBoundingClientRect(),px=event.clientX-r.left,py=event.clientY-r.top,g=waveGeom;
    const i=Math.floor((py-g.top)/g.row)+1;if(px<g.left||px>g.right||i<1||i>state.n)return;state.picks[i]=Math.round((px-g.left)/(g.right-g.left)*g.max*4)/4;table();updatePlots();
  });$('auto-pick').addEventListener('click',autoPick);$('clear-picks').addEventListener('click',()=>{state.picks={};render();});
  $('split').addEventListener('change',e=>{state.split=Number(e.target.value);updatePlots();});$('fit').addEventListener('click',()=>{state.fitVisible=true;updatePlots();});
  $('model-type').addEventListener('change',e=>{state.modelType=e.target.value;cancelAnimationFrame(state.rayFrame);updatePlots();});
  ['v1','v2','depth'].forEach(id=>$(id).addEventListener('input',e=>{state[id==='depth'?'h':id]=Number(e.target.value);cancelAnimationFrame(state.rayFrame);updatePlots();}));
  $('ray-station').addEventListener('change',e=>{state.ray=Number(e.target.value);cancelAnimationFrame(state.rayFrame);modelMessage();drawSection();});
  $('animate-ray').addEventListener('click',()=>{
    cancelAnimationFrame(state.rayFrame);const p=modelPaths(state.ray*3),end=Math.max(p.direct,Number.isFinite(p.head)?p.head:0),started=performance.now(),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:2400;
    const animate=now=>{const f=duration?Math.min(1,(now-started)/duration):1;drawSection(f*end);if(f<1)state.rayFrame=requestAnimationFrame(animate);};state.rayFrame=requestAnimationFrame(animate);
  });
  $('teacher-model').addEventListener('click',()=>{cancelAnimationFrame(state.rayFrame);state.animation++;state.n=12;state.recorded=true;state.modelType='two';state.v1=300;state.v2=900;state.h=6;state.ray=12;state.fitVisible=true;state.split=15;$('split').value='15';$('model-type').value='two';$('v1').value=300;$('v2').value=900;$('depth').value=6;$('strike').disabled=false;setStep(3);autoPick();});
  $('export-csv').addEventListener('click',exportCSV);$('export-top').addEventListener('click',exportNotes);$('export-bottom').addEventListener('click',exportNotes);
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(updatePlots,100);});setStep(0);
  // Optional browser agent tools. No dependency or network call in unsupported browsers.
  if(document.modelContext?.registerTool){const lifecycle=new AbortController();window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
    try{Promise.resolve(document.modelContext.registerTool({name:'configure_sensor_count',title:'配置地表感測器',description:'設定 1–16 個、間距三公尺的地表感測器；配置後需重新敲擊記錄。',inputSchema:{type:'object',properties:{count:{type:'integer',minimum:1,maximum:16}},required:['count'],additionalProperties:false},annotations:{readOnlyHint:false},execute:input=>{if(!input||Object.keys(input).some(k=>k!=='count'))throw new Error('輸入需只有 count。');setCount(input.count);return {count:state.n,recorded:state.recorded};}},{signal:lifecycle.signal})).catch(()=>{});}catch(_){}
  }
})();
