const $ = (id) => document.getElementById(id);
const examples = {
  tangent: 'مشتق چیست؟ با یک مثال ساده توضیح بده و کمک کن شیب لحظه‌ای را روی نمودار ببینم.',
  integral: 'انتگرال x^2 از صفر تا دو را مرحله‌به‌مرحله حساب کن و مفهوم انباشت را ساده توضیح بده.',
  geometry: 'قضیهٔ فیثاغورس را با یک مثلث قائم‌الزاویه با ضلع‌های ۳ و ۴ ساده توضیح بده.',
  function: 'اثر تغییر ضریب‌ها در تابع f(x)=a*x^2+b را با یک مثال تعاملی توضیح بده.'
};
const nodeLabels = {analyze_request:'درک سؤال',ask_clarification:'روشن کردن سؤال',assess_level:'تعیین سطح توضیح',plan_lesson:'آماده کردن مسیر آموزش',explain_concept:'توضیح مفهوم',solve_problem:'حل مرحله‌به‌مرحله',calculate:'بررسی محاسبه',review_answer:'بازبینی پاسخ',revise_answer:'اصلاح پاسخ',finalize:'آماده کردن پاسخ',design_visual:'ساخت نمایش مناسب'};
const kindLabels = {steps:'مراحل حل',function:'نمودار تابع',tangent:'مماس تعاملی',integral:'انتگرال تعاملی',geometry:'هندسهٔ تعاملی',matrix:'نمایش ماتریس'};
const verificationLabels = {symbolically_checked:'نتیجه بررسی شد',reviewed_with_tool:'بازبینی با ابزار',model_reviewed:'بازبینی آموزشی',failed_review:'تأیید نشد',not_applicable:'نیاز به ادامه'};
let sessionId = null, busy = false, health = null, turns = [], currentSpec = null, currentData = null, activeTurn = -1;
let visualEpoch = 0, sampleTimer = null, sampling = false, pendingSample = false;
const svg = $('chart'), tooltip = $('chart-tooltip'), loader = $('chart-loader');
const ns = 'http://www.w3.org/2000/svg';
const number = (n) => Number(n).toLocaleString('en-US',{maximumFractionDigits:4});
function el(tag, className='', text='') {const node=document.createElement(tag);node.className=className;node.textContent=text;return node;}
function svgEl(tag, attrs={}, text='') {const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));node.textContent=text;return node;}
function toast(text) {$('toast').textContent=text;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,5000);}
async function api(path, data) {const response=await fetch(path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'ارتباط کامل نشد.');return result;}
function maths(node) {if(window.renderMathInElement)window.renderMathInElement(node,{delimiters:[{left:'$$',right:'$$',display:true},{left:'\\[',right:'\\]',display:true},{left:'\\(',right:'\\)',display:false},{left:'$',right:'$',display:false}],throwOnError:false,trust:false,maxExpand:500,maxSize:10});}
function formula(node, latex, display=false) {try{window.katex.render(latex,node,{displayMode:display,throwOnError:false,trust:false,maxExpand:500,maxSize:10});}catch{node.textContent=latex;}}
function rich(node, text) { // Always construct text nodes; never insert model-authored HTML.
  const parts=String(text).split(/(`[^`\n]+`|(?<![\w*])\*\*[^*\n]+\*\*(?![\w*]))/g);
  for(const part of parts){if(part.startsWith('`')&&part.endsWith('`'))node.append(el('span','math-inline',part.slice(1,-1)));else if(part.startsWith('**')&&part.endsWith('**'))node.append(el('strong','',part.slice(2,-2)));else node.append(document.createTextNode(part));}maths(node);
}
function setBusy(value) {busy=value;$('send-button').disabled=value;$('new-button').disabled=value;$('progress').hidden=!value;$('question').setAttribute('aria-busy',String(value));}
function prefill(text) {$('question').value=text;$('question').focus();$('composer').scrollIntoView({behavior:'smooth',block:'nearest'});}
document.querySelectorAll('[data-example]').forEach(button=>button.addEventListener('click',()=>prefill(examples[button.dataset.example])));
$('examples-nav').onclick=()=>$('examples').scrollIntoView({behavior:'smooth',block:'center'});
$('workspace-nav').onclick=()=>window.scrollTo({top:0,behavior:'smooth'});
$('guide-button').onclick=()=>$('guide-dialog').showModal();$('close-guide').onclick=()=>$('guide-dialog').close();
function mobileSettings(open){document.body.classList.toggle('settings-open',open);$('settings-button').setAttribute('aria-expanded',String(open));$('settings-backdrop').hidden=!open;}
$('settings-button').onclick=()=>mobileSettings(true);$('close-settings').onclick=()=>mobileSettings(false);$('settings-backdrop').onclick=()=>mobileSettings(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')mobileSettings(false);});
$('guide-dialog').addEventListener('click',e=>{if(e.target===$('guide-dialog'))$('guide-dialog').close();});
$('question').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();$('composer').requestSubmit();}});
$('composer').addEventListener('submit', async (e)=>{
  e.preventDefault();if(busy)return;const question=$('question').value.trim();if(!question)return;
  if(health&&!health.ready){toast(health.message);return;}
  setBusy(true);$('welcome')?.remove();const article=el('article','turn');
  const user=el('div','user-message');user.dir='auto';user.append(el('span','user-caption','سؤال تو'));user.append(document.createTextNode(question));article.append(user);$('thread').append(article);$('question').value='';article.scrollIntoView({block:'nearest',behavior:'smooth'});
  const started=Date.now();let clock=setInterval(()=>$('elapsed').textContent=Math.floor((Date.now()-started)/1000)+' s',1000);
  try{
    if(!sessionId)sessionId=(await api('/api/sessions',{})).session_id;
    const {job_id}=await api('/api/messages',{session_id:sessionId,question,level:$('level').value,language:$('language').value});
    let job;
    do {await new Promise(resolve=>setTimeout(resolve,600));job=await api(`/api/jobs/${job_id}?session_id=${encodeURIComponent(sessionId)}`);$('progress-label').textContent=nodeLabels[job.stage]||'در حال آماده کردن پاسخ…';if(Date.now()-started>15*60*1000)throw new Error('زمان انتظار طولانی شد. پاسخ ممکن است هنوز روی سرور در حال اجرا باشد.');}while(job.status==='running');
    if(job.status==='error')throw new Error(job.error);
    const index=turns.length;turns.push({question,result:job.result});renderAnswer(article,job.result,index);activateTurn(index);$('export-button').disabled=false;
    if(job.result.warning)toast(job.result.warning);
  }catch(error){article.append(el('div','error-message',error.message));$('question').value=question;}
  finally{clearInterval(clock);$('elapsed').textContent='';setBusy(false);$('question').focus();}
});
function renderAnswer(article,result,index){
  const s=result.state,head=el('div','answer-head');head.append(el('span','mini-logo','m'),el('span','','مایلو'));
  const badge=el('span','verification'+(s.status==='unverified'?' warning':''),verificationLabels[s.verification]||s.status);badge.title=s.verification;head.append(badge);article.append(head);
  if(result.demo)article.append(el('div','subtle-label','پاسخ نمونهٔ آفلاین'));
  if(s.status!=='answered'){const plain=el('p','answer-plain');rich(plain,s.final_answer);article.append(plain);}else{
    const d=s.draft,intro=el('p','answer-intro');rich(intro,d.introduction);article.append(intro);
    const details=[];
    d.steps.forEach((text,i)=>{const clean=text.replace(/^(?:\s*\d+[.)]\s+)+/,'');const item=el('details','lesson-step');item.open=i===0;const summary=el('summary');summary.append(el('span','step-number',String(i+1)),el('span','',clean.replace(/\\\([\s\S]*?\\\)/g,'رابطهٔ ریاضی').slice(0,70)));const content=el('div','step-text');rich(content,clean);item.append(summary,content);article.append(item);details.push(item);});
    const actions=el('div','step-actions'),expand=el('button','text-button','همهٔ مراحل را باز کن');expand.onclick=()=>{const open=details.some(d=>!d.open);details.forEach(d=>d.open=open);expand.textContent=open?'مراحل را جمع کن':'همهٔ مراحل را باز کن';};const simpler=el('button','text-button','ساده‌تر توضیح بده');simpler.onclick=()=>prefill('پاسخ قبلی را ساده‌تر و با یک مثال دیگر توضیح بده.');actions.append(expand,simpler);article.append(actions);
    if(d.example){const block=el('div','example-block');block.append(el('h4','','یک مثال برای فهم بهتر'));const p=el('p','example-text');rich(p,d.example);block.append(p);article.append(block);}
    if(d.result){const card=el('div','result-card');card.append(el('small','','پاسخ نهایی'));const math=el('div','result-math');let latex=d.result.replace(/\*\*/g,'^').replace(/\*/g,'\\cdot ');if(/^[-\d]+\/\d+$/.test(latex)){const [a,b]=latex.split('/');latex=`\\frac{${a}}{${b}}`;}formula(math,latex);card.append(math);article.append(card);}
    const check=el('div','check-question');check.append(el('b','','یک قدم برای اطمینان از یادگیری'));rich(check,d.check_question);article.append(check);
  }
  const route=el('details','route-details');route.append(el('summary','','چطور به این پاسخ رسیدیم؟'));const list=el('ul','route-list');s.trace.forEach(event=>{const li=el('li','',nodeLabels[event.node]||event.node);li.title=event.node+': '+event.elapsed_ms+' ms';list.append(li);});route.append(list);article.append(route);
  const select=el('button','turn-select','نمایش بصری این پاسخ');select.onclick=()=>activateTurn(index);article.append(select);
}
function activateTurn(index){activeTurn=index;document.querySelectorAll('.turn').forEach(a=>a.classList.remove('active'));const button=document.querySelectorAll('.turn-select')[index];button?.closest('.turn').classList.add('active');const r=turns[index].result;currentSpec=structuredClone(r.visual);currentData=r.data;visualEpoch++;$('visual-badge').textContent=kindLabels[currentSpec.kind];$('visual-title').textContent=currentSpec.title;$('visual-caption').textContent=currentSpec.caption||'نمایش متناسب با پاسخ؛ مراحل را در گفت‌وگو بررسی کن.';renderVisual(currentSpec,currentData,r.state);renderControls();}
$('new-button').onclick=async()=>{if(busy)return;try{if(sessionId)await api('/api/reset',{session_id:sessionId});sessionId=null;turns=[];activeTurn=-1;$('thread').replaceChildren(el('div','welcome','گفت‌وگوی تازه آماده است. از یک سؤال شروع کن.'));$('export-button').disabled=true;await preview();prefill('');}catch(e){toast(e.message);}};
$('export-button').onclick=()=>{const file=new Blob([JSON.stringify({exported_at:new Date().toISOString(),turns},null,2)],{type:'application/json'});const link=document.createElement('a');link.href=URL.createObjectURL(file);link.download='milo-conversation.json';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);};

function renderVisual(spec,data,state){
  $('chart-box').replaceChildren(svg,tooltip,loader);svg.replaceChildren();svg.style.display='block';tooltip.hidden=true;
  const formulas=$('formula-strip');formulas.replaceChildren();
  for(const latex of [data.latex,spec.kind==='tangent'?data.derivative_latex:null,spec.kind==='integral'?data.integral_latex:null].filter(Boolean)){const chip=el('div','formula-chip');formula(chip,latex);formulas.append(chip);}
  for(const f of spec.formulas||[]){const chip=el('div','formula-chip');chip.title=f.label;formula(chip,f.latex);formulas.append(chip);}
  $('metrics').replaceChildren();for(const item of data.metrics||[]){const metric=el('div','metric');metric.append(el('span','',item.label),el('strong','',number(item.value)));$('metrics').append(metric);}
  $('chart-legend').replaceChildren();
  if(['function','tangent','integral'].includes(spec.kind)){drawChart(spec,data);legend('تابع');if(spec.kind==='tangent')legend('خط مماس','tangent');if(spec.kind==='integral')legend('انباشت علامت‌دار','area');}
  else if(spec.kind==='geometry')drawGeometry(data);
  else {svg.style.display='none';const box=el('div',spec.kind==='matrix'?'matrix-visual':'steps-visual');if(spec.kind==='matrix')formula(box,data.latex,true);else{const steps=state?.status==='answered'?state.draft.steps:['سؤال را بنویس.','مراحل توضیح را دنبال کن.','برای فهم بهتر، سؤال بعدی را بپرس.'];steps.forEach((step,i)=>{const line=el('div','visual-step');line.append(el('span','',String(i+1)));const p=el('p');rich(p,step);line.append(p);box.append(line);});} $('chart-box').prepend(box);}
  $('visual-notice').textContent='تغییر کنترل‌ها برای کاوش این مثال است؛ پاسخ ثبت‌شدهٔ سؤال را تغییر نمی‌دهد.';
}
function legend(text,role=''){const item=el('span','legend-item');item.append(el('i','legend-dot '+role),document.createTextNode(text));$('chart-legend').append(item);}
function drawChart(spec,data){
  const W=600,H=340,L=48,R=22,T=22,B=35,w=W-L-R,h=H-T-B;
  const ys=data.points.filter(p=>p[1]!==null).map(p=>p[1]).sort((a,b)=>a-b);
  let low=Math.min(0,ys[Math.floor(ys.length*.02)]||0),high=Math.max(0,ys[Math.floor(ys.length*.98)]||1);
  if(data.focus){low=Math.min(low,data.focus[1]);high=Math.max(high,data.focus[1]);}if(high-low<.01){high=low+1;}const padding=(high-low)*.12;low-=padding;high+=padding;
  const X=(x)=>L+(x-spec.x_min)/(spec.x_max-spec.x_min)*w,Y=(y)=>T+(high-y)/(high-low)*h;
  const defs=svgEl('defs'),clip=svgEl('clipPath',{id:'chart-clip'});clip.append(svgEl('rect',{x:L,y:T,width:w,height:h}));defs.append(clip);svg.append(defs);
  for(let i=0;i<=6;i++){const x=spec.x_min+(spec.x_max-spec.x_min)*i/6;svg.append(svgEl('line',{x1:X(x),x2:X(x),y1:T,y2:H-B,class:'chart-grid'}),svgEl('text',{x:X(x),y:H-13,'text-anchor':'middle',class:'chart-label'},number(x)));}
  for(let i=0;i<=4;i++){const y=low+(high-low)*i/4;svg.append(svgEl('line',{x1:L,x2:W-R,y1:Y(y),y2:Y(y),class:'chart-grid'}),svgEl('text',{x:L-10,y:Y(y)+3,'text-anchor':'end',class:'chart-label'},number(y)));}
  if(spec.x_min<=0&&spec.x_max>=0)svg.append(svgEl('line',{x1:X(0),x2:X(0),y1:T,y2:H-B,class:'chart-axis'}));if(low<=0&&high>=0)svg.append(svgEl('line',{x1:L,x2:W-R,y1:Y(0),y2:Y(0),class:'chart-axis'}));
  const group=svgEl('g',{'clip-path':'url(#chart-clip)'});svg.append(group);
  const path=(points)=>{let d='',connected=false,lastY=null;for(const [x,y] of points){if(y===null||!Number.isFinite(y)){connected=false;continue;}const px=X(x),py=Y(y);if(lastY!==null&&Math.abs(py-lastY)>h*2)connected=false;d+=(connected?'L':'M')+px.toFixed(2)+','+py.toFixed(2);connected=true;lastY=py;}return d;};
  if(data.area){for(let i=0;i<data.area.length-1;i++){const [x1,y1]=data.area[i],[x2,y2]=data.area[i+1];if(y1!==null&&y2!==null)group.append(svgEl('path',{d:`M${X(x1)},${Y(0)}L${X(x1)},${Y(y1)}L${X(x2)},${Y(y2)}L${X(x2)},${Y(0)}Z`,fill:(y1+y2)/2>=0?'#cddfc2':'#e6c9c2',opacity:'.65'}));}}
  group.append(svgEl('path',{d:path(data.points),class:'chart-curve'}));
  if(data.tangent)group.append(svgEl('path',{d:path(data.tangent),class:'chart-tangent'}));
  if(data.focus){group.append(svgEl('circle',{cx:X(data.focus[0]),cy:Y(data.focus[1]),r:10,fill:'#b9afd6',opacity:'.25'}),svgEl('circle',{cx:X(data.focus[0]),cy:Y(data.focus[1]),r:5,fill:'#7e6ab5',stroke:'#fff','stroke-width':2}));}
  svg.append(svgEl('text',{x:W-R+7,y:Y(0)+3,class:'chart-label'},'x'),svgEl('text',{x:X(Math.max(spec.x_min,Math.min(spec.x_max,0)))+9,y:15,class:'chart-label'},'f(x)'));
  svg.onpointermove=(event)=>{const rect=svg.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width*W;const x=spec.x_min+(px-L)/w*(spec.x_max-spec.x_min);if(px<L||px>W-R){tooltip.hidden=true;return;}const point=data.points.reduce((a,b)=>Math.abs(b[0]-x)<Math.abs(a[0]-x)?b:a);if(point[1]===null){tooltip.hidden=true;return;}tooltip.textContent=`x = ${number(point[0])}  ·  f(x) = ${number(point[1])}`;tooltip.style.left=Math.max(5,Math.min(rect.width-200,event.clientX-rect.left+12))+'px';tooltip.style.top=Math.max(8,event.clientY-rect.top-35)+'px';tooltip.hidden=false;};svg.onpointerleave=()=>tooltip.hidden=true;
  svg.onpointerdown=(event)=>{if(spec.kind!=='tangent')return;const rect=svg.getBoundingClientRect();const px=(event.clientX-rect.left)/rect.width*W;currentSpec.focus=Math.max(spec.x_min,Math.min(spec.x_max,spec.x_min+(px-L)/w*(spec.x_max-spec.x_min)));const slider=$('control-focus');if(slider){slider.value=currentSpec.focus;slider.dispatchEvent(new Event('input'));}};
}
function drawGeometry(data){
  svg.onpointermove=null;svg.onpointerdown=null;svg.onpointerleave=null;
  if(data.shape==='circle'){const r=110;svg.append(svgEl('circle',{cx:300,cy:170,r,fill:'#efedf8',stroke:'#8c79bb','stroke-width':2.5}),svgEl('line',{x1:300,y1:170,x2:410,y2:170,stroke:'#8c79bb','stroke-width':2,'stroke-dasharray':'5 4'}),svgEl('circle',{cx:300,cy:170,r:4,fill:'#7661ad'}),svgEl('text',{x:350,y:158,'text-anchor':'middle',class:'chart-label'},'r = '+number(data.radius)));}
  else {const scale=220/Math.max(data.a,data.b),a=data.a*scale,b=data.b*scale,x=(600-a)/2,y=(340+b)/2;svg.append(svgEl('path',{d:`M${x},${y}L${x+a},${y}L${x},${y-b}Z`,fill:'#f0edf8',stroke:'#9585bc','stroke-width':2.5}),svgEl('path',{d:`M${x+15},${y}L${x+15},${y-15}L${x},${y-15}`,fill:'none',stroke:'#9ca492','stroke-width':1.5}),svgEl('text',{x:x+a/2,y:y+24,'text-anchor':'middle',class:'chart-label'},'a = '+number(data.a)),svgEl('text',{x:x-16,y:y-b/2,'text-anchor':'end',class:'chart-label'},'b = '+number(data.b)),svgEl('text',{x:x+a/2+22,y:y-b/2-14,'text-anchor':'start',class:'chart-label'},'c = '+number(data.c)));}
}
function renderControls(){
  const box=$('controls');box.replaceChildren();if(!currentSpec)return;
  const control=(id,label,min,max,value,step,onInput)=>{const wrap=el('div','control'),lbl=el('label');lbl.htmlFor='control-'+id;const out=el('output','',number(value));lbl.append(document.createTextNode(label),out);const input=el('input');input.type='range';input.id='control-'+id;input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',label);input.oninput=()=>{out.textContent=number(input.value);onInput(Number(input.value));queueSample();};const ends=el('div','range-ends');ends.append(el('span','',number(min)),el('span','',number(max)));wrap.append(lbl,input,ends);box.append(wrap);return input;};
  if(currentSpec.kind==='tangent')control('focus','نقطهٔ تماس x₀',currentSpec.x_min,currentSpec.x_max,currentSpec.focus,.05,v=>currentSpec.focus=v);
  if(currentSpec.kind==='integral'){
    const a=control('lower','کران پایین',currentSpec.x_min,currentSpec.x_max-.05,currentSpec.lower,.05,v=>{currentSpec.lower=Math.min(v,currentSpec.upper-.05);$('control-lower').value=currentSpec.lower;});
    const b=control('upper','کران بالا',currentSpec.x_min+.05,currentSpec.x_max,currentSpec.upper,.05,v=>{currentSpec.upper=Math.max(v,currentSpec.lower+.05);$('control-upper').value=currentSpec.upper;});
    a.addEventListener('input',()=>a.previousElementSibling.lastChild.textContent=number(currentSpec.lower));b.addEventListener('input',()=>b.previousElementSibling.lastChild.textContent=number(currentSpec.upper));
  }
  for(const p of currentSpec.parameters||[])control(p.name,p.label,p.minimum,p.maximum,p.value,p.step,v=>p.value=v);
}
function queueSample(){pendingSample=true;visualEpoch++;clearTimeout(sampleTimer);sampleTimer=setTimeout(resample,180);}
async function resample(){if(sampling||!pendingSample||!currentSpec)return;sampling=true;pendingSample=false;const epoch=visualEpoch,spec=structuredClone(currentSpec);loader.hidden=false;
  try{const {data}=await api('/api/visual',{visual:spec});if(epoch===visualEpoch){currentData=data;renderVisual(spec,data,activeTurn>=0?turns[activeTurn].result.state:null);}}
  catch(error){if(epoch===visualEpoch){$('metrics').replaceChildren();svg.replaceChildren();$('visual-notice').textContent='این بازه قابل محاسبه نیست. کنترل‌ها را تغییر بده تا نمایش دوباره ساخته شود.';toast(error.message);}}
  finally{sampling=false;loader.hidden=true;if(pendingSample)resample();}
}
async function preview(){currentSpec={kind:'tangent',title:'شیب را جابه‌جا کن، تغییر را ببین',caption:'یک نمونهٔ آموزشی از تابع x²؛ سؤال تو، نمایش مناسب خودش را می‌سازد.',expression:'x**2',x_min:-3,x_max:3,focus:1,lower:0,upper:2,shape:'right_triangle',parameters:[],matrix:[],formulas:[]};visualEpoch++;$('visual-badge').textContent='پیش‌نمایش آموزشی';$('visual-title').textContent=currentSpec.title;$('visual-caption').textContent=currentSpec.caption;const {data}=await api('/api/visual',{visual:currentSpec});currentData=data;renderVisual(currentSpec,data);renderControls();}
try{health=await api('/api/health');$('connection-dot').classList.add(health.ready?(health.demo?'offline':'ready'):'offline');$('connection-label').replaceChildren(document.createTextNode(health.ready?(health.demo?'نمونه‌های آفلاین':'مدرس آماده است'):'تنظیمات مدل نیاز به بررسی دارد'),el('small','',health.model||'فایل .env را تنظیم کن'));$('demo-banner').hidden=!health.demo;if(!health.ready)toast(health.message);await preview();}catch(error){toast(error.message);}
