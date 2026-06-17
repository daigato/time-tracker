import './style.css';

// ----------------------------------------------------
// Constants & Configuration
// ----------------------------------------------------
const CIRCUMFERENCE = 2 * Math.PI * 130; // Radius = 130

// ----------------------------------------------------
// State Variables
// ----------------------------------------------------
let tasks = [];
let activeTaskId = null;
let stats = [];

let sessionTime = 0; // Current count-up session seconds
let timerId = null;
let isRunning = false;
let audioCtx = null;

// ----------------------------------------------------
// DOM Elements
// ----------------------------------------------------
const timerTimeEl = document.getElementById('timer-time');
const timerStatusEl = document.getElementById('timer-status');
const activeTaskNameEl = document.getElementById('active-task-name');
const btnStart = document.getElementById('btn-start');
const btnPause = document.getElementById('btn-pause');
const btnReset = document.getElementById('btn-reset');
const taskForm = document.getElementById('task-form');
const taskInput = document.getElementById('task-input');
const taskListEl = document.getElementById('task-list');
const statSessionsEl = document.getElementById('stat-sessions');
const statMinutesEl = document.getElementById('stat-minutes');
const weeklyChartEl = document.getElementById('weekly-chart');
const progressRingBar = document.querySelector('.progress-ring-bar');

// ----------------------------------------------------
// Audio Synthesis (Web Audio API)
// ----------------------------------------------------
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playCompletionSound() {
  initAudio();
  if (!audioCtx) return;

  const now = audioCtx.currentTime;
  
  // High quality double chime (A5 -> E6)
  const osc1 = audioCtx.createOscillator();
  const osc2 = audioCtx.createOscillator();
  const gain1 = audioCtx.createGain();
  const gain2 = audioCtx.createGain();
  
  osc1.type = 'sine';
  osc1.frequency.setValueAtTime(880, now);
  
  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(1320, now + 0.15);
  
  gain1.gain.setValueAtTime(0.2, now);
  gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  
  gain2.gain.setValueAtTime(0.2, now + 0.15);
  gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
  
  osc1.connect(gain1);
  gain1.connect(audioCtx.destination);
  
  osc2.connect(gain2);
  gain2.connect(audioCtx.destination);
  
  osc1.start(now);
  osc1.stop(now + 0.6);
  
  osc2.start(now + 0.15);
  osc2.stop(now + 0.85);
}

function playChime(type) {
  initAudio();
  if (!audioCtx) return;
  
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  
  if (type === 'start') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(659.25, now + 0.1); // E5
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'pause') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(523.25, now + 0.1); // C5
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

