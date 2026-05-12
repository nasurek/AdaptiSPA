// app.js

// quotes shown daily on the dashboard
var QUOTES = [
  { text: "Work hard in silence, let success make the noise.", author: "Frank Ocean" },
  { text: "I've failed over and over again in my life. And that is why I succeed.", author: "Michael Jordan" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Don't stop when you're tired. Stop when you're done.", author: "David Goggins" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" }
];

// picks a different quote each day using day of year % number of quotes
function getDailyQuote() {
  var now   = new Date();
  var start = new Date(now.getFullYear(), 0, 0);
  var day   = Math.floor((now - start) / 86400000);
  return QUOTES[day % QUOTES.length];
}

// timer state - kept outside functions so it survives page changes
var timerSeconds     = 25 * 60;
var timerRunning     = false;
var timerInterval    = null;
var timerSessionName = "Focus Session";

// calendar state - tracks which month is showing
var calYear  = new Date().getFullYear();
var calMonth = new Date().getMonth();

// Data

// reads tasks from localStorage on page load
function loadData() {
  try {
    var saved = localStorage.getItem("studyData");
    if (saved) return normalizeData(JSON.parse(saved));
  } catch (e) {}
  return normalizeData({ modules: [{ name: "General", tasks: [] }] });
}

// writes current tasks to localStorage
function saveData() {
  localStorage.setItem("studyData", JSON.stringify(data));
}

var data = loadData();

// Setup

var app       = document.getElementById("app");
var statusMsg = document.getElementById("statusMsg");
var importBtn = document.getElementById("importBtn");
var exportBtn = document.getElementById("exportBtn");
var fileInput = document.getElementById("fileInput");

// import button clicks the hidden file input to open the file picker
if (importBtn) { importBtn.onclick = function() { fileInput.click(); }; }
if (fileInput) { fileInput.onchange = importJSON; }
if (exportBtn) { exportBtn.onclick = exportJSON; }

// re-renders the page every time the URL hash changes
window.onhashchange = render;
window.onload = function() {
  if (!location.hash) location.hash = "#dashboard";
  render();
};

// Router

// reads the URL hash and calls the right render function
function render() {
  var page = location.hash.replace("#", "") || "dashboard";
  setActiveNav(page);
  if      (page === "tasks")    renderTasks();
  else if (page === "calendar") renderCalendar();
  else if (page === "timer")    renderTimer();
  else if (page === "about")    renderAbout();
  else                          renderDashboard();
}

// adds the active CSS class to the current page nav link
function setActiveNav(page) {
  var links = document.querySelectorAll(".nav-link");
  for (var i = 0; i < links.length; i++) {
    var href = links[i].getAttribute("href").replace("#", "");
    if (href === page) links[i].classList.add("active");
    else               links[i].classList.remove("active");
  }
}

// Helpers

// validates all task data - fills in missing fields with safe defaults
function normalizeData(raw) {
  var d = (raw && typeof raw === "object") ? raw : {};
  if (!Array.isArray(d.modules)) d.modules = [];
  var allTasks = [];
  for (var i = 0; i < d.modules.length; i++) {
    var m = d.modules[i];
    if (m && Array.isArray(m.tasks)) allTasks = allTasks.concat(m.tasks);
  }
  d.modules = [{ name: "General", tasks: allTasks }];
  d.modules[0].tasks = d.modules[0].tasks
    .map(function(t) {
      return {
        id:         (typeof t.id === "string") ? t.id : makeId(),
        title:      (typeof t.title === "string") ? t.title : "",
        deadline:   (typeof t.deadline === "string") ? t.deadline : "",
        importance: clamp(Number(t.importance), 1, 5, 3),
        status:     validStatus(t.status)
      };
    })
    .filter(function(t) { return t.title.trim() !== ""; });
  return d;
}

// generates a unique ID for each task
function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

// keeps a number between min and max
function clamp(n, min, max, fallback) {
  if (!Number.isFinite(n)) return (fallback !== undefined ? fallback : min);
  return Math.min(max, Math.max(min, n));
}

// only allows the three valid status values
function validStatus(s) {
  var v = String(s || "").toLowerCase();
  if (v === "not started" || v === "in progress" || v === "completed") return v;
  return "not started";
}

// replaces dangerous HTML characters to prevent XSS attacks
function esc(str) {
  return String(str).replace(/[&<>"']/g, function(c) {
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
  });
}

function setStatus(text) {
  if (statusMsg) statusMsg.textContent = text;
}

// builds a star rating string e.g. importance 3 = ★★★☆☆
function makeStars(n) {
  var s = "";
  for (var i = 0; i < n; i++) s += "★";
  for (var j = n; j < 5; j++) s += "☆";
  return s;
}

// Priority

// converts days left into an urgency score 1-10
// overdue=10, today=9, tomorrow=8, within 14 days uses smooth decay formula
function getUrgencyScore(days) {
  if (days === null) return 1;
  if (days < 0)     return 10;
  if (days === 0)   return 9;
  if (days === 1)   return 8;
  if (days <= 14)   return Math.max(2, 7 / (days + 1)); // smooth decay
  return 1;
}

// calculates final score = importance x urgency, sorts highest first
function getSortedTasks() {
  var result = [];
  var tasks  = data.modules[0].tasks;
  for (var i = 0; i < tasks.length; i++) {
    var t       = tasks[i];
    var days    = daysUntil(t.deadline);
    var urgency = getUrgencyScore(days);
    var urgencyClass = "ok";
    if      (days !== null && days < 0)  urgencyClass = "urgent";
    else if (days !== null && days <= 3) urgencyClass = "urgent";
    else if (days !== null && days <= 7) urgencyClass = "warn";
    // completed tasks get 0.1 multiplier so they sink to the bottom
    var score = t.importance * urgency * (t.status === "completed" ? 0.1 : 1);
    result.push({ id: t.id, title: t.title, deadline: t.deadline,
      importance: t.importance, status: t.status,
      days: days, urgencyClass: urgencyClass, score: score });
  }
  // b.score - a.score = descending order (highest first)
  result.sort(function(a, b) { return b.score - a.score; });
  return result;
}

// returns days between today and a deadline string
// built manually to avoid UTC timezone shifting the date by a day in UK
function daysUntil(dateStr) {
  if (!dateStr) return null;
  var parts = dateStr.split("-").map(Number);
  if (parts.length < 3) return null;
  var d = new Date(parts[0], parts[1] - 1, parts[2]); // local time not UTC
  if (isNaN(d.getTime())) return null;
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d - today) / 86400000);
}

