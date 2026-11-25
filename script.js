"use strict";

/* ==========================================
   SafeSpace — script.js
   Modules: storage helpers, Journal, Mood Tracker,
   7-Day Mood Trend, Guided Breathing, Checklist.
   Everything starts in init(), after the DOM is ready.
   ========================================== */

// ==========================================
// SHARED HELPERS
// ==========================================
const KEYS = {
  journal: "safespace_journal_entries",
  draft: "safespace_journal_draft",
  moods: "safespace_moods",
  checklist: "safespace_checklist",
  checklistTab: "safespace_checklist_tab"
};

const $ = (id) => document.getElementById(id);

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    alert("Unable to save data. Check your browser storage settings.");
    return false;
  }
}

function removeStorage(key) {
  try { localStorage.removeItem(key); } catch (error) { /* ignore */ }
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric", month: "long", day: "numeric",
    hour: "numeric", minute: "2-digit"
  });
}

// "YYYY-MM-DD" -> local Date (avoids timezone shifts)
function parseDayKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatDayKey(key, long) {
  const date = parseDayKey(key);
  if (Number.isNaN(date.getTime())) return key;
  return date.toLocaleDateString(undefined, long
    ? { weekday: "long", year: "numeric", month: "long", day: "numeric" }
    : { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function toDayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("-");
}

function getToday() {
  return toDayKey(new Date());
}

// Show a short message in a status element; clears itself after a few seconds
function setMessage(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", Boolean(isError));
  clearTimeout(el._timer);
  if (text) el._timer = setTimeout(() => { el.textContent = ""; }, 5000);
}

// ==========================================
// JOURNAL
// ==========================================
function initJournal() {
  const titleInput = $("entryTitle");
  const textInput = $("journalText");
  const list = $("journalList");
  const count = $("journalCount");
  const saveBtn = $("saveJournal");
  const newBtn = $("newJournal");
  const cancelBtn = $("cancelEdit");
  const heading = $("editorHeading");
  const draftStatus = $("draftStatus");
  const status = $("journalStatus");
  const dialog = $("entryDialog");

  const DRAFT_TEXT = "Your unfinished writing is automatically saved as a draft on this device.";
  let editingId = null;

  function getEntries() {
    const raw = readStorage(KEYS.journal, []);
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e === "object" && e.id)
      .map((e) => ({
        id: String(e.id),
        title: String(e.title || "Untitled Entry"),
        content: String(e.content || ""),
        createdAt: e.createdAt || e.updatedAt || new Date().toISOString(),
        updatedAt: e.updatedAt || e.createdAt || new Date().toISOString()
      }));
  }

  // ----- Draft handling -----
  function saveDraft() {
    if (editingId !== null) return; // never overwrite the draft while editing a saved entry
    if (!titleInput.value && !textInput.value) {
      removeStorage(KEYS.draft);
      draftStatus.textContent = DRAFT_TEXT;
      return;
    }
    try {
      localStorage.setItem(KEYS.draft, JSON.stringify({
        title: titleInput.value,
        content: textInput.value
      }));
      draftStatus.textContent = "Draft automatically saved on this device.";
    } catch (error) {
      draftStatus.textContent = "Unable to automatically save draft.";
    }
  }

  function loadDraft() {
    const draft = readStorage(KEYS.draft, null);
    if (draft && typeof draft === "object") {
      titleInput.value = draft.title || "";
      textInput.value = draft.content || "";
    }
  }

  // Clears the editor, returns to "new entry" mode and restores any saved draft
  function resetEditor() {
    editingId = null;
    titleInput.value = "";
    textInput.value = "";
    heading.textContent = "Write a New Entry";
    saveBtn.textContent = "Save Entry";
    newBtn.classList.remove("hidden");
    cancelBtn.classList.add("hidden");
    draftStatus.textContent = DRAFT_TEXT;
    loadDraft();
  }

  // ----- Rendering -----
  function render() {
    const entries = getEntries()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

    count.textContent = `${entries.length} ${entries.length === 1 ? "entry" : "entries"} saved`;
    list.innerHTML = "";

    if (entries.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📓</div>
          <strong>No journal entries yet.</strong>
          <p>Start writing your first journal entry today.</p>
        </div>`;
      return;
    }

    entries.forEach((entry) => {
      const article = document.createElement("article");
      article.className = "journal-entry";

      const title = document.createElement("h3");
      title.textContent = entry.title;

      const date = document.createElement("div");
      date.className = "entry-date";
      date.textContent = "Last updated: " + formatDate(entry.updatedAt);

      const preview = document.createElement("p");
      preview.className = "entry-preview";
      preview.textContent = entry.content.length > 180
        ? entry.content.substring(0, 180) + "..."
        : entry.content;

      const buttons = document.createElement("div");
      buttons.className = "entry-buttons";

      const actions = [
        ["View", "btn small-btn secondary", () => viewEntry(entry.id)],
        ["Edit", "btn small-btn", () => editEntry(entry.id)],
        ["Download", "btn small-btn secondary", () => downloadEntry(entry.id)],
        ["Delete", "btn small-btn danger", () => deleteEntry(entry.id)]
      ];
      actions.forEach(([label, cls, handler]) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = cls;
        btn.textContent = label;
        btn.addEventListener("click", handler);
        buttons.appendChild(btn);
      });

      article.append(title, date, preview, buttons);
      list.appendChild(article);
    });
  }

  // ----- Actions -----
  function saveEntry() {
    const title = titleInput.value.trim();
    const content = textInput.value.trim();

    if (!content) {
      setMessage(status, "Please write your journal thoughts before saving.", true);
      textInput.focus();
      return;
    }

    const entries = getEntries();
    const now = new Date().toISOString();
    const wasEditing = editingId !== null;

    if (wasEditing) {
      const index = entries.findIndex((e) => e.id === editingId);
      if (index === -1) {
        setMessage(status, "This journal entry could not be found.", true);
        resetEditor();
        return;
      }
      entries[index] = { ...entries[index], title: title || "Untitled Entry", content, updatedAt: now };
    } else {
      entries.push({
        id: makeId(),
        title: title || "Untitled Entry",
        content,
        createdAt: now,
        updatedAt: now
      });
      removeStorage(KEYS.draft); // the draft has become a real entry
    }

    if (!writeStorage(KEYS.journal, entries)) return;

    resetEditor();
    render();
    setMessage(status, wasEditing
      ? "Your journal entry has been updated successfully!"
      : "Your journal entry has been saved successfully!");
  }

  function viewEntry(id) {
    const entry = getEntries().find((e) => e.id === id);
    if (!entry) { setMessage(status, "Journal entry not found.", true); return; }

    if (typeof dialog.showModal === "function") {
      $("viewTitle").textContent = entry.title;
      $("viewMeta").textContent =
        "Created: " + formatDate(entry.createdAt) + " · Last updated: " + formatDate(entry.updatedAt);
      $("viewBody").textContent = entry.content;
      dialog.showModal();
    } else {
      alert(entry.title + "\n\n" + entry.content); // very old browsers
    }
  }

  function editEntry(id) {
    const entry = getEntries().find((e) => e.id === id);
    if (!entry) { setMessage(status, "Journal entry not found.", true); return; }

    editingId = id;
    titleInput.value = entry.title;
    textInput.value = entry.content;
    heading.textContent = "Edit Journal Entry";
    saveBtn.textContent = "Update Entry";
    newBtn.classList.add("hidden");
    cancelBtn.classList.remove("hidden");
    draftStatus.textContent = "You are editing a saved journal entry.";

    $("journal").scrollIntoView({ behavior: "smooth" });
    textInput.focus();
  }

  function deleteEntry(id) {
    if (!confirm("Are you sure you want to delete this journal entry? This cannot be undone.")) return;

    const remaining = getEntries().filter((e) => e.id !== id);
    if (!writeStorage(KEYS.journal, remaining)) return;

    if (editingId === id) resetEditor();
    render();
    setMessage(status, "Journal entry deleted.");
  }

  function downloadEntry(id) {
    const entry = getEntries().find((e) => e.id === id);
    if (!entry) { setMessage(status, "Journal entry not found.", true); return; }

    const text =
      "SAFESPACE - MY JOURNAL\n\n" +
      "Title: " + entry.title + "\n" +
      "Created: " + formatDate(entry.createdAt) + "\n" +
      "Last Updated: " + formatDate(entry.updatedAt) +
      "\n\n--------------------------------\n\n" +
      entry.content;

    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = (entry.title || "journal-entry").replace(/[^a-z0-9_-]/gi, "_") + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ----- Event listeners -----
  saveBtn.addEventListener("click", saveEntry);

  newBtn.addEventListener("click", () => {
    if (titleInput.value.trim() || textInput.value.trim()) {
      if (!confirm("Start a new entry? Your current unsaved writing will be cleared.")) return;
    }
    removeStorage(KEYS.draft);
    resetEditor();
    titleInput.focus();
  });

  cancelBtn.addEventListener("click", () => {
    if (!confirm("Cancel editing this entry? Your changes will not be saved.")) return;
    resetEditor();
  });

  titleInput.addEventListener("input", saveDraft);
  textInput.addEventListener("input", saveDraft);

  $("closeEntryDialog").addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });

  // ----- Initialise -----
  loadDraft();
  render();

  return {
    refresh() {
      render();
      if (editingId === null) { titleInput.value = ""; textInput.value = ""; loadDraft(); }
    }
  };
}

// ==========================================
// MOOD TRACKER + 7-DAY TREND
// ==========================================
const MOODS = {
  Happy:    { emoji: "😊", value: 6 },
  Calm:     { emoji: "😌", value: 5 },
  Okay:     { emoji: "🙂", value: 4 },
  Tired:    { emoji: "😴", value: 3 },
  Stressed: { emoji: "😟", value: 2 },
  Sad:      { emoji: "😔", value: 1 }
};
const MOOD_BY_VALUE = Object.fromEntries(
  Object.entries(MOODS).map(([name, info]) => [info.value, name])
);

const MOOD_QUOTES = {
  Happy: [
    "Keep embracing the little moments that make you smile.",
    "Your happiness is worth celebrating, even in the smallest ways.",
    "Let your happiness remind you of the good things around you.",
    "You deserve all the beautiful moments life has to offer."
  ],
  Calm: [
    "Give yourself permission to enjoy this moment of peace.",
    "You don't have to rush. Take life one moment at a time.",
    "A peaceful mind begins with giving yourself time to breathe.",
    "Enjoy the calm. You deserve moments like this."
  ],
  Okay: [
    "You don't have to be extraordinary every day. Showing up is enough.",
    "Even ordinary days are part of your journey.",
    "You are making progress, even when it doesn't feel like it.",
    "It's okay to simply be okay today."
  ],
  Tired: [
    "Rest is productive too. You deserve a moment to recharge.",
    "You don't have to do everything all at once.",
    "Give yourself the same kindness you give to others.",
    "Taking a break doesn't mean you're giving up."
  ],
  Stressed: [
    "Take things one step at a time. You don't have to figure everything out today.",
    "Focus on what you can do right now. One step is enough.",
    "You are allowed to pause, breathe, and begin again.",
    "Remember that your worth is not measured by your productivity."
  ],
  Sad: [
    "It's okay to have difficult days. Your feelings deserve kindness.",
    "You don't have to pretend to be okay all the time.",
    "Be gentle with yourself. Tomorrow is another opportunity.",
    "Your feelings matter, and you deserve support and understanding."
  ]
};

function initMood() {
  const buttons = [...document.querySelectorAll(".mood")];
  const quoteBox = $("quoteBox");
  const result = $("moodResult");
  const historyList = $("moodHistory");
  const canvas = $("moodTrendChart");
  const summary = $("weeklyMoodSummary");
  const SUMMARY_DEFAULT = "Your mood check-ins for the past 7 days.";

  let selectedMood = "";
  let chart = null;

  // Read + validate saved check-ins, sorted oldest -> newest, one per date
  function getHistory() {
    const raw = readStorage(KEYS.moods, []);
    if (!Array.isArray(raw)) return [];
    const byDate = new Map();
    raw.forEach((e) => {
      if (e && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && MOODS[e.mood]) byDate.set(e.date, e.mood);
    });
    return [...byDate.entries()]
      .map(([date, mood]) => ({ date, mood }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  function showResult(text) {
    result.textContent = text;
    result.classList.remove("hidden");
  }

  function selectMood(mood) {
    selectedMood = mood;
    buttons.forEach((b) => {
      const on = b.dataset.mood === mood;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-pressed", String(on));
    });
  }

  function showQuote(mood) {
    const quotes = MOOD_QUOTES[mood];
    $("quoteTitle").textContent = `A message for your ${mood.toLowerCase()} day`;
    $("quoteText").textContent = `"${quotes[Math.floor(Math.random() * quotes.length)]}"`;
    quoteBox.classList.remove("show");
    void quoteBox.offsetWidth; // restart the fade-in animation
    quoteBox.classList.add("show");
  }

  // ----- History list -----
  function renderHistory() {
    const history = getHistory();
    historyList.innerHTML = "";

    if (!history.length) {
      const li = document.createElement("li");
      li.className = "mood-history-empty";
      li.textContent = "No check-ins saved yet.";
      historyList.appendChild(li);
      return;
    }

    history.slice().reverse().slice(0, 7).forEach((entry) => {
      const li = document.createElement("li");

      const label = document.createElement("span");
      label.textContent = `${formatDayKey(entry.date)}: ${MOODS[entry.mood].emoji} ${entry.mood}`;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mood-remove";
      remove.textContent = "Remove";
      remove.setAttribute("aria-label", `Remove ${entry.mood} check-in for ${formatDayKey(entry.date)}`);
      remove.addEventListener("click", () => removeCheckin(entry.date));

      li.append(label, remove);
      historyList.appendChild(li);
    });
  }

  // ----- 7-day trend -----
  function getWeeklyData() {
    const history = getHistory();
    const out = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = toDayKey(date);
      const found = history.find((e) => e.date === key);
      out.push({
        key,
        label: date.toLocaleDateString("en-US", { weekday: "short" }),
        mood: found ? found.mood : null
      });
    }
    return out;
  }

  function ensureChart() {
    if (chart) return chart;
    if (!canvas || typeof Chart === "undefined") return null;

    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Mood",
          data: [],
          borderColor: "#b8caff",
          backgroundColor: "rgba(184,202,255,0.2)",
          borderWidth: 3,
          pointRadius: 6,
          pointHoverRadius: 8,
          pointBackgroundColor: "#ffffff",
          tension: 0.35,
          spanGaps: false // days with no check-in show as gaps
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (items) => items.length ? formatDayKey(chart._dayKeys[items[0].dataIndex], true) : "",
              label: (ctx) => {
                const name = MOOD_BY_VALUE[ctx.parsed.y];
                return name ? `${MOODS[name].emoji} ${name}` : "";
              }
            }
          }
        },
        scales: {
          y: {
            min: 0,
            max: 7,
            grid: { color: "rgba(202,188,235,0.16)" },
            ticks: {
              stepSize: 1,
              color: "#ffffff",
              callback: (value) => MOOD_BY_VALUE[value] || ""
            }
          },
          x: {
            grid: { color: "rgba(202,188,235,0.1)" },
            ticks: { color: "#ffffff" }
          }
        }
      }
    });
    chart._dayKeys = [];
    return chart;
  }

  function renderTrend() {
    const week = getWeeklyData();
    const checkedIn = week.filter((d) => d.mood);
    const c = ensureChart();

    if (c) {
      c._dayKeys = week.map((d) => d.key);
      c.data.labels = week.map((d) => d.label);
      c.data.datasets[0].data = week.map((d) => (d.mood ? MOODS[d.mood].value : null));
      c.update();
    }

    if (!summary) return;
    if (checkedIn.length === 0) {
      summary.textContent = "No check-ins yet this week. Save a mood check-in to see your trend.";
    } else {
      summary.textContent =
        `${checkedIn.length} of 7 days checked in. Moods: ${checkedIn.map((d) => d.mood).join(", ")}`;
    }
    if (!c) {
      summary.textContent += " (The chart couldn't load. Check your internet connection and refresh; your check-ins are still saved.)";
    }
  }

  function refresh() {
    renderHistory();
    renderTrend();
  }

  // ----- Actions -----
  function saveCheckin() {
    if (!selectedMood) {
      showResult("Please choose a mood before saving.");
      return;
    }

    const today = getToday();
    const history = getHistory();
    const existing = history.find((e) => e.date === today);

    if (existing && existing.mood === selectedMood) {
      showResult(`Your ${selectedMood.toLowerCase()} mood is already saved for today.`);
      return;
    }

    // One record per day: replace today's entry instead of duplicating it
    const updated = history.filter((e) => e.date !== today).concat({ date: today, mood: selectedMood });
    if (!writeStorage(KEYS.moods, updated.slice(-365))) return;

    showResult(existing
      ? `Today's check-in was updated from ${existing.mood.toLowerCase()} to ${selectedMood.toLowerCase()}.`
      : `Your ${selectedMood.toLowerCase()} mood has been saved for today!`);
    refresh();
  }

  function removeCheckin(date) {
    if (!confirm(`Remove the check-in for ${formatDayKey(date)}?`)) return;
    const updated = getHistory().filter((e) => e.date !== date);
    if (!writeStorage(KEYS.moods, updated)) return;
    if (date === getToday()) {
      selectMood("");
      quoteBox.classList.remove("show");
    }
    showResult("Check-in removed.");
    refresh();
  }

  // ----- Event listeners -----
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      selectMood(button.dataset.mood);
      showQuote(selectedMood);
      result.classList.add("hidden");
    });
  });
  $("saveMood").addEventListener("click", saveCheckin);

  // ----- Initialise -----
  const todays = getHistory().find((e) => e.date === getToday());
  if (todays) {
    selectMood(todays.mood);
    showResult(`Today's saved check-in: ${todays.mood.toLowerCase()}.`);
  }
  refresh();

  // If Chart.js finished loading late, draw the chart once the page has fully loaded
  window.addEventListener("load", () => { if (!chart) renderTrend(); });

  return { refresh };
}

