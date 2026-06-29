const API_URL = "http://127.0.0.1:8000";

let passRateChartInstance = null;
let engagementChartInstance = null;
let scenarioLabChartInstance = null;
let forecastScenarioChartInstance = null;
let impactTrendChartInstance = null;
let semesterPassChartInstance = null;
let semesterRiskChartInstance = null;
let executiveBriefToneIndex = 0;
let notificationPollHandle = null;
let notificationItems = [];
let currentUserRole = null;
let currentRegNo = null;
let currentTwinActions = [];
let currentQueueSnapshot = [];
let currentForecastMetrics = null;
let currentForecastRisk = null;
let reportsAnalyticsSnapshot = null;
let selectedLoginRole = null;
let currentUserScope = null;
let activeAuditRequestToken = 0;
let currentAuditStudentProfile = null;
let currentAuditStudentMetrics = null;

const ROLE_ACCESS_MAP = {
  cod_cs: { label: "CoD - Computer Science", username: "cod_cs" },
  cod_it: { label: "CoD - Information Technology", username: "cod_it" },
  cod_ims: {
    label: "CoD - Information & Media Studies",
    username: "cod_ims",
  },
  dean: { label: "Dean", username: "dean_sci" },
};

function scopedApiUrl(path) {
  if (!currentUserScope || !currentUserScope.department) {
    return `${API_URL}${path}`;
  }
  const joiner = path.includes("?") ? "&" : "?";
  return `${API_URL}${path}${joiner}scope_department=${encodeURIComponent(currentUserScope.department)}`;
}

const INTERVENTION_PLAYBOOKS = {
  "Attendance Recovery Contract": {
    owner: "Academic Advisor",
    etaDays: 7,
    steps: [
      "Attend all classes for the next 14 days",
      "Submit signed attendance commitment form",
      "Meet advisor every Friday for attendance review",
    ],
    qa: [
      "Has attendance improved above 80% this week?",
      "Did the student submit valid absence explanations?",
      "Was advisor follow-up completed on schedule?",
    ],
  },
  "Targeted Remedial Clinic": {
    owner: "Course Lecturer",
    etaDays: 10,
    steps: [
      "Attend two remedial sessions this week",
      "Complete targeted CAT revision exercises",
      "Sit for follow-up micro-assessment",
    ],
    qa: [
      "Did student attend both remedial clinics?",
      "Was revision work submitted and graded?",
      "Did follow-up assessment show score improvement?",
    ],
  },
  "Guided Study Plan (+6 hrs/week)": {
    owner: "Peer Mentor",
    etaDays: 14,
    steps: [
      "Follow a 6-hour weekly study schedule",
      "Log daily study activity with mentor",
      "Review progress using weekly reflection form",
    ],
    qa: [
      "Was the 6-hour target achieved this week?",
      "Are study logs complete and verified?",
      "Did mentor submit weekly progress remarks?",
    ],
  },
  "Academic Probation Coaching": {
    owner: "CoD Office",
    etaDays: 14,
    steps: [
      "Attend probation coaching meeting",
      "Sign recovery contract with CoD office",
      "Complete bi-weekly academic progress review",
    ],
    qa: [
      "Was coaching session completed and documented?",
      "Is the recovery contract signed by student?",
      "Did first progress review happen on time?",
    ],
  },
  "Emergency academic advising": {
    owner: "CoD Office",
    etaDays: 2,
    steps: [
      "Report to CoD office within 24 hours",
      "Guardian/mentor notification completed",
      "Follow urgent 72-hour recovery action plan",
    ],
    qa: [
      "Did student attend emergency advising within 24h?",
      "Was guardian or sponsor notified and acknowledged?",
      "Was a 72-hour recovery plan issued and accepted?",
    ],
  },
  "QA Intervention": {
    owner: "Advisor",
    etaDays: 3,
    steps: [
      "Complete intervention quality checklist",
      "Verify evidence of student action completion",
      "Approve case closure only after QA sign-off",
    ],
    qa: [
      "Are all intervention steps evidence-backed?",
      "Was student feedback collected and recorded?",
      "Did CoD/advisor sign off on closure quality?",
    ],
  },
};

function getInterventionPack(actionName) {
  const direct = INTERVENTION_PLAYBOOKS[actionName];
  if (direct) return direct;

  const key = Object.keys(INTERVENTION_PLAYBOOKS).find((name) =>
    actionName.toLowerCase().includes(name.toLowerCase().split(" ")[0]),
  );
  return (
    INTERVENTION_PLAYBOOKS[key] || {
      owner: "Academic Advisor",
      etaDays: 7,
      steps: [
        "Attend advisor session",
        "Follow assigned recovery plan",
        "Return for progress verification",
      ],
      qa: [
        "Were intervention steps communicated clearly?",
        "Was progress evidence collected?",
        "Was closure decision justified?",
      ],
    }
  );
}

function selectLoginRole(roleKey) {
  const roleData = ROLE_ACCESS_MAP[roleKey];
  const roleHint = document.getElementById("role-hint");
  const selectedRoleName = document.getElementById("selected-role-name");
  const passInput = document.getElementById("login-password");
  const passSection = document.getElementById("password-section");
  const authBtn = document.getElementById("login-btn");
  const errorDiv = document.getElementById("login-error");

  if (!roleData) return;

  selectedLoginRole = roleKey;

  // Update all role buttons
  Object.keys(ROLE_ACCESS_MAP).forEach((key) => {
    const btn = document.getElementById(`role-btn-${key}-main`);
    if (!btn) return;
    const isActive = key === roleKey;
    btn.classList.toggle("border-blue-300", isActive);
    btn.classList.toggle("bg-blue-900/80", isActive);
    btn.classList.toggle("text-blue-100", isActive);
    btn.classList.toggle("border-slate-700", !isActive);
    btn.classList.toggle("bg-slate-800/70", !isActive);
    btn.classList.toggle("text-slate-100", !isActive);
  });

  // Show password field and button
  if (passSection) passSection.classList.remove("hidden");
  if (authBtn) authBtn.classList.remove("hidden");

  // Update hint
  if (roleHint) {
    roleHint.innerText = `${roleData.label} selected. Enter passcode.`;
  }
  if (selectedRoleName) {
    selectedRoleName.innerText = roleData.label;
  }

  // Focus on password field
  if (passInput) {
    setTimeout(() => passInput.focus(), 100);
  }

  if (errorDiv) {
    errorDiv.classList.add("hidden");
  }
}

function resetRoleSelection() {
  selectedLoginRole = null;

  const roleHint = document.getElementById("role-hint");
  const selectedRoleName = document.getElementById("selected-role-name");
  const passSection = document.getElementById("password-section");
  const authBtn = document.getElementById("login-btn");
  const passInput = document.getElementById("login-password");

  if (roleHint) roleHint.innerText = "Choose your role to continue.";
  if (selectedRoleName) selectedRoleName.innerText = "None";

  if (passSection) passSection.classList.add("hidden");
  if (authBtn) authBtn.classList.add("hidden");
  if (passInput) passInput.value = "";

  Object.keys(ROLE_ACCESS_MAP).forEach((key) => {
    const btn = document.getElementById(`role-btn-${key}-main`);
    if (!btn) return;
    btn.classList.remove("border-blue-300", "bg-blue-900/80", "text-blue-100");
    btn.classList.add("border-slate-700", "bg-slate-800/70", "text-slate-100");
  });
}

function updateActiveNav(viewName) {
  const navMap = {
    dashboard: "nav-dashboard",
    audit: "nav-audit",
    forecaster: "nav-forecast",
    reports: "nav-reports",
    "semester-analysis": "nav-semester-analysis",
    impact: "nav-impact",
    "model-watch": "nav-model-watch",
    "war-room": "nav-war-room",
    briefing: "nav-briefing",
  };

  Object.values(navMap).forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove("nav-active");
    el.classList.add("text-slate-400");
  });

  const activeId = navMap[viewName];
  const activeEl = activeId ? document.getElementById(activeId) : null;
  if (activeEl) {
    activeEl.classList.add("nav-active");
    activeEl.classList.remove("text-slate-400");
  }
}

function updateHeaderContext(viewName) {
  const subtitle = document.getElementById("header-subtitle");
  if (!subtitle) return;

  const map = {
    dashboard:
      "Cross-department pulse, anomaly detection, and guided presentation scenarios.",
    audit:
      "Student-level diagnostics, intervention assignment, and escalation governance.",
    forecaster:
      "Outcome forecasting and counterfactual planning for safer academic trajectories.",
    reports:
      "Executive impact telemetry, war-room pressure lanes, and policy-level evidence.",
    "semester-analysis":
      "Five-semester history plus next-semester forecast for scoped department or all departments.",
    impact:
      "Impact reporting with before-after outcome tracking and leadership-ready evidence.",
    "model-watch":
      "Model health, equity checks, and scenario comparison for dean-level oversight.",
    "war-room":
      "Operational command board for active cases, escalation risk, and governance flow.",
    briefing:
      "Executive briefing and export center for leadership-ready summaries and evidence packs.",
  };
  subtitle.innerText =
    map[viewName] ||
    "Real-time academic intelligence and intervention operations.";
}

function renderNotificationsPage() {
  const feed = document.getElementById("notifications-feed");
  const summary = document.getElementById("notifications-summary");
  if (!feed || !summary) return;

  summary.innerText = `${notificationItems.length} active notifications in live stream.`;

  if (!notificationItems.length) {
    feed.innerHTML =
      '<div class="text-xs text-slate-400">No notifications at this time.</div>';
    return;
  }

  feed.innerHTML = notificationItems
    .map((item, idx) => {
      const tone =
        item.severity === "critical"
          ? "border-blue-300 bg-blue-100"
          : item.severity === "high"
            ? "border-blue-200 bg-blue-50"
            : item.severity === "warning"
              ? "border-slate-300 bg-slate-100"
              : "border-slate-200 bg-white";
      const destination = getNotificationDestination(item);
      return `
        <button onclick="openNotificationDestination(${idx})" class="p-4 rounded-xl border ${tone} w-full text-left hover:shadow-md transition cursor-pointer">
          <div class="flex justify-between items-center mb-2">
            <p class="text-[10px] uppercase font-black text-slate-500">${item.type}</p>
            <p class="text-[10px] text-slate-400">${new Date(item.timestamp).toLocaleTimeString()}</p>
          </div>
          <p class="text-sm font-black text-slate-800">${item.title}</p>
          <p class="text-xs text-slate-600 mt-1">${item.message}</p>
          <p class="text-[10px] text-blue-700 font-black mt-2 uppercase tracking-widest">Open ${destination.label}</p>
        </button>
      `;
    })
    .join("");
}

function getNotificationDestination(item) {
  const type = String(item?.type || "").toLowerCase();
  if (["workflow", "sla", "escalation", "governance"].includes(type)) {
    return { view: "audit", label: "Risk Registry" };
  }
  if (type === "model") {
    return { view: "reports", label: "Strategic Reports" };
  }
  return { view: "dashboard", label: "Dashboard" };
}

function openNotificationDestination(index) {
  const item = notificationItems[Number(index)];
  const target = getNotificationDestination(item);
  loadView(target.view);
}

async function refreshNotificationsPage() {
  await fetchLiveNotifications();
  renderNotificationsPage();
}

function openNotificationsPage() {
  loadView("notifications");
}

function initNotifications() {
  refreshNotificationsPage();
}

async function fetchLiveNotifications() {
  try {
    const resp = await fetch(scopedApiUrl(`/wow/live-notifications`));
    const data = await resp.json();
    notificationItems = data.items || [];
    const count = document.getElementById("alert-count");
    if (count) count.innerText = `${data.count || 0}`;
    renderNotificationsPage();
  } catch (err) {
    const count = document.getElementById("alert-count");
    if (count) count.innerText = "!";
  }
}

function startRealtimeNotifications() {
  fetchLiveNotifications();
  if (notificationPollHandle) clearInterval(notificationPollHandle);
  notificationPollHandle = setInterval(fetchLiveNotifications, 12000);
}

// --- SECURE AUTHENTICATION LOGIC ---
async function attemptLogin() {
  const pass = document.getElementById("login-password").value.trim();
  const errorDiv = document.getElementById("login-error");
  const btn = document.getElementById("login-btn");

  if (!selectedLoginRole || !ROLE_ACCESS_MAP[selectedLoginRole]) {
    errorDiv.innerText = "Select your role first.";
    errorDiv.classList.remove("hidden");
    return;
  }

  if (!pass) {
    errorDiv.innerText = "Enter your passcode to continue.";
    errorDiv.classList.remove("hidden");
    return;
  }

  btn.innerText = "AUTHENTICATING...";
  btn.disabled = true;
  errorDiv.classList.add("hidden");

  try {
    const roleData = ROLE_ACCESS_MAP[selectedLoginRole];
    const user = roleData.username;
    const resp = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: user, password: pass }),
    });
    const data = await resp.json();

    if (data.status === "success") {
      currentUserRole = data.role;
      currentUserScope = {
        department: data.department_scope || null,
        programs: data.program_scope || [],
        portalKey: data.portal_key || selectedLoginRole,
      };
      document.getElementById("user-role-badge").innerText =
        data.role === "CoD" && currentUserScope.department
          ? `CoD • ${currentUserScope.department.replace("Department of ", "")}`
          : data.role;

      if (data.role === "Dean") {
        document.getElementById("header-title").innerText =
          "Dean's Strategic Monitor";
        document.getElementById("nav-audit").classList.add("hidden");
        document.getElementById("nav-forecast").classList.add("hidden");
        document.getElementById("nav-reports").classList.remove("hidden");
        document.getElementById("nav-impact").classList.remove("hidden");
        document.getElementById("nav-model-watch").classList.remove("hidden");
        document.getElementById("nav-war-room").classList.remove("hidden");
        document.getElementById("nav-briefing").classList.remove("hidden");
      } else if (data.role === "CoD") {
        const deptShort = (currentUserScope.department || "").replace(
          "Department of ",
          "",
        );
        document.getElementById("header-title").innerText = deptShort
          ? `Chairperson's Monitor - ${deptShort}`
          : "Chairperson's Monitor";
        document.getElementById("nav-audit").classList.remove("hidden");
        document.getElementById("nav-forecast").classList.remove("hidden");
        document.getElementById("nav-reports").classList.add("hidden");
        document.getElementById("nav-impact").classList.add("hidden");
        document.getElementById("nav-model-watch").classList.add("hidden");
        document.getElementById("nav-war-room").classList.add("hidden");
        document.getElementById("nav-briefing").classList.add("hidden");
      } else if (data.role === "Admin") {
        document.getElementById("header-title").innerText =
          "Administrative Control Tower";
        document.getElementById("nav-audit").classList.remove("hidden");
        document.getElementById("nav-forecast").classList.remove("hidden");
        document.getElementById("nav-reports").classList.remove("hidden");
        document.getElementById("nav-impact").classList.remove("hidden");
        document.getElementById("nav-model-watch").classList.remove("hidden");
        document.getElementById("nav-war-room").classList.remove("hidden");
        document.getElementById("nav-briefing").classList.remove("hidden");
      }

      const overlay = document.getElementById("auth-overlay");
      overlay.classList.add("opacity-0", "pointer-events-none");
      const appLayout = document.getElementById("app-layout");
      if (appLayout) appLayout.classList.remove("hidden");
      setTimeout(() => {
        overlay.classList.add("hidden");
      }, 500);

      startRealtimeNotifications();
      loadView("dashboard");
    } else {
      errorDiv.innerText = data.message;
      errorDiv.classList.remove("hidden");
    }
  } catch (err) {
    errorDiv.innerText = "Connection Error. Ensure FastAPI is running.";
    errorDiv.classList.remove("hidden");
  } finally {
    btn.innerText = "AUTHENTICATE";
    btn.disabled = false;
  }
}