// returns the badge label and colour class for a task card
function deadlineBadge(days) {
  if (days === null) return { text: "No deadline", cls: "green" };
  if (days < 0)      return { text: "Overdue by " + Math.abs(days) + " day" + (Math.abs(days) === 1 ? "" : "s"), cls: "red" };
  if (days === 0)    return { text: "Due today!", cls: "red" };
  if (days === 1)    return { text: "Due tomorrow", cls: "red" };
  if (days <= 3)     return { text: "Due in " + days + " days", cls: "amber" };
  return               { text: "Due in " + days + " days", cls: "green" };
}

// Dashboard

function renderDashboard() {
  data = normalizeData(data);
  var tasks     = getSortedTasks();
  var total     = tasks.length;
  var completed = 0;
  var overdue   = 0;
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].status === "completed") completed++;
    if (tasks[i].days !== null && tasks[i].days < 0 && tasks[i].status !== "completed") overdue++;
  }
  var remaining   = total - completed;
  // prevent divide by zero when no tasks exist
  var progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
  var quote       = getDailyQuote();
  var h = "";
  h += '<div class="page-title">Dashboard</div>';
  // builds today's date as a readable string
  var days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  var months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var now = new Date();
  var dateStr = days[now.getDay()] + ", " + now.getDate() + " " + months[now.getMonth()] + " " + now.getFullYear();
  h += '<div class="page-sub">' + dateStr + "</div>";
  h += '<div class="quote-banner"><div class="quote-text">"' + esc(quote.text) + '"</div>';
  h += '<div class="quote-author">— ' + esc(quote.author) + "</div></div>";
  h += '<div class="stats-row">';
  h += '<div class="stat-card purple"><div class="stat-num">' + total     + '</div><div class="stat-label">Total Tasks</div></div>';
  h += '<div class="stat-card pink"  ><div class="stat-num">' + completed + '</div><div class="stat-label">Completed</div></div>';
  h += '<div class="stat-card cyan"  ><div class="stat-num">' + remaining + '</div><div class="stat-label">Remaining</div></div>';
  h += '<div class="stat-card green" ><div class="stat-num">' + progressPct + '%</div><div class="stat-label">Completion Rate</div></div>';
  h += "</div>";
  h += '<div class="card"><div class="card-title">Overall Progress</div>';
  h += '<div class="progress-meta"><span>' + progressPct + '% complete</span><span>' + completed + ' / ' + total + ' tasks</span></div>';
  // width set as inline style so CSS transition animates it
  h += '<div class="progress-track"><div class="progress-fill" style="width:' + progressPct + '%"></div></div></div>';
  h += '<div class="card"><div class="card-title">Your Tasks</div>';
  if (tasks.length === 0) {
    h += '<div class="empty-msg">No tasks yet. <a href="#tasks">Add your first task</a></div>';
  } else {
    h += '<div class="task-grid">';
    for (var j = 0; j < tasks.length; j++) {
      var t  = tasks[j];
      var b  = deadlineBadge(t.days);
      var tc = "task-card " + t.urgencyClass;
      if (t.status === "completed") tc += " done";
      h += '<div class="' + tc + '">';
      h += '<div class="task-name">' + esc(t.title) + "</div>"; // esc prevents XSS
      h += '<div class="task-stars">' + makeStars(t.importance) + "</div>";
      h += '<div class="task-deadline">Deadline: ' + (t.deadline || "None set") + "</div>";
      h += '<span class="task-badge ' + b.cls + '">' + b.text + "</span>";
      h += '<div class="task-footer">';
      // data-id stores the task ID so we know which task to update
      h += '<select class="statusDrop" data-id="' + t.id + '">';
      h += '<option value="not started"' + (t.status === "not started" ? " selected" : "") + ">Not started</option>";
      h += '<option value="in progress"' + (t.status === "in progress" ? " selected" : "") + ">In progress</option>";
      h += '<option value="completed"'   + (t.status === "completed"   ? " selected" : "") + ">Completed</option>";
      h += "</select>";
      h += '<button class="del-btn" data-id="' + t.id + '">&#10005;</button>';
      h += "</div></div>";
    }
    h += "</div>";
  }
  h += "</div>";
  app.innerHTML = h;

  // wire up status dropdowns after HTML is on the page
  var drops = document.querySelectorAll(".statusDrop");
  for (var s = 0; s < drops.length; s++) {
    drops[s].addEventListener("change", function() {
      var id = this.dataset.id;
      for (var k = 0; k < data.modules[0].tasks.length; k++) {
        if (data.modules[0].tasks[k].id === id) {
          data.modules[0].tasks[k].status = validStatus(this.value);
          break;
        }
      }
      saveData();
      setStatus("Status updated");
      renderDashboard();
    });
  }

  // wire up delete buttons after HTML is on the page
  var delBtns = document.querySelectorAll(".del-btn");
  for (var d2 = 0; d2 < delBtns.length; d2++) {
    delBtns[d2].addEventListener("click", function() {
      if (!confirm("Delete this task?")) return;
      var id = this.dataset.id;
      for (var k = 0; k < data.modules[0].tasks.length; k++) {
        if (data.modules[0].tasks[k].id === id) {
          data.modules[0].tasks.splice(k, 1); // removes 1 item at index k
          break;
        }
      }
      saveData();
      setStatus("Task deleted");
      renderDashboard();
    });
  }
}

