/* Rogue-2048 (Endless + Rebalanced Chance/Fate System) */

const SIZE = 4;
const BEST_KEY = 'rogue2048_best_roguelike';

// Config
const EVENT_PROBABILITY = 1.0;
const EVENT_TRIGGER_MODE = 'eachMax'; // 'eachMax','powerOfTwo','multipleOf8','everyIncrement'
const EVENT_COOLDOWN = 2;
const ENABLE_WIN_CHECK = false; // Endless
const MAX_STATIC_CLASS = 2048;
const EVENT_FOR_POWERS_ONLY = false;

// Chance ratios
const CHANCE_GOOD_RATIO = 0.8;

// State
let grid = [];
let score = 0;
let best = safeParseInt(localStorage.getItem(BEST_KEY), 0);
let moves = 0;
let gameOver = false;
let isEventActive = false;
let blindMode = false;
let blindModeMovesLeft = 0;
let lastEventMove = -999;
let triggeredSet = new Set();
let triggeredHistory = [];
let lastMaxValue = 0;

// DOM
const gridEl = document.getElementById('grid');
const scoreEl = document.getElementById('score');
const bestEl  = document.getElementById('best');
const endgameOverlay = document.getElementById('endgameOverlay');
const overlayTitle   = document.getElementById('overlayTitle');
const overlayText    = document.getElementById('overlayText');
const eventOverlay       = document.getElementById('eventOverlay');
const overlayTitleEvent  = document.getElementById('overlayTitleEvent');
const overlayTextEvent   = document.getElementById('overlayTextEvent');
const eventOptionsEl     = document.getElementById('eventOptions');
const statusBar          = document.getElementById('statusBar');

bestEl.textContent = best;

// ---------- Utilities ----------
function safeParseInt(v, fallback=0){
  const n = parseInt(v,10);
  return isNaN(n) ? fallback : n;
}
function cloneGrid(g){ return g.map(r => r.slice()); }
function getMaxTile(){
  let max = 0;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c] > max) max = grid[r][c];
  return max;
}
function getMinNonZero(){
  let min = Infinity;
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    const v = grid[r][c];
    if (v!==0 && v < min) min = v;
  }
  return min === Infinity ? 0 : min;
}
function isPowerOfTwo(n){ return n>0 && (n & (n-1))===0; }

// ---------- Setup ----------
function createGridUI() {
  gridEl.innerHTML = '';
  for (let i=0;i<SIZE*SIZE;i++){
    const div = document.createElement('div');
    div.className = 'cell';
    div.setAttribute('role','gridcell');
    gridEl.appendChild(div);
  }
}
function init(){
  grid = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  score = 0; moves = 0;
  gameOver = false;
  isEventActive = false;
  blindMode = false; blindModeMovesLeft = 0;
  triggeredSet.clear();
  triggeredHistory = [];
  lastMaxValue = 0;
  lastEventMove = -999;

  spawnRandom(); spawnRandom();
  hideOverlays();
  render();
  enableInput();
  updateStatus('');
}
function spawnRandom(){
  const empties = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) empties.push([r,c]);
  if (!empties.length) return false;
  const [r,c] = empties[(Math.random() * empties.length) | 0];
  grid[r][c] = Math.random() < 0.9 ? 2 : 4;
  return true;
}

// ---------- Move / Merge ----------
function moveLeftProcess(g){
  let moved = false, gained = 0;
  const mergedPos = [];
  const ng = g.map((row,rIdx) => {
    const filtered = row.filter(v => v!==0);
    const newRow = [];
    for (let i=0;i<filtered.length;i++){
      if (i+1 < filtered.length && filtered[i] === filtered[i+1]) {
        const merged = filtered[i]*2;
        newRow.push(merged);
        gained += merged;
        mergedPos.push({row: rIdx, col: newRow.length-1});
        i++;
      } else {
        newRow.push(filtered[i]);
      }
    }
    while (newRow.length < SIZE) newRow.push(0);
    return newRow;
  });
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (ng[r][c] !== g[r][c]) moved = true;
  return { newGrid: ng, moved, gained, mergedPositions: mergedPos };
}
function transpose(g){
  const out = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) out[r][c] = g[c][r];
  return out;
}
const reverseRows = g => g.map(r => r.slice().reverse());