function logout() {
  currentUserRole = null;
  currentUserScope = null;
  document.getElementById("login-password").value = "";
  document.getElementById("login-error").classList.add("hidden");
  document.getElementById("app-content").innerHTML = "";
  resetRoleSelection();

  const overlay = document.getElementById("auth-overlay");
  const appLayout = document.getElementById("app-layout");

  if (notificationPollHandle) {
    clearInterval(notificationPollHandle);
    notificationPollHandle = null;
  }
  notificationItems = [];
  const count = document.getElementById("alert-count");
  if (count) count.innerText = "0";

  overlay.classList.remove("opacity-0", "pointer-events-none");
  overlay.classList.remove("hidden");
  if (appLayout) appLayout.classList.add("hidden");

  setTimeout(() => {
    overlay.classList.remove("opacity-0", "pointer-events-none");
  }, 10);
}

// --- THE ROUTER ---
async function loadView(viewName) {
  const contentDiv = document.getElementById("app-content");
  contentDiv.innerHTML =
    '<div class="text-center text-slate-500 mt-20 font-bold animate-pulse">Loading System Module...</div>';

  try {
    const response = await fetch(`views/${viewName}.html`);
    if (!response.ok) throw new Error("Module not found");

    const html = await response.text();
    contentDiv.innerHTML = html;
    updateActiveNav(viewName);
    updateHeaderContext(viewName);

    const revealTargets = contentDiv.querySelectorAll(
      ".panel-card, .panel-card-dark, .stagger-up",
    );
    revealTargets.forEach((el, idx) => {
      el.style.animationDelay = `${Math.min(idx * 55, 320)}ms`;
      if (!el.classList.contains("stagger-up")) {
        el.classList.add("stagger-up");
      }
    });

    if (viewName === "dashboard") initDashboard();
    else if (viewName === "audit") initRegistry();
    else if (viewName === "reports") initReports();
    else if (viewName === "semester-analysis") initSemesterAnalysis();
    else if (viewName === "notifications") initNotifications();
    else if (viewName === "impact") initImpact();
    else if (viewName === "model-watch") initModelWatch();
    else if (viewName === "war-room") initWarRoom();
    else if (viewName === "briefing") initBriefing();
    else if (viewName === "forecaster") {
      updateForecasterFlow(
        1,
        "Step 1 active: load a student profile to start guided forecasting.",
      );
    }
  } catch (error) {
    contentDiv.innerHTML = `<div class="text-red-500 bg-red-100 p-4 rounded text-center mt-20 font-bold">Error loading module.</div>`;
  }
}

// --- DASHBOARD LOGIC ---
async function initDashboard() {
  try {
    const resp = await fetch(scopedApiUrl(`/executive-summary`));
    const data = await resp.json();
    document.getElementById("briefing-title").innerText = data.title;
    document.getElementById("briefing-content").innerText = data.content;
    if (data.metrics.total_students) {
      document.getElementById("kpi-total").innerText =
        data.metrics.total_students;
      document.getElementById("kpi-safe").innerText =
        data.metrics.safe_rate + "%";
      document.getElementById("kpi-risk").innerText =
        data.metrics.at_risk_count;
    }
  } catch (err) {
    console.error("Could not load executive summary.");
  }

  try {
    const shockResp = await fetch(scopedApiUrl(`/wow/cohort-shock-detector`));
    const shockData = await shockResp.json();
    const summaryEl = document.getElementById("shock-summary");
    const listEl = document.getElementById("shock-list");

    if (summaryEl)
      summaryEl.innerText = shockData.summary || "Shock detector unavailable.";
    if (listEl && Array.isArray(shockData.alerts)) {
      listEl.innerHTML = shockData.alerts
        .slice(0, 5)
        .map((row) => {
          const color =
            row.status === "Critical Shock"
              ? "text-red-600 bg-red-50 border-red-200"
              : row.status === "Early Shock"
                ? "text-orange-600 bg-orange-50 border-orange-200"
                : "text-green-600 bg-green-50 border-green-200";
          return `
                    <div class="p-3 border rounded-xl ${color}">
                        <div class="flex justify-between items-center">
                            <span class="text-xs font-black">${row.department}</span>
                            <span class="text-[10px] font-black uppercase">${row.status}</span>
                        </div>
                        <div class="text-[10px] mt-2 font-bold">Shock Index ${row.shock_index} | Attendance ${row.avg_attendance}% | Fail Rate ${row.fail_rate}%</div>
                    </div>
                `;
        })
        .join("");
    }
  } catch (err) {
    console.error("Could not load shock detector.");
  }

  try {
    const heatmapResp = await fetch(scopedApiUrl(`/wow/risk-heatmap`));
    const heatmapData = await heatmapResp.json();
    const grid = document.getElementById("heatmap-grid");
    if (grid && Array.isArray(heatmapData.cells)) {
      grid.innerHTML = heatmapData.cells
        .slice(0, 12)
        .map((cell) => {
          const cls =
            cell.band === "critical"
              ? "bg-red-100 border-red-300 text-red-700"
              : cell.band === "high"
                ? "bg-orange-100 border-orange-300 text-orange-700"
                : cell.band === "moderate"
                  ? "bg-yellow-100 border-yellow-300 text-yellow-700"
                  : "bg-green-100 border-green-300 text-green-700";
          return `
                    <div class="p-3 rounded-xl border ${cls}">
                        <div class="text-[10px] font-black uppercase">${cell.semester}</div>
                        <div class="text-xs font-bold mt-1">${cell.reg_no}</div>
                        <div class="text-sm font-black mt-1">Risk ${cell.risk}%</div>
                    </div>
                `;
        })
        .join("");
    }
  } catch (err) {
    console.error("Could not load risk heatmap.");
  }

  try {
    const [queueResp, warResp] = await Promise.all([
      fetch(scopedApiUrl(`/wow/advisor-queue`)),
      fetch(scopedApiUrl(`/wow/war-room`)),
    ]);
    const queueData = await queueResp.json();
    const warData = await warResp.json();

    const now = new Date();
    const stamp = document.getElementById("ops-timestamp");
    if (stamp)
      stamp.innerText = now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });

    const activity = [];
    activity.push(`Queue cases: ${queueData.summary?.total ?? 0} total`);
    activity.push(`In progress: ${queueData.summary?.in_progress ?? 0}`);
    activity.push(`Resolved: ${queueData.summary?.resolved ?? 0}`);
    if (warData.urgent_cases?.length) {
      activity.push(
        `Top urgent case: ${warData.urgent_cases[0].reg_no} (${warData.urgent_cases[0].priority})`,
      );
    } else {
      activity.push("No urgent war-room case at this moment.");
    }

    const feed = document.getElementById("live-activity-list");
    if (feed) {
      feed.innerHTML = activity
        .map(
          (line) =>
            `<div class="text-xs p-2 rounded border border-slate-700 bg-slate-800/70"><span class="text-cyan-300 font-black mr-2">•</span>${line}</div>`,
        )
        .join("");
    }
  } catch (err) {
    const feed = document.getElementById("live-activity-list");
    if (feed)
      feed.innerHTML =
        '<div class="text-xs text-slate-400">Activity stream unavailable.</div>';
  }

  const demoSteps = document.getElementById("demo-steps");
  if (demoSteps) {
    demoSteps.innerHTML =
      '<div class="text-slate-400">Select a scenario to begin scripted walkthrough.</div>';
  }
}

function appendDemoStep(text, tone = "slate") {
  const root = document.getElementById("demo-steps");
  if (!root) return;
  const cls =
    tone === "green"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : tone === "red"
          ? "bg-red-50 border-red-200 text-red-800"
          : "bg-slate-50 border-slate-200 text-slate-700";
  root.innerHTML += `<div class="p-2 rounded border ${cls}">${text}</div>`;
}

async function startDemoScenario(type) {
  const root = document.getElementById("demo-steps");
  if (root) root.innerHTML = "";

  appendDemoStep("Scenario initialized. Loading Risk Registry module...");
  await loadView("audit");

  const scenarios = {
    safe: {
      GPA: 3.4,
      Attendance: 88,
      Score: 72,
      Failures: 0,
      tone: "green",
      title: "Safe recovery",
    },
    borderline: {
      GPA: 2.4,
      Attendance: 69,
      Score: 52,
      Failures: 1,
      tone: "amber",
      title: "Borderline stabilization",
    },
    critical: {
      GPA: 1.5,
      Attendance: 46,
      Score: 31,
      Failures: 3,
      tone: "red",
      title: "Critical escalation",
    },
  };

  const scenario = scenarios[type];
  if (!scenario) return;

  appendDemoStep(
    `Applying ${scenario.title} profile and running AI analysis...`,
    scenario.tone,
  );
  document.getElementById("GPA").value = scenario.GPA;
  document.getElementById("Attendance").value = scenario.Attendance;
  document.getElementById("Score").value = scenario.Score;
  document.getElementById("Failures").value = scenario.Failures;
  await analyzeManual();

  if (type !== "safe") {
    appendDemoStep(
      "Creating an intervention case automatically for workflow visibility...",
      scenario.tone,
    );
    try {
      await fetch(scopedApiUrl(`/wow/advisor-queue`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reg_no: `DEMO/${type.toUpperCase()}/001`,
          action_name:
            type === "critical"
              ? "Emergency academic advising"
              : "Guided study intervention",
          owner: type === "critical" ? "CoD Office" : "Academic Advisor",
          priority: type === "critical" ? "critical" : "high",
          expected_risk_reduction: type === "critical" ? 14 : 8,
          due_days: type === "critical" ? 2 : 7,
        }),
      });
      refreshWorkflowBoard();
      refreshEscalationRadar();
    } catch (err) {
      appendDemoStep("Workflow creation failed in demo mode.", "red");
    }
  }

  if (type === "critical") {
    appendDemoStep(
      "Escalation path highlighted: queue and radar now show urgent case.",
      "red",
    );
  } else if (type === "borderline") {
    appendDemoStep(
      "What-if simulation recommended to pull the student into safer band.",
      "amber",
    );
  } else {
    appendDemoStep(
      "Student remains safe. Use as control-case in your defense narrative.",
      "green",
    );
  }
}

// --- REGISTRY LOGIC ---
async function initRegistry() {
  try {
    const resp = await fetch(scopedApiUrl(`/department-alert`));
    const data = await resp.json();
    if (document.getElementById("alert-text"))
      document.getElementById("alert-text").innerText =
        `Active scanning complete. Found ${data.total_alerts} high-risk correlations requiring intervention.`;

    const container = document.getElementById("course-container");
    if (!container) return;
    container.innerHTML = "";

    for (const [course, students] of Object.entries(data.grouped_alerts)) {
      const div = document.createElement("div");
      div.className =
        "bg-white p-6 rounded-2xl shadow-sm border-t-4 border-blue-500 hover:shadow-md transition";
      div.innerHTML = `
                <h4 class="font-bold text-slate-800 mb-4 flex justify-between items-center">
                    ${course}
                    <span class="text-[10px] text-blue-500">${students.length} Flags</span>
                </h4>
                <div class="space-y-3">
                    ${students
                      .slice(0, 3)
                      .map(
                        (s) => `
                        <div onclick="searchStudentDB('${s.reg_no}')" class="risk-card bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-100">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-black text-slate-400 uppercase">${s.reg_no}</span>
                                <span class="text-xs font-bold text-slate-700">GPA: ${s.gpa}</span>
                                <span class="text-[10px] font-black ${s.integrity_flag === "THIEF SUSPECT" ? "text-red-600" : "text-emerald-600"}">${s.integrity_flag || "clean"}</span>
                            </div>
                            <span class="text-[10px] bg-red-100 text-red-600 px-3 py-1 rounded-full font-black uppercase">${s.attendance}% Att.</span>
                        </div>
                    `,
                      )
                      .join("")}
                </div>
            `;
      container.appendChild(div);
    }
  } catch (err) {
    console.error("Could not load registry data.");
  }

  await Promise.all([
    loadAcademicIntegrityWatch(),
    loadAdvisorWorkloadBalancer(),
    loadInterventionPlaybookScoring(),
    refreshWorkflowBoard(),
    refreshEscalationRadar(),
    loadROIScorecard(),
    loadGovernanceTrail(),
    loadSLAIntelligence(),
  ]);
}

async function loadAcademicIntegrityWatch() {
  const summary = document.getElementById("integrity-summary");
  const list = document.getElementById("integrity-watch-list");
  if (!summary || !list) return;

  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/academic-integrity-watch?limit=8`),
    );
    const data = await resp.json();
    const rows = data.rows || [];
    summary.innerText = `${rows.length} thief suspect${rows.length === 1 ? "" : "s"}`;

    if (!rows.length) {
      list.innerHTML =
        '<div class="text-xs text-emerald-600 font-bold">No integrity red flags in current scope.</div>';
      return;
    }

    list.innerHTML = rows
      .map(
        (row) => `
      <div class="p-3 rounded-xl border border-red-200 bg-red-50">
        <div class="flex justify-between items-center">
          <span class="text-xs font-black text-red-700">${row.reg_no}</span>
          <span class="text-[10px] uppercase font-black text-red-600">${row.flag}</span>
        </div>
        <p class="text-[11px] font-bold text-slate-800 mt-1">${row.name || "Unknown Student"}</p>
        <p class="text-[10px] text-slate-600 mt-1">${row.program || "Unknown"}</p>
        <p class="text-[10px] text-slate-600 mt-1">Span ${row.score_span} | High ${row.high_mark} | Low ${row.low_mark} | Att ${row.avg_attendance}%</p>
        <button onclick="searchStudentDB('${row.reg_no}')" class="mt-2 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition">Drill Down</button>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    summary.innerText = "Unavailable";
    list.innerHTML =
      '<div class="text-xs text-red-500">Failed to load integrity watch data.</div>';
  }
}

async function loadStudentOpsIntel(regNo) {
  if (!regNo) return;
  await Promise.all([
    loadStudentTimelineCasebook(regNo),
    loadGuardianWorkflow(regNo),
  ]);
}