// Calendar

function renderCalendar() {
  data = normalizeData(data);
  // builds a map of date string -> task titles due that day
  var tasksByDate = {};
  var urgentDates = {};
  for (var i = 0; i < data.modules[0].tasks.length; i++) {
    var t = data.modules[0].tasks[i];
    if (t.deadline && t.status !== "completed") {
      if (!tasksByDate[t.deadline]) tasksByDate[t.deadline] = [];
      tasksByDate[t.deadline].push(t.title);
      var d = daysUntil(t.deadline);
      if (d !== null && d <= 3) urgentDates[t.deadline] = true;
    }
  }
  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var DAYS   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  // getDay() returns 0-6 for which day of week the 1st falls on
  var firstDay    = new Date(calYear, calMonth, 1).getDay();
  // day 0 of next month = last day of this month
  var daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  var now         = new Date();
  var todayStr    = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
  var h = "";
  h += '<div class="page-title">Calendar</div>';
  h += '<div class="page-sub">See your deadlines laid out by month</div>';
  h += '<div class="card"><div class="cal-nav">';
  h += '<button class="cal-arrow" id="calPrev">&#8592; Prev</button>';
  h += '<div class="cal-month">' + MONTHS[calMonth] + " " + calYear + "</div>";
  h += '<button class="cal-arrow" id="calNext">Next &#8594;</button></div>';
  h += '<div class="cal-grid">';
  for (var dh = 0; dh < 7; dh++) h += '<div class="cal-head">' + DAYS[dh] + "</div>";
  // empty cells before the 1st of the month
  for (var e = 0; e < firstDay; e++) h += '<div class="cal-cell empty"></div>';
  for (var day = 1; day <= daysInMonth; day++) {
    var ds    = calYear + "-" + String(calMonth+1).padStart(2,"0") + "-" + String(day).padStart(2,"0");
    var tasks = tasksByDate[ds] || [];
    var cls   = "cal-cell";
    if (ds === todayStr)        cls += " today";
    else if (urgentDates[ds])   cls += " urgent";
    else if (tasks.length > 0)  cls += " has-task";
    h += '<div class="' + cls + '"><div class="cal-day-num">' + day + "</div>";
    // show up to 2 task names inside the cell
    for (var ti = 0; ti < Math.min(tasks.length, 2); ti++) {
      h += '<div class="cal-task-label">' + esc(tasks[ti]) + "</div>";
    }
    if (tasks.length > 2) h += '<div class="cal-task-label">+' + (tasks.length - 2) + " more</div>";
    h += "</div>";
  }
  h += "</div>";
  h += '<div class="cal-legend">';
  h += '<div class="legend-row"><div class="legend-box" style="background:#0d9488"></div>Today</div>';
  h += '<div class="legend-row"><div class="legend-box" style="background:#d1fae5;border:1px solid #6ee7b7"></div>Has deadline</div>';
  h += '<div class="legend-row"><div class="legend-box" style="background:#fee2e2;border:1px solid #fca5a5"></div>Urgent (within 3 days)</div>';
  h += "</div></div>";
  app.innerHTML = h;
  // prev/next buttons change calMonth and re-render
  document.getElementById("calPrev").addEventListener("click", function() {
    calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar();
  });
  document.getElementById("calNext").addEventListener("click", function() {
    calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar();
  });
}