// ----------------------------------------------------
// Helper Functions
// ----------------------------------------------------
function formatTimeSpent(seconds) {
  if (seconds === 0) return '0秒';
  if (seconds < 60) {
    return `${seconds}秒`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (remainingMinutes === 0 && remainingSeconds === 0) {
    return `${hours}時間`;
  }
  if (remainingSeconds === 0) {
    return `${hours}時間${remainingMinutes}分`;
  }
  return `${hours}時間${remainingMinutes}分${remainingSeconds}秒`;
}

function formatStopwatch(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');
  
  if (h > 0) {
    const hStr = String(h).padStart(2, '0');
    return `${hStr}:${mStr}:${sStr}`;
  }
  return `${mStr}:${sStr}`;
}

// Escape HTML utility
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ----------------------------------------------------
// Timer Functions
// ----------------------------------------------------
function updateTimerDisplay() {
  const timeString = formatStopwatch(sessionTime);
  timerTimeEl.textContent = timeString;
  document.title = `${timeString} | FocusFlow`;
  
  // Progress Ring: Sweeping Second Hand (loops every 60 seconds)
  const secondsOfMinute = sessionTime % 60;
  const progressPercent = secondsOfMinute / 60;
  const offset = CIRCUMFERENCE * (1 - progressPercent);
  progressRingBar.style.strokeDashoffset = offset;
}

function startTimer() {
  if (activeTaskId === null) {
    alert('まずタスクを選択するか、新しく追加してください。');
    return;
  }
  
  const activeTask = tasks.find(t => t.id === activeTaskId);
  if (!activeTask || activeTask.completed) {
    alert('完了済みのタスクは計測できません。別のタスクを選択してください。');
    return;
  }

  initAudio();
  if (isRunning) return;
  
  isRunning = true;
  btnStart.classList.add('hidden');
  btnPause.classList.remove('hidden');
  timerStatusEl.textContent = '作業時間を計測中...';
  
  playChime('start');
  
  timerId = setInterval(() => {
    sessionTime++;
    
    // Accumulate time on active task
    const task = tasks.find(t => t.id === activeTaskId);
    if (task) {
      task.timeSpent++;
    }
    
    // Track stats in seconds
    addStatSeconds(1);
    
    // Save tasks periodically
    saveTasks();
    
    updateTimerDisplay();
    updateActiveTaskTimeDisplay(activeTaskId);
  }, 1000);
}

function pauseTimer() {
  if (!isRunning) return;
  
  clearInterval(timerId);
  timerId = null;
  isRunning = false;
  
  btnStart.classList.remove('hidden');
  btnPause.classList.add('hidden');
  timerStatusEl.textContent = '一時停止中';
  
  playChime('pause');
  saveTasks();
}

function resetTimer() {
  const confirmed = confirm('現在のセッション計測（中央のタイマー）を 00:00 にリセットしますか？\n(タスクに記録された累計時間は消去されません)');
  if (!confirmed) return;

  pauseTimer();
  sessionTime = 0;
  timerStatusEl.textContent = '計測を開始してください';
  updateTimerDisplay();
}

// ----------------------------------------------------
// Task Manager Functions
// ----------------------------------------------------
function saveTasks() {
  localStorage.setItem('focusflow_tasks', JSON.stringify(tasks));
  localStorage.setItem('focusflow_active_task_id', JSON.stringify(activeTaskId));
}

function loadTasks() {
  const storedTasks = localStorage.getItem('focusflow_tasks');
  const storedActiveId = localStorage.getItem('focusflow_active_task_id');
  
  tasks = storedTasks ? JSON.parse(storedTasks) : [];
  activeTaskId = storedActiveId ? JSON.parse(storedActiveId) : null;
  
  // Fallback if active task no longer exists or is completed
  if (activeTaskId) {
    const activeTask = tasks.find(t => t.id === activeTaskId);
    if (!activeTask || activeTask.completed) {
      const fallbackTask = tasks.find(t => !t.completed);
      activeTaskId = fallbackTask ? fallbackTask.id : null;
    }
  } else if (tasks.length > 0) {
    const fallbackTask = tasks.find(t => !t.completed);
    activeTaskId = fallbackTask ? fallbackTask.id : null;
  }
  
  renderTasks();
  updateActiveTaskDisplay();
}

function renderTasks() {
  taskListEl.innerHTML = '';
  
  if (tasks.length === 0) {
    taskListEl.innerHTML = `<li class="task-empty" style="color: var(--text-light); text-align: center; padding: 1.5rem 0; font-size: 0.9rem;">タスクが登録されていません</li>`;
    return;
  }
  
  tasks.forEach(task => {
    const li = document.createElement('li');
    li.className = `task-item ${task.completed ? 'completed' : ''} ${task.id === activeTaskId ? 'selected' : ''}`;
    
    li.innerHTML = `
      <div class="task-item-left">
        <div class="task-checkbox" title="${task.completed ? '未完了に戻す' : '完了にする'}">
          <i data-lucide="check"></i>
        </div>
        <span class="task-title">${escapeHTML(task.title)}</span>
      </div>
      <div class="task-item-right">
        <span class="time-spent-tag" data-task-id="${task.id}">${formatTimeSpent(task.timeSpent)}</span>
        <button class="btn-delete-task" aria-label="タスク削除" title="タスクを削除">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    `;
    
    // Select task click
    li.addEventListener('click', (e) => {
      if (e.target.closest('.task-checkbox') || e.target.closest('.btn-delete-task')) {
        return;
      }
      selectTask(task.id);
    });
    
    // Toggle completed click
    li.querySelector('.task-checkbox').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleTaskCompleted(task.id);
    });
    
    // Delete click
    li.querySelector('.btn-delete-task').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteTask(task.id);
    });
    
    taskListEl.appendChild(li);
  });
  
  lucide.createIcons();
}

function addTask(title) {
  const newTask = {
    id: Date.now(),
    title,
    completed: false,
    timeSpent: 0
  };
  tasks.push(newTask);
  
  // Auto-select if no task is active
  if (activeTaskId === null) {
    activeTaskId = newTask.id;
  }
  
  saveTasks();
  renderTasks();
  updateActiveTaskDisplay();
}

function toggleTaskCompleted(id) {
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.completed = !task.completed;
    
    if (task.completed) {
      playCompletionSound();
      
      // If completed and was selected, clear active selection and reset session timer
      if (activeTaskId === id) {
        pauseTimer();
        sessionTime = 0;
        activeTaskId = null;
        
        // Select another incomplete task if exists
        const nextTask = tasks.find(t => !t.completed);
        if (nextTask) activeTaskId = nextTask.id;
      }
    }
    
    saveTasks();
    renderTasks();
    updateActiveTaskDisplay();
    updateTimerDisplay();
    renderStats(); // Update completed count
  }
}

function selectTask(id) {
  const task = tasks.find(t => t.id === id);
  if (task && !task.completed) {
    if (activeTaskId !== id) {
      pauseTimer();
      sessionTime = 0; // Reset session timer on changing task
      activeTaskId = id;
      saveTasks();
      renderTasks();
      updateActiveTaskDisplay();
      updateTimerDisplay();
    }
  }
}