async function loadStudentTimelineCasebook(regNo) {
  const summary = document.getElementById("casebook-summary");
  const root = document.getElementById("timeline-casebook");
  if (!summary || !root) return;
  try {
    const resp = await fetch(
      scopedApiUrl(
        `/wow/student-timeline-casebook/${encodeURIComponent(regNo)}`,
      ),
    );
    const data = await resp.json();
    if (data.error) {
      summary.innerText = "Unavailable";
      root.innerHTML = `<div class="text-red-500">${data.error}</div>`;
      return;
    }
    summary.innerText = `${(data.cases || []).length} case(s)`;
    const caseHtml = (data.cases || [])
      .slice(0, 4)
      .map(
        (c) =>
          `<div class="p-2 rounded border border-slate-200 bg-slate-50"><p class="font-black text-slate-700">${c.action_name}</p><p class="text-[11px] text-slate-500 mt-1">${(c.status || "new").toUpperCase()} | Due ${new Date(c.due_at).toLocaleDateString()}</p></div>`,
      )
      .join("");
    const eventHtml = (data.events || [])
      .slice(0, 3)
      .map(
        (e) =>
          `<div class="text-[11px] text-slate-500">${new Date(e.timestamp || Date.now()).toLocaleString()} - ${e.new_state || e.action || "event"}</div>`,
      )
      .join("");
    root.innerHTML = `${caseHtml || '<div class="text-slate-400">No case timeline yet.</div>'}<div class="pt-2 border-t border-slate-200 mt-2">${eventHtml || '<div class="text-slate-400">No timeline events yet.</div>'}</div>`;
  } catch (err) {
    summary.innerText = "Unavailable";
    root.innerHTML = '<div class="text-red-500">Failed to load casebook.</div>';
  }
}

async function loadAdvisorWorkloadBalancer() {
  const root = document.getElementById("advisor-workload");
  if (!root) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/advisor-workload-balancer`));
    const data = await resp.json();
    const ownerRows = (data.owner_load || [])
      .slice(0, 5)
      .map(
        (o) =>
          `<div class="p-2 rounded border border-slate-700 bg-slate-800"><span class="font-black">${o.owner}</span><span class="float-right">${o.active_cases}</span></div>`,
      )
      .join("");
    const topRec = (data.recommendations || [])[0];
    root.innerHTML = `${ownerRows || '<div class="text-slate-400">No active workload.</div>'}<div class="mt-2 text-[11px] text-cyan-200">${topRec ? `Suggested reassignment: ${topRec.reg_no} to ${topRec.recommended_owner}` : "No reassignment required."}</div>`;
  } catch (err) {
    root.innerHTML =
      '<div class="text-xs text-red-400">Failed to load advisor workload balancer.</div>';
  }
}

async function loadInterventionPlaybookScoring() {
  const root = document.getElementById("playbook-scoring");
  if (!root) return;
  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/intervention-playbook-scoring`),
    );
    const data = await resp.json();
    root.innerHTML = (data.rows || [])
      .slice(0, 6)
      .map(
        (r) =>
          `<div class="p-2 rounded border border-slate-200 bg-slate-50"><span class="font-black text-slate-700">${r.intervention}</span><span class="float-right text-blue-700 font-black">${r.score}</span><p class="text-[11px] text-slate-500 mt-1">Success ${r.success_rate}% | Avg drop ${r.avg_risk_drop}%</p></div>`,
      )
      .join("");
    if (!root.innerHTML) {
      root.innerHTML =
        '<div class="text-slate-400">No playbook scoring data yet.</div>';
    }
  } catch (err) {
    root.innerHTML =
      '<div class="text-xs text-red-500">Failed to load intervention scoring.</div>';
  }
}

async function loadGuardianWorkflow(regNo) {
  const summary = document.getElementById("guardian-summary");
  const root = document.getElementById("guardian-workflow");
  if (!summary || !root || !regNo) return;
  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/guardian-communication/${encodeURIComponent(regNo)}`),
    );
    const data = await resp.json();
    if (data.error) {
      summary.innerText = "Unable to generate guardian template.";
      root.innerText = data.error;
      return;
    }
    summary.innerText = data.consent_required
      ? "Consent required before dispatch."
      : "Ready for guardian dispatch.";
    root.innerText = `${data.template}\n\n${data.audit_trail_hint || ""}`;
  } catch (err) {
    summary.innerText = "Guardian workflow unavailable.";
    root.innerText = "Failed to load guardian template.";
  }
}

async function searchStudentDB(forceRegNo = null) {
  const regNo =
    forceRegNo || document.getElementById("search-reg").value.trim();
  if (!regNo) return alert("Please enter a valid Registration Number.");
  currentRegNo = regNo;
  const requestToken = ++activeAuditRequestToken;
  currentAuditStudentProfile = null;
  currentAuditStudentMetrics = null;

  const btn = document.getElementById("search-btn");
  const originalText = btn.innerText;
  btn.innerText = "SCANNING...";
  btn.disabled = true;

  const resultArea = document.getElementById("analysis-result");
  const aiReportBox = document.getElementById("res-ai");
  resultArea.classList.remove("hidden");
  aiReportBox.innerHTML = `<div class="animate-pulse text-slate-400">Retrieving records & running AI...</div>`;

  try {
    const resp = await fetch(
      scopedApiUrl(`/database-audit/${encodeURIComponent(regNo)}`),
    );
    const data = await resp.json();
    if (requestToken !== activeAuditRequestToken) {
      return;
    }

    if (data.error) {
      alert(data.error);
      aiReportBox.innerHTML =
        "<span class='text-red-500'>Student not found.</span>";
      return;
    }

    document.getElementById("student-profile-card").classList.remove("hidden");
    document.getElementById("prof-name").innerText = data.student_profile.name;
    document.getElementById("prof-reg").innerText = data.student_profile.reg_no;
    document.getElementById("prof-dept").innerText =
      data.student_profile.department;
    document.getElementById("prof-prog").innerText =
      data.student_profile.program;

    document.getElementById("GPA").value = data.metrics.GPA;
    document.getElementById("Attendance").value = data.metrics.Attendance;
    document.getElementById("Score").value = data.metrics.Score;
    document.getElementById("Failures").value = data.metrics.Failures;
    currentAuditStudentProfile = data.student_profile;
    currentAuditStudentMetrics = data.metrics;

    renderAIReport(data.ai_analysis, {
      studentProfile: data.student_profile,
      metrics: data.metrics,
      source: "registry",
    });
    await loadStudentOpsIntel(regNo);
    loadAdvisorNotes();
    loadDigitalTwin(regNo);
  } catch (error) {
    aiReportBox.innerHTML = "Backend offline.";
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
    document
      .getElementById("analysis-result")
      .scrollIntoView({ behavior: "smooth" });
  }
}

async function analyzeManual() {
  const gpa = document.getElementById("GPA").value;
  const att = document.getElementById("Attendance").value;
  const score = document.getElementById("Score").value;
  const fail = document.getElementById("Failures").value;
  if (!gpa || !att || !score) return alert("Fill all metrics.");

  const studentData = {
    Year: 3,
    GPA: parseFloat(gpa),
    Score: parseFloat(score),
    Attendance: parseFloat(att),
    Study_Hours: 2.0,
    Failures: parseInt(fail) || 0,
    Credits: 15,
  };
  const btn = document.getElementById("audit-btn");
  btn.innerText = "PROCESSING...";
  btn.disabled = true;

  try {
    const resp = await fetch(`${API_URL}/predict-risk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(studentData),
    });
    const payload = await resp.json();
    renderAIReport(payload, {
      studentProfile: currentAuditStudentProfile,
      metrics: {
        ...studentData,
      },
      source: currentAuditStudentProfile ? "registry-override" : "manual",
    });
  } catch (err) {
  } finally {
    btn.innerText = "RUN OVERRIDE / RE-ANALYZE DATA";
    btn.disabled = false;
  }
}

function updateSimLabel(val) {
  document.getElementById("sim-hours-label").innerText = "+" + val;
}
function resetSimulator(initialRisk) {
  const slider = document.getElementById("sim-slider");
  if (slider) {
    slider.value = 0;
    updateSimLabel(0);
    document.getElementById("sim-orig-risk").innerText = initialRisk + "%";
    document.getElementById("sim-new-risk").innerText = initialRisk + "%";
    document.getElementById("sim-impact").innerText = "Baseline Model";
  }
}
async function runSimulation() {
  const addedHours = parseFloat(document.getElementById("sim-slider").value);
  const data = {
    Year: 3,
    GPA: parseFloat(document.getElementById("GPA").value),
    Score: parseFloat(document.getElementById("Score").value),
    Attendance: parseFloat(document.getElementById("Attendance").value),
    Study_Hours: 2.0,
    Failures: parseInt(document.getElementById("Failures").value) || 0,
    Credits: 15,
  };

  document.getElementById("sim-impact").innerText = "Calculating...";
  try {
    const resp = await fetch(
      `${API_URL}/simulate-policy?added_study_hours=${addedHours}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
    );
    const res = await resp.json();
    document.getElementById("sim-new-risk").innerText =
      res.simulated_risk_percent + "%";
    document.getElementById("sim-impact").innerText = res.policy_impact;
  } catch (err) {}
}

function updateSMSModeOptions(cases = []) {
  const select = document.getElementById("sms-intervention-mode");
  if (!select) return;

  const fromTwin = currentTwinActions.map((a) => a.name);
  const fromCases = (cases || []).map((c) => c.action_name);
  const merged = [
    ...new Set([
      ...fromTwin,
      ...fromCases,
      ...Object.keys(INTERVENTION_PLAYBOOKS),
    ]),
  ].filter(Boolean);

  if (!merged.length) return;

  const currentValue = select.value;
  select.innerHTML = merged
    .map((name) => `<option value="${name}">${name}</option>`)
    .join("");
  if (merged.includes(currentValue)) {
    select.value = currentValue;
  }
  updateSMSPreview();
}

function updateSMSPreview() {
  const preview = document.getElementById("sms-preview");
  const select = document.getElementById("sms-intervention-mode");
  const riskText =
    document.getElementById("res-badge")?.innerText || "At Risk (--%)";
  const regNo =
    document.getElementById("prof-reg")?.innerText || currentRegNo || "UNKNOWN";
  if (!preview || !select) return;

  const mode = select.value;
  const pack = getInterventionPack(mode);
  const steps = pack.steps.slice(0, 3).join(" | ");

  preview.innerText = `MUST Alert: ${regNo}, ${riskText}. Mode: ${mode}. Owner: ${pack.owner}. Review in ${pack.etaDays} days. Steps: ${steps}`;
}

async function sendSMSAlert() {
  const phone = document.getElementById("sms-phone").value.trim();
  const regNo = document.getElementById("prof-reg").innerText;
  const riskText = document.getElementById("res-badge").innerText;
  const selectedMode =
    document.getElementById("sms-intervention-mode")?.value ||
    "General Academic Advising";
  const statusEl = document.getElementById("sms-status");
  const btn = document.getElementById("sms-btn");

  if (!phone || !phone.startsWith("+")) {
    statusEl.innerText = "Error: Use international format (e.g. +254...).";
    statusEl.classList.remove("hidden", "text-green-400");
    statusEl.classList.add("text-red-400");
    return;
  }

  btn.innerText = "SENDING...";
  btn.disabled = true;
  statusEl.classList.add("hidden");

  const riskProb = riskText.match(/\d+/)[0];
  const pack = getInterventionPack(selectedMode);

  try {
    const resp = await fetch(`${API_URL}/notify-student`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reg_no: regNo !== "--" ? regNo : "UNKNOWN",
        phone_number: phone,
        risk_probability: parseFloat(riskProb),
        intervention_mode: selectedMode,
        intervention_owner: pack.owner,
        intervention_eta_days: pack.etaDays,
        intervention_steps: pack.steps,
      }),
    });
    const data = await resp.json();

    statusEl.classList.remove("hidden", "text-red-400");
    if (data.status === "success") {
      statusEl.innerText =
        "Success! Smart intervention SMS dispatched with action plan.";
      statusEl.classList.add("text-green-400");
      if (data.message_preview) {
        const preview = document.getElementById("sms-preview");
        if (preview) preview.innerText = data.message_preview;
      }
    } else {
      statusEl.innerText = "Failed: " + data.message;
      statusEl.classList.add("text-red-400");
    }
  } catch (err) {
    statusEl.innerText = "Connection error to FastAPI.";
    statusEl.classList.remove("hidden", "text-green-400");
    statusEl.classList.add("text-red-400");
  } finally {
    btn.innerText = "SEND WARNING SMS";
    btn.disabled = false;
  }
}

function renderAuditStudentContext(profile, metrics, source = "manual") {
  const panel = document.getElementById("res-student-context");
  const sourceEl = document.getElementById("res-student-source");
  if (!panel || !sourceEl) return;

  const hasProfile = profile && profile.reg_no;
  const sourceLabel =
    source === "registry"
      ? "Live registry record"
      : source === "registry-override"
        ? "Registry student with manual override"
        : "Manual simulation input";
  sourceEl.innerText = sourceLabel;

  if (!hasProfile) {
    panel.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
        <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Reg</span><p class="font-black text-slate-700">MANUAL</p></div>
        <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">GPA</span><p class="font-black text-slate-700">${Number(metrics?.GPA || 0).toFixed(2)}</p></div>
        <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Attendance</span><p class="font-black text-slate-700">${Number(metrics?.Attendance || 0)}%</p></div>
        <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Score</span><p class="font-black text-slate-700">${Number(metrics?.Score || 0)}/100</p></div>
        <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Failures</span><p class="font-black text-slate-700">${Number(metrics?.Failures || 0)}</p></div>
      </div>
    `;
    return;
  }

  panel.innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] mb-2">
      <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Student</span><p class="font-black text-slate-700">${profile.name || "Unknown"}</p></div>
      <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Reg No</span><p class="font-black text-slate-700">${profile.reg_no || "--"}</p></div>
      <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Department</span><p class="font-black text-slate-700">${profile.department || "Unassigned"}</p></div>
      <div class="p-2 rounded bg-slate-100 border border-slate-200"><span class="text-slate-500 font-bold">Program</span><p class="font-black text-slate-700">${profile.program || "Unknown"}</p></div>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
      <div class="p-2 rounded bg-blue-50 border border-blue-100"><span class="text-blue-600 font-bold">GPA</span><p class="font-black text-slate-800">${Number(metrics?.GPA || 0).toFixed(2)}</p></div>
      <div class="p-2 rounded bg-blue-50 border border-blue-100"><span class="text-blue-600 font-bold">Attendance</span><p class="font-black text-slate-800">${Number(metrics?.Attendance || 0)}%</p></div>
      <div class="p-2 rounded bg-blue-50 border border-blue-100"><span class="text-blue-600 font-bold">Score</span><p class="font-black text-slate-800">${Number(metrics?.Score || 0)}/100</p></div>
      <div class="p-2 rounded bg-blue-50 border border-blue-100"><span class="text-blue-600 font-bold">Failures</span><p class="font-black text-slate-800">${Number(metrics?.Failures || 0)}</p></div>
      <div class="p-2 rounded bg-blue-50 border border-blue-100"><span class="text-blue-600 font-bold">Study Hrs</span><p class="font-black text-slate-800">${Number(metrics?.Study_Hours || 0).toFixed(1)}</p></div>
    </div>
  `;
}

function renderAIReport(res, context = {}) {
  document.getElementById("analysis-result").classList.remove("hidden");
  const header = document.getElementById("res-header");
  const badge = document.getElementById("res-badge");
  const smsWidget = document.getElementById("sms-widget");

  if (res.status === "At Risk") {
    header.className =
      "p-6 text-white font-bold bg-red-600 flex justify-between items-center";
    badge.style.color = "#dc2626";
    smsWidget.classList.remove("hidden");
  } else {
    header.className =
      "p-6 text-white font-bold bg-green-600 flex justify-between items-center";
    badge.style.color = "#16a34a";
    smsWidget.classList.add("hidden");
  }

  badge.innerText = `${res.status} (${res.risk_probability}%)`;
  document.getElementById("res-reasons").innerHTML = res.explanation
    .map(
      (text) =>
        `<li class="bg-slate-50 border border-slate-100 p-3 rounded-xl flex items-center space-x-3 shadow-sm"><span class="text-blue-500">▶</span><span class="text-xs font-bold text-slate-700">${text}</span></li>`,
    )
    .join("");
  renderAuditStudentContext(
    context.studentProfile || currentAuditStudentProfile,
    context.metrics || currentAuditStudentMetrics,
    context.source || "manual",
  );
  document.getElementById("res-ai").innerText = res.ai_advisor_summary;
  resetSimulator(res.risk_probability);
  updateSMSPreview();
}

async function loadDigitalTwin(regNo) {
  const card = document.getElementById("digital-twin-card");
  const factorsEl = document.getElementById("twin-factors");
  const actionsEl = document.getElementById("twin-actions");
  const trajectoryEl = document.getElementById("twin-trajectory");
  if (!card || !factorsEl || !actionsEl) return;

  card.classList.remove("hidden");
  factorsEl.innerHTML =
    '<div class="text-xs text-slate-400 animate-pulse">Loading explainability factors...</div>';
  actionsEl.innerHTML =
    '<div class="text-xs text-slate-400 animate-pulse">Loading intervention pack...</div>';

  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/student-digital-twin/${encodeURIComponent(regNo)}`),
    );
    const data = await resp.json();
    if (data.error) {
      factorsEl.innerHTML = `<div class="text-xs text-red-500">${data.error}</div>`;
      actionsEl.innerHTML = "";
      return;
    }

    document.getElementById("twin-risk-band").innerText = data.risk.band;
    document.getElementById("twin-risk-prob").innerText =
      `${data.risk.probability}%`;

    const escalation =
      (data.recommended_actions.find((a) => a.escalation) || {}).escalation ||
      "No escalation.";
    document.getElementById("twin-escalation").innerText = escalation;

    factorsEl.innerHTML = data.top_factors
      .map((item) => {
        const tone =
          item.direction === "risk_up"
            ? "bg-red-50 border-red-200"
            : "bg-green-50 border-green-200";
        return `
                <div class="p-3 rounded-xl border ${tone}">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-black text-slate-800">${item.name}</span>
                        <span class="text-[10px] font-black text-slate-600">weight ${item.weight}</span>
                    </div>
                    <p class="text-xs text-slate-600 mt-2">${item.insight}</p>
                </div>
            `;
      })
      .join("");

    currentTwinActions = data.recommended_actions.filter((a) => a.name);
    updateSMSModeOptions(currentQueueSnapshot);

    actionsEl.innerHTML = currentTwinActions
      .map(
        (action, index) => `
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-black text-slate-800">${action.name}</span>
                    <span class="text-[10px] font-black uppercase text-blue-700">${action.priority}</span>
                </div>
                <p class="text-[10px] text-slate-500 mt-2">Owner: ${action.owner} | ETA: ${action.timeline_days} days | Expected Risk Delta: ${action.expected_risk_reduction}%</p>
                <p class="text-[10px] text-slate-500 mt-1">Pass Lift +${action.expected_pass_rate_lift || "--"}% | Confidence ${Math.round((action.confidence || 0) * 100)}% | Effort ${action.effort_hours || "--"}h | ROI ${action.roi_score || "--"}</p>
                <button onclick="promoteActionToWorkflow(${index})" class="mt-3 bg-slate-900 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition">Create Workflow Case</button>
            </div>
        `,
      )
      .join("");

    if (trajectoryEl) {
      const points = data.trajectory || [];
      if (!points.length) {
        trajectoryEl.innerHTML =
          '<div class="text-xs text-slate-500">No trajectory data available.</div>';
      } else {
        trajectoryEl.innerHTML = points
          .map((p) => {
            const risk = Number(p.risk_proxy || 0);
            const cls =
              risk >= 75
                ? "bg-red-100 text-red-700 border-red-200"
                : risk >= 50
                  ? "bg-amber-100 text-amber-700 border-amber-200"
                  : "bg-emerald-100 text-emerald-700 border-emerald-200";
            return `
              <div class="p-3 rounded-xl border ${cls}">
                <p class="text-[10px] font-black uppercase">${p.semester}</p>
                <p class="text-xs font-bold mt-1">Attendance ${p.attendance}% | Score ${p.score}</p>
                <div class="mt-2 h-2 bg-white/80 rounded"><div class="h-2 rounded bg-current" style="width:${Math.min(100, risk)}%"></div></div>
                <p class="text-[10px] font-black mt-2">Risk Proxy ${risk}%</p>
              </div>
            `;
          })
          .join("");
      }
    }

    await loadExplainabilityV2(regNo);
    updateSMSPreview();
  } catch (err) {
    factorsEl.innerHTML =
      '<div class="text-xs text-red-500">Failed to load digital twin data.</div>';
    actionsEl.innerHTML = "";
  }
}