// Timer

function renderTimer() {
  var h = "";
  h += '<div class="page-title">Pomodoro Timer</div>';
  h += '<div class="page-sub">Use timed sessions to stay focused</div>';
  h += '<div class="timer-presets">';
  h += '<button class="preset-btn" data-secs="' + (25*60) + '" data-name="Focus Session">25 min — Focus</button>';
  h += '<button class="preset-btn" data-secs="' + (15*60) + '" data-name="Long Break">15 min — Long Break</button>';
  h += '<button class="preset-btn" data-secs="' + (10*60) + '" data-name="Short Break">10 min — Short Break</button>';
  h += '<button class="preset-btn" data-secs="' +  (5*60) + '" data-name="Quick Break">5 min — Quick Break</button>';
  h += "</div>";
  h += '<div class="timer-face">';
  h += '<div class="timer-session" id="timerLabel">' + timerSessionName + "</div>";
  h += '<div class="timer-display" id="timerDisplay">' + formatTime(timerSeconds) + "</div>";
  h += '<div class="timer-controls">';
  h += '<button class="timer-btn" id="btnStart">&#9654; Start</button>';
  h += '<button class="timer-btn" id="btnPause">&#9646;&#9646; Pause</button>';
  h += '<button class="timer-btn" id="btnReset">&#8635; Reset</button>';
  h += "</div></div>";
  app.innerHTML = h;
  var presets = document.querySelectorAll(".preset-btn");
  for (var i = 0; i < presets.length; i++) {
    presets[i].addEventListener("click", function() {
      stopTimer();
      timerSeconds     = Number(this.dataset.secs);
      timerSessionName = this.dataset.name;
      var lbl = document.getElementById("timerLabel");
      if (lbl) lbl.textContent = timerSessionName;
      updateTimerDisplay();
      var all = document.querySelectorAll(".preset-btn");
      for (var j = 0; j < all.length; j++) all[j].classList.remove("active");
      this.classList.add("active");
    });
  }
  document.getElementById("btnStart").addEventListener("click", startTimer);
  document.getElementById("btnPause").addEventListener("click", pauseTimer);
  document.getElementById("btnReset").addEventListener("click", function() {
    stopTimer();
    timerSeconds = 25 * 60;
    timerSessionName = "Focus Session";
    var lbl = document.getElementById("timerLabel");
    if (lbl) lbl.textContent = timerSessionName;
    updateTimerDisplay();
    var all = document.querySelectorAll(".preset-btn");
    for (var k = 0; k < all.length; k++) all[k].classList.remove("active");
  });
}

