let state = {
    lists: [],       // [{ id, name, emoji }]
    tasks: [],       // [{ id, listId, title, completed, priority, due, createdAt }]
    activeListId: null,
    filter: 'all',
};

const STORAGE_KEY = 'taskly_data_v1';

const SARCASTIC_EMPTY = [
    { title: "Crystal clear.", sub: "Nothing to do. (Either you are incredibly productive or incredibly avoidant)" },
    { title: "Wow. Empty.", sub: "Look at you, totally on top of things. (Or totally in denial)" },
    { title: "A clean slate.", sub: "okay now add something." },
    { title: "Nothing here.", sub: "Go ahead, add a task." },
    { title: "All done!", sub: "You are not forgetting anything, are you?." },
];

const SARCASTIC_COMPLETED = [
    { title: "All caught up.", sub: "Suspiciously productive today, are we?" },
    { title: "Wow. You did it.", sub: "Everything is done. (This is rare. Screenshot this)" },
];

//INIT

function init() {
    loadFromStorage();
    renderLists();
    renderTasks();
    updateGlobalStats();
    bindEvents();
}

//STORAGE

function loadFromStorage() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            state.lists = saved.lists || [];
            state.tasks = saved.tasks || [];
            state.activeListId = saved.activeListId || null;
            state.filter = saved.filter || 'all';
        }
    } catch (e) {
        console.warn('Could not load saved data.', e);
    }
}

function saveToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Could not save data.', e);
    }
}

// RENDER: LISTS

function renderLists() {
    const nav = document.getElementById('list-nav');
    nav.innerHTML = '';

    if (state.lists.length === 0) {
        nav.innerHTML = `<li style="padding:14px 18px; font-size:0.82rem; color:var(--ink-faint); font-family:var(--font-hand);">No lists yet. Create one!</li>`;
        return;
    }

    state.lists.forEach(list => {
        const taskCount = state.tasks.filter(t => t.listId === list.id && !t.completed).length;
        const li = document.createElement('li');
        li.className = 'list-nav-item' + (state.activeListId === list.id ? ' active' : '');
        li.dataset.id = list.id;
        li.innerHTML = `
      <span class="list-emoji">${list.emoji}</span>
      <span class="list-label">${escHtml(list.name)}</span>
      ${taskCount > 0 ? `<span class="list-count">${taskCount}</span>` : ''}
    `;
        li.addEventListener('click', () => selectList(list.id));
        nav.appendChild(li);
    });

    //   Sync filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === state.filter);
    });
}

// RENDER: TASKS