async function loadExplainabilityV2(regNo) {
  const reasonsEl = document.getElementById("explainability-v2-reasons");
  const changesEl = document.getElementById("explainability-v2-changes");
  if (!reasonsEl || !changesEl) return;

  reasonsEl.innerHTML =
    '<div class="text-xs text-slate-400 animate-pulse">Loading top model reasons...</div>';
  changesEl.innerHTML =
    '<div class="text-xs text-slate-400 animate-pulse">Comparing against previous review...</div>';

  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/explainability-v2/${encodeURIComponent(regNo)}`),
    );
    const data = await resp.json();
    if (data.error) {
      reasonsEl.innerHTML = `<div class="text-xs text-red-500">${data.error}</div>`;
      changesEl.innerHTML = "";
      return;
    }

    reasonsEl.innerHTML = (data.top_reasons || [])
      .map((row) => {
        const up = row.arrow === "up";
        const arrow = up ? "▲" : "▼";
        const cls = up
          ? "bg-red-50 border-red-200 text-red-700"
          : "bg-emerald-50 border-emerald-200 text-emerald-700";
        return `
          <div class="p-2 rounded-lg border ${cls}">
            <div class="flex justify-between items-center">
              <span class="text-xs font-black">${arrow} ${row.reason}</span>
              <span class="text-[10px] font-black">Sensitivity ${row.sensitivity}</span>
            </div>
            <p class="text-[11px] mt-1">${row.insight}</p>
          </div>
        `;
      })
      .join("");

    changesEl.innerHTML = (data.changes_since_last_review || [])
      .map((row) => {
        const cls =
          row.direction === "up"
            ? "text-red-600"
            : row.direction === "down"
              ? "text-emerald-600"
              : "text-slate-600";
        const sign = row.delta > 0 ? "+" : "";
        return `
          <div class="p-2 rounded-lg border border-slate-200 bg-white">
            <div class="flex justify-between items-center">
              <span class="text-xs font-black text-slate-800">${row.name}</span>
              <span class="text-[10px] font-black ${cls}">${sign}${row.delta}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-1">${row.insight}</p>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    reasonsEl.innerHTML =
      '<div class="text-xs text-red-500">Explainability panel unavailable.</div>';
    changesEl.innerHTML = "";
  }
}

async function loadROIScorecard() {
  const root = document.getElementById("roi-scorecard");
  const story = document.getElementById("roi-story");
  if (!root) return;

  try {
    const resp = await fetch(scopedApiUrl(`/wow/intervention-roi`));
    const data = await resp.json();
    if (!data.rows || data.rows.length === 0) {
      root.innerHTML =
        '<div class="text-xs text-slate-400">No ROI rows yet.</div>';
      if (story)
        story.innerText =
          "ROI explainer: create one intervention case to see ranked impact recommendations.";
      return;
    }

    const best = data.rows[0];
    if (story) {
      story.innerHTML = `
        <p class="font-black">Recommended First Move: ${best.intervention}</p>
        <p class="mt-1">Why this is best right now: it can reduce risk by <strong>${best.expected_risk_drop}%</strong>, lift pass chance by <strong>${best.expected_pass_rate_lift}%</strong>, and has confidence <strong>${Math.round(best.confidence * 100)}%</strong> within <strong>${best.time_to_impact_days} days</strong>.</p>
      `;
    }

    root.innerHTML = data.rows
      .slice(0, 8)
      .map(
        (row) => `
      <div class="p-3 rounded-xl border border-slate-200 bg-slate-50">
        <div class="flex justify-between items-center gap-2">
          <span class="text-xs font-black text-slate-800">${row.intervention}</span>
          <span class="text-[10px] font-black text-cyan-700">ROI ${row.roi_score}</span>
        </div>
        <p class="text-[10px] text-slate-500 mt-2">${row.reg_no} | ${row.priority.toUpperCase()} | ${row.status.toUpperCase()}</p>
        <div class="mt-2 space-y-2">
          <div>
            <div class="flex justify-between text-[10px] text-slate-600 font-bold"><span>Expected Pass Lift</span><span>+${row.expected_pass_rate_lift}%</span></div>
            <div class="h-1.5 bg-slate-200 rounded"><div class="h-1.5 bg-emerald-500 rounded" style="width:${Math.min(100, row.expected_pass_rate_lift * 5)}%"></div></div>
          </div>
          <div>
            <div class="flex justify-between text-[10px] text-slate-600 font-bold"><span>Expected Risk Drop</span><span>-${row.expected_risk_drop}%</span></div>
            <div class="h-1.5 bg-slate-200 rounded"><div class="h-1.5 bg-cyan-500 rounded" style="width:${Math.min(100, row.expected_risk_drop * 4)}%"></div></div>
          </div>
        </div>
        <p class="text-[10px] text-slate-600 mt-2">Time to impact: <strong>${row.time_to_impact_days} days</strong> | Confidence: <strong>${Math.round(row.confidence * 100)}%</strong></p>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    root.innerHTML =
      '<div class="text-xs text-red-500">Unable to load ROI scorecard.</div>';
  }
}

async function loadGovernanceTrail() {
  const summary = document.getElementById("governance-summary");
  const root = document.getElementById("governance-trail");
  if (!summary || !root) return;

  try {
    const resp = await fetch(scopedApiUrl(`/wow/governance-trail?limit=10`));
    const data = await resp.json();
    summary.innerText = data.summary || "Governance trail online.";
    if (!data.events || !data.events.length) {
      root.innerHTML =
        '<div class="text-xs text-slate-400">No governance events yet.</div>';
      return;
    }

    root.innerHTML = data.events
      .map(
        (ev) => `
      <div class="p-2 rounded border border-slate-700 bg-slate-900">
        <div class="flex justify-between items-center">
          <span class="text-[10px] font-black text-cyan-300">${ev.role || "System"}</span>
          <span class="text-[10px] text-slate-400">${new Date(ev.timestamp || ev.resolved_at || Date.now()).toLocaleString()}</span>
        </div>
        <p class="text-xs text-white mt-1">${ev.reg_no || "N/A"}: ${ev.old_state || "none"} -> ${ev.new_state || "n/a"}</p>
        <p class="text-[10px] text-slate-400 mt-1">${ev.justification || "No justification provided."}</p>
      </div>
    `,
      )
      .join("");
  } catch (err) {
    summary.innerText = "Governance trail unavailable.";
    root.innerHTML =
      '<div class="text-xs text-red-400">Failed to load governance data.</div>';
  }
}

async function loadSLAIntelligence() {
  const summary = document.getElementById("sla-summary");
  const root = document.getElementById("sla-intelligence");
  if (!summary || !root) return;

  try {
    const resp = await fetch(scopedApiUrl(`/wow/sla-intelligence`));
    const data = await resp.json();
    summary.innerText = `${data.likely_breach_48h || 0} likely SLA breaches in 48h`;
    if (!data.rows || !data.rows.length) {
      root.innerHTML =
        '<div class="text-xs text-slate-400">No active SLA risks.</div>';
      return;
    }
    root.innerHTML = data.rows
      .slice(0, 6)
      .map((row) => {
        const cls = row.at_risk
          ? "border-red-400 bg-red-500/10"
          : "border-slate-600 bg-slate-900";
        return `
          <div class="p-3 rounded border ${cls}">
            <p class="text-xs font-black text-white">${row.reg_no}</p>
            <p class="text-[10px] text-slate-300 mt-1">${row.priority.toUpperCase()} | ${row.hours_left}h left</p>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    summary.innerText = "SLA intelligence unavailable.";
    root.innerHTML =
      '<div class="text-xs text-red-400">Failed to load SLA intelligence.</div>';
  }
}

function loadAdvisorNotes() {
  const textarea = document.getElementById("advisor-notes");
  const status = document.getElementById("notes-status");
  if (!textarea) return;
  if (!currentRegNo) {
    textarea.value = "";
    if (status) status.innerText = "Search a student to load advisor notes.";
    return;
  }

  const key = `advisor_notes_${currentRegNo}`;
  textarea.value = localStorage.getItem(key) || "";
  if (status) status.innerText = `Notes loaded for ${currentRegNo}.`;
}

function saveAdvisorNotes() {
  const textarea = document.getElementById("advisor-notes");
  const status = document.getElementById("notes-status");
  if (!textarea || !currentRegNo) {
    if (status)
      status.innerText = "Select a student first before saving notes.";
    return;
  }

  const key = `advisor_notes_${currentRegNo}`;
  localStorage.setItem(key, textarea.value.trim());
  if (status)
    status.innerText = `Saved notes for ${currentRegNo} at ${new Date().toLocaleTimeString()}.`;
}

function applyPlaybookTemplate(type) {
  const textarea = document.getElementById("advisor-notes");
  if (!textarea) return;
  const templates = {
    attendance:
      "Attendance Recovery Plan:\n1) Student signs attendance contract for next 2 weeks.\n2) Weekly check-in with advisor every Friday.\n3) Missing two classes triggers guardian notification.",
    remedial:
      "Remedial Coaching Plan:\n1) Assign targeted tutorial group for weak units.\n2) Set CAT revision milestones with lecturer.\n3) Re-assess risk after 10 days.",
    critical:
      "Critical Escalation Protocol:\n1) Immediate CoD office session within 24h.\n2) Student support referral and guardian contact.\n3) Daily monitoring until risk drops below high band.",
  };
  textarea.value = templates[type] || textarea.value;
}

async function promoteActionToWorkflow(index) {
  if (!currentRegNo) {
    alert("Search a student first.");
    return;
  }
  const action = currentTwinActions[index];
  if (!action) return;

  try {
    const resp = await fetch(scopedApiUrl(`/wow/advisor-queue`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reg_no: currentRegNo,
        action_name: action.name,
        owner: action.owner,
        priority: action.priority,
        expected_risk_reduction: action.expected_risk_reduction,
        due_days: action.timeline_days,
      }),
    });
    const data = await resp.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    await Promise.all([
      refreshWorkflowBoard(),
      refreshEscalationRadar(),
      loadROIScorecard(),
      loadGovernanceTrail(),
      loadSLAIntelligence(),
    ]);
  } catch (err) {
    alert("Failed to create workflow case.");
  }
}

