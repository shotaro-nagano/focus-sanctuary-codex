export const KEY='focus-sanctuary.chrysalis.v1';
export const DURATIONS={focus:1500000,short:300000,long:900000};
export type Mode=keyof typeof DURATIONS;
export type Status='idle'|'running'|'paused';
export interface State {version:1;task:string;mode:Mode;status:Status;remainingMs:number;endsAt:number|null;sessionId:string|null;completed:{id:string;endedAt:number}[];}
type Store=Pick<Storage,'getItem'|'setItem'>;
export function localDate(date:number){const d=new Date(date);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
const fresh=():State=>({version:1,task:'',mode:'focus',status:'idle',remainingMs:DURATIONS.focus,endsAt:null,sessionId:null,completed:[]});
function valid(x:unknown):x is State {
  if(!x||typeof x!=='object')return false;
  const s=x as State;
  if(s.version!==1||!Object.hasOwn(DURATIONS,s.mode)||!['idle','running','paused'].includes(s.status)||typeof s.task!=='string'||s.task.length>140)return false;
  if(!Number.isFinite(s.remainingMs)||s.remainingMs<=0||s.remainingMs>DURATIONS[s.mode])return false;
  if(!Array.isArray(s.completed)||!s.completed.every(c=>c&&typeof c.id==='string'&&c.id.length>0&&Number.isFinite(c.endedAt)&&Math.abs(c.endedAt)<8.64e15))return false;
  if(new Set(s.completed.map(c=>c.id)).size!==s.completed.length)return false;
  if(s.status==='idle')return s.sessionId===null&&s.endsAt===null&&s.remainingMs===DURATIONS[s.mode];
  if(typeof s.sessionId!=='string'||!s.sessionId||s.completed.some(c=>c.id===s.sessionId))return false;
  return s.status==='running'?typeof s.endsAt==='number'&&Number.isFinite(s.endsAt)&&Math.abs(s.endsAt)<8.64e15:s.endsAt===null;
}
export class Timer {
  state:State=fresh();warning='';
  private storage:Store|null;private now:()=>number;private id:()=>string;private canSave=true;
  constructor(storage:Store|null,now:()=>number=Date.now,id:()=>string=()=>crypto.randomUUID()){
    this.storage=storage;this.now=now;this.id=id;
    if(!storage){this.disable('この環境では保存できません。この画面内でタイマーを使えます。');return;}
    this.reload();this.reconcile();
  }
  reload(){
    if(!this.canSave||!this.storage)return;
    try{const raw=this.storage.getItem(KEY);if(raw===null)return;const parsed:unknown=JSON.parse(raw);
      if(!valid(parsed))throw Error('Invalid saved state');this.state=parsed;
    }catch{this.disable('保存データを読み込めません。元のデータを保護し、この画面内で動作します。');}
  }
  private disable(message:string){this.canSave=false;this.warning=message;}
  private save(){if(!this.canSave||!this.storage)return;try{this.storage.setItem(KEY,JSON.stringify(this.state));}catch{this.disable('保存できません。この画面では使えますが、再読み込みで記録が失われる場合があります。');}}
  remaining(at=this.now()){return this.state.status==='running'?Math.max(0,this.state.endsAt!-at):this.state.remainingMs;}
  today(){const date=localDate(this.now()),sessions=this.state.completed.filter(c=>localDate(c.endedAt)===date).length;return {sessions,minutes:sessions*25};}
  start(){const at=this.now();if(this.reconcile(at)||this.state.status==='running')return;this.state={...this.state,status:'running',sessionId:this.state.sessionId??this.id(),endsAt:at+this.state.remainingMs};this.save();}
  pause(){const at=this.now();if(this.reconcile(at)||this.state.status!=='running')return;this.state={...this.state,remainingMs:this.remaining(at),endsAt:null,status:'paused'};this.save();}
  reconcile(at=this.now()):{mode:Mode}|null{
    const s=this.state;if(s.status!=='running'||s.endsAt!>at)return null;
    const completed=[...s.completed];
    if(s.mode==='focus'&&!completed.some(c=>c.id===s.sessionId))completed.push({id:s.sessionId!,endedAt:s.endsAt!});
    const mode:Mode=s.mode==='focus'?(completed.length%4===0?'long':'short'):'focus';
    // The completion ledger and next idle state are one atomic localStorage value.
    this.state={...s,completed,mode,status:'idle',remainingMs:DURATIONS[mode],endsAt:null,sessionId:null};
    this.save();return {mode:s.mode};
  }
  reset(){this.reconcile();const mode=this.state.mode;this.state={...this.state,status:'idle',remainingMs:DURATIONS[mode],endsAt:null,sessionId:null};this.save();}
  changeMode(mode:Mode){this.reconcile();this.state={...this.state,mode,status:'idle',remainingMs:DURATIONS[mode],endsAt:null,sessionId:null};this.save();}
  setTask(task:string){this.state={...this.state,task:task.slice(0,140)};this.save();}
}
