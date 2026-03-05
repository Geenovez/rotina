/* =========================
   Storage
========================= */
const STORAGE_KEY = "daily_tasks_v1";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return mergeWithDefaults(parsed);
  } catch {
    return defaultState();
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function defaultState() {
  return {
    tasks: [],                 // {id, title, time:"HH:MM"| "", days:[0..6], enabled:true, createdAt:number}
    manualOrderByDow: {        // dow -> [taskId, ...]
      "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": []
    },
    doneByDate: {},            // "YYYY-MM-DD" -> { [taskId]: true }
    sortMode: "time",          // "time" | "manual"
    selectedDow: null          // number 0..6
  };
}
function mergeWithDefaults(s) {
  const d = defaultState();
  const out = { ...d, ...s };
  out.tasks = Array.isArray(s.tasks) ? s.tasks : [];
  out.manualOrderByDow = { ...d.manualOrderByDow, ...(s.manualOrderByDow || {}) };
  out.doneByDate = s.doneByDate || {};
  out.sortMode = (s.sortMode === "manual") ? "manual" : "time";
  out.selectedDow = (typeof s.selectedDow === "number") ? s.selectedDow : null;
  return out;
}

/* =========================
   Utils
========================= */
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DOW_LONG = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];

function uid() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}
function pad2(n){ return String(n).padStart(2,"0"); }
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function nowDow() {
  return new Date().getDay(); // 0..6
}
function formatDatePt(iso) {
  const [y,m,dd] = iso.split("-").map(Number);
  const d = new Date(y, m-1, dd);
  return d.toLocaleDateString("pt-BR", { weekday:"long", year:"numeric", month:"long", day:"numeric" });
}
function timeKey(t) {
  // "" goes to end
  if (!t) return "99:99";
  return t;
}

function ensureManualOrderForDow(dow) {
  const key = String(dow);
  const list = state.manualOrderByDow[key] || [];
  const eligible = state.tasks
    .filter(t => t.enabled !== false && t.days.includes(dow))
    .map(t => t.id);

  // keep existing order, append missing, remove non-eligible
  const setEligible = new Set(eligible);
  const kept = list.filter(id => setEligible.has(id));
  const keptSet = new Set(kept);
  const appended = eligible.filter(id => !keptSet.has(id));
  state.manualOrderByDow[key] = [...kept, ...appended];
}

/* =========================
   App State
========================= */
let state = loadState();

/* =========================
   DOM
========================= */
const todayLabel = document.getElementById("todayLabel");
const dayTabs = document.getElementById("dayTabs");
const dayTitle = document.getElementById("dayTitle");
const dayHint = document.getElementById("dayHint");
const taskList = document.getElementById("taskList");
const emptyState = document.getElementById("emptyState");
const toggleSortBtn = document.getElementById("toggleSortBtn");
const addTaskBtn = document.getElementById("addTaskBtn");
const clearTodayBtn = document.getElementById("clearTodayBtn");

const modalBackdrop = document.getElementById("modalBackdrop");
const closeModalBtn = document.getElementById("closeModalBtn");
const cancelBtn = document.getElementById("cancelBtn");
const taskForm = document.getElementById("taskForm");
const modalTitle = document.getElementById("modalTitle");
const taskIdEl = document.getElementById("taskId");
const taskTitleEl = document.getElementById("taskTitle");
const taskTimeEl = document.getElementById("taskTime");
const taskEnabledEl = document.getElementById("taskEnabled");
const weekGrid = document.getElementById("weekGrid");
const deleteBtn = document.getElementById("deleteBtn");

/* =========================
   Render
========================= */
function render() {
  const iso = todayISO();
  todayLabel.textContent = `Hoje: ${formatDatePt(iso)}`;

  const currentDow = (state.selectedDow ?? nowDow());
  state.selectedDow = currentDow;

  renderTabs(currentDow);
  renderHeader(currentDow);
  renderTasks(currentDow, iso);

  toggleSortBtn.textContent = `Ordenar: ${state.sortMode === "time" ? "Horário" : "Manual"}`;
  saveState();
}

function renderTabs(activeDow) {
  dayTabs.innerHTML = "";
  for (let dow = 0; dow <= 6; dow++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `tab ${dow === activeDow ? "active" : ""}`;
    btn.textContent = DOW[dow];
    btn.addEventListener("click", () => {
      state.selectedDow = dow;
      render();
    });
    dayTabs.appendChild(btn);
  }
}