function renderQueueColumn(elementId, cases, actionButtons = []) {
  const container = document.getElementById(elementId);
  if (!container) return;
  if (!cases || cases.length === 0) {
    container.innerHTML =
      '<div class="text-[11px] text-slate-400">No cases in this lane.</div>';
    return;
  }

  container.innerHTML = cases
    .map((item) => {
      const pack = getInterventionPack(item.action_name);
      const evidence = pack.qa
        .slice(0, 2)
        .map((q) => `<li class="text-[10px] text-slate-300">- ${q}</li>`)
        .join("");
      const achievedBadge =
        item.status === "resolved"
          ? '<span class="text-[10px] font-black uppercase text-emerald-300">Achieved</span>'
          : '<span class="text-[10px] font-black uppercase text-amber-300">In Verification</span>';
      const controls = actionButtons
        .map(
          (btn) =>
            `<button onclick="updateWorkflowCase('${item.id}','${btn.next}')" class="px-2 py-1 rounded text-[10px] font-black uppercase ${btn.cls}">${btn.label}</button>`,
        )
        .join(" ");

      return `
        <div class="bg-slate-900 border border-slate-700 rounded-lg p-3">
          <div class="flex justify-between items-center mb-2">
            <span class="text-[10px] font-black text-blue-300">${item.reg_no}</span>
            <span class="text-[10px] uppercase font-black text-amber-300">${item.priority}</span>
          </div>
          <p class="text-xs font-bold text-white">${item.action_name}</p>
          <p class="text-[10px] text-slate-400 mt-1">Owner: ${item.owner} | Due: ${new Date(item.due_at).toLocaleDateString()} | ETA ${item.timeline_days || pack.etaDays}d</p>
          <div class="mt-2 p-2 rounded border border-slate-700 bg-slate-800">
            <div class="flex justify-between items-center mb-1">
              <p class="text-[10px] font-black text-slate-300 uppercase">Evidence Checklist</p>
              ${achievedBadge}
            </div>
            <ul class="space-y-1">${evidence}</ul>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">${controls}</div>
        </div>
      `;
    })
    .join("");
}

function renderInterventionEvidence(cases) {
  const root = document.getElementById("intervention-evidence");
  const summary = document.getElementById("evidence-summary");
  if (!root || !summary) return;

  if (!cases || !cases.length) {
    summary.innerText = "No active intervention case yet.";
    root.innerHTML =
      '<div class="text-xs text-slate-400">Create or search a case to view evidence tracker.</div>';
    return;
  }

  const focus = cases[0];
  const pack = getInterventionPack(focus.action_name);
  const achieved = focus.status === "resolved";
  summary.innerText = achieved
    ? `${focus.reg_no}: intervention achieved and verified`
    : `${focus.reg_no}: evidence collection in progress`;

  root.innerHTML = pack.qa
    .map((question, idx) => {
      const checked = achieved || idx === 0;
      const cls = checked
        ? "border-emerald-500 bg-emerald-500/10"
        : "border-slate-600 bg-slate-900";
      return `
        <div class="p-3 rounded border ${cls}">
          <p class="text-xs font-black text-white">${checked ? "[OK]" : "[ ]"} ${question}</p>
        </div>
      `;
    })
    .join("");
}

async function refreshWorkflowBoard() {
  try {
    const resp = await fetch(scopedApiUrl(`/wow/advisor-queue`));
    const data = await resp.json();
    if (data.error) return;

    currentQueueSnapshot = [
      ...(data.grouped.new || []),
      ...(data.grouped.in_progress || []),
      ...(data.grouped.resolved || []),
    ];

    renderQueueColumn("queue-new", data.grouped.new, [
      { label: "Start", next: "in_progress", cls: "bg-blue-500 text-white" },
      { label: "Resolve", next: "resolved", cls: "bg-emerald-500 text-white" },
    ]);
    renderQueueColumn("queue-progress", data.grouped.in_progress, [
      { label: "Resolve", next: "resolved", cls: "bg-emerald-500 text-white" },
      { label: "Reset", next: "new", cls: "bg-slate-500 text-white" },
    ]);
    renderQueueColumn("queue-resolved", data.grouped.resolved, []);

    const prioritized = [
      ...(data.grouped.in_progress || []),
      ...(data.grouped.new || []),
      ...(data.grouped.resolved || []),
    ];
    renderInterventionEvidence(prioritized);
    updateSMSModeOptions(prioritized);
  } catch (err) {
    console.error("Failed to load workflow queue.");
  }
}

async function updateWorkflowCase(caseId, status) {
  let justification = "";
  let evidenceSummary = "";
  let checklistCompleted = 0;
  if (status === "resolved") {
    justification = prompt(
      "Decision justification is required before resolving this case. Enter a short justification:",
      "Risk reduced after verified intervention outcomes.",
    );
    if (!justification || !justification.trim()) {
      alert("Resolution cancelled: justification is required.");
      return;
    }

    evidenceSummary =
      prompt(
        "Provide evidence summary (attendance proof, remedial completion, assessment proof):",
        "Attendance improved above threshold, remedial tasks completed, and follow-up assessment confirmed progress.",
      ) || "";
    const checklistInput =
      prompt("How many checklist items were completed? (minimum 2)", "2") ||
      "0";
    checklistCompleted = Number(checklistInput);
    if (!evidenceSummary.trim() || checklistCompleted < 2) {
      alert(
        "Resolution cancelled: provide evidence summary and checklist count >= 2.",
      );
      return;
    }
  }

  try {
    const resp = await fetch(scopedApiUrl(`/wow/advisor-queue/${caseId}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        notes:
          status === "resolved"
            ? `Resolved with evidence: ${evidenceSummary}`
            : `Moved to ${status}`,
        actor_role: currentUserRole || "System",
        justification,
        evidence_summary: evidenceSummary,
        checklist_completed: checklistCompleted,
      }),
    });
    const data = await resp.json();
    if (data.error) {
      alert(data.error);
      return;
    }
    await Promise.all([
      refreshWorkflowBoard(),
      refreshEscalationRadar(),
      loadGovernanceTrail(),
      loadSLAIntelligence(),
      loadROIScorecard(),
    ]);
  } catch (err) {
    console.error("Failed to update case.");
  }
}

async function refreshEscalationRadar() {
  try {
    const resp = await fetch(scopedApiUrl(`/wow/escalation-radar`));
    const data = await resp.json();
    const summary = document.getElementById("escalation-summary");
    const list = document.getElementById("escalation-list");
    if (summary) {
      const watch = data.sla_watch?.likely_breach_48h || 0;
      summary.innerText = `${data.summary || "Radar unavailable."} | SLA 48h watch: ${watch}`;
    }
    if (!list) return;

    if (!data.alerts || data.alerts.length === 0) {
      list.innerHTML =
        '<div class="text-xs text-slate-400">No active escalations.</div>';
      return;
    }

    list.innerHTML = data.alerts
      .slice(0, 6)
      .map((row) => {
        const cls =
          row.severity === "critical"
            ? "border-red-500 bg-red-500/10"
            : row.severity === "high"
              ? "border-orange-400 bg-orange-500/10"
              : row.severity === "warning"
                ? "border-yellow-400 bg-yellow-500/10"
                : "border-emerald-500 bg-emerald-500/10";

        return `
          <div class="p-3 border rounded-lg ${cls}">
            <div class="flex justify-between items-center">
              <span class="text-xs font-black">${row.reg_no}</span>
              <span class="text-[10px] uppercase font-black">${row.escalation}</span>
            </div>
            <p class="text-[10px] text-slate-200 mt-1">${row.action}</p>
            <p class="text-[10px] text-slate-300 mt-1">Owner: ${row.owner} | Overdue: ${row.overdue_hours}h | Countdown: ${row.countdown_hours}h</p>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    console.error("Failed to load escalation radar.");
  }
}

async function downloadCaseBrief() {
  if (!currentRegNo) {
    alert("Search a student first to generate a case brief.");
    return;
  }

  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/case-brief/${encodeURIComponent(currentRegNo)}`),
    );
    const data = await resp.json();
    if (data.error) {
      alert(data.error);
      return;
    }

    const blob = new Blob([data.brief_text], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `case_brief_${currentRegNo.replaceAll("/", "_")}.txt`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Failed to generate case brief.");
  }
}

// --- NEW: FORECASTER LOGIC (OBJECTIVE 2) ---
async function runForecast() {
  const regNo = document.getElementById("forecast-reg").value.trim();
  if (!regNo) return alert("Please enter a valid Registration Number.");

  const btn = document.getElementById("forecast-btn");
  const originalText = btn.innerText;
  btn.innerText = "CALCULATING...";
  btn.disabled = true;

  try {
    const resp = await fetch(
      scopedApiUrl(`/database-audit/${encodeURIComponent(regNo)}`),
    );
    const data = await resp.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    // Student Info
    document.getElementById("fc-name").innerText = data.student_profile.name;
    document.getElementById("fc-reg").innerText = data.student_profile.reg_no;
    document.getElementById("fc-confidence").innerText =
      data.ai_analysis.risk_probability + "%";
    const deptEl = document.getElementById("fc-dept");
    const progEl = document.getElementById("fc-program");
    const yearEl = document.getElementById("fc-year");
    const riskNowEl = document.getElementById("fc-risk-now");
    if (deptEl)
      deptEl.innerText = data.student_profile.department || "Unassigned";
    if (progEl) progEl.innerText = data.student_profile.program || "Unknown";
    if (yearEl) yearEl.innerText = `${data.metrics.Year || "--"}`;
    if (riskNowEl)
      riskNowEl.innerText = `${data.ai_analysis.risk_probability}%`;

    // --- THE RAW FEATURE VECTOR (Bragging Rights Data) ---
    // Added the % sign for clarity
    document.getElementById("raw-cat").innerText = data.metrics.Score + "%";
    document.getElementById("raw-att").innerText =
      data.metrics.Attendance + "%";
    document.getElementById("raw-gpa").innerText = data.metrics.GPA;
    document.getElementById("raw-fail").innerText = data.metrics.Failures;
    document.getElementById("raw-study").innerText = data.metrics.Study_Hours;
    document.getElementById("raw-cred").innerText = data.metrics.Credits;

    // Forecast Metrics
    const fc = data.ai_analysis.forecast;
    document.getElementById("val-cat").innerText = fc.cat_score;
    document.getElementById("val-exam").innerText = fc.exam_prediction;
    document.getElementById("val-total").innerText = fc.total_score;

    // Color Grade (Typo fixed!)
    const gradeEl = document.getElementById("val-grade");
    gradeEl.innerText = fc.grade;
    gradeEl.className = "text-7xl font-black relative z-10";
    if (fc.grade === "FAIL") gradeEl.classList.add("text-red-500");
    else if (fc.grade === "D") gradeEl.classList.add("text-orange-500");
    else if (fc.grade === "C") gradeEl.classList.add("text-yellow-400");
    else gradeEl.classList.add("text-green-400");

    // Explaining the Factors
    document.getElementById("fac-att").innerText =
      data.metrics.Attendance + "%";
    document.getElementById("fac-gpa").innerText = data.metrics.GPA;
    document.getElementById("fac-fail").innerText = data.metrics.Failures;

    currentForecastMetrics = data.metrics;
    currentForecastRisk = data.ai_analysis.risk_probability;

    updateComparatorLabels();
    const baseEl = document.getElementById("cmp-base");
    if (baseEl) baseEl.innerText = `Risk ${currentForecastRisk}%`;

    renderForecastPulse(fc, data.ai_analysis.risk_probability);
    renderScenarioBoard([]);
    renderForecastScenarioChart([]);
    updateForecasterFlow(
      2,
      "Baseline profile loaded. Next, compare intervention scenarios before generating the action plan.",
    );

    // Reveal
    document.getElementById("forecast-results").classList.remove("hidden");
  } catch (error) {
    alert("Connection error to FastAPI. Make sure the backend is running.");
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function updateComparatorLabels() {
  const att = document.getElementById("cmp-att");
  const gpa = document.getElementById("cmp-gpa");
  const study = document.getElementById("cmp-study");
  if (att && document.getElementById("cmp-att-label")) {
    document.getElementById("cmp-att-label").innerText = `${att.value}%`;
  }
  if (gpa && document.getElementById("cmp-gpa-label")) {
    document.getElementById("cmp-gpa-label").innerText =
      `${Number(gpa.value).toFixed(1)}`;
  }
  if (study && document.getElementById("cmp-study-label")) {
    const sign = Number(study.value) > 0 ? "+" : "";
    document.getElementById("cmp-study-label").innerText =
      `${sign}${study.value}h`;
  }
}

function renderForecastPulse(forecast, risk) {
  const root = document.getElementById("forecast-pulse-cards");
  if (!root) return;

  const recoveryProbability = Math.max(
    5,
    Math.min(98, 100 - Number(risk || 0)),
  );
  const stabilizationDays =
    Number(risk) >= 75 ? 21 : Number(risk) >= 50 ? 14 : 7;
  const advisingLoad =
    Number(risk) >= 75 ? "High" : Number(risk) >= 50 ? "Medium" : "Light";

  root.innerHTML = `
    <div class="p-3 rounded-xl border border-emerald-200 bg-emerald-50">
      <p class="text-[10px] uppercase font-black text-emerald-700">Recovery Probability</p>
      <p class="text-2xl font-black text-emerald-800 mt-1">${recoveryProbability}%</p>
      <p class="text-[10px] text-emerald-700 mt-1">Based on current projection and achievable support actions.</p>
    </div>
    <div class="p-3 rounded-xl border border-cyan-200 bg-cyan-50">
      <p class="text-[10px] uppercase font-black text-cyan-700">Earliest Stabilization</p>
      <p class="text-2xl font-black text-cyan-800 mt-1">${stabilizationDays} days</p>
      <p class="text-[10px] text-cyan-700 mt-1">Estimated time to move student into safer band.</p>
    </div>
    <div class="p-3 rounded-xl border border-amber-200 bg-amber-50">
      <p class="text-[10px] uppercase font-black text-amber-700">Advising Load Index</p>
      <p class="text-2xl font-black text-amber-800 mt-1">${advisingLoad}</p>
      <p class="text-[10px] text-amber-700 mt-1">Operational pressure expected for this intervention pathway.</p>
    </div>
  `;
}

function renderScenarioBoard(rows) {
  const root = document.getElementById("scenario-outcomes");
  const note = document.getElementById("scenario-recommendation");
  if (!root || !note) return;

  if (!rows.length) {
    root.innerHTML =
      '<div class="text-xs text-slate-400">Run comparator to build three scenario outcomes.</div>';
    note.innerText =
      "The system will recommend the best practical scenario after simulation.";
    return;
  }

  const ranked = [...rows].sort((a, b) => a.risk - b.risk);
  const best = ranked[0];
  const issueNote = describeCurrentIssue(currentForecastMetrics);
  const issueImpact = describeIssueImpact(currentForecastMetrics);
  note.innerText = `${issueNote} ${issueImpact} Recommended path: ${best.label} can lower projected risk to ${best.risk}% with realistic execution.`;

  root.innerHTML = rows
    .map((row) => {
      const tone =
        row.risk >= 75
          ? "border-red-200 bg-red-50"
          : row.risk >= 50
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50";
      return `
        <div class="p-3 rounded-lg border ${tone}">
          <div class="flex justify-between items-center">
            <p class="text-xs font-black text-slate-800">${row.label}</p>
            <p class="text-[10px] font-black uppercase text-slate-600">Risk ${row.risk}%</p>
          </div>
          <p class="text-[11px] text-slate-600 mt-1">${row.note}</p>
          <p class="text-[10px] text-slate-500 mt-2">Expected student outcome: ${row.outcome}</p>
        </div>
      `;
    })
    .join("");
}

function describeCurrentIssue(metrics) {
  if (!metrics) return "Main issue not available yet.";

  const attendance = Number(metrics.Attendance || 0);
  const gpa = Number(metrics.GPA || 0);
  const failures = Number(metrics.Failures || 0);
  const studyHours = Number(metrics.Study_Hours || 0);

  if (attendance < 70)
    return `Main issue: weak class attendance (${attendance}%) is pushing risk upward.`;
  if (gpa < 2.3)
    return `Main issue: low academic consistency (GPA ${gpa.toFixed(2)}) is driving instability.`;
  if (failures >= 2)
    return `Main issue: repeated course failures (${failures}) are stacking graduation pressure.`;
  if (studyHours < 3)
    return `Main issue: low weekly study time (${studyHours}h) is limiting recovery speed.`;
  return "Main issue: mixed performance signals require close support follow-through.";
}

function describeIssueImpact(metrics) {
  if (!metrics) return "";
  const attendance = Number(metrics.Attendance || 0);
  const failures = Number(metrics.Failures || 0);

  if (attendance < 70)
    return "If attendance remains low, missed learning time can quickly convert into score decline and possible course repeat.";
  if (failures >= 2)
    return "Without correction, backlog pressure can trigger delayed completion and higher probation risk.";
  return "Without coordinated action, the student may drift into a higher-risk band in coming weeks.";
}

function updateForecasterFlow(step, summary) {
  const maxStep = Math.max(1, Math.min(4, Number(step || 1)));
  for (let i = 1; i <= 4; i += 1) {
    const card = document.getElementById(`flow-step-${i}`);
    if (!card) continue;

    const active = i === maxStep;
    card.classList.remove(
      "border-cyan-200",
      "bg-cyan-50",
      "border-slate-200",
      "bg-slate-50",
      "border-emerald-200",
      "bg-emerald-50",
    );

    if (i < maxStep) {
      card.classList.add("border-emerald-200", "bg-emerald-50");
    } else if (active) {
      card.classList.add("border-cyan-200", "bg-cyan-50");
    } else {
      card.classList.add("border-slate-200", "bg-slate-50");
    }
  }

  const summaryEl = document.getElementById("flow-summary");
  if (summaryEl && summary) summaryEl.innerText = summary;
}

function renderForecastScenarioChart(rows) {
  const canvas = document.getElementById("forecastScenarioChart");
  if (!canvas) return;
  if (forecastScenarioChartInstance) forecastScenarioChartInstance.destroy();

  if (!rows.length) return;

  forecastScenarioChartInstance = new Chart(canvas.getContext("2d"), {
    type: "line",
    data: {
      labels: ["Current", "Week 1", "Week 2", "Week 3"],
      datasets: rows.map((row) => ({
        label: row.label,
        data: [
          Number(currentForecastRisk || 0),
          Math.max(0, row.risk + 6),
          Math.max(0, row.risk + 3),
          row.risk,
        ],
        borderColor: row.color,
        backgroundColor: `${row.color}33`,
        fill: true,
        tension: 0.35,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Predicted Risk %" },
        },
      },
    },
  });
}

async function runScenarioComparator() {
  if (!currentForecastMetrics) {
    alert("Run a forecast first to initialize baseline metrics.");
    return;
  }

  const attDelta = Number(document.getElementById("cmp-att")?.value || 0);
  const gpaDelta = Number(document.getElementById("cmp-gpa")?.value || 0);
  const studyDelta = Number(document.getElementById("cmp-study")?.value || 0);

  const payload = {
    Year: currentForecastMetrics.Year,
    GPA: Math.max(
      0,
      Math.min(4, Number(currentForecastMetrics.GPA) + gpaDelta),
    ),
    Score: Math.max(0, Math.min(100, Number(currentForecastMetrics.Score))),
    Attendance: Math.max(
      0,
      Math.min(100, Number(currentForecastMetrics.Attendance) + attDelta),
    ),
    Study_Hours: Math.max(
      0,
      Number(currentForecastMetrics.Study_Hours) + studyDelta,
    ),
    Failures: Number(currentForecastMetrics.Failures),
    Credits: Number(currentForecastMetrics.Credits),
  };

  const moderatePayload = {
    ...payload,
    Attendance: Math.max(0, Math.min(100, payload.Attendance + 6)),
    GPA: Math.max(0, Math.min(4, payload.GPA + 0.2)),
    Study_Hours: Math.max(0, payload.Study_Hours + 2),
  };

  const aggressivePayload = {
    ...payload,
    Attendance: Math.max(0, Math.min(100, payload.Attendance + 12)),
    GPA: Math.max(0, Math.min(4, payload.GPA + 0.4)),
    Study_Hours: Math.max(0, payload.Study_Hours + 4),
    Failures: Math.max(0, payload.Failures - 1),
  };

  try {
    const [customResp, moderateResp, aggressiveResp] = await Promise.all([
      fetch(`${API_URL}/predict-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
      fetch(`${API_URL}/predict-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(moderatePayload),
      }),
      fetch(`${API_URL}/predict-risk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(aggressivePayload),
      }),
    ]);

    const data = await customResp.json();
    const moderateData = await moderateResp.json();
    const aggressiveData = await aggressiveResp.json();
    const adjustedEl = document.getElementById("cmp-adjusted");
    if (adjustedEl) adjustedEl.innerText = `Risk ${data.risk_probability}%`;

    const rows = [
      {
        label: "Custom Comparator",
        risk: Number(data.risk_probability),
        note: `Using your selected targets: attendance ${payload.Attendance}%, GPA ${payload.GPA.toFixed(2)}, study ${payload.Study_Hours}h/week.`,
        outcome:
          Number(data.risk_probability) <= 45
            ? "Likely movement into a safer academic path if maintained for 2-3 weeks."
            : "Some improvement expected, but student may still require tighter follow-up.",
        color: "#0ea5e9",
      },
      {
        label: "Moderate Support Plan",
        risk: Number(moderateData.risk_probability),
        note: `Adds structured support: attendance ${moderatePayload.Attendance}%, GPA ${moderatePayload.GPA.toFixed(2)}, study ${moderatePayload.Study_Hours}h/week.`,
        outcome:
          Number(moderateData.risk_probability) <= 45
            ? "Good chance of stabilizing class performance with weekly advisor checks."
            : "Reduces pressure but may not be enough without stronger attendance enforcement.",
        color: "#14b8a6",
      },
      {
        label: "Aggressive Recovery Plan",
        risk: Number(aggressiveData.risk_probability),
        note: `High-intensity intervention: attendance ${aggressivePayload.Attendance}%, GPA ${aggressivePayload.GPA.toFixed(2)}, study ${aggressivePayload.Study_Hours}h/week, failures ${aggressivePayload.Failures}.`,
        outcome:
          Number(aggressiveData.risk_probability) <= 45
            ? "Strongest option to pull the student out of danger quickly."
            : "Needed for containment now, then continue with sustained mentoring.",
        color: "#f97316",
      },
    ];

    renderScenarioBoard(rows);
    renderForecastScenarioChart(rows);
    updateForecasterFlow(
      3,
      "Scenario comparison completed. Review the outcome board, then run the action planner.",
    );
  } catch (err) {
    alert("Scenario comparator failed. Ensure backend is running.");
  }
}