function move(dir){
  if (gameOver || isEventActive) return;
  let g = cloneGrid(grid);
  let result;
  switch(dir){
    case 0: result = moveLeftProcess(g); g = result.newGrid; break;
    case 2: g = reverseRows(g); result = moveLeftProcess(g); g = reverseRows(result.newGrid); break;
    case 3: g = transpose(g); result = moveLeftProcess(g); g = transpose(result.newGrid); break;
    case 1: g = transpose(g); g = reverseRows(g); result = moveLeftProcess(g);
            g = reverseRows(result.newGrid); g = transpose(g); break;
  }
  if (!result || !result.moved) return;

  grid = g;
  score += result.gained;
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, best);
  }

  if (blindModeMovesLeft > 0) {
    blindModeMovesLeft--;
    if (blindModeMovesLeft <= 0) {
      blindMode = false;
      updateStatus('Blind ended.');
    } else {
      updateStatus(`Blind: ${blindModeMovesLeft} moves left.`);
    }
  }

  spawnRandom();
  moves++;
  render(result.mergedPositions);
  if (ENABLE_WIN_CHECK) checkWin();
  checkEnd();
  maybeTriggerEvent();
}

// ---------- End / Win ----------
function canMove(){
  for (let r=0;r<SIZE;r++){
    for (let c=0;c<SIZE;c++){
      const v = grid[r][c];
      if (v===0) return true;
      if (r+1 < SIZE && grid[r+1][c] === v) return true;
      if (c+1 < SIZE && grid[r][c+1] === v) return true;
    }
  }
  return false;
}
function checkEnd(){
  if (!canMove()) {
    endGame('Game Over', `You scored ${score} in ${moves} moves.`);
  }
}
function checkWin(){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
    if (grid[r][c] === 2048) {
      endGame('You Win!', `Reached 2048 in ${moves} moves. Score: ${score}.`);
      return;
    }
  }
}
function endGame(title,text){
  if (gameOver) return;
  gameOver = true;
  disableInput();
  if (score > best) {
    best = score;
    localStorage.setItem(BEST_KEY, best);
  }
  overlayTitle.textContent = title;
  overlayText.textContent = `${text} (Best: ${best})`;
  endgameOverlay.style.display = 'flex';
}

// ---------- Rendering ----------
function render(mergedPositions = []){
  const cells = gridEl.querySelectorAll('.cell');
  cells.forEach((cell, i) => {
    const r = (i / SIZE) | 0;
    const c = i % SIZE;
    const v = grid[r][c];
    cell.className = 'cell';
    cell.style.background = '';
    cell.style.color = '';
    if (v === 0){
      cell.textContent = '';
      return;
    }
    if (blindMode) {
      cell.textContent = '?';
      cell.classList.add('t-large');
    } else {
      cell.textContent = v;
      if (v <= MAX_STATIC_CLASS) {
        cell.classList.add(`t-${v}`);
        if (v >= 1024) cell.classList.add('t-large');
      } else {
        const hue = (Math.log2(v) * 37) % 360;
        cell.style.background = `hsl(${hue} 65% 50%)`;
        cell.style.color = '#fff';
        cell.classList.add('t-large');
      }
    }
  });

  mergedPositions.forEach(mp => {
    const idx = mp.row * SIZE + mp.col;
    const cell = cells[idx];
    if (cell){
      cell.classList.add('merged');
      setTimeout(() => cell.classList.remove('merged'), 180);
    }
  });

  scoreEl.textContent = score;
  bestEl.textContent = best;
}