function renderHeader(dow) {
  const iso = todayISO();
  const selectedIsToday = (dow === nowDow());
  dayTitle.textContent = selectedIsToday ? "Hoje" : DOW_LONG[dow];
  dayHint.textContent = selectedIsToday
    ? "Marque o que você já fez hoje."
    : "Você pode organizar as tarefas deste dia e marcar concluídas por data.";
}

function getDoneMapForDate(iso) {
  if (!state.doneByDate[iso]) state.doneByDate[iso] = {};
  return state.doneByDate[iso];
}

function tasksForDow(dow) {
  return state.tasks.filter(t => (t.enabled !== false) && t.days.includes(dow));
}

function orderedTasks(dow) {
  ensureManualOrderForDow(dow);

  const list = tasksForDow(dow);
  const manualOrder = state.manualOrderByDow[String(dow)] || [];
  const manualIndex = new Map(manualOrder.map((id, i) => [id, i]));

  if (state.sortMode === "manual") {
    return [...list].sort((a,b) => (manualIndex.get(a.id) ?? 9999) - (manualIndex.get(b.id) ?? 9999));
  }

  // time mode: time asc, then manual as tie-breaker, then createdAt
  return [...list].sort((a,b) => {
    const ta = timeKey(a.time);
    const tb = timeKey(b.time);
    if (ta !== tb) return ta.localeCompare(tb);
    const ma = manualIndex.get(a.id) ?? 9999;
    const mb = manualIndex.get(b.id) ?? 9999;
    if (ma !== mb) return ma - mb;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
  });
}

function renderTasks(dow, iso) {
  taskList.innerHTML = "";
  const doneMap = getDoneMapForDate(iso);

  const list = orderedTasks(dow);

  emptyState.hidden = list.length !== 0;

  for (const t of list) {
    const li = document.createElement("li");
    li.className = "task";
    li.dataset.id = t.id;
    li.draggable = (state.sortMode === "manual");
    li.addEventListener("dragstart", onDragStart);
    li.addEventListener("dragover", onDragOver);
    li.addEventListener("drop", onDrop);

    const drag = document.createElement("div");
    drag.className = `dragHandle ${state.sortMode === "manual" ? "" : "hidden"}`;
    drag.textContent = "≡";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "checkbox";
    cb.checked = !!doneMap[t.id];
    cb.addEventListener("change", () => {
      if (cb.checked) doneMap[t.id] = true;
      else delete doneMap[t.id];
      render();
    });

    const main = document.createElement("div");
    main.className = "taskMain";

    const top = document.createElement("div");
    top.className = "taskTop";

    const title = document.createElement("div");
    title.className = "taskTitle";
    title.textContent = t.title;

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = t.time ? t.time : "sem horário";

    top.appendChild(title);
    top.appendChild(badge);

    const meta = document.createElement("div");
    meta.className = "taskMeta";
    meta.textContent = `Recorrente em: ${t.days.sort().map(d => DOW[d]).join(", ")}`;

    main.appendChild(top);
    main.appendChild(meta);

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "iconBtn";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", () => openModalForEdit(t.id));

    if (doneMap[t.id]) li.classList.add("taskDone");

    li.appendChild(drag);
    li.appendChild(cb);
    li.appendChild(main);
    li.appendChild(editBtn);

    taskList.appendChild(li);
  }
}

/* =========================
   Drag & Drop (Manual order)
========================= */
let draggedId = null;

function onDragStart(e) {
  if (state.sortMode !== "manual") return;
  draggedId = e.currentTarget.dataset.id;
  e.dataTransfer.effectAllowed = "move";
}
function onDragOver(e) {
  if (state.sortMode !== "manual") return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
}
function onDrop(e) {
  if (state.sortMode !== "manual") return;
  e.preventDefault();
  const targetId = e.currentTarget.dataset.id;
  if (!draggedId || draggedId === targetId) return;

  const dow = state.selectedDow ?? nowDow();
  ensureManualOrderForDow(dow);
  const key = String(dow);
  const arr = [...(state.manualOrderByDow[key] || [])];

  const from = arr.indexOf(draggedId);
  const to = arr.indexOf(targetId);
  if (from === -1 || to === -1) return;

  arr.splice(from, 1);
  arr.splice(to, 0, draggedId);
  state.manualOrderByDow[key] = arr;
  draggedId = null;
  render();
}

