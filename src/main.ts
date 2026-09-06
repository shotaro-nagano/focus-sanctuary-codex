import '@fontsource/syne/400.css';
import '@fontsource/syne/500.css';
import '@fontsource/syne/600.css';
import '@fontsource/syne/700.css';
import '@fontsource/syne/800.css';
import '@fontsource/ibm-plex-mono/400.css';
import './style.css';
import { SanctuaryScene } from './scene';
import { gsap } from 'gsap';
import { Timer, DURATIONS, KEY, type Mode } from './timer';

document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <main class="sanctuary">
    <header><a class="brand" href="./" aria-label="Focus Sanctuary"><span class="brand-icon">✳</span><span>FOCUS<br>SANCTUARY</span></a><span class="edition">AN EXPERIMENT IN TIME<br>VOLUME 001 — 3D MAX EDITION</span><button class="replay" id="replay">↗ REPLAY</button></header>
    <div class="giant giant-back" aria-hidden="true"><span>FOCUS</span></div>
    <div id="scene"></div>
    <aside class="object-caption"><span class="index">01 / CHRONO CHRYSALIS</span><h1>Time, held<br>in a different<br><em>form.</em></h1><p>時間を包む、浮遊彫刻。</p><span class="material-note">LIQUID CHROME<br>PRISMATIC GLASS<br>YOUR UNDIVIDED ATTENTION</span></aside>
    <section class="timer-console" aria-label="集中タイマー"><div class="timer-kicker"><span class="status-dot"></span><span id="state-label">READY TO FOCUS</span></div><div class="time" id="time">25<span>:</span>00</div><div class="timer-rule"><i id="progress"></i></div><div class="timer-actions"><button class="start magnetic" id="start"><span id="action-label">BEGIN FOCUS</span><span id="action-symbol">↗</span></button><button class="reset" id="reset" aria-label="タイマーをリセット">↺</button></div></section>
    <div class="right-rail"><span>TIME IS A MATERIAL.</span><span>MAKE SOMETHING OF IT.</span></div>
    <div class="interaction-note"><span class="crosshair">✧</span> DRAG TO EXPLORE <span>↔</span></div>
    <div class="complete-title" aria-live="polite"><span>TIME, TRANSFORMED.</span><strong>SESSION<br>COMPLETE</strong></div>
    <footer><div class="task-entry"><label for="task">01 — YOUR INTENTION</label><input id="task" maxlength="140" placeholder="いま、何に集中する？" autocomplete="off"></div><nav class="modes" aria-label="タイマーモード"><button data-mode="focus" class="selected" aria-pressed="true">FOCUS <span>25</span></button><button data-mode="short" aria-pressed="false">SHORT <span>05</span></button><button data-mode="long" aria-pressed="false">LONG <span>15</span></button></nav><div class="today"><span>02 — TODAY'S PRACTICE</span><p><b id="sessions">00</b> <small>SESSIONS</small><i>/</i><b id="minutes">0</b> <small>MIN</small></p></div></footer>
    <div class="bottom-line"><span>CHRONO CHRYSALIS</span><span class="local-note">SAVED IN THIS BROWSER</span><span>CHOOSE TO BE HERE. ↗</span></div>
    <p class="notice" id="notice" role="status" hidden></p>
    <dialog id="confirm"><form method="dialog"><span class="index">A MOMENT BEFORE YOU LEAVE</span><h2>この集中を<br>手放しますか？</h2><p>進行中の時間は記録されません。</p><div><button value="cancel">続ける</button><button value="discard" class="discard">破棄する ↗</button></div></form></dialog>
  </main>`;
const report=(message:string)=>{const n=document.querySelector<HTMLElement>('#notice')!;n.textContent=message;n.hidden=!message;};
let art:SanctuaryScene|undefined;
try{art=new SanctuaryScene(document.querySelector('#scene')!,report);art.replay();}
catch(e){console.error(e);document.body.classList.add('no-webgl');report('WebGLを利用できないため3Dを表示できません。タイマーは利用できます。');}
const $=<T extends HTMLElement>(s:string)=>document.querySelector<T>(s)!;
const params=new URLSearchParams(location.search),preview=params.has('preview');
let storage:Storage|null=null;try{storage=localStorage;}catch{/* Timer reports unavailable storage. */}
const timer=new Timer(preview?{getItem:()=>null,setItem:()=>{}}:storage);
const task=$<HTMLInputElement>('#task');task.value=timer.state.task;
if(timer.warning)report(timer.warning);
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches;
let typography:gsap.core.Timeline|undefined,completionType:gsap.core.Timeline|undefined;
function introduction(){
  art?.replay();typography?.kill();
  gsap.set('.giant span',{yPercent:reduced()?0:115});
  gsap.set(['.object-caption','.timer-console','footer'],{opacity:reduced()?1:0});
  typography=gsap.timeline().to('.giant span',{yPercent:0,duration:reduced()?0:1.4,ease:'power4.out'},reduced()?0:.8)
    .to('.object-caption',{opacity:1,duration:.8},1.5).to('.timer-console',{opacity:1,duration:.65},1.85).to('footer',{opacity:1,duration:.65},2.1);
  if(reduced())typography.progress(1);
}
function completion(isPreview=false){
  completionType?.kill();
  gsap.set('.complete-title',{opacity:0,y:30});
  completionType=gsap.timeline()
    .to('.timer-console',{opacity:0,duration:.35},0)
    .to('.complete-title',{opacity:1,y:0,duration:.65,ease:'power3.out'},.75)
    .to('.complete-title',{opacity:0,y:-20,duration:.65},2.85)
    .to('.timer-console',{opacity:1,duration:.7},3.35);
  if(reduced())completionType.progress(1);
  art?.complete(()=>{if(isPreview)art?.setMode(timer.state.mode);});
  if(isPreview)art?.setMode('short');
}
let lastMode=timer.state.mode,lastStatus=timer.state.status,lastTime='';
const labels={focus:'FOCUS',short:'SHORT BREAK',long:'LONG BREAK'};
function sync(){
  const event=timer.reconcile();
  const s=timer.state;
  if(s.mode!==lastMode){lastMode=s.mode;art?.setMode(s.mode);gsap.fromTo('.timer-kicker',{y:9,opacity:0},{y:0,opacity:1,duration:reduced()?0:.6});
    gsap.killTweensOf('.giant span');$('.giant span').textContent=s.mode==='focus'?'FOCUS':s.mode==='short'?'EXHALE':'UNFOLD';
    gsap.fromTo('.giant span',{yPercent:110},{yPercent:0,duration:reduced()?0:1.3,ease:'power4.out'});
  }
  if(s.status!==lastStatus){lastStatus=s.status;art?.setStatus(s.status);}
  const seconds=Math.ceil(timer.remaining()/1000),m=String(Math.floor(seconds/60)).padStart(2,'0'),sec=String(seconds%60).padStart(2,'0');
  const display=`${m}:${sec}`;
  if(display!==lastTime){lastTime=display;$('#time').replaceChildren(document.createTextNode(m),Object.assign(document.createElement('span'),{textContent:':'}),document.createTextNode(sec));}
  $('#state-label').textContent=s.status==='paused'?'TIME, SUSPENDED':s.status==='running'?`${labels[s.mode]} IN PROGRESS`:`READY FOR ${labels[s.mode]}`;
  $('#action-label').textContent=s.status==='running'?'PAUSE':s.status==='paused'?'RESUME':s.mode==='focus'?'BEGIN FOCUS':'BEGIN REST';
  $('#action-symbol').textContent=s.status==='running'?'Ⅱ':'↗';
  const progress=1-timer.remaining()/DURATIONS[s.mode];if(art)art.progress=progress;
  $('#progress').style.width=`${progress*100}%`;
  const today=timer.today();$('#sessions').textContent=String(today.sessions).padStart(2,'0');$('#minutes').textContent=String(today.minutes);
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>{b.classList.toggle('selected',b.dataset.mode===s.mode);b.setAttribute('aria-pressed',String(b.dataset.mode===s.mode));});
  document.documentElement.style.setProperty('--accent',s.mode==='focus'?'#d9ff62':s.mode==='short'?'#a1dfff':'#f2c5a0');
  if(timer.warning){report(timer.warning);$('.local-note').textContent='MEMORY ONLY';}
  if(event)completion();
}
art?.setMode(timer.state.mode,true);art?.setStatus(timer.state.status);
let pendingDiscard:(()=>void)|undefined;
function confirmDiscard(action:()=>void){sync();if(timer.state.status==='idle'){action();sync();return;}pendingDiscard=action;$('#confirm').querySelector('h2')!.textContent=timer.state.mode==='focus'?'この集中を手放しますか？':'この休憩を手放しますか？';$<HTMLDialogElement>('#confirm').showModal();}
$('#confirm').addEventListener('close',()=>{if($<HTMLDialogElement>('#confirm').returnValue==='discard')pendingDiscard?.();pendingDiscard=undefined;sync();});
$('#start').addEventListener('click',()=>{sync();timer.state.status==='running'?timer.pause():timer.start();sync();});
$('#reset').addEventListener('click',()=>confirmDiscard(()=>timer.reset()));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b=>b.addEventListener('click',()=>{const mode=b.dataset.mode as Mode;if(mode!==timer.state.mode)confirmDiscard(()=>timer.changeMode(mode));}));
task.addEventListener('input',()=>{timer.setTask(task.value);if(timer.warning)report(timer.warning);});
$('#replay').addEventListener('click',introduction);
document.querySelectorAll<HTMLButtonElement>('.magnetic,.replay').forEach(button=>{
  button.addEventListener('pointermove',e=>{if(reduced()||e.pointerType==='touch')return;const r=button.getBoundingClientRect();gsap.to(button,{x:(e.clientX-r.left-r.width/2)*.1,y:(e.clientY-r.top-r.height/2)*.16,duration:.3,overwrite:true});});
  button.addEventListener('pointerleave',()=>gsap.to(button,{x:0,y:0,duration:.5,ease:'elastic.out(1,.6)',overwrite:true}));
});
let interval=window.setInterval(sync,200);
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInterval(interval);typography?.pause();completionType?.pause();}else{sync();interval=window.setInterval(sync,200);typography?.resume();completionType?.resume();}});
window.addEventListener('storage',e=>{if(!preview&&e.key===KEY){timer.reload();task.value=timer.state.task;sync();}});
sync();introduction();
if(preview){$('.local-note').textContent='PREVIEW — NO RECORDS SAVED';if(params.get('preview')==='complete')window.setTimeout(()=>completion(true),3800);
  // Read-only visual preview API exists only in the explicit preview URL.
  Object.assign(window,{chrysalisPreview:{complete:()=>completion(true),mode:(mode:Mode)=>art?.setMode(mode),replay:introduction}});
}
