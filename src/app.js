import {Game,PADS,TYPES,ENEMIES,towerStats,upgradeCost,sellValue,canStrikeAt} from './game.js';
import {CAMPAIGN} from './campaign.js';
import {Renderer,drawTowerIcon} from './render.js';
import {AudioEngine} from './audio.js';
import {loadProgress,saveProgress,loadSession,saveSession,clearSession,getSettings,setSettings,getStorageStatus} from './save.js';

const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const digits=n=>String(n).padStart(2,'0');
const typeOrder=['gun','mortar','frost','arc','relay','battery'];
const names={gun:'哨戒炮',mortar:'迫击炮',frost:'寒潮塔',arc:'电弧塔',relay:'中继灯站',battery:'储能电池'};
const roles={gun:'精准 · 单体',mortar:'爆破 · 群伤',frost:'减速 · 控场',arc:'连锁 · 清群',relay:'夜间照明',battery:'孤岛备用'};
const descriptions={gun:'稳定追击单个目标。升级提升射速与伤害，也会提高功率需求。',mortar:'落点范围爆炸；搭配寒潮塔让密集敌群停留在火力区。',frost:'减缓敌人，延长其他炮塔的开火时间。伤害较低，适合组合。',arc:'电弧在相邻敌人之间跳跃。升级可增加连锁目标。',relay:'不占用功率的照明中继。通电时照亮附近敌人，让夜间远程火力看清目标。',battery:'储存能量，最大输出6功率。失去主网后仍能向同一孤岛供电；有余量时以最大4功率充电。'};
const enemyNames={crawler:'潜行者',runner:'疾行者',tank:'重甲蟹',splitter:'裂殖体',spawn:'幼体',boss:'深渊巨像'};
const mechanicNames={connect:'线路连通',backup:'双路备用',battery:'电池孤岛',priority:'负载优先级',protection:'支路保护',storage:'储能调度',storm:'风暴抢修',finale:'最后的守望'};
const chapterTips=[
 '点击空基座，再选择下方设施。把火力放在道路转角，敌人会在射程内停留更久。',
 '建造前会预览供电结果。青色表示已供电，灰色表示断连，橙色表示功率不足。',
 '点击地面压下灯塔光束：照亮的敌人更慢，也更容易被击败。夜战时光线尤其重要。',
 '按 Space 可以暂停并继续建造、切线路。准备好了再迎接下一波；波间有固定补给。'
];
let settings=getSettings(),progress=loadProgress(),screen='home',selectedLevel=0,selectedPad=null,selectedLine=null,buildType=null,aiming=false,gridOpen=false,tutorialStep=0;
let game=new Game({level:0}),pauseBeforeDialog=false,modalKind='',lastSelection='',lastGrid='',lastHud=0,previous=performance.now(),saveClock=0,resultShown=false,toastTimer,bannerTimer;
const canvas=$('battlefield'),audio=new AudioEngine(),renderer=new Renderer(canvas,game);

// The title screen is an unsaved miniature, independent from the player's session.
function titleIsland(){
 game=new Game({level:0});game.credits=1500;game.capacity=60;for(const l of game.lines)l.capacity=60;for(const [type,pad] of [['gun',7],['mortar',3],['frost',1],['relay',9],['arc',5]])game.build(type,pad);game.toggleLine('tie');game.events.length=0;game.aimBeam(7,5);renderer.setGame(game);renderer.grid=false;renderer.selected=null;renderer.buildType=null;
}
function fit(){
 const small=innerWidth<660;
 renderer.setInsets(screen==='home'?{left:innerWidth*(small?.15:.33),right:small?-innerWidth*.45:-innerWidth*.08,top:small?innerHeight*.2:15,bottom:small?100:35}:{left:small?0:25,right:small?0:25,top:small?92:115,bottom:small?200:196});
}
function toast(message){$('toast').textContent=message;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3000);}
function banner(title,subtitle=''){ $('wave-banner').innerHTML=`<small>${esc(subtitle)}</small><strong>${esc(title)}</strong>`;$('wave-banner').classList.add('show');clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>$('wave-banner').classList.remove('show'),2300); }
function switchScreen(next){screen=next;$('home').hidden=next!=='home';$('map-screen').hidden=next!=='map';$('play').hidden=next!=='play';document.body.classList.toggle('menu',next==='home');fit();}
function openModal(kind,html){
 if(!$('modal').open){pauseBeforeDialog=screen==='play'?game.paused:false;if(screen==='play')game.paused=true;}
 modalKind=kind;$('modal-content').innerHTML=html;if(!$('modal').open)$('modal').showModal();
}
function closeModal(){if(!$('modal').open)return;if(screen==='play'&&game.canEdit())game.paused=pauseBeforeDialog;modalKind='';$('modal').close();refresh();}
$('modal').addEventListener('cancel',event=>{event.preventDefault();if(modalKind!=='result'&&modalKind!=='ending')closeModal();});
function modalHeader(kicker,title,closable=true){return `${closable?'<button class="modal-close" data-action="close" aria-label="关闭">×</button>':''}<span class="eyebrow">${kicker}</span><h2>${title}</h2>`;}
function persist(){
 if(screen!=='play'||!game.canEdit())return;
 const ok=saveSession(game.toSnapshot());$('save-status').textContent=ok?'已自动保存 · 本机':'无法写入存档 · 请勿关闭页面';
}
function updateContinue(){const s=loadSession();$('continue').hidden=!s;return s;}
function goHome(){persist();closeModal();switchScreen('home');titleIsland();updateContinue();audio.setAmbience({rain:0,wind:.15,waves:.5,night:.6});}
function showMap(){persist();closeModal();switchScreen('map');selectedLevel=Math.min(progress.unlocked-1,7);paintMap();}
function paintMap(){
 const positions=[[9.5,72],[21.5,44],[34.5,58],[47.5,26],[60.5,51],[71.5,21],[82,56],[92,25]];
 $('level-nodes').innerHTML=CAMPAIGN.map((l,i)=>`<button class="level-node ${selectedLevel===i?'selected':''} ${progress.completed.includes(i)?'completed':''} ${i>=progress.unlocked?'locked':''}" data-level="${i}" style="left:${positions[i][0]}%;top:${positions[i][1]}%" ${i>=progress.unlocked?'disabled':''} aria-label="第${i+1}章 ${esc(l.name)} ${progress.completed.includes(i)?'已完成':i>=progress.unlocked?'尚未解锁':''}"><span class="islet"></span><small>${digits(i+1)} ${progress.completed.includes(i)?'· 已点亮':''}</small><span>${esc(l.name)}</span></button>`).join('');
 const l=CAMPAIGN[selectedLevel];$('level-detail').innerHTML=`<span class="detail-number">${digits(selectedLevel+1)}</span><div class="detail-copy"><p class="level-mechanic">${esc(mechanicNames[l.mechanic])} / ${l.waves} 波潮汐</p><h3>${esc(l.subtitle)}</h3><p>${esc(l.tip)}</p></div><button class="primary" data-action="launch-level">${progress.completed.includes(selectedLevel)?'重返海岸':'前往海岸'} ${icon('arrow')}</button>`;
 $('campaign-progress').textContent=`已点亮 ${progress.completed.length} / 8 座海岸${progress.completed.length===8?' · 群岛航路已恢复':''}`;$('map-difficulty').value=settings.difficulty;
}
function newGame(level=0,sandbox=false){
 closeModal();game=new Game({level,difficulty:settings.difficulty,sandbox});renderer.setGame(game);renderer.grid=true;selectedPad=null;selectedLine=null;buildType=null;aiming=false;gridOpen=false;resultShown=false;tutorialStep=0;lastSelection='';lastGrid='';switchScreen('play');paintDock();refresh();showBrief(true);persist();enableAudio();
}
function resumeGame(){
 const snapshot=loadSession();if(!snapshot){toast('没有可继续的战局。');updateContinue();return;}
 try{game=Game.fromSnapshot(snapshot);}catch{clearSession();updateContinue();toast('旧存档已损坏或不兼容。战役解锁进度保留，可以重新启程。');return;}
 renderer.setGame(game);renderer.grid=true;selectedPad=null;selectedLine=null;buildType=null;gridOpen=false;aiming=false;resultShown=false;tutorialStep=4;switchScreen('play');paintDock();game.paused=true;refresh();showPause();pauseBeforeDialog=false;enableAudio();
}
function showBrief(initial=false){
 const l=game.levelDef;const faults=l.faults.length?`天气台已预报 ${l.faults.length} 次线路扰动，战场会提前倒计时。`:'海况平静，适合规划第一道防线。';
 openModal('brief',`${modalHeader(game.sandbox?'FREE PLAY / 自由沙盒':`CHAPTER ${digits(game.level+1)} / ${esc(mechanicNames[l.mechanic])}`,esc(l.name))}<p>${esc(l.subtitle)}</p><ul class="brief-list"><li>${esc(l.objective||`守住灯塔，完成 ${l.waves} 波潮汐。`)}</li><li>${esc(l.tip)}</li><li>${esc(l.networkBrief||'主路与备用联络共同组成岛上的供电网。')}</li><li>${esc(faults)}</li><li>每波结束补给 ${l.supply} 零件并修复 5 点耐久。可以暂停，建造和调度无需抢操作。</li></ul><p class="setting-note">本作使用简化微电网供电预算。线路上的功率和电池能量是游戏尺度，不是工程设计数值。</p><div class="modal-actions"><button class="primary" data-action="close">${initial?'接管灯塔':'返回战场'} ${icon('arrow')}</button>${initial?'<button class="secondary" data-action="guide">阅读守塔手册</button>':''}</div>`);
}
function showPause(){
 persist();openModal('pause',`${modalHeader('THE KEEPER’S REST / 暂停', '潮汐暂歇')}<p>${esc(game.levelDef.name)} · 第 ${Math.max(1,game.wave)} 波 · ${game.paused?'已暂停，可安心规划':'战局已自动保存'}</p><div class="modal-actions stacked"><button class="primary" data-action="resume">继续守望 ${icon('arrow')}</button><button class="secondary" data-action="pause-plan">保持暂停，调度电网</button><button class="secondary" data-action="retry-confirm">重新守卫本关</button><button class="secondary" data-action="settings">声音与难度</button><button class="secondary" data-action="home">保存并返回灯塔</button></div>`);
}
function showSettings(){
 openModal('settings',`${modalHeader('PREFERENCES / 设置','风声与潮汐')}<label class="setting-row"><span>音量 <b id="volume-value">${Math.round(settings.volume*100)}%</b></span><input id="volume-input" aria-label="音量" type="range" min="0" max="100" value="${settings.volume*100}"></label><div class="setting-row"><span>合成音效与海浪</span><button id="mute-toggle" class="minor-button">${settings.muted?'开启声音':'关闭声音'}</button></div><label class="setting-row"><span>新战局难度</span><select id="difficulty-input"><option value="easy">轻松 · 宽裕补给</option><option value="normal">标准 · 策略守望</option><option value="hard">风暴 · 更强敌潮</option></select></label><p class="setting-note">难度在开始或重试关卡时生效，当前战局不变。存档、进度、音量只保存在此浏览器；离线文件和本地网站各有独立存档。</p><div class="modal-actions"><button class="primary" data-action="close">保存设置</button><button class="secondary" data-action="guide">键鼠操作</button></div>`);$('difficulty-input').value=settings.difficulty;
 $('volume-input').addEventListener('input',()=>{settings.volume=Number($('volume-input').value)/100;$('volume-value').textContent=`${Math.round(settings.volume*100)}%`;setSettings(settings);enableAudio();});
 $('difficulty-input').addEventListener('change',()=>{settings.difficulty=$('difficulty-input').value;setSettings(settings);});
 $('mute-toggle').addEventListener('click',()=>{settings.muted=!settings.muted;setSettings(settings);$('mute-toggle').textContent=settings.muted?'开启声音':'关闭声音';enableAudio();});
}
function showGuide(){
 openModal('guide',`${modalHeader('FIELD NOTES / 守塔手册','让光有路可走')}<div class="guide-grid"><div><b>01 / 防线</b><p>点击空基座，再选择建造。哨戒针对单体，迫击清理密集敌群，寒潮减速，电弧连锁。升级会增加功率需求。</p></div><div><b>02 / 光束</b><p>点击地面引导灯塔光束，敌人减速且承受额外伤害。夜战远处敌人必须被照亮；中继灯站可提供固定照明。</p></div><div><b>03 / 电网</b><p>按 G 调度线路。东、西主路和备用联络可相互接替。选择设施查看“断连”与“供电不足”的具体原因。</p></div><div><b>04 / 电池</b><p>电池的能量决定能坚持多久，输出上限决定能带多少负载。输出6功率持续10秒消耗60能量；断网后仍可供孤岛。</p></div><div><b>05 / 优先与保护</b><p>选择炮塔切换高/常规/低优先级。持续超出支路预算会保护跳闸；先切负载或开启备用，再手动复位。</p></div><div><b>06 / 风暴</b><p>线路故障有倒计时。按 Space 暂停后仍能建造和切线。红色故障需等待抢修；橙色跳闸需要手动复位。</p></div></div><h3>键鼠操作</h3><p><kbd>1–6</kbd> 选择设施　<kbd>← →</kbd> 选择基座　<kbd>Enter</kbd> 确认建造<br><kbd>Space</kbd> 暂停/继续　<kbd>G</kbd> 电网　<kbd>Q</kbd> 超频<br><kbd>E</kbd> 聚光后点击落点　<kbd>B</kbd> 光束追踪敌群　<kbd>F</kbd> 倍速<br><kbd>Esc</kbd> 取消/菜单　右键取消选择。每波手动开战。</p><p class="setting-note">本作模拟连接、调度容量、功率和能量守恒，不求解电压、电流、交流潮流或基尔霍夫方程。线路数字表示可分配的功率预算。</p><div class="modal-actions"><button class="primary" data-action="close">回到守望</button></div>`);
}
function showCredits(){openModal('credits',`${modalHeader('ORIGINS / 关于作品','每一束光都有来处')}<p>《余烬灯塔》是一款关于守望与选择的单机塔防。用有限资源建立防线，在潮汐中维护一张微电网。</p><p>基于 <a href="https://github.com/stackloomdev/last-beacon" target="_blank" rel="noopener">stackloomdev / Last Beacon</a>（MIT 许可）改编，固定原作提交 ad531d2。保留并扩展其战斗规则、程序绘制与合成音效；新增八章战役、微电网调度、存档和本版界面。</p><p>本版海岛、灯塔、炮塔、菜单与效果均由本地代码绘制，无 CDN、账户或付费服务。视觉方向借鉴优秀游戏的信息克制与海洋氛围，没有提取商业游戏素材。</p><p class="setting-note">原作版权 © 2026 stackloomdev。完整 MIT 文本与修改、素材来源说明见交付包 LICENSE、SOURCES.md。专业模型为玩法简化，不能用于实际电气设计。</p><div class="modal-actions"><button class="primary" data-action="close">感谢这束光</button></div>`);}
async function enableAudio(){
 try{if(!audio.ctx&&!settings.muted)audio.init();if(!audio.ctx)return;if(audio.ctx.state==='suspended'&&!settings.muted)await audio.ctx.resume();audio.enabled=!settings.muted;audio.level=1;audio.master.gain.setTargetAtTime(settings.muted?0:settings.volume*.7,audio.ctx.currentTime,.08);}catch{}
}
function paintDock(){
 $('build-dock').innerHTML=typeOrder.map((type,i)=>`<button class="build-card" data-build="${type}" title="${esc(descriptions[type])}" ${!game.sandbox&&!game.levelDef.available.includes(type)?'disabled':''}><canvas width="100" height="100" aria-hidden="true"></canvas><span><strong>${names[type]}</strong><small><span class="build-price">${TYPES[type].cost} 零件</span> · ${type==='battery'?'输出6':`${TYPES[type].power} 功率`}</small><small>${!game.sandbox&&!game.levelDef.available.includes(type)?'第三章解锁':roles[type]}</small></span><span class="shortcut">${i+1}</span></button>`).join('');
 for(const card of $('build-dock').children)drawTowerIcon(card.querySelector('canvas'),card.dataset.build);
}
function chooseBuild(type){
 if(!game.canEdit())return;if(!game.sandbox&&!game.levelDef.available.includes(type)){toast('储能电池在第三章引入；沙盒中可自由使用。');return;}
 buildType=buildType===type?null:type;aiming=false;renderer.aim=null;renderer.buildType=buildType;gridOpen=false;selectedLine=null;refresh();if(buildType&&selectedPad===null)toast(`已选择${names[type]}，点击空基座预览。`);
}
function doBuild(){if(selectedPad===null||!buildType)return;const result=game.build(buildType,selectedPad);if(result.ok){toast(`${names[buildType]}已建造${result.tower.powered?' · 供电就绪':' · '+result.tower.reason}`);buildType=null;renderer.buildType=null;persist();}else toast(result.reason||'无法建造');refresh();}
function selectPad(id){selectedPad=id;selectedLine=null;renderer.selected=id;renderer.selectedLine=null;gridOpen=false;lastSelection='';refresh();}
function paintSelection(){
 const box=$('selection');if(gridOpen){box.hidden=true;return;}
 if(selectedLine){const l=game.lines.find(l=>l.id===selectedLine);if(!l){selectedLine=null;return;}const key=JSON.stringify([l.id,l.closed,l.fault,l.tripped,Math.round(l.load*10),Math.ceil(l.warningRemaining),Math.floor(l.overloadTime)]);if(lastSelection===key)return;lastSelection=key;box.hidden=false;box.innerHTML=`<button class="close-selection" data-action="clear-selection" aria-label="取消选择">×</button><div class="selection-head"><h3>${esc(l.name)}</h3><small>线路 ${esc(l.id)}</small></div><p class="selection-status ${l.fault||l.tripped?'bad':''}">${l.fault?'故障隔离 · 等待抢修':l.tripped?'保护跳闸 · 减载或改路后复位':!l.closed?'开关断开 · 点击合闸可接通':'开关闭合'} · ${l.load.toFixed(1)} / ${l.capacity} 功率预算</p><p>${l.warningRemaining!==null&&l.warningRemaining!==undefined?`故障预告：${Math.ceil(l.warningRemaining)} 秒后隔离。`:'切线立即重算负载。可随时暂停后规划备用路径。'}</p><div class="selection-actions"><button data-line="${esc(l.id)}">${l.tripped?'复位保护':l.closed?'断开支路':'闭合支路'}</button><button data-action="grid">查看全部电网</button></div>`;return;}
 if(selectedPad===null){box.hidden=true;return;}const tower=game.towers.find(t=>t.pad===selectedPad);let html='';
 if(tower){const stats=towerStats(tower),battery=tower.type==='battery',support=['battery','relay'].includes(tower.type);const key=JSON.stringify([tower.id,tower.level,tower.powered,tower.reason,tower.priority,tower.target,Math.floor(tower.energy||0),Math.floor(tower.output||0),game.credits]);if(lastSelection===key)return;lastSelection=key;
 html=`<div class="selection-head"><h3>${names[tower.type]} <small>${support?'支援设施':'等级 '+tower.level+' / 3'}</small></h3><span class="eyebrow">基座 ${digits(selectedPad+1)}</span></div><p class="selection-status ${!tower.powered?'bad':''}">${esc(tower.reason|| (tower.powered?'供电正常':'等待连接'))}${battery?` · 能量 ${Math.floor(tower.energy)} / ${tower.energyMax} · 输出 ${(tower.output||0).toFixed(1)} / ${tower.maxOutput}`:` · 需求 ${stats.power} 功率`}</p><p>${battery?descriptions.battery:support?descriptions.relay:`伤害 ${Math.round(stats.damage)} · 射程 ${stats.range.toFixed(1)} · ${descriptions[tower.type]}`}</p><div class="selection-actions">${!support?`<button data-action="upgrade" ${tower.level>=3||game.credits<upgradeCost(tower)?'disabled':''}>${tower.level>=3?'已至最高级':'升级 · '+upgradeCost(tower)+' 零件'}</button><button data-action="priority">优先级：${['低','常规','高'][tower.priority??1]}</button><button data-action="target">索敌：${{first:'最前',strong:'最强',close:'最近'}[tower.target]||'最前'}</button>`:''}<button data-action="sell">出售 · +${sellValue(tower)}</button><button data-action="grid">电网调度</button></div>`;
 }else{const key=JSON.stringify([selectedPad,buildType,game.credits,game.powerUsed,game.lines.map(l=>[l.closed,l.fault,l.tripped])]);if(lastSelection===key)return;lastSelection=key;let preview=null;if(buildType)try{preview=game.previewBuild(buildType,selectedPad);}catch{}
 html=`<div class="selection-head"><h3>${buildType?names[buildType]:'空置基座'}</h3><span class="eyebrow">${digits(selectedPad+1)} / ${PADS.length}</span></div><p>${buildType?descriptions[buildType]:'选择下方设施。适合的位置、足够的供电，比炮塔的数量更重要。'}</p>${preview?`<p class="selection-status ${!preview.powered?'bad':''}">建造预览：${esc(preview.reason|| (preview.powered?'供电就绪':'暂无可用电源'))}${preview.unpowered?` · 预计 ${preview.unpowered} 个负载停机`:''}</p>`:''}<div class="selection-actions">${buildType?`<button data-action="build" ${game.credits<TYPES[buildType].cost?'disabled':''}>确认建造 · ${TYPES[buildType].cost} 零件 <kbd>Enter</kbd></button>`:'<span class="preview">快捷键 1–6 选择设施</span>'}<button data-action="grid">查看供电线路</button></div>`;
 }box.hidden=false;box.innerHTML='<button class="close-selection" data-action="clear-selection" aria-label="取消选择">×</button>'+html;
}
function paintGrid(){
 $('grid-panel').hidden=!gridOpen;if(!gridOpen)return;const s=game.gridSummary;
 const key=JSON.stringify([Math.floor(s.batteryEnergy),Math.round(s.batteryOutput*10),Math.round(s.charging*10),s.powerUsed,s.capacity,s.demand,s.unpowered,s.islandLoads,game.credits,game.lines.map(l=>[l.closed,l.tripped,l.fault,Math.round(l.load),Math.ceil(l.warningRemaining)])]);if(key===lastGrid)return;lastGrid=key;
 $('grid-summary').innerHTML=`<b>${s.powerUsed.toFixed(1)}</b> / ${s.demand} 负载获供 · 主网上限 <b>${game.capacity}</b> · 电池输出 <b>${s.batteryOutput.toFixed(1)}</b> · 储能 <b>${Math.floor(s.batteryEnergy)}</b> · ${s.islandLoads} 个孤岛负载${s.unpowered?` · <span style="color:var(--red)">${s.unpowered} 个负载未供电</span>`:''} <button class="minor-button" data-action="upgrade-grid" ${game.gridLevel>=game.maxGridLevel()||game.credits<game.gridCost()?'disabled':''}>${game.gridLevel>=game.maxGridLevel()?'扩容已达本关上限':`扩容 +6 · ${game.gridCost()} 零件`}</button>`;
 $('line-controls').innerHTML=game.lines.map(l=>`<button class="line-control ${!l.closed?'off':''} ${l.fault||l.tripped?'fault':''}" data-line="${esc(l.id)}" title="${l.fault?'线路故障，等待修复':l.tripped?'点击复位保护':l.closed?'点击断开':'点击闭合'}">${esc(l.name)} <small>${l.fault?'故障':l.tripped?'复位':!l.closed?'断开':`${l.load.toFixed(0)}/${l.capacity}`}${l.warningRemaining!==null?` · ${Math.ceil(l.warningRemaining)}s`:''}</small></button>`).join('');
}
function toggleGrid(force){gridOpen=force??!gridOpen;selectedLine=null;renderer.selectedLine=null;lastGrid='';lastSelection='';refresh();}
function changeLine(id){const l=game.lines.find(l=>l.id===id);if(!l)return;if(l.fault){toast('线路正在抢修，可切换备用路径或用电池支撑。');return;}const ok=l.tripped?game.resetLine(id):game.toggleLine(id);toast(ok?`${l.name} · ${l.closed?'已合闸':'已断开'}`:'负载仍超过支路预算，请先切换备用或降低负载。');persist();refresh();}
function clearSelection(){selectedPad=null;selectedLine=null;buildType=null;aiming=false;renderer.aim=null;renderer.selected=null;renderer.selectedLine=null;renderer.buildType=null;lastSelection='';refresh();}
function startWave(){if(game.phase!=='build')return;if(game.startWave()){clearSelection();gridOpen=false;banner(`第 ${game.wave} 波潮汐`,game.waveDef().name);persist();refresh();}}
function togglePause(){if(!game.canEdit())return;game.paused=!game.paused;banner(game.paused?'时间暂停':'守望继续',game.paused?'仍可建造、切线与调整优先级':'THE TIDE RETURNS');persist();refresh();}
function autoBeam(){const target=game.enemies.find(e=>e.type==='boss')||game.enemies.reduce((a,b)=>!a||a.distance<b.distance?b:a,null);if(target)game.aimBeam(target.x,target.y);else toast('敌潮尚未抵达，可以点击地面预置光束。');}
function handleEvents(){
 for(const event of game.events.splice(0)){renderer.onEvent(event);audio.play(event.type,event);
  if(event.type==='clear'){banner('潮汐已退',`补给 +${event.reward} · 灯塔修复 +5`);persist();}
  if(event.type==='faultWarning')toast('天气预警：主路即将故障。按 Space 暂停并调度备用。');
  if(event.type==='trip')toast('支路保护已跳闸。降低负载或打开备用，再手动复位。');
  if(event.type==='faultRestored')toast('抢修完成，主路已恢复。');
  if(event.type==='boss')banner('深渊巨像', '最后一道防线 · 守住这束光');
  if(event.type==='won'||event.type==='lost')showResult();
 }
}
function showResult(){
 if(resultShown)return;resultShown=true;const won=game.phase==='won';clearSession();
 if(won&&!game.sandbox){if(!progress.completed.includes(game.level))progress.completed.push(game.level);progress.unlocked=Math.max(progress.unlocked,Math.min(8,game.level+2));progress.best[String(game.level)]=Math.max(progress.best[String(game.level)]||0,game.hp);saveProgress(progress);}
 openModal('result',`${modalHeader(won?'COAST SECURED / 海岸已点亮':'THE LIGHT WILL RETURN / 再次启程',won?'光还在这里':'这一夜，灯暗了',false)}<p>${won?esc(game.levelDef.subtitle)+'。这座海岸的航路已经重新亮起。':'潮汐暂时越过了防线。重试会恢复本关完整初始补给；你不需要带着失败的经济重新开始。'}</p><div class="result-number"><div><strong>${Math.round(game.hp)}</strong><small>灯塔剩余耐久</small></div><div><strong>${game.kills}</strong><small>拦截敌人</small></div><div><strong>${Math.floor(game.elapsed/60)}:${digits(Math.floor(game.elapsed%60))}</strong><small>战斗用时</small></div></div><p class="setting-note">${won?'最佳耐久与关卡解锁已记录在本机。':'建议：在转角配置控制与范围火力；电网故障前准备备用线路，必要时暂停救场。'}</p><div class="modal-actions"><button class="primary" data-action="${won?(game.level===7?'ending':'next-level'):'retry'}">${won?(game.level===7?'看见黎明':'驶向下一座海岸'):'重新守望'} ${icon('arrow')}</button><button class="secondary" data-action="map">航海图</button><button class="secondary" data-action="home">返回灯塔</button></div>`);
}
function showEnding(){openModal('ending',`<div class="result-seal">${icon('beacon')}</div>${modalHeader('DAWN / 群岛的黎明','所有灯塔，都亮了',false)}<p>风暴终于退到海平线外。第一艘归航的船驶过岬角，看到了你留下的光。</p><p>你守住的不只是一座灯塔。那些跨过海岸的线路，那些在孤岛上坚持的电池，以及在最黑的时刻被优先保住的火力，连成了群岛的新航路。</p><p>八段守望已经完成。你可以重返海岸追求更高耐久，或在自由沙盒里尝试另一种电网。</p><div class="modal-actions"><button class="primary" data-action="map">重看群岛 ${icon('arrow')}</button><button class="secondary" data-action="sandbox">进入沙盒</button><button class="secondary" data-action="credits">制作与来源</button></div>`);}
function refresh(){
 if(screen!=='play')return;const s=game.gridSummary;
 $('chapter-name').textContent=game.levelDef.name;$('chapter-kicker').textContent=game.sandbox?'SANDBOX / 自由调度':`CHAPTER ${digits(game.level+1)} / ${mechanicNames[game.levelDef.mechanic]}`;
 $('health').textContent=Math.ceil(game.hp);$('health-fill').style.width=game.hp+'%';$('credits').textContent=Math.floor(game.credits);$('power').textContent=`${s.powerUsed.toFixed(0)} / ${game.capacity}`;$('power-caption').textContent=s.batteryOutput>0?`电池 +${s.batteryOutput.toFixed(0)}`:'供电功率';$('power-open').classList.toggle('warn',s.unpowered>0);
 $('objective').textContent=game.sandbox?'自由沙盒 · 不记录战役成绩 · 可无限迎战':game.levelDef.objective;
 const n=game.phase==='build'?game.wave+1:game.wave,def=game.waveDef(n);$('wave-label').textContent=`${game.paused?'已暂停 · ':''}潮汐 ${digits(n)} / ${game.sandbox?'∞':digits(game.levelDef.waves)}`;$('wave-name').textContent=game.phase==='build'?'布置防线，等待潮汐':def.name+' · '+(game.queue.length+game.enemies.length)+' 个威胁';$('wave-enemies').textContent=def.units.map(([type,count])=>`${enemyNames[type]} ${count}`).join(' · ');
 $('speed').textContent=game.speed+'×';$('start-wave').disabled=game.phase!=='build';$('start-wave').querySelector('span').textContent=game.phase==='build'?'迎接潮汐':'潮汐进行中';$('overdrive').disabled=game.phase!=='wave'||game.paused||game.overdriveCooldown>0;$('overdrive-cooldown').textContent=game.overdriveCooldown>0?Math.ceil(game.overdriveCooldown)+'s':'Q';$('strike').disabled=game.phase!=='wave'||game.paused||game.strikeCooldown>0;$('strike').classList.toggle('active',aiming);$('strike-cooldown').textContent=game.strikeCooldown>0?Math.ceil(game.strikeCooldown)+'s':'E';
 for(const card of $('build-dock').children)card.classList.toggle('active',card.dataset.build===buildType);
 $('pad-current').textContent=selectedPad===null?'选择基座':`基座 ${digits(selectedPad+1)}`;
 $('tutorial').hidden=game.level!==0||game.sandbox||tutorialStep>=chapterTips.length||game.wave>1;if(!$('tutorial').hidden)$('tutorial-copy').textContent=chapterTips[tutorialStep];
 const alerts=game.lines.filter(l=>l.warningRemaining!==null&&l.warningRemaining!==undefined||l.fault||l.tripped);$('fault-alert').hidden=!alerts.length;if(alerts.length)$('fault-alert').innerHTML=alerts.slice(0,2).map(l=>`${esc(l.name)} · ${l.fault?'故障隔离':l.tripped?'保护跳闸':Math.ceil(l.warningRemaining)+' 秒后故障'}`).join('<br>')+'<button data-action="pause-grid">暂停并调度 →</button>';
 paintSelection();paintGrid();
}