async function runCounterfactualPlanner() {
  const regNo =
    (document.getElementById("fc-reg")?.innerText || "").trim() ||
    (document.getElementById("forecast-reg")?.value || "").trim();
  const band = document.getElementById("cf-target-band")?.value || "Moderate";
  const planEl = document.getElementById("cf-plan");
  const narrativeEl = document.getElementById("cf-narrative");
  const feasibilityScoreEl = document.getElementById("cf-feasibility-score");
  const feasibilityNoteEl = document.getElementById("cf-feasibility-note");
  const ownerFocusEl = document.getElementById("cf-owner-focus");
  const targetGapEl = document.getElementById("cf-target-gap");

  if (!regNo || regNo === "--") {
    alert("Run a forecast first or enter registration number.");
    return;
  }

  if (planEl)
    planEl.innerHTML =
      '<div class="text-xs text-slate-300 animate-pulse">Running counterfactual planner...</div>';
  if (narrativeEl)
    narrativeEl.innerText = "Computing minimum intervention path...";
  if (feasibilityScoreEl) feasibilityScoreEl.innerText = "--";
  if (feasibilityNoteEl)
    feasibilityNoteEl.innerText = "Recomputing intervention feasibility...";
  if (ownerFocusEl) ownerFocusEl.innerText = "--";
  if (targetGapEl) targetGapEl.innerText = "--";

  try {
    const resp = await fetch(
      scopedApiUrl(
        `/wow/counterfactual-target/${encodeURIComponent(regNo)}?target_band=${encodeURIComponent(band)}`,
      ),
    );
    const data = await resp.json();
    if (data.error) {
      if (narrativeEl) narrativeEl.innerText = data.error;
      if (planEl) planEl.innerHTML = "";
      return;
    }

    if (narrativeEl)
      narrativeEl.innerText = data.narrative || "Planner completed.";

    const plan = data.recommended_plan || data.plan || [];
    if (!planEl) return;
    if (plan.length === 0) {
      planEl.innerHTML =
        '<div class="text-xs text-slate-300">No additional actions required.</div>';
      if (feasibilityScoreEl) feasibilityScoreEl.innerText = "98/100";
      if (feasibilityNoteEl)
        feasibilityNoteEl.innerText =
          "Target already achieved; maintain current intervention rhythm.";
      if (ownerFocusEl) ownerFocusEl.innerText = "Advisor Monitoring";
      if (targetGapEl) targetGapEl.innerText = "0.0";
      return;
    }

    planEl.innerHTML = plan
      .map(
        (step) => `
      <div class="p-3 rounded-xl border border-slate-600 bg-slate-800">
        <p class="text-[10px] uppercase font-black text-blue-300">${step.owner || "Advisor"}</p>
        <p class="text-sm font-bold text-white mt-1">${step.step}</p>
        <p class="text-xs text-slate-300 mt-1">Target: ${step.target || step.impact || "N/A"}</p>
        <p class="text-[10px] text-slate-400 mt-2">Delta: ${step.delta || "N/A"} | Timeline: ${step.timeline_days || 7} days</p>
      </div>
    `,
      )
      .join("");

    const avgTimeline =
      plan.reduce((acc, row) => acc + Number(row.timeline_days || 7), 0) /
      Math.max(1, plan.length);
    const riskGap = Math.max(
      0,
      Number(data.current_risk || 0) - Number(data.target_threshold || 0),
    );
    const feasibility = Math.max(
      40,
      Math.min(96, Math.round(100 - riskGap - avgTimeline * 1.2)),
    );

    if (feasibilityScoreEl) feasibilityScoreEl.innerText = `${feasibility}/100`;
    if (feasibilityNoteEl)
      feasibilityNoteEl.innerText =
        feasibility >= 75
          ? "High feasibility: target band can likely be reached with disciplined execution."
          : feasibility >= 55
            ? "Moderate feasibility: success depends on strict follow-through."
            : "Low feasibility: consider longer timeline or stronger intervention package.";
    if (ownerFocusEl)
      ownerFocusEl.innerText =
        (plan[0] && plan[0].owner) || "Academic Support Unit";
    if (targetGapEl) targetGapEl.innerText = `${riskGap.toFixed(1)} pts`;
    updateForecasterFlow(
      4,
      "Action plan ready. Share owner responsibilities and execution timeline for follow-through.",
    );
  } catch (err) {
    if (narrativeEl)
      narrativeEl.innerText = "Failed to run counterfactual planner.";
    if (planEl) planEl.innerHTML = "";
    if (feasibilityScoreEl) feasibilityScoreEl.innerText = "--";
  }
}