function deleteTask(id) {
  const confirmed = confirm('このタスクを削除しますか？\n(記録された時間も削除されます)');
  if (!confirmed) return;

  if (activeTaskId === id) {
    pauseTimer();
    sessionTime = 0;
    activeTaskId = null;
  }
  
  tasks = tasks.filter(t => t.id !== id);
  
  if (activeTaskId === null && tasks.length > 0) {
    const nextTask = tasks.find(t => !t.completed);
    if (nextTask) activeTaskId = nextTask.id;
  }
  
  saveTasks();
  renderTasks();
  updateActiveTaskDisplay();
  updateTimerDisplay();
  renderStats();
}

function updateActiveTaskDisplay() {
  const activeTask = tasks.find(t => t.id === activeTaskId);
  if (activeTask && !activeTask.completed) {
    activeTaskNameEl.textContent = activeTask.title;
    activeTaskNameEl.style.opacity = '1';
  } else {
    activeTaskNameEl.textContent = 'タスクが選択されていません';
    activeTaskNameEl.style.opacity = '0.5';
  }
}

function updateActiveTaskTimeDisplay(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const timeTag = document.querySelector(`.time-spent-tag[data-task-id="${id}"]`);
  if (timeTag) {
    timeTag.textContent = formatTimeSpent(task.timeSpent);
  }
}

// ----------------------------------------------------
// Statistics & Charts Functions
// ----------------------------------------------------
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadStats() {
  const storedStats = localStorage.getItem('focusflow_stats');
  stats = storedStats ? JSON.parse(storedStats) : [];
  
  // Clean up any old stats schemas if necessary
  stats = stats.map(s => {
    // If it's old Pomodoro stats schema
    if (s.sessionsCompleted !== undefined && s.secondsTracked === undefined) {
      return {
        date: s.date,
        secondsTracked: s.minutesCompleted * 60
      };
    }
    return s;
  });
  
  renderStats();
}

function saveStats() {
  localStorage.setItem('focusflow_stats', JSON.stringify(stats));
}

function addStatSeconds(seconds) {
  const today = getTodayDateString();
  let todayStat = stats.find(s => s.date === today);
  
  if (todayStat) {
    todayStat.secondsTracked += seconds;
  } else {
    stats.push({
      date: today,
      secondsTracked: seconds
    });
  }
  
  saveStats();
  renderStats();
}

function renderStats() {
  const today = getTodayDateString();
  const todayStat = stats.find(s => s.date === today);
  const totalSeconds = todayStat ? todayStat.secondsTracked : 0;
  
  statMinutesEl.textContent = formatTimeSpent(totalSeconds);
  statSessionsEl.textContent = tasks.filter(t => t.completed).length;
  
  renderWeeklyChart();
}

function renderWeeklyChart() {
  weeklyChartEl.innerHTML = '';
  
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    
    const weekdayLabels = ['日', '月', '火', '水', '木', '金', '土'];
    const label = weekdayLabels[d.getDay()];
    
    last7Days.push({
      date: dateStr,
      label: label,
      minutes: 0
    });
  }
  
  last7Days.forEach(day => {
    const matchedStat = stats.find(s => s.date === day.date);
    if (matchedStat) {
      day.minutes = Math.round(matchedStat.secondsTracked / 60);
    }
  });
  
  const maxMinutes = Math.max(...last7Days.map(d => d.minutes), 30); // scale ceiling: min 30 minutes
  
  last7Days.forEach(day => {
    const barHeightPercent = (day.minutes / maxMinutes) * 100;
    
    const barWrapper = document.createElement('div');
    barWrapper.className = 'chart-bar-wrapper';
    
    barWrapper.innerHTML = `
      <div class="chart-bar-container" title="${day.minutes}分記録">
        <div class="chart-bar-fill" style="height: ${barHeightPercent}%"></div>
      </div>
      <span class="chart-label">${day.label}</span>
    `;
    
    weeklyChartEl.appendChild(barWrapper);
  });
}

// ----------------------------------------------------
// Initialization & Events
// ----------------------------------------------------
function init() {
  // SVG circular bar setup
  progressRingBar.style.strokeDasharray = `${CIRCUMFERENCE} ${CIRCUMFERENCE}`;
  progressRingBar.style.strokeDashoffset = CIRCUMFERENCE;
  
  // Set default state
  updateTimerDisplay();
  
  // Button Event Listeners
  btnStart.addEventListener('click', startTimer);
  btnPause.addEventListener('click', pauseTimer);
  btnReset.addEventListener('click', resetTimer);
  
  // Form submission
  taskForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = taskInput.value.trim();
    if (title) {
      addTask(title);
      taskInput.value = '';
    }
  });
  
  // Load initial data
  loadTasks();
  loadStats();
  
  lucide.createIcons();
}

window.addEventListener('DOMContentLoaded', init);