function renderTasks() {
    const taskList = document.getElementById('task-list');
    const emptyState = document.getElementById('empty-state');
    const addBar = document.getElementById('add-task-bar');
    const panelTitle = document.getElementById('panel-title');
    const panelCount = document.getElementById('panel-count');
    const panelActs = document.getElementById('panel-actions');

    taskList.innerHTML = '';

    if (!state.activeListId) {
        addBar.style.display = 'none';
        panelActs.style.display = 'none';
        panelTitle.textContent = 'Pick a list';
        panelCount.textContent = '';
        emptyState.style.display = 'none';
        taskList.innerHTML = '';
        taskList.parentElement.innerHTML += ``;
        showNoListState();
        return;
    }

    removeNoListState();

    const list = state.lists.find(l => l.id === state.activeListId);
    panelTitle.textContent = list ? `${list.emoji} ${list.name}` : 'List';
    addBar.style.display = 'block';
    panelActs.style.display = 'flex';

    let tasks = state.tasks.filter(t => t.listId === state.activeListId);

    // Apply filter
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    if (state.filter === 'active') tasks = tasks.filter(t => !t.completed);
    if (state.filter === 'completed') tasks = tasks.filter(t => t.completed);
    if (state.filter === 'today') tasks = tasks.filter(t => t.due && t.due.slice(0, 10) === todayStr);

    // Sort: incomplete first, then by due date, then by priority weight
    const priWeight = { high: 0, medium: 1, low: 2 };
    tasks.sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.due && b.due) return new Date(a.due) - new Date(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return priWeight[a.priority] - priWeight[b.priority];
    });

    const totalCount = state.tasks.filter(t => t.listId === state.activeListId).length;
    const doneCount = state.tasks.filter(t => t.listId === state.activeListId && t.completed).length;
    panelCount.textContent = totalCount > 0 ? `${doneCount} of ${totalCount} done` : '';

    if (tasks.length === 0) {
        emptyState.style.display = 'flex';
        const msgs = doneCount > 0 ? SARCASTIC_COMPLETED : SARCASTIC_EMPTY;
        const msg = msgs[Math.floor(Math.random() * msgs.length)];
        document.getElementById('empty-title').textContent = msg.title;
        document.getElementById('empty-sub').textContent = msg.sub;
        return;
    }

    emptyState.style.display = 'none';

    tasks.forEach(task => {
        const li = document.createElement('li');
        li.className = `task-card pri-${task.priority}${task.completed ? ' completed' : ''}`;
        li.dataset.id = task.id;

        const dueLabel = formatDue(task.due);
        const dueClass = getDueClass(task.due);
        if (dueClass === 'today') li.classList.add('due-soon');

        li.innerHTML = `
    <button class="task-check" title="Mark complete" aria-label="Toggle complete">
        <svg viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <div class="task-body">
        <div class="task-title">${escHtml(task.title)}</div>
        <div class="task-meta-row">
        ${task.due ? `<span class="task-due ${dueClass}">
            <svg viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M4 1v2M10 1v2M1 6h12" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
            ${dueLabel}
        </span>` : ''}
        <span class="task-priority-tag ${task.priority}">${task.priority}</span>
        </div>
    </div>
    <div class="task-actions">
        <button class="task-act-btn edit" title="Edit task">
        <svg viewBox="0 0 14 14" fill="none"><path d="M2 10l7-7 2.5 2.5-7 7H2v-2.5z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
        </button>
        <button class="task-act-btn delete" title="Delete task">
    <svg viewBox="0 0 14 14" fill="none"><path d="M3 5h8M5.5 5V3.5h3V5M10.5 5l-.8 7H4.3L3.5 5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
    </div>
    `;

        li.querySelector('.task-check').addEventListener('click', () => toggleTask(task.id));
        li.querySelector('.edit').addEventListener('click', () => openEditModal(task.id));
        li.querySelector('.delete').addEventListener('click', () => deleteTask(task.id, li));

        taskList.appendChild(li);
    });
}

function showNoListState() {
    const wrap = document.querySelector('.task-list-wrap');
    if (wrap.querySelector('.no-list-state')) return;
    const div = document.createElement('div');
    div.className = 'no-list-state';
    div.innerHTML = `
    <svg class="no-list-icon" viewBox="0 0 60 60" fill="none">
    <rect x="8" y="6" width="34" height="42" rx="4" fill="var(--bg-alt)" stroke="var(--paper-shadow)" stroke-width="1.5"/>
    <rect x="14" y="14" width="22" height="2.5" rx="1.2" fill="var(--ink-faint)"/>
    <rect x="14" y="21" width="16" height="2.5" rx="1.2" fill="var(--ink-faint)"/>
    <rect x="14" y="28" width="20" height="2.5" rx="1.2" fill="var(--ink-faint)"/>
    </svg>
    <p class="no-list-title">No list selected</p>
    <p class="no-list-sub">Pick one from the sidebar, or make a new one. The button is right there.</p>
`;
    wrap.appendChild(div);
}

function removeNoListState() {
    const el = document.querySelector('.no-list-state');
    if (el) el.remove();
}

//ACTIONS on lists

function selectList(id) {
    state.activeListId = id;
    saveToStorage();
    renderLists();
    renderTasks();
}