// --- DEAN'S STRATEGIC REPORTS LOGIC ---
async function initReports() {
  try {
    const resp = await fetch(scopedApiUrl(`/dean-analytics`));
    const data = await resp.json();

    const departments = Object.keys(data);
    const passRates = departments.map((d) => data[d].pass_rate);
    const attendances = departments.map((d) => data[d].avg_attendance);
    const scores = departments.map((d) => data[d].avg_score);

    const tbody = document.getElementById("analytics-table-body");
    tbody.innerHTML = "";
    departments.forEach((dept) => {
      const stats = data[dept];
      tbody.innerHTML += `
                <tr class="hover:bg-slate-50 transition">
                    <td class="px-6 py-4 font-bold text-slate-700">${dept.replace("Department of ", "")}</td>
                    <td class="px-6 py-4 text-center font-mono ${stats.avg_attendance < 70 ? "text-red-500 font-bold" : "text-slate-600"}">${stats.avg_attendance}%</td>
                    <td class="px-6 py-4 text-center font-mono">${stats.avg_score}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${stats.pass_rate < 50 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}">${stats.pass_rate}%</span>
                    </td>
                </tr>
            `;
    });

    reportsAnalyticsSnapshot = data;

    if (passRateChartInstance) passRateChartInstance.destroy();
    if (engagementChartInstance) engagementChartInstance.destroy();

    const ctx1 = document.getElementById("passRateChart").getContext("2d");
    passRateChartInstance = new Chart(ctx1, {
      type: "bar",
      data: {
        labels: departments.map((d) => d.replace("Department of ", "")),
        datasets: [
          {
            label: "Pass Rate (%)",
            data: passRates,
            backgroundColor: "rgba(59, 130, 246, 0.8)",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });

    const ctx2 = document.getElementById("engagementChart").getContext("2d");
    engagementChartInstance = new Chart(ctx2, {
      type: "line",
      data: {
        labels: departments.map((d) => d.replace("Department of ", "")),
        datasets: [
          {
            label: "Avg Attendance (%)",
            data: attendances,
            borderColor: "rgba(55, 143, 233, 1)",
            backgroundColor: "rgba(55, 143, 233, 0.2)",
            fill: true,
            tension: 0.4,
          },
          {
            label: "Avg CAT Score (Out of 30/100 scaled)",
            data: scores,
            borderColor: "rgba(10, 102, 194, 1)",
            borderDash: [5, 5],
            tension: 0.4,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
    });

    await Promise.all([
      loadImpactPanel(),
      loadWarRoomFeed(),
      loadModelHealth(),
      loadScenarioLab(),
      loadEquityLens(),
      loadPolicyApprovalGate(),
      loadPerformanceContracts(),
      loadBudgetImpactPlanner(),
      loadEarlyWarningCohorts(),
      loadSemesterUnitCorrelation(),
    ]);
    await generateExecutiveBrief();
    runPolicyPressureSim();
    renderDepartmentSpotlight();
  } catch (err) {
    console.error("Error loading analytics:", err);
    document.getElementById("analytics-table-body").innerHTML =
      `<tr><td colspan="4" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load from database.</td></tr>`;
  }
}

async function initSemesterAnalysis() {
  const summary = document.getElementById("semester-analysis-summary");
  const matrixSummary = document.getElementById("semester-matrix-summary");
  const matrixBody = document.getElementById("semester-matrix-body");
  const nextPass = document.getElementById("semester-next-pass");
  const nextRisk = document.getElementById("semester-next-risk");
  const modeEl = document.getElementById("semester-view-mode");
  const spotlight = document.getElementById("semester-forecast-spotlight");
  const passCanvas = document.getElementById("semesterPassChart");
  const riskCanvas = document.getElementById("semesterRiskChart");
  if (
    !summary ||
    !matrixSummary ||
    !matrixBody ||
    !nextPass ||
    !nextRisk ||
    !modeEl ||
    !spotlight ||
    !passCanvas ||
    !riskCanvas
  ) {
    return;
  }

  try {
    const resp = await fetch(scopedApiUrl(`/wow/semester-analysis?history=5`));
    const data = await resp.json();
    summary.innerText =
      data.summary || "Semester analytics synchronized successfully.";
    modeEl.innerText =
      data.mode === "dean"
        ? "Dean (All Departments)"
        : "CoD (Department Scope)";
    nextPass.innerText = `${Number(data.next_prediction?.predicted_pass_rate || 0).toFixed(1)}%`;
    nextRisk.innerText = `${Number(data.next_prediction?.predicted_risk_proxy || 0).toFixed(1)}%`;

    const rows = [];
    (data.series || []).forEach((series) => {
      (series.rows || []).forEach((row) => {
        rows.push({
          department: series.department,
          ...row,
        });
      });
    });

    matrixSummary.innerText = `${rows.length} semester rows`;
    matrixBody.innerHTML = rows
      .map(
        (r) => `<tr>
          <td class="px-3 py-2">${(r.department || "Unassigned").replace("Department of ", "")}</td>
          <td class="px-3 py-2">${r.semester}</td>
          <td class="px-3 py-2 text-right">${r.avg_attendance}%</td>
          <td class="px-3 py-2 text-right">${r.avg_score}</td>
          <td class="px-3 py-2 text-right">${r.pass_rate}%</td>
          <td class="px-3 py-2 text-right">${r.risk_proxy}%</td>
        </tr>`,
      )
      .join("");
    if (!matrixBody.innerHTML) {
      matrixBody.innerHTML =
        '<tr><td colspan="6" class="px-3 py-4 text-slate-400">No semester rows available.</td></tr>';
    }

    const focus = (data.series || [])[0] || { department: "Scope", rows: [] };
    const labels = (focus.rows || [])
      .map((r) => r.semester)
      .concat([data.next_prediction?.next_semester_label || "NEXT"]);
    const passVals = (focus.rows || [])
      .map((r) => Number(r.pass_rate || 0))
      .concat([Number(data.next_prediction?.predicted_pass_rate || 0)]);
    const riskVals = (focus.rows || [])
      .map((r) => Number(r.risk_proxy || 0))
      .concat([Number(data.next_prediction?.predicted_risk_proxy || 0)]);

    if (semesterPassChartInstance) semesterPassChartInstance.destroy();
    semesterPassChartInstance = new Chart(passCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `${(focus.department || "Scope").replace("Department of ", "")} Pass Rate`,
            data: passVals,
            borderColor: "rgba(16, 185, 129, 1)",
            backgroundColor: "rgba(16, 185, 129, 0.18)",
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });

    if (semesterRiskChartInstance) semesterRiskChartInstance.destroy();
    semesterRiskChartInstance = new Chart(riskCanvas.getContext("2d"), {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: `${(focus.department || "Scope").replace("Department of ", "")} Risk Proxy`,
            data: riskVals,
            borderColor: "rgba(239, 68, 68, 1)",
            backgroundColor: "rgba(239, 68, 68, 0.15)",
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, max: 100 } },
      },
    });

    const deptPred = data.next_prediction?.department_predictions || [];
    spotlight.innerHTML = deptPred.length
      ? deptPred
          .map(
            (p) =>
              `<div class="p-2 rounded border border-slate-700 bg-slate-800"><span class="font-black">${(p.department || "Unassigned").replace("Department of ", "")}</span><span class="float-right text-cyan-200">Pass ${p.predicted_pass_rate}% | Risk ${p.predicted_risk_proxy}%</span></div>`,
          )
          .join("")
      : `<div class="p-2 rounded border border-slate-700 bg-slate-800">${(focus.department || "Scope").replace("Department of ", "")}: Pass ${Number(data.next_prediction?.predicted_pass_rate || 0).toFixed(1)}% | Risk ${Number(data.next_prediction?.predicted_risk_proxy || 0).toFixed(1)}%</div>`;
  } catch (err) {
    summary.innerText = "Failed to load semester analysis.";
    matrixSummary.innerText = "Unavailable";
    matrixBody.innerHTML =
      '<tr><td colspan="6" class="px-3 py-4 text-red-500">Failed to load semester matrix.</td></tr>';
    spotlight.innerHTML =
      '<div class="text-red-300">Forecast spotlight unavailable.</div>';
  }
}

function runPolicyPressureSim() {
  const slider = document.getElementById("policy-slider");
  const scaleLabel = document.getElementById("policy-scale-label");
  const passLift = document.getElementById("policy-pass-lift");
  const riskCut = document.getElementById("policy-risk-cut");
  const summary = document.getElementById("policy-summary");
  if (!slider || !scaleLabel || !passLift || !riskCut || !summary) return;

  const intensity = Number(slider.value);
  scaleLabel.innerText = `${intensity}`;
  const passProjection = Math.round((intensity * 0.18 + 2) * 10) / 10;
  const riskProjection = Math.round((intensity * 0.22 + 3) * 10) / 10;

  passLift.innerText = `+${passProjection}%`;
  riskCut.innerText = `-${riskProjection}%`;
  summary.innerText = `At ${intensity}% execution intensity, the policy engine projects pass-rate lift of ${passProjection}% and risk reduction of ${riskProjection}%.`;
}

function renderDepartmentSpotlight() {
  const root = document.getElementById("dept-spotlight");
  if (!root) return;
  if (!reportsAnalyticsSnapshot) {
    root.innerHTML =
      '<div class="text-xs text-slate-400">No analytics snapshot available.</div>';
    return;
  }

  const entries = Object.entries(reportsAnalyticsSnapshot).map(
    ([dept, stats]) => ({
      dept,
      passRate: Number(stats.pass_rate),
      attendance: Number(stats.avg_attendance),
      score: Number(stats.avg_score),
    }),
  );
  if (!entries.length) {
    root.innerHTML =
      '<div class="text-xs text-slate-400">Insufficient department data.</div>';
    return;
  }

  const best = [...entries].sort((a, b) => b.passRate - a.passRate)[0];
  const watch = [...entries].sort((a, b) => a.passRate - b.passRate)[0];

  root.innerHTML = `
    <div class="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
      <p class="text-[10px] uppercase font-black text-emerald-300">Top Performer</p>
      <p class="text-sm font-black mt-1">${best.dept}</p>
      <p class="text-[11px] text-slate-200 mt-1">Pass ${best.passRate}% | Attendance ${best.attendance}%</p>
    </div>
    <div class="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
      <p class="text-[10px] uppercase font-black text-red-300">Needs Immediate Focus</p>
      <p class="text-sm font-black mt-1">${watch.dept}</p>
      <p class="text-[11px] text-slate-200 mt-1">Pass ${watch.passRate}% | Attendance ${watch.attendance}%</p>
    </div>
  `;
}

async function loadPolicyApprovalGate() {
  const badge = document.getElementById("policy-gate-badge");
  const summary = document.getElementById("policy-gate-summary");
  const reasons = document.getElementById("policy-gate-reasons");
  if (!badge || !summary || !reasons) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/dean-policy-gate`));
    const data = await resp.json();
    badge.innerText = data.approved ? "APPROVED" : "HOLD";
    badge.className = `text-[10px] px-3 py-1 rounded-full font-black uppercase ${data.approved ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`;
    summary.innerText = `Stability ${data.stability}% | Fairness watch ${data.fairness_watch_count}`;
    reasons.innerHTML = (data.reasons || [])
      .map(
        (r) =>
          `<div class="p-2 rounded border border-slate-200 bg-slate-50">${r}</div>`,
      )
      .join("");
  } catch (err) {
    badge.innerText = "UNAVAILABLE";
    summary.innerText = "Policy gate unavailable.";
    reasons.innerHTML = "";
  }
}

async function loadPerformanceContracts() {
  const root = document.getElementById("performance-contracts");
  if (!root) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/dean-performance-contracts`));
    const data = await resp.json();
    root.innerHTML = (data.rows || [])
      .map(
        (r) =>
          `<div class="p-2 rounded border ${r.status === "escalate" ? "border-red-500 bg-red-500/10" : "border-emerald-500 bg-emerald-500/10"}"><p class="font-black">${r.department}</p><p class="text-[11px] mt-1">Pass ${r.actual_pass_rate}% / ${r.target_pass_rate}% target | SLA ${r.actual_sla}%</p></div>`,
      )
      .join("");
    if (!root.innerHTML)
      root.innerHTML = '<div class="text-slate-400">No contract rows.</div>';
  } catch (err) {
    root.innerHTML =
      '<div class="text-red-300">Failed to load contracts.</div>';
  }
}

async function loadBudgetImpactPlanner() {
  const root = document.getElementById("budget-impact-planner");
  if (!root) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/dean-budget-impact-planner`));
    const data = await resp.json();
    root.innerHTML = (data.rows || [])
      .slice(0, 6)
      .map(
        (r) =>
          `<div class="p-2 rounded border border-slate-200 bg-slate-50"><p class="font-black text-slate-700">${r.intervention}</p><p class="text-[11px] text-slate-500 mt-1">$${r.estimated_cost_usd} | Lift/$100 ${r.pass_lift_per_100_usd} | Lift/hr ${r.pass_lift_per_advisor_hour}</p></div>`,
      )
      .join("");
    if (!root.innerHTML)
      root.innerHTML = '<div class="text-slate-400">No budget data yet.</div>';
  } catch (err) {
    root.innerHTML =
      '<div class="text-red-500">Failed to load budget planner.</div>';
  }
}

async function loadEarlyWarningCohorts() {
  const root = document.getElementById("cohort-alerts");
  if (!root) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/early-warning-cohort-alerts`));
    const data = await resp.json();
    root.innerHTML = (data.alerts || [])
      .slice(0, 8)
      .map(
        (a) =>
          `<div class="p-2 rounded border ${a.severity === "critical" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}"><p class="font-black text-slate-700">${a.program}</p><p class="text-[11px] text-slate-600 mt-1">${a.department} | ${a.semester} | Risk ${a.avg_risk}% | Fail ${a.fail_rate}%</p></div>`,
      )
      .join("");
    if (!root.innerHTML)
      root.innerHTML = '<div class="text-slate-400">No cohort alerts.</div>';
  } catch (err) {
    root.innerHTML =
      '<div class="text-red-500">Failed to load cohort alerts.</div>';
  }
}

async function loadSemesterUnitCorrelation() {
  const summary = document.getElementById("correlation-summary");
  const table = document.getElementById("correlation-matrix");
  if (!summary || !table) return;
  try {
    const resp = await fetch(
      scopedApiUrl(`/wow/semester-unit-lecturer-correlation`),
    );
    const data = await resp.json();
    summary.innerText = `${(data.rows || []).length} slices`;
    table.innerHTML = (data.rows || [])
      .slice(0, 16)
      .map(
        (r) =>
          `<tr><td class="px-3 py-2">${r.department.replace("Department of ", "")}</td><td class="px-3 py-2">${r.semester}</td><td class="px-3 py-2">${r.course_code} - ${r.course_name}</td><td class="px-3 py-2">${r.lecturer}</td><td class="px-3 py-2 text-right">${r.avg_attendance}%</td><td class="px-3 py-2 text-right">${r.pass_rate}%</td><td class="px-3 py-2 text-right">${r.risk_proxy}%</td></tr>`,
      )
      .join("");
    if (!table.innerHTML) {
      table.innerHTML =
        '<tr><td colspan="7" class="px-3 py-4 text-slate-400">No correlation rows available.</td></tr>';
    }
  } catch (err) {
    summary.innerText = "Unavailable";
    table.innerHTML =
      '<tr><td colspan="7" class="px-3 py-4 text-red-500">Failed to load correlation matrix.</td></tr>';
  }
}

async function loadImpactPanel() {
  try {
    const resp = await fetch(scopedApiUrl(`/wow/impact-panel`));
    const data = await resp.json();
    if (!data.kpis) return;

    document.getElementById("impact-total").innerText = data.kpis.cases_total;
    document.getElementById("impact-resolved").innerText =
      data.kpis.cases_resolved;
    document.getElementById("impact-efficiency").innerText =
      `${data.kpis.execution_efficiency}%`;

    document.getElementById("impact-baseline").innerText =
      data.before_after.baseline_risk_proxy;
    document.getElementById("impact-current").innerText =
      data.before_after.current_risk_proxy;
    const confidenceEl = document.getElementById("impact-confidence");
    if (confidenceEl)
      confidenceEl.innerText = `${Math.round((data.before_after.confidence || 0) * 100)}%`;
    document.getElementById("impact-baseline-bar").style.width =
      `${data.before_after.baseline_risk_proxy}%`;
    document.getElementById("impact-current-bar").style.width =
      `${data.before_after.current_risk_proxy}%`;
    document.getElementById("impact-narrative").innerText =
      `${data.before_after.narrative} ${data.before_after.confidence_window || ""} (confidence ${Math.round((data.before_after.confidence || 0) * 100)}%).`;
  } catch (err) {
    console.error("Could not load impact panel.");
  }
}