// ==========================================
// GUIDED BREATHING
// ==========================================
function initBreathing() {
  const circle = $("breathCircle");
  const timerEl = $("breathTimer");
  const textEl = $("breathText");
  const cyclesEl = $("breathCycles");
  const startBtn = $("breathStart");
  const pauseBtn = $("breathPause");
  const resetBtn = $("breathReset");
  const choiceButtons = [...document.querySelectorAll(".breathing-choice")];

  // [circle word, instruction, seconds, circle scale at end of phase]
  const PATTERNS = {
    calm: [
      ["Inhale", "Breathe in gently", 4, 1.25],
      ["Hold", "Hold softly", 2, 1.25],
      ["Exhale", "Breathe out slowly", 6, 1]
    ],
    balanced: [
      ["Inhale", "Breathe in gently", 4, 1.25],
      ["Hold", "Hold softly", 4, 1.25],
      ["Exhale", "Breathe out slowly", 4, 1]
    ]
  };

  const state = {
    status: "idle",      // idle | running | paused
    pattern: "calm",
    phase: 0,
    remaining: 0,
    cycles: 0,
    timer: null
  };

  function animateTo(scale, seconds) {
    circle.style.transition = `transform ${seconds}s ease-in-out`;
    circle.style.transform = `scale(${scale})`;
  }

  function setControls() {
    const idle = state.status === "idle";
    startBtn.disabled = !idle;
    pauseBtn.disabled = idle;
    resetBtn.disabled = idle;
    pauseBtn.textContent = state.status === "paused" ? "Resume" : "Pause";
    choiceButtons.forEach((b) => { b.disabled = !idle; });
  }

  function updateCycles() {
    cyclesEl.textContent = state.cycles
      ? `Completed ${state.cycles} ${state.cycles === 1 ? "breath cycle" : "breath cycles"}.`
      : "";
  }

  function beginPhase(index) {
    const [action, label, seconds, scale] = PATTERNS[state.pattern][index];
    state.phase = index;
    state.remaining = seconds;
    circle.textContent = action;
    textEl.textContent = label;
    timerEl.textContent = String(seconds);
    animateTo(scale, seconds);
  }

  function tick() {
    state.remaining -= 1;
    if (state.remaining > 0) {
      timerEl.textContent = String(state.remaining);
      return;
    }
    const steps = PATTERNS[state.pattern];
    const next = (state.phase + 1) % steps.length;
    if (next === 0) { state.cycles += 1; updateCycles(); }
    beginPhase(next);
  }

  function clearTimer() {
    if (state.timer !== null) { clearInterval(state.timer); state.timer = null; }
  }

  function start() {
    if (state.status !== "idle") return;   // prevents overlapping timers
    clearTimer();
    state.status = "running";
    state.cycles = 0;
    updateCycles();
    circle.style.transition = "none";
    circle.style.transform = "scale(1)";
    void circle.offsetWidth;               // apply the starting size before animating
    beginPhase(0);
    state.timer = setInterval(tick, 1000);
    setControls();
  }

  function pause() {
    if (state.status !== "running") return;
    clearTimer();
    state.status = "paused";
    // Freeze the circle at its current size
    const frozen = getComputedStyle(circle).transform;
    circle.style.transition = "none";
    circle.style.transform = frozen === "none" ? "scale(1)" : frozen;
    textEl.textContent = "Paused. Breathe normally, then press Resume.";
    setControls();
  }

  function resume() {
    if (state.status !== "paused") return;
    const [action, label, , scale] = PATTERNS[state.pattern][state.phase];
    state.status = "running";
    circle.textContent = action;
    textEl.textContent = label;
    void circle.offsetWidth;
    animateTo(scale, state.remaining);
    clearTimer();
    state.timer = setInterval(tick, 1000);
    setControls();
  }

  function reset() {
    clearTimer();
    state.status = "idle";
    state.phase = 0;
    state.remaining = 0;
    state.cycles = 0;
    circle.style.transition = "transform 0.6s ease-in-out";
    circle.style.transform = "scale(1)";
    circle.textContent = "Ready?";
    timerEl.innerHTML = "&nbsp;";
    textEl.textContent = "Exercise stopped. Return to your normal breathing.";
    updateCycles();
    setControls();
  }

  startBtn.addEventListener("click", start);
  pauseBtn.addEventListener("click", () => (state.status === "paused" ? resume() : pause()));
  resetBtn.addEventListener("click", reset);

  choiceButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (state.status !== "idle") return;
      state.pattern = button.dataset.pattern;
      choiceButtons.forEach((b) => {
        const on = b === button;
        b.classList.toggle("selected", on);
        b.setAttribute("aria-pressed", String(on));
      });
    });
  });

  // Pause automatically if the tab is hidden, so the timer and animation stay in sync
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });

  setControls();
}

