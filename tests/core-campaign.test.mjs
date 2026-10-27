import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,TYPES,upgradeCost} from '../src/game.js';
const plans={mixed:[['gun',7],['frost',3],['mortar',1],['gun',4],['arc',2],['mortar',5],['gun',9]],battery:[['gun',7],['gun',4],['battery',16],['frost',3],['arc',1],['gun',2],['battery',12],['mortar',5]]};
export function playCampaign(level,strategy,difficulty='normal'){
 const g=new Game({level,difficulty});if(!g.lines.find(l=>l.id==='tie').closed)g.toggleLine('tie');
 const plan=plans[strategy].filter(([type])=>g.levelDef.available.includes(type));let index=0,ticks=0,island=false,spent=0,lastAction=0;
 while(!['won','lost'].includes(g.phase)&&ticks<15000){
  if(g.phase==='build'){
   while(index<plan.length){const [type,pad]=plan[index];if(g.gridSummary.demand+TYPES[type].power>g.capacity){if(!g.upgradeGrid())break;}const result=g.build(type,pad);if(!result.ok)break;spent+=TYPES[type].cost;index++;}
   for(const t of g.towers)if(t.type!=='battery'&&t.level<3&&g.credits>=upgradeCost(t)+80&&g.gridSummary.demand+1<=g.capacity)g.upgrade(t.id);
   g.startWave();
  }
  // One tactical action pass per second, not frame-perfect clicking.
  if(g.time-lastAction>=1){lastAction=g.time;for(const l of g.lines)if(l.tripped)g.resetLine(l.id);
   const e=g.enemies.find(e=>e.type==='boss')||g.enemies.at(-1);if(e){g.aimBeam(e.x,e.y);if(g.enemies.length>=5||e.type==='boss')g.activateStrike(e.x,e.y);}if(g.enemies.length>6)g.activateOverdrive();
  }
  g.tick(.05);island ||=g.gridSummary.islandLoads>0;g.events.length=0;ticks++;
  assert.ok(g.credits>=0,'economy cannot borrow');assert.ok(g.towers.filter(t=>t.type==='battery').every(t=>t.energy>=0&&t.energy<=180));
 }
 return {g,ticks,island,spent};
}
for(const strategy of Object.keys(plans))for(let level=0;level<8;level++)test(`finite economy campaign ${level+1}, ${strategy}`,()=>{
 const {g,ticks,spent}=playCampaign(level,strategy);assert.equal(g.phase,'won',`wave=${g.wave} hp=${g.hp} ticks=${ticks}`);assert.equal(g.wave,g.levelDef.waves);assert.ok(spent>0);
});
test('storage strategy actually sustains isolated load during scheduled blackout',()=>assert.equal(playCampaign(5,'battery').island,true));
test('three difficulty levels change threat and supplies',()=>{
 const e=new Game({difficulty:'easy'}),n=new Game(),h=new Game({difficulty:'hard'});assert.ok(e.credits>n.credits&&h.credits<n.credits);e.startWave();n.startWave();h.startWave();assert.ok(e.spawn('tank').hp<n.spawn('tank').hp);assert.ok(h.spawn('tank').hp>n.spawn('tank').hp);
});
test('new session is a clean retry and repeated final wave cannot restart',()=>{
 const {g}=playCampaign(0,'mixed');assert.equal(g.startWave(),false);const retry=new Game({level:g.level,difficulty:g.difficulty});assert.equal(retry.wave,0);assert.equal(retry.phase,'build');assert.equal(retry.hp,100);assert.equal(retry.enemies.length,0);
});
for(const difficulty of ['easy','hard'])for(let level=0;level<8;level++)test(`full campaign difficulty ${difficulty}, chapter ${level+1}`,()=>{
 const strategy=level>=2?'battery':'mixed';const {g,ticks}=playCampaign(level,strategy,difficulty);
 assert.equal(g.phase,'won',`${difficulty} chapter ${level+1}: wave=${g.wave}, hp=${g.hp}, ticks=${ticks}`);assert.equal(g.wave,g.levelDef.waves);assert.ok(g.credits>=0);
});