function createList(name, emoji) {
    const id = 'list_' + Date.now();
    state.lists.push({ id, name: name.trim(), emoji });
    state.activeListId = id;
    saveToStorage();
    renderLists();
    renderTasks();
    updateGlobalStats();
    showToast(`"${name}" created.`);
}

function renameList(id, newName, newEmoji) {
    const list = state.lists.find(l => l.id === id);
    if (!list) return;
    list.name = newName.trim();
    list.emoji = newEmoji;
    saveToStorage();
    renderLists();
    renderTasks();
    showToast('List updated.');
}

function deleteList(id) {
    state.lists = state.lists.filter(l => l.id !== id);
    state.tasks = state.tasks.filter(t => t.listId !== id);
    if (state.activeListId === id) state.activeListId = state.lists[0]?.id || null;
    saveToStorage();
    renderLists();
    renderTasks();
    updateGlobalStats();
    showToast('List deleted.');
}

// ACTIONS on tasks

function addTask(title, priority, due) {
    if (!state.activeListId || !title.trim()) return;
    const task = {
        id: 'task_' + Date.now(),
        listId: state.activeListId,
        title: title.trim(),
        completed: false,
        priority: priority || 'medium',
        due: due || null,
        createdAt: new Date().toISOString(),
    };
    state.tasks.unshift(task);
    saveToStorage();
    renderTasks();
    renderLists();
    updateGlobalStats();
}

function toggleTask(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.completed = !task.completed;
    saveToStorage();
    renderTasks();
    renderLists();
    updateGlobalStats();
    if (task.completed) showToast('Done! You absolute legend.');
}

function editTask(id, title, priority, due) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    task.title = title.trim();
    task.priority = priority;
    task.due = due || null;
    saveToStorage();
    renderTasks();
    showToast('Task updated.');
}

function deleteTask(id, liEl) {
    liEl.classList.add('removing');
    liEl.addEventListener('animationend', () => {
        state.tasks = state.tasks.filter(t => t.id !== id);
        saveToStorage();
        renderTasks();
        renderLists();
        updateGlobalStats();
    }, { once: true });
    showToast('Task deleted.');
}

// EDIT MODAL

let editingTaskId = null;

function openEditModal(id) {
    const task = state.tasks.find(t => t.id === id);
    if (!task) return;
    editingTaskId = id;
    document.getElementById('modal-task-input').value = task.title;
    document.getElementById('modal-task-priority').value = task.priority;
    document.getElementById('modal-task-due').value = task.due ? task.due.slice(0, 16) : '';
    document.getElementById('modal-task').style.display = 'flex';
    document.getElementById('modal-task-input').focus();
}

// LIST MODAL

let listModalMode = 'create'; // 'create' | 'rename'
let selectedEmoji = '\uD83D\uDCCB';

function openNewListModal() {
    listModalMode = 'create';
    selectedEmoji = '\uD83D\uDCCB';
    document.getElementById('modal-list-title').textContent = 'New List';
    document.getElementById('modal-list-confirm').textContent = 'Create';
    document.getElementById('modal-list-input').value = '';
    document.querySelectorAll('.emoji-opt').forEach((b, i) => b.classList.toggle('selected', i === 0));
    document.getElementById('modal-list').style.display = 'flex';
    document.getElementById('modal-list-input').focus();
}

function openRenameListModal() {
    const list = state.lists.find(l => l.id === state.activeListId);
    if (!list) return;
    listModalMode = 'rename';
    selectedEmoji = list.emoji;
    document.getElementById('modal-list-title').textContent = 'Rename List';
    document.getElementById('modal-list-confirm').textContent = 'Save';
    document.getElementById('modal-list-input').value = list.name;
    document.querySelectorAll('.emoji-opt').forEach(b => {
        b.classList.toggle('selected', b.dataset.emoji === list.emoji);
    });
    document.getElementById('modal-list').style.display = 'flex';
    document.getElementById('modal-list-input').focus();
}

function closeListModal() {
    document.getElementById('modal-list').style.display = 'none';
}

function closeTaskModal() {
    document.getElementById('modal-task').style.display = 'none';
    editingTaskId = null;
}