// ==========================================
// SELF-CARE CHECKLIST (category dashboard)
// ==========================================
const CHECKLIST_GROUPS = [
  { key: "physical",  icon: "🌿", title: "Physical Self-Care" },
  { key: "academic",  icon: "📚", title: "Academic Self-Care" },
  { key: "emotional", icon: "💙", title: "Emotional Self-Care" },
  { key: "social",    icon: "🤝", title: "Social Self-Care" }
];

const DEFAULT_CHECKLIST = [
  ["physical", "Drink some water"],
  ["physical", "Stretch gently"],
  ["physical", "Get some fresh air"],
  ["physical", "Give myself time to rest"],
  ["academic", "Organize my school tasks for today"],
  ["academic", "Take a screen break"],
  ["academic", "Finish one task at a time"],
  ["academic", "Prepare my school materials for tomorrow"],
  ["emotional", "Write down something I'm grateful for"],
  ["emotional", "Give myself credit for a small achievement"],
  ["social", "Talk with someone I trust"],
  ["social", "Spend time with friends or family"]
].map(([group, text]) => ({ id: makeId(), group, text, done: false }));

function initChecklist() {
  const tabsEl = $("checklistTabs");
  const container = $("checklistGroups");
  const form = $("checklistForm");
  const input = $("checklistInput");
  const message = $("checklistMessage");
  const progressText = $("checklistProgress");
  const progressBar = $("checklistProgressBar");
  const progressTrack = progressBar.parentElement;
  const validGroups = CHECKLIST_GROUPS.map((g) => g.key);

  let items = load();
  let active = validGroups.includes(readStorage(KEYS.checklistTab, "")) ? readStorage(KEYS.checklistTab, "") : validGroups[0];

  function load() {
    const saved = readStorage(KEYS.checklist, null);
    if (!Array.isArray(saved)) return DEFAULT_CHECKLIST.map((i) => ({ ...i })); // first visit
    return saved
      .filter((i) => i && i.id && typeof i.text === "string" && validGroups.includes(i.group))
      .map((i) => ({ id: String(i.id), group: i.group, text: i.text, done: Boolean(i.done) }));
  }

  function save() {
    return writeStorage(KEYS.checklist, items);
  }

  const groupMeta = (key) => CHECKLIST_GROUPS.find((g) => g.key === key);

  // Overall progress (all categories) + per-category counts on the buttons
  function updateProgress() {
    const total = items.length;
    const done = items.filter((i) => i.done).length;
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    progressText.textContent = `${done} of ${total} activities completed`;
    progressBar.style.width = pct + "%";
    progressTrack.setAttribute("aria-valuenow", String(pct));

    CHECKLIST_GROUPS.forEach((g) => {
      const inGroup = items.filter((i) => i.group === g.key);
      const badge = tabsEl.querySelector(`[data-group="${g.key}"] .tab-count`);
      if (badge) badge.textContent = `${inGroup.filter((i) => i.done).length}/${inGroup.length}`;
    });
  }

  function buildTabs() {
    tabsEl.innerHTML = "";
    CHECKLIST_GROUPS.forEach((g) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "checklist-tab";
      btn.dataset.group = g.key;
      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = `${g.icon} ${g.title}`;
      const count = document.createElement("span");
      count.className = "tab-count";
      btn.append(label, count);
      tabsEl.appendChild(btn);
    });
  }

  function syncTabs() {
    tabsEl.querySelectorAll(".checklist-tab").forEach((btn) => {
      const on = btn.dataset.group === active;
      btn.classList.toggle("selected", on);
      btn.setAttribute("aria-pressed", String(on));
    });
    input.placeholder = `Add to ${groupMeta(active).title}...`;
  }

  // Show only the active category's items
  function renderList(animate) {
    container.innerHTML = "";
    const groupItems = items.filter((i) => i.group === active);
    const section = document.createElement("div");
    section.className = "checklist-group" + (animate ? " switching" : "");
    section.setAttribute("aria-label", groupMeta(active).title);

    if (groupItems.length === 0) {
      const empty = document.createElement("p");
      empty.className = "small checklist-empty";
      empty.textContent = "No items yet. Add one above.";
      section.appendChild(empty);
    }

    groupItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "checklist-row";

      const label = document.createElement("label");
      label.className = "checklist-item";

      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "selfcare-task";
      box.checked = item.done;
      box.dataset.id = item.id;

      const text = document.createElement("span");
      text.textContent = item.text;
      label.append(box, text);

      const del = document.createElement("button");
      del.type = "button";
      del.className = "checklist-delete";
      del.dataset.id = item.id;
      del.textContent = "✕";
      del.setAttribute("aria-label", `Delete "${item.text}"`);

      row.append(label, del);
      section.appendChild(row);
    });

    container.appendChild(section);
    container.scrollTop = 0;
    syncTabs();
    updateProgress();
  }

  tabsEl.addEventListener("click", (e) => {
    const btn = e.target.closest(".checklist-tab");
    if (!btn || btn.dataset.group === active) return;
    active = btn.dataset.group;
    writeStorageQuiet(KEYS.checklistTab, active);
    setMessage(message, "");
    renderList(true);
  });

  function writeStorageQuiet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) { /* ignore */ }
  }

  // Delegated listeners for checkboxes and delete buttons
  container.addEventListener("change", (e) => {
    const box = e.target.closest(".selfcare-task");
    if (!box) return;
    const item = items.find((i) => i.id === box.dataset.id);
    if (!item) return;
    item.done = box.checked;
    if (!save()) { item.done = !box.checked; box.checked = item.done; }
    updateProgress();
  });

  container.addEventListener("click", (e) => {
    const del = e.target.closest(".checklist-delete");
    if (!del) return;
    const before = items;
    items = items.filter((i) => i.id !== del.dataset.id);
    if (!save()) { items = before; return; }
    renderList(false);
    setMessage(message, "Item deleted.");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim().replace(/\s+/g, " ");

    if (!text) {
      setMessage(message, "Please type a self-care step to add.", true);
      input.focus();
      return;
    }
    if (items.some((i) => i.group === active && i.text.toLowerCase() === text.toLowerCase())) {
      setMessage(message, "That item is already in this category.", true);
      input.focus();
      return;
    }

    const before = items;
    items = items.concat({ id: makeId(), group: active, text, done: false });
    if (!save()) { items = before; return; }

    input.value = "";
    renderList(false);
    container.scrollTop = container.scrollHeight; // reveal the new item
    setMessage(message, "Item added.");
    input.focus();
  });

  $("checklistReset").addEventListener("click", () => {
    if (!items.some((i) => i.done)) {
      setMessage(message, "Nothing is checked yet.");
      return;
    }
    const before = items;
    items = items.map((i) => ({ ...i, done: false }));
    if (!save()) { items = before; return; }
    renderList(false);
    setMessage(message, "All items unchecked.");
  });

  buildTabs();
  renderList(false);

  return {
    refresh() { items = load(); renderList(false); }
  };
}

// ==========================================
// START EVERYTHING AFTER THE DOM IS READY
// ==========================================
function init() {
  const modules = {};
  // Each module is isolated so one failure cannot stop the others
  [
    ["journal", initJournal],
    ["mood", initMood],
    ["breathing", initBreathing],
    ["checklist", initChecklist]
  ].forEach(([name, fn]) => {
    try { modules[name] = fn(); }
    catch (error) { console.error(`SafeSpace: could not start ${name}.`, error); }
  });

  // Keep multiple open tabs in sync
  window.addEventListener("storage", (e) => {
    if (e.key === KEYS.journal || e.key === KEYS.draft) modules.journal && modules.journal.refresh();
    if (e.key === KEYS.moods) modules.mood && modules.mood.refresh();
    if (e.key === KEYS.checklist) modules.checklist && modules.checklist.refresh();
  });

  // Update the 7-day window if the page stays open past midnight
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && modules.mood) modules.mood.refresh();
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