// ---------- Event Trigger Policy ----------
function eventShouldTrigger(maxTile){
  if (maxTile < 8) return false;
  if (EVENT_FOR_POWERS_ONLY && !isPowerOfTwo(maxTile)) return false;
  switch (EVENT_TRIGGER_MODE) {
    case 'eachMax':
    case 'powerOfTwo':
      if (EVENT_TRIGGER_MODE === 'powerOfTwo' && !isPowerOfTwo(maxTile)) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile);
      return true;
    case 'multipleOf8':
      if (maxTile % 8 !== 0) return false;
      if (triggeredSet.has(maxTile)) return false;
      triggeredSet.add(maxTile);
      return true;
    case 'everyIncrement':
      if (maxTile > lastMaxValue) {
        triggeredHistory.push(maxTile);
        lastMaxValue = maxTile;
        return true;
      }
      return false;
    default:
      return false;
  }
}

function maybeTriggerEvent(){
  if (isEventActive) return;
  if (moves - lastEventMove < EVENT_COOLDOWN) return;
  const maxTile = getMaxTile();
  if (!eventShouldTrigger(maxTile)) return;
  if (Math.random() > EVENT_PROBABILITY) return;
  lastEventMove = moves;
  showEvent(maxTile);
}

// ---------- Effects (Chance & Fate) ----------
const chanceGoodEffects = [
  {
    id: 'AddMaxTile',
    label: 'Add one tile equal to current max',
    run: () => {
      const empties = collectEmpties();
      if (empties.length){
        const [r,c] = empties[(Math.random()*empties.length)|0];
        grid[r][c] = getMaxTile();
      }
    }
  },
  {
    id: 'DoubleRandomSmallRank',
    label: 'All tiles of a random small rank (2/4/8) doubled',
    run: () => {
      const present = [2,4,8].filter(v => hasValue(v));
      if (present.length === 0) return;
      const chosen = present[(Math.random()*present.length)|0];
      iterateTiles((v,r,c)=>{ if (v===chosen) grid[r][c] = v*2; });
    }
  },
  {
    id: 'SpawnPair48',
    label: 'Spawn two tiles (4 or 8)',
    run: () => {
      for (let i=0;i<2;i++){
        const empties = collectEmpties();
        if (!empties.length) return;
        const [r,c] = empties[(Math.random()*empties.length)|0];
        grid[r][c] = Math.random() < 0.5 ? 4 : 8;
      }
    }
  },
  {
    id: 'UpgradeLowestThree',
    label: 'Lowest up to three tiles doubled',
    run: () => {
      const tiles = [];
      for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++){
        const v = grid[r][c];
        if (v>0) tiles.push({v,r,c});
      }
      tiles.sort((a,b)=>a.v-b.v);
      const pick = tiles.slice(0,3);
      pick.forEach(t => { grid[t.r][t.c] = t.v*2; });
    }
  }
];

const chanceHindranceEffects = [
  {
    id: 'HalveSingleMax',
    label: 'One max tile halved',
    run: () => {
      const m = getMaxTile();
      const coords = [];
      iterateTiles((v,r,c)=>{ if (v===m) coords.push([r,c]); });
      if (!coords.length) return;
      const [r,c] = coords[(Math.random()*coords.length)|0];
      grid[r][c] = Math.max(1, Math.floor(grid[r][c]/2));
    }
  }
];