//GLOBAL STATS

function updateGlobalStats() {
    const total = state.tasks.length;
    const done = state.tasks.filter(t => t.completed).length;
    const el = document.getElementById('global-stats');
    if (total === 0) {
        el.textContent = 'nothing to do.';
        return;
    }
    const pct = Math.round((done / total) * 100);
    el.textContent = `${done}/${total} done (${pct}%)`;
}

//DUE DATE

function formatDue(due) {
    if (!due) return '';
    const d = new Date(due);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dueStr = d.toISOString().slice(0, 10);
    if (dueStr === todayStr) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (d < now) return 'Overdue: ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getDueClass(due) {
    if (!due) return '';
    const d = new Date(due);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const dueStr = d.toISOString().slice(0, 10);
    if (d < now && !isToday(d)) return 'overdue';
    if (dueStr === todayStr) return 'today';
    return '';
}

function isToday(d) {
    const now = new Date();
    return d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
}

// TOAST

let toastTimer;
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

//UTILS

function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

//EVENTS

function bindEvents() {

// New list button
    document.getElementById('btn-new-list').addEventListener('click', openNewListModal);

// Rename / delete list
    document.getElementById('btn-rename-list').addEventListener('click', openRenameListModal);
    document.getElementById('btn-delete-list').addEventListener('click', () => {
        if (!state.activeListId) return;
        const list = state.lists.find(l => l.id === state.activeListId);
        if (!list) return;
        if (confirm(`Delete "${list.name}" and all its tasks? This cannot be undone.`)) {
            deleteList(state.activeListId);
        }
    });

// Filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            state.filter = btn.dataset.filter;
            saveToStorage();
            renderTasks();
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b === btn));
        });
    });

// Add task
    document.getElementById('btn-add-task').addEventListener('click', () => {
        const title = document.getElementById('task-input').value;
        const pri = document.getElementById('task-priority').value;
        const due = document.getElementById('task-due').value;
        if (!title.trim()) {
            showToast('Type something first.');
            document.getElementById('task-input').focus();
            return;
        }
        addTask(title, pri, due);
        document.getElementById('task-input').value = '';
        document.getElementById('task-due').value = '';
        document.getElementById('task-priority').value = 'medium';
        document.getElementById('task-input').focus();
    });

    document.getElementById('task-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btn-add-task').click();
    });

    // List modal: emoji selection
    document.querySelectorAll('.emoji-opt').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.emoji-opt').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedEmoji = btn.dataset.emoji;
        });
    });

    // List modal: cancel / confirm
    document.getElementById('modal-list-cancel').addEventListener('click', closeListModal);
    document.getElementById('modal-list-confirm').addEventListener('click', () => {
        const name = document.getElementById('modal-list-input').value.trim();
        if (!name) {
            showToast('A name would be nice.');
            return;
        }
        if (listModalMode === 'create') {
            createList(name, selectedEmoji);
        } else {
            renameList(state.activeListId, name, selectedEmoji);
        }
        closeListModal();
    });

    document.getElementById('modal-list-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-list-confirm').click();
    });

    // Task modal: cancel / confirm
    document.getElementById('modal-task-cancel').addEventListener('click', closeTaskModal);
    document.getElementById('modal-task-confirm').addEventListener('click', () => {
        const title = document.getElementById('modal-task-input').value;
        const pri = document.getElementById('modal-task-priority').value;
        const due = document.getElementById('modal-task-due').value;
        if (!title.trim()) {
            showToast('Empty task title is not a vibe.');
            return;
        }
        editTask(editingTaskId, title, pri, due);
        closeTaskModal();
    });

    document.getElementById('modal-task-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-task-confirm').click();
    });

    // Close modals on overlay click
    document.getElementById('modal-list').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-list')) closeListModal();
    });
    document.getElementById('modal-task').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-task')) closeTaskModal();
    });

    // Keyboard: Escape
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeListModal();
            closeTaskModal();
        }
    });
}

// START
init();