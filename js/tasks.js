function loadTasks() {
  try { return JSON.parse(localStorage.getItem('fc_tasks') || '[]'); } catch { return []; }
}

function saveTasks(t) {
  try { localStorage.setItem('fc_tasks', JSON.stringify(t)); } catch {}
}

let tasks = loadTasks();

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderTasks() {
  const list = document.getElementById('task-list');
  if (!tasks.length) {
    list.innerHTML = '<div class="task-empty">Nothing here yet — add your first task</div>';
    return;
  }
  list.innerHTML = tasks.map(t => `
    <div class="task-item${t.done ? ' done' : ''}">
      <div class="task-check${t.done ? ' checked' : ''}" onclick="toggleTask(${t.id})"></div>
      <span class="task-text">${escHtml(t.text)}</span>
      <button class="task-del" onclick="deleteTask(${t.id})">×</button>
    </div>`).join('');
}

function toggleTaskInput() {
  const row = document.getElementById('task-input-row');
  row.classList.toggle('open');
  if (row.classList.contains('open')) setTimeout(() => document.getElementById('task-input').focus(), 50);
}

function addTask() {
  const input = document.getElementById('task-input');
  const val = input.value.trim();
  if (!val) return;
  tasks.push({ id: Date.now(), text: val, done: false });
  saveTasks(tasks);
  renderTasks();
  input.value = '';
  input.focus();
}

function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (t) { t.done = !t.done; saveTasks(tasks); renderTasks(); }
}

function deleteTask(id) {
  tasks = tasks.filter(x => x.id !== id);
  saveTasks(tasks);
  renderTasks();
}