async function loadImpactTrend() {
  const canvas = document.getElementById("impact-trend-chart");
  const note = document.getElementById("impact-trend-note");
  if (!canvas) return;

  try {
    const resp = await fetch(scopedApiUrl(`/wow/impact-trend`));
    const data = await resp.json();
    const points = data.trend_window || [];
    if (note) {
      note.innerText = `Trend confidence ${Math.round((data.confidence || 0) * 100)}% | ${data.confidence_window || "No window"}`;
    }

    if (impactTrendChartInstance) impactTrendChartInstance.destroy();
    impactTrendChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: points.map((p) => p.label),
        datasets: [
          {
            label: "Baseline Risk Proxy",
            data: points.map((p) => p.baseline),
            borderColor: "rgba(148, 163, 184, 1)",
            borderDash: [6, 4],
            tension: 0.35,
          },
          {
            label: "Current Risk Proxy",
            data: points.map((p) => p.current),
            borderColor: "rgba(10, 102, 194, 1)",
            backgroundColor: "rgba(10, 102, 194, 0.14)",
            fill: true,
            tension: 0.35,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { usePointStyle: true } },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            title: { display: true, text: "Risk Proxy" },
          },
        },
      },
    });
  } catch (err) {
    if (note) note.innerText = "Impact trend unavailable.";
  }
}

async function loadWarRoomFeed() {
  try {
    const resp = await fetch(scopedApiUrl(`/wow/war-room`));
    const data = await resp.json();
    if (!data.lane_pressure) return;

    document.getElementById("warroom-headline").innerText = data.headline;
    document.getElementById("lane-new").innerText = data.lane_pressure.new;
    document.getElementById("lane-progress").innerText =
      data.lane_pressure.in_progress;
    document.getElementById("lane-resolved").innerText =
      data.lane_pressure.resolved;

    const casesEl = document.getElementById("warroom-cases");
    if (!casesEl) return;
    if (!data.urgent_cases || data.urgent_cases.length === 0) {
      casesEl.innerHTML =
        '<div class="text-xs text-slate-400">No urgent cases currently.</div>';
      return;
    }

    casesEl.innerHTML = data.urgent_cases
      .map(
        (c) => `
        <div class="bg-slate-800 border border-slate-700 rounded-lg p-3">
          <div class="flex justify-between items-center">
            <span class="text-xs font-black text-white">${c.reg_no}</span>
            <span class="text-[10px] uppercase font-black text-red-300">${c.priority}</span>
          </div>
          <p class="text-[11px] text-slate-300 mt-1">${c.action_name}</p>
          <p class="text-[10px] text-slate-400 mt-1">Owner: ${c.owner} | Status: ${c.status}</p>
        </div>
      `,
      )
      .join("");
  } catch (err) {
    console.error("Could not load war room feed.");
  }
}

async function loadModelHealth() {
  const root = document.getElementById("model-health");
  if (!root) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/model-health`));
    const data = await resp.json();
    if (data.error) {
      root.innerHTML = `<div class="text-xs text-red-500">${data.error}</div>`;
      return;
    }
    root.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100"><p class="text-[10px] uppercase font-black text-slate-400">Attendance Drift</p><p class="text-lg font-black text-slate-800">${data.drift.attendance_drift}%</p></div>
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100"><p class="text-[10px] uppercase font-black text-slate-400">CAT Drift</p><p class="text-lg font-black text-slate-800">${data.drift.cat_drift}%</p></div>
        <div class="p-3 rounded-lg bg-slate-50 border border-slate-100"><p class="text-[10px] uppercase font-black text-slate-400">Failure Drift</p><p class="text-lg font-black text-slate-800">${data.drift.failure_rate_drift}%</p></div>
      </div>
      <div class="p-3 rounded-lg border border-cyan-200 bg-cyan-50 mt-3">
        <p class="text-[10px] uppercase font-black text-cyan-700">Prediction Stability</p>
        <p class="text-2xl font-black text-cyan-800">${data.prediction_stability}%</p>
        <p class="text-xs text-slate-600 mt-1">${data.recommendation}</p>
      </div>
    `;
  } catch (err) {
    root.innerHTML =
      '<div class="text-xs text-red-500">Model health monitor unavailable.</div>';
  }
}

async function loadScenarioLab() {
  const note = document.getElementById("scenario-lab-note");
  const canvas = document.getElementById("scenarioLabChart");
  if (!canvas) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/dean-scenario-lab`));
    const data = await resp.json();
    if (note) note.innerText = data.board_note || "Scenario lab synchronized.";

    if (scenarioLabChartInstance) scenarioLabChartInstance.destroy();
    const datasets = (data.scenarios || []).map((s, idx) => {
      const color = idx === 0 ? "#64748b" : idx === 1 ? "#0ea5e9" : "#ef4444";
      return {
        label: `${s.name} (${s.intensity}%)`,
        data: s.semester_delta,
        borderColor: color,
        backgroundColor: `${color}33`,
        tension: 0.35,
        fill: idx > 0,
      };
    });

    scenarioLabChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: data.semesters || ["S1", "S2", "S3", "S4"],
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { boxWidth: 10 } } },
        scales: {
          y: {
            beginAtZero: true,
            title: { display: true, text: "Pass-rate delta (%)" },
          },
        },
      },
    });
  } catch (err) {
    if (note) note.innerText = "Scenario lab unavailable.";
  }
}

async function loadEquityLens() {
  const root = document.getElementById("equity-lens");
  const summary = document.getElementById("equity-summary");
  if (!root || !summary) return;
  try {
    const resp = await fetch(scopedApiUrl(`/wow/equity-lens`));
    const data = await resp.json();
    summary.innerText = data.summary || "Equity lens synced.";
    if (!data.rows || !data.rows.length) {
      root.innerHTML =
        '<div class="text-xs text-slate-400">No equity rows available.</div>';
      return;
    }
    root.innerHTML = data.rows
      .slice(0, 8)
      .map((row) => {
        const cls =
          row.fairness_flag === "watch"
            ? "border-amber-500 bg-amber-500/10"
            : "border-emerald-500 bg-emerald-500/10";
        return `
          <div class="p-2 rounded border ${cls}">
            <p class="text-xs font-black text-white">${row.department} | ${row.program} | ${row.semester}</p>
            <p class="text-[10px] text-slate-300 mt-1">Risk ${row.avg_risk}% | Pass ${row.pass_rate}% | ${row.fairness_flag.toUpperCase()}</p>
          </div>
        `;
      })
      .join("");
  } catch (err) {
    summary.innerText = "Equity lens unavailable.";
    root.innerHTML =
      '<div class="text-xs text-red-400">Failed to load equity lens.</div>';
  }
}

async function generateExecutiveBrief() {
  const headline = document.getElementById("memo-headline");
  const textarea = document.getElementById("memo-content");
  if (!headline || !textarea) return;
  headline.innerText = "Generating executive memo...";

  try {
    const resp = await fetch(scopedApiUrl(`/wow/executive-brief`));
    const data = await resp.json();
    headline.innerText = data.headline || "Executive memo ready.";
    textarea.value = data.memo_text || "No memo content returned.";
    const briefingHeadline = document.getElementById("briefing-headline");
    const briefingSubject = document.getElementById("briefing-subject");
    if (briefingHeadline)
      briefingHeadline.innerText = data.headline || "Executive brief ready.";
    if (briefingSubject)
      briefingSubject.innerText = data.email_subject || "Leadership brief";
  } catch (err) {
    headline.innerText = "Failed to generate executive memo.";
  }
}

function cycleExecutiveBriefTone() {
  const themes = [
    {
      cls: ["border-blue-200", "bg-blue-50", "text-blue-700"],
      label: "Leadership-ready",
    },
    {
      cls: ["border-emerald-200", "bg-emerald-50", "text-emerald-700"],
      label: "Impact-positive",
    },
    {
      cls: ["border-slate-200", "bg-slate-50", "text-slate-700"],
      label: "Evidence-first",
    },
  ];
  executiveBriefToneIndex = (executiveBriefToneIndex + 1) % themes.length;
  const theme = themes[executiveBriefToneIndex];
  const badge = document.getElementById("briefing-tone-badge");
  const panels = document.querySelectorAll(".briefing-tone-panel");
  if (badge) badge.innerText = theme.label;
  panels.forEach((panel) => {
    panel.classList.remove(
      "border-blue-200",
      "bg-blue-50",
      "text-blue-700",
      "border-emerald-200",
      "bg-emerald-50",
      "text-emerald-700",
      "border-slate-200",
      "bg-slate-50",
      "text-slate-700",
    );
    panel.classList.add(...theme.cls);
  });
}

async function copyExecutiveMemo() {
  const memo = document.getElementById("briefing-memo");
  const status = document.getElementById("briefing-copy-status");
  if (!memo || !memo.value) return;
  try {
    await navigator.clipboard.writeText(memo.value);
    if (status) status.innerText = "Memo copied to clipboard.";
  } catch (err) {
    if (status) status.innerText = "Copy failed. Use the memo field manually.";
  }
}

async function initBriefing() {
  await Promise.all([
    loadBriefingCenter(),
    loadImpactTrend(),
    loadImpactPanel(),
  ]);
}

async function loadBriefingCenter() {
  const memo = document.getElementById("briefing-memo");
  const headline = document.getElementById("briefing-headline");
  const subject = document.getElementById("briefing-subject");
  const status = document.getElementById("briefing-copy-status");
  const packEl = document.getElementById("briefing-pack");
  const snapshotEl = document.getElementById("briefing-snapshot");
  if (!memo || !headline || !subject || !packEl || !snapshotEl) return;

  headline.innerText = "Loading leadership briefing...";
  if (status) status.innerText = "Syncing live executive evidence...";

  try {
    const [briefResp, impactResp, modelResp, slaResp] = await Promise.all([
      fetch(scopedApiUrl(`/wow/executive-brief`)),
      fetch(scopedApiUrl(`/wow/impact-panel`)),
      fetch(scopedApiUrl(`/wow/model-health`)),
      fetch(scopedApiUrl(`/wow/sla-intelligence`)),
    ]);
    const brief = await briefResp.json();
    const impact = await impactResp.json();
    const model = await modelResp.json();
    const sla = await slaResp.json();

    headline.innerText = brief.headline || "Executive brief ready.";
    subject.innerText = brief.email_subject || "Leadership brief";
    memo.value = brief.memo_text || "No memo content returned.";

    const currentRisk = impact.before_after?.current_risk_proxy ?? "--";
    const confidence = Math.round((impact.before_after?.confidence || 0) * 100);
    const efficiency = impact.kpis?.execution_efficiency ?? 0;
    const breach = sla.likely_breach_48h || 0;

    snapshotEl.innerHTML = `
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="p-4 rounded-xl border border-blue-200 bg-blue-50 briefing-tone-panel">
          <p class="text-[10px] font-black uppercase text-blue-700">Current Risk Proxy</p>
          <p class="text-3xl font-black text-slate-800 mt-1">${currentRisk}</p>
          <p class="text-[11px] text-slate-600 mt-1">Used in the board memo and impact board.</p>
        </div>
        <div class="p-4 rounded-xl border border-emerald-200 bg-emerald-50 briefing-tone-panel">
          <p class="text-[10px] font-black uppercase text-emerald-700">Execution Efficiency</p>
          <p class="text-3xl font-black text-slate-800 mt-1">${efficiency}%</p>
          <p class="text-[11px] text-slate-600 mt-1">Higher is better for sustained intervention closure.</p>
        </div>
        <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 briefing-tone-panel">
          <p class="text-[10px] font-black uppercase text-slate-700">Confidence Window</p>
          <p class="text-3xl font-black text-slate-800 mt-1">${confidence}%</p>
          <p class="text-[11px] text-slate-600 mt-1">Model and intervention confidence for leadership use.</p>
        </div>
        <div class="p-4 rounded-xl border border-blue-200 bg-blue-50 briefing-tone-panel">
          <p class="text-[10px] font-black uppercase text-blue-700">SLA Watch</p>
          <p class="text-3xl font-black text-slate-800 mt-1">${breach}</p>
          <p class="text-[11px] text-slate-600 mt-1">High-priority cases likely to miss SLA in 48h.</p>
        </div>
      </div>
    `;

    packEl.innerHTML = `
      <div class="p-4 rounded-xl border border-slate-200 bg-slate-50 briefing-tone-panel">
        <p class="text-[10px] font-black uppercase text-slate-500">Ready to Export</p>
        <div class="flex flex-wrap gap-2 mt-2">
          <button onclick="downloadDeanReport()" class="px-3 py-2 rounded-lg bg-blue-700 text-white text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition">Export PDF</button>
          <button onclick="copyExecutiveMemo()" class="px-3 py-2 rounded-lg bg-white border border-slate-200 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition">Copy Memo</button>
          <button onclick="generateExecutiveBrief()" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition">Refresh Brief</button>
          <button onclick="cycleExecutiveBriefTone()" class="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition">Cycle View Tone</button>
        </div>
        <p class="text-[11px] text-slate-500 mt-3">${status?.innerText || "Ready for briefing export."}</p>
      </div>
    `;
  } catch (err) {
    headline.innerText = "Briefing load failed.";
    memo.value = "Unable to load executive brief.";
    if (status) status.innerText = "Data source unavailable.";
  }
}

async function initImpact() {
  await Promise.all([
    loadImpactPanel(),
    loadImpactTrend(),
    generateExecutiveBrief(),
  ]);
}

async function initModelWatch() {
  await Promise.all([loadModelHealth(), loadScenarioLab(), loadEquityLens()]);
}

async function initWarRoom() {
  await Promise.all([
    refreshWorkflowBoard(),
    refreshEscalationRadar(),
    loadGovernanceTrail(),
    loadSLAIntelligence(),
  ]);
}

// --- PDF EXPORT LOGIC ---
function downloadDeanReport() {
  const element = document.getElementById("pdf-report-content");
  const btnText = document.getElementById("export-btn-text");
  const originalText = btnText.innerText;

  btnText.innerText = "GENERATING PDF...";

  const opt = {
    margin: [0.5, 0.5, 0.5, 0.5],
    filename: "MUST_SCI_Strategic_Report.pdf",
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: "in", format: "a4", orientation: "landscape" },
  };

  html2pdf()
    .set(opt)
    .from(element)
    .save()
    .then(() => {
      btnText.innerText = originalText;
    });
}