// Fate weighted effects
const fateEffects = [
  {
    id:'AllBecomeMax', weight:5,
    label:'All tiles become current max',
    run: () => {
      const m = getMaxTile();
      iterateTiles((v,r,c)=>{ if (v!==0) grid[r][c]=m; });
    }
  },
  {
    id:'SpawnHighTile', weight:5,
    label:'Spawn a high tile (max*2)',
    run: () => {
      const m = getMaxTile();
      const val = Math.min(m*2, 8192);
      const empties = collectEmpties();
      if (empties.length){
        const [r,c] = empties[(Math.random()*empties.length)|0];
        grid[r][c] = val;
      } else {
        const all = collectAll();
        const [r,c] = all[(Math.random()*all.length)|0];
        grid[r][c] = val;
      }
    }
  },
  {
    id:'RandomFactorGlobal', weight:15,
    label:'Random global factor (×0.5 / ×2 / ×4 / ×8)',
    run: () => {
      const roll = Math.random();
      let factor;
      if (roll < 0.60) factor = 0.5;
      else if (roll < 0.85) factor = 2;
      else if (roll < 0.97) factor = 4;
      else factor = 8;
      iterateTiles((v,r,c)=>{ if (v!==0) grid[r][c] = Math.max(1, Math.floor(v*factor)); });
    }
  },
  {
    id:'ShuffleAll', weight:10,
    label:'Board shuffled',
    run: () => shuffleGrid()
  },
  {
    id:'HalveAllAbove32', weight:15,
    label:'All tiles ≥32 halved',
    run: () => {
      iterateTiles((v,r,c)=>{ if (v>=32) grid[r][c]=Math.max(1,Math.floor(v/2)); });
    }
  },
  {
    id:'BlindFive', weight:10,
    label:'Blind mode for 5 moves',
    run: () => { blindMode = true; blindModeMovesLeft = 5; }
  },
  {
    id:'DecayAll', weight:15,
    label:'All tiles halved',
    run: () => {
      iterateTiles((v,r,c)=>{ if (v>0) grid[r][c]=Math.max(1,Math.floor(v/2)); });
    }
  },
  {
    id:'PurgeRandomRow', weight:5,
    label:'One random row cleared',
    run: () => {
      const row = (Math.random()*SIZE)|0;
      for (let c=0;c<SIZE;c++) grid[row][c]=0;
    }
  },
  {
    id:'StripMaxTiles', weight:10,
    label:'All max tiles reduced (halved)',
    run: () => {
      const m = getMaxTile();
      iterateTiles((v,r,c)=>{ if (v===m) grid[r][c]=Math.max(1,Math.floor(v/2)); });
    }
  },
  {
    id:'ResetHalfBoard', weight:10,
    label:'Half of non-zero tiles reset to 2',
    run: () => {
      const coords = [];
      iterateTiles((v,r,c)=>{ if (v>0) coords.push([r,c]); });
      shuffleArray(coords);
      const cut = Math.floor(coords.length/2);
      for (let i=0;i<cut;i++){
        const [r,c] = coords[i];
        grid[r][c] = 2;
      }
    }
  }
];

// ---------- Event System ----------
function showEvent(triggerValue){
  isEventActive = true;
  disableInput();
  overlayTitleEvent.textContent = 'Event!';
  overlayTextEvent.textContent = `Max tile ${triggerValue}. Choose your path.`;
  eventOptionsEl.innerHTML = '';

  addEventOption('Chance', 'Mostly helpful (small risk).', 'chance', () => {
    const isGood = Math.random() < CHANCE_GOOD_RATIO;
    const pool = isGood ? chanceGoodEffects : chanceHindranceEffects;
    const chosen = pool[(Math.random()*pool.length)|0];
    chosen.run();
    closeEvent();
    render();
    updateStatus(`Chance -> ${isGood ? 'Good' : 'Hindrance'}: ${chosen.label}`);
    if (blindMode) updateStatus(`Chance -> ${isGood ? 'Good' : 'Hindrance'}: ${chosen.label} (Blind)`);
  });

  addEventOption('Fate', 'High risk gambling (heavier negatives).', 'fate', () => {
    const chosen = weightedPick(fateEffects);
    chosen.run();
    closeEvent();
    render();
    updateStatus(`Fate: ${chosen.label}${blindMode ? ' (Blind)' : ''}`);
  });

  eventOverlay.style.display = 'flex';
  setTimeout(() => {
    const first = eventOptionsEl.querySelector('.event-option');
    if (first) first.focus();
  }, 20);
}