const actions={close:closeModal,resume:()=>{pauseBeforeDialog=false;closeModal();},'pause-plan':()=>{pauseBeforeDialog=true;closeModal();toggleGrid(true);},'pause-grid':()=>{game.paused=true;toggleGrid(true);},home:goHome,map:showMap,guide:showGuide,credits:showCredits,settings:showSettings,sandbox:()=>newGame(7,true),'launch-level':()=>newGame(selectedLevel),retry:()=>newGame(game.level,game.sandbox),'next-level':()=>newGame(Math.min(7,game.level+1)),ending:showEnding,build:doBuild,grid:()=>toggleGrid(),'clear-selection':clearSelection,'retry-confirm':()=>openModal('confirm',`${modalHeader('RETRY / 重试','重新点亮这座海岸')}<p>本关布防将重新开始，初始补给会全部恢复。已经解锁的关卡与最佳成绩保留。</p><div class="modal-actions"><button class="primary" data-action="retry">确认重试</button><button class="secondary" data-action="close">取消</button></div>`),'upgrade-grid':()=>{if(!game.upgradeGrid())toast('零件不足或已达到本关扩容上限。');else{toast('主网 +6，主干支路容量 +3。');persist();}refresh();},upgrade:()=>{const t=game.towers.find(t=>t.pad===selectedPad);if(t){const r=game.upgrade(t.id);if(!r.ok)toast(r.reason);else persist();refresh();}},priority:()=>{const t=game.towers.find(t=>t.pad===selectedPad);if(t){game.setPriority(t.id,((t.priority??1)+1)%3);persist();refresh();}},target:()=>{const t=game.towers.find(t=>t.pad===selectedPad);if(t){game.cycleTargeting(t.id);persist();refresh();}},sell:()=>{const t=game.towers.find(t=>t.pad===selectedPad);if(t){game.sell(t.id);persist();refresh();}}};
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.action)actions[button.dataset.action]?.();else if(button.dataset.build)chooseBuild(button.dataset.build);else if(button.dataset.line)changeLine(button.dataset.line);else if(button.dataset.level!==undefined){selectedLevel=Number(button.dataset.level);paintMap();}});
for(const [id,fn] of Object.entries({'campaign-menu':showMap,'map-back':goHome,'settings-menu':showSettings,'map-settings':showSettings,'credits-menu':showCredits,'guide-menu':showGuide,'sandbox-menu':()=>newGame(7,true),continue:resumeGame,pause:showPause,'pause-icon':showPause,help:showGuide,'brief-open':()=>showBrief(),'power-open':()=>toggleGrid(),'grid-toggle':()=>toggleGrid(),'grid-close':()=>toggleGrid(false),'start-wave':startWave,speed:()=>{game.speed=game.speed===1?2:1;refresh();},overdrive:()=>{game.activateOverdrive();refresh();},strike:()=>{if(game.phase!=='wave'||game.paused||game.strikeCooldown>0)return;aiming=!aiming;buildType=null;renderer.buildType=null;toast(aiming?'点击战场选择聚光落点，右键取消。':'已取消聚光瞄准');refresh();},'tutorial-next':()=>{tutorialStep++;refresh();},'pad-prev':()=>selectPad((selectedPad===null?0:selectedPad+PADS.length-1)%PADS.length),'pad-next':()=>selectPad((selectedPad===null?0:selectedPad+1)%PADS.length)}))$(id).addEventListener('click',fn);
$('map-difficulty').addEventListener('change',()=>{settings.difficulty=$('map-difficulty').value;setSettings(settings);});
function local(event){const r=canvas.getBoundingClientRect();return [event.clientX-r.left,event.clientY-r.top];}
canvas.addEventListener('pointermove',event=>{if(screen!=='play'||$('modal').open)return;const [x,y]=local(event),pad=renderer.hitPad(x,y);renderer.hover=pad?.id??null;renderer.hoverLine=pad?null:renderer.hitLine?.(x,y)?.id;canvas.style.cursor=pad||renderer.hoverLine||aiming?'pointer':'crosshair';if(aiming){const p=renderer.pickGround(x,y);renderer.aim=canStrikeAt(p.x,p.y)?p:null;}});
canvas.addEventListener('pointerleave',()=>{renderer.hover=null;renderer.hoverLine=null;renderer.aim=null;});
canvas.addEventListener('click',event=>{if(screen!=='play'||$('modal').open||!game.canEdit())return;const [x,y]=local(event),p=renderer.pickGround(x,y);if(aiming){if(game.activateStrike(p.x,p.y)){aiming=false;renderer.aim=null;refresh();}return;}const pad=renderer.hitPad(x,y);if(pad){selectPad(pad.id);return;}const line=renderer.hitLine?.(x,y);if(line&&event.shiftKey){selectedPad=null;selectedLine=line.id;renderer.selectedLine=line.id;renderer.selected=null;gridOpen=false;lastSelection='';refresh();return;}clearSelection();if(canStrikeAt(p.x,p.y))game.aimBeam(p.x,p.y);});
canvas.addEventListener('contextmenu',event=>{event.preventDefault();clearSelection();});
document.addEventListener('keydown',event=>{
 if(event.repeat||['INPUT','SELECT','TEXTAREA'].includes(event.target.tagName))return;if($('modal').open)return;if(screen!=='play')return;
 if(event.key==='Escape'){event.preventDefault();if(buildType||selectedPad!==null||selectedLine||aiming||gridOpen){clearSelection();toggleGrid(false);}else showPause();return;}
 if(event.target.closest('button')&&['Enter',' '].includes(event.key))return;
 const key=event.key.toLowerCase();if([' ','arrowleft','arrowright','enter','g','q','e','b','f','h','1','2','3','4','5','6'].includes(key))event.preventDefault();
 if(key===' ')togglePause();else if(key==='g')toggleGrid();else if(key==='q')game.activateOverdrive();else if(key==='e')$('strike').click();else if(key==='b')autoBeam();else if(key==='f')$('speed').click();else if(key==='h')showGuide();else if(key==='enter'){if(buildType&&selectedPad!==null)doBuild();else startWave();}else if(key==='arrowleft')$('pad-prev').click();else if(key==='arrowright')$('pad-next').click();else if(/^[1-6]$/.test(key))chooseBuild(typeOrder[Number(key)-1]);refresh();
});
window.addEventListener('resize',fit);window.addEventListener('beforeunload',persist);document.addEventListener('visibilitychange',()=>{audio.setHidden(document.hidden);if(document.hidden&&screen==='play'){game.paused=true;persist();}});
function frame(now){
 const realDt=Math.min(.05,(now-previous)/1000);previous=now;
 if(screen==='play'){game.tick(realDt);handleEvents();saveClock+=realDt;if(saveClock>=5){saveClock=0;persist();}if(now-lastHud>160){refresh();lastHud=now;}audio.setAmbience({rain:game.level>=6?.45:0,wind:.2+game.level*.05,waves:.65,night:game.isNight()?1:.6});}
 if(screen==='home'){game.tick(realDt);game.events.length=0;}renderer.draw(screen==='play'&&game.paused?0:realDt,realDt);requestAnimationFrame(frame);
}
window.addEventListener('error',event=>{console.error('Last Beacon:',event.error);$('fatal').hidden=false;$('fatal-copy').textContent='运行时出现错误。你的已保存进度仍在本机。'+(event.message||'');});
titleIsland();switchScreen('home');updateContinue();requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('test'))window.__beacon={get game(){return game;},get screen(){return screen;},renderer,refresh,newGame};