/* =========================
   Modal (Create/Edit)
========================= */
function buildWeekGrid() {
  weekGrid.innerHTML = "";
  for (let d = 0; d <= 6; d++) {
    const wrap = document.createElement("div");
    wrap.className = "weekItem";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `dow_${d}`;

    const lb = document.createElement("label");
    lb.setAttribute("for", cb.id);
    lb.textContent = DOW[d];

    wrap.appendChild(cb);
    wrap.appendChild(lb);
    weekGrid.appendChild(wrap);
  }
}

function openModal() {
  modalBackdrop.hidden = false;
  document.body.style.overflow = "hidden";
  taskTitleEl.focus();
}
function closeModal() {
  modalBackdrop.hidden = true;
  document.body.style.overflow = "";
}

function resetForm() {
  taskIdEl.value = "";
  taskTitleEl.value = "";
  taskTimeEl.value = "";
  taskEnabledEl.value = "true";
  for (let d = 0; d <= 6; d++) {
    document.getElementById(`dow_${d}`).checked = false;
  }
}

function openModalForNew() {
  modalTitle.textContent = "Nova tarefa";
  deleteBtn.hidden = true;
  resetForm();

  // por padrão: dia selecionado marcado
  const dow = state.selectedDow ?? nowDow();
  document.getElementById(`dow_${dow}`).checked = true;

  openModal();
}

function openModalForEdit(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;

  modalTitle.textContent = "Editar tarefa";
  deleteBtn.hidden = false;

  taskIdEl.value = t.id;
  taskTitleEl.value = t.title;
  taskTimeEl.value = t.time || "";
  taskEnabledEl.value = (t.enabled === false) ? "false" : "true";

  for (let d = 0; d <= 6; d++) {
    document.getElementById(`dow_${d}`).checked = t.days.includes(d);
  }

  openModal();
}

function getSelectedDaysFromForm() {
  const days = [];
  for (let d = 0; d <= 6; d++) {
    if (document.getElementById(`dow_${d}`).checked) days.push(d);
  }
  return days;
}

/* =========================
   Events
========================= */
toggleSortBtn.addEventListener("click", () => {
  state.sortMode = (state.sortMode === "time") ? "manual" : "time";
  render();
});

addTaskBtn.addEventListener("click", openModalForNew);
closeModalBtn.addEventListener("click", closeModal);
cancelBtn.addEventListener("click", closeModal);

modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeModal();
});

taskForm.addEventListener("submit", (e) => {
  e.preventDefault();

  const id = taskIdEl.value || uid();
  const title = taskTitleEl.value.trim();
  const time = taskTimeEl.value || "";
  const enabled = (taskEnabledEl.value === "true");
  const days = getSelectedDaysFromForm();

  if (!title) return;
  if (days.length === 0) {
    alert("Selecione pelo menos um dia da semana.");
    return;
  }

  const existing = state.tasks.find(t => t.id === id);
  if (existing) {
    existing.title = title;
    existing.time = time;
    existing.enabled = enabled;
    existing.days = days;
  } else {
    state.tasks.push({
      id, title, time, enabled,
      days,
      createdAt: Date.now()
    });
  }

  // garantir que a tarefa apareça nos orders manuais
  for (const d of days) ensureManualOrderForDow(d);

  closeModal();
  render();
});

deleteBtn.addEventListener("click", () => {
  const id = taskIdEl.value;
  if (!id) return;

  const ok = confirm("Excluir esta tarefa?");
  if (!ok) return;

  state.tasks = state.tasks.filter(t => t.id !== id);

  // remover de orders manuais
  for (let d = 0; d <= 6; d++) {
    const key = String(d);
    state.manualOrderByDow[key] = (state.manualOrderByDow[key] || []).filter(x => x !== id);
  }

  // remover de doneByDate
  for (const dateKey of Object.keys(state.doneByDate)) {
    if (state.doneByDate[dateKey] && state.doneByDate[dateKey][id]) {
      delete state.doneByDate[dateKey][id];
    }
  }

  closeModal();
  render();
});

clearTodayBtn.addEventListener("click", () => {
  const iso = todayISO();
  const ok = confirm("Zerar os checks de hoje?");
  if (!ok) return;
  state.doneByDate[iso] = {};
  render();
});

/* =========================
   Init
========================= */
buildWeekGrid();

// selectedDow default: today
if (state.selectedDow === null) state.selectedDow = nowDow();

render();

/* =========================
   PWA SW register
========================= */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