// converts seconds to MM:SS string e.g. 1500 = "25:00"
function formatTime(secs) {
  var m = Math.floor(secs / 60);
  var s = secs % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function updateTimerDisplay() {
  var el = document.getElementById("timerDisplay");
  if (el) el.textContent = formatTime(timerSeconds);
}

function startTimer() {
  if (timerRunning) return; // stops a second interval starting if pressed twice
  timerRunning = true;
  timerInterval = setInterval(function() {
    if (timerSeconds <= 0) {
      stopTimer();
      alert("Time is up! Great work. Take a break.");
      return;
    }
    timerSeconds--;
    updateTimerDisplay();
  }, 1000); // runs every 1000ms = 1 second
}

function pauseTimer() {
  timerRunning = false;
  clearInterval(timerInterval); // cancels the interval
  timerInterval = null;
}

function stopTimer() {
  timerRunning = false;
  clearInterval(timerInterval);
  timerInterval = null;
}

// Add Task

function renderTasks() {
  var h = "";
  h += '<div class="page-title">Add Task</div>';
  h += '<div class="page-sub">Fill in the form below to add a new task</div>';
  h += '<div class="card form-wrap">';
  h += '<div class="form-group"><label class="form-label">Task Title</label>';
  h += '<input class="form-input" id="fTitle" type="text" placeholder="e.g. Write psychology essay" /></div>';
  h += '<div class="form-group"><label class="form-label">Deadline Date</label>';
  h += '<input class="form-input" id="fDeadline" type="date" /></div>';
  h += '<div class="form-group"><label class="form-label">Importance (1 = low, 5 = high)</label>';
  h += '<input class="form-input" id="fImportance" type="number" min="1" max="5" value="3" /></div>';
  h += '<div class="form-group"><label class="form-label">Status</label>';
  h += '<select class="form-input" id="fStatus">';
  h += '<option value="not started">Not started</option>';
  h += '<option value="in progress">In progress</option>';
  h += '<option value="completed">Completed</option>';
  h += "</select></div>";
  h += '<button class="form-submit" id="btnAdd">Add Task</button>';
  h += '<div class="form-error" id="formErr"></div>';
  h += "</div>";
  app.innerHTML = h;
  document.getElementById("btnAdd").addEventListener("click", addTask);
}

function addTask() {
  var titleEl = document.getElementById("fTitle");
  var dlEl    = document.getElementById("fDeadline");
  var impEl   = document.getElementById("fImportance");
  var statEl  = document.getElementById("fStatus");
  var errEl   = document.getElementById("formErr");
  var title   = titleEl.value.trim(); // trim removes accidental spaces
  // show inline error instead of alert so it fits the design
  if (!title) { errEl.textContent = "Please enter a task title."; return; }
  errEl.textContent = "";
  data.modules[0].tasks.push({
    id:         makeId(),
    title:      title,
    deadline:   dlEl.value,
    importance: clamp(Number(impEl.value), 1, 5, 3),
    status:     validStatus(statEl.value)
  });
  saveData();
  setStatus("Task added");
  location.hash = "#dashboard"; // triggers router to go back to dashboard
}

// About

function renderAbout() {
  var h = "";
  h += '<div class="page-title">About</div>';
  h += '<div class="page-sub">How this app works</div>';
  h += '<div class="card about-body">';
  h += "<p>Adapti is a task prioritisation tool that adapts to support students in managing their academic tasks.</p>";
  h += "<p>Tasks are automatically ranked based on their importance and the length of time to the deadline, which makes the most important task always appear on top.</p>";
  h += "<p>Your tasks are stored locally in your browser using localStorage, so they remember you between sessions without requiring a server or login.</p>";
  h += "<p>Stay on track with study time using the Pomodoro Timer, and view all of your deadlines by month with the Calendar.</p>";
  h += "</div>";
  app.innerHTML = h;
}

// Import / Export

async function importJSON(e) {
  var file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    var text = await file.text(); // await waits for file to be fully read
    var json = JSON.parse(text);  // converts text back to a JS object
    data = normalizeData(json);
    saveData();
    setStatus("Imported successfully");
    render();
  } catch (err) {
    console.error(err);
    alert("Could not read that file. Please check it is valid JSON.");
  } finally {
    e.target.value = ""; // resets input so same file can be imported again
  }
}

function exportJSON() {
  data = normalizeData(data);
  // null, 2 adds indentation to the JSON output
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  var a    = document.createElement("a");
  a.href   = URL.createObjectURL(blob); // creates a temporary download URL
  a.download = "study-plan.json";
  a.click(); // simulates a click to trigger the download
  setStatus("Exported successfully");
}