function addEventOption(title, desc, extraClass, handler){
  const div = document.createElement('div');
  div.className = `event-option ${extraClass}`;
  div.innerHTML = `<strong>${title}</strong><div>${desc}</div>`;
  div.onclick = handler;
  eventOptionsEl.appendChild(div);
}

function weightedPick(list){
  const total = list.reduce((a,e)=>a+e.weight,0);
  let roll = Math.random()*total;
  for (const e of list){
    if (roll < e.weight) return e;
    roll -= e.weight;
  }
  return list[list.length-1];
}

function closeEvent(){
  isEventActive = false;
  eventOverlay.style.display = 'none';
  enableInput();
  render();
}

// ---------- Helpers ----------
function collectEmpties(){
  const out = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===0) out.push([r,c]);
  return out;
}
function collectAll(){
  const out = [];
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) out.push([r,c]);
  return out;
}
function iterateTiles(fn){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) fn(grid[r][c], r, c);
}
function shuffleGrid(){
  const flat = grid.flat();
  shuffleArray(flat);
  for (let i=0;i<flat.length;i++){
    grid[(i/SIZE)|0][i%SIZE] = flat[i];
  }
}
function shuffleArray(a){
  for (let i=a.length-1;i>0;i--){
    const j = (Math.random()*(i+1))|0;
    [a[i],a[j]]=[a[j],a[i]];
  }
}
function hasValue(val){
  for (let r=0;r<SIZE;r++) for (let c=0;c<SIZE;c++) if (grid[r][c]===val) return true;
  return false;
}

// ---------- Input ----------
function keyHandler(e){
  if (gameOver || isEventActive) return;
  switch(e.key){
    case 'ArrowLeft': case 'a': move(0); break;
    case 'ArrowRight': case 'd': move(2); break;
    case 'ArrowUp': case 'w': move(3); break;
    case 'ArrowDown': case 's': move(1); break;
  }
}
let touchStartX=0,touchStartY=0,touchEndX=0,touchEndY=0;
function touchStartHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length === 1){
    touchStartX = touchEndX = e.touches[0].clientX;
    touchStartY = touchEndY = e.touches[0].clientY;
  }
}
function touchMoveHandler(e){
  if (gameOver || isEventActive) return;
  if (e.touches.length === 1){
    touchEndX = e.touches[0].clientX;
    touchEndY = e.touches[0].clientY;
  }
}
function touchEndHandler(){
  if (gameOver || isEventActive) return;
  const dx = touchEndX - touchStartX;
  const dy = touchEndY - touchStartY;
  if (Math.abs(dx) < 30 && Math.abs(dy) < 30) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    dx > 0 ? move(2) : move(0);
  } else {
    dy > 0 ? move(1) : move(3);
  }
}

function disableInput(){
  window.removeEventListener('keydown', keyHandler);
  window.removeEventListener('touchstart', touchStartHandler);
  window.removeEventListener('touchmove', touchMoveHandler);
  window.removeEventListener('touchend', touchEndHandler);
}
function enableInput(){
  window.addEventListener('keydown', keyHandler);
  window.addEventListener('touchstart', touchStartHandler, { passive: true });
  window.addEventListener('touchmove', touchMoveHandler, { passive: true });
  window.addEventListener('touchend', touchEndHandler, { passive: true });
}

// ---------- UI ----------
function hideOverlays(){
  endgameOverlay.style.display = 'none';
  eventOverlay.style.display = 'none';
}
function updateStatus(msg){
  if (statusBar) statusBar.textContent = msg;
}

// ---------- Buttons ----------
document.getElementById('btnRestart').addEventListener('click', () => { init(); });
document.getElementById('btnRestart2').addEventListener('click', () => { init(); });
document.getElementById('btnCloseEvent').addEventListener('click', () => { closeEvent(); });

// ---------- Start ----------
createGridUI();
init();