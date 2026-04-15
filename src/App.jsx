import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";


// 工具函数
// eslint-disable-next-line no-unused-vars
function packLanes(items, getStart, getEnd) {
  // items: Array
  const sorted = [...items].sort(
    (a, b) => +new Date(getStart(a)) - +new Date(getStart(b))
  );
  const lanesEnd = [];
  const placed = [];

  for (const it of sorted) {
    const s = +new Date(getStart(it));
    const e = +new Date(getEnd(it));
    let lane = 0;
    while (lane < lanesEnd.length && s < lanesEnd[lane]) lane++;
    lanesEnd[lane] = Math.max(lanesEnd[lane] || 0, e);
    placed.push({ item: it, lane });
  }

  return { placed, lanes: lanesEnd.length };
}

const tz = "Asia/Shanghai"; // 北京时间
// 安全格式化：无效时间返回 "—"
const df = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false, timeZone: tz,
  }).format(dt);
};
// 分钟转时:分:秒
// eslint-disable-next-line no-unused-vars
function formatHMS(mins) {
  const totalSec = Math.floor(mins * 60);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function phaseElapsedSeconds(tasks, phase, currentTime) {
  const now = currentTime || Date.now();

  // 找到该阶段所有已开始的任务（ongoing 或 done）
  const startedTasks = tasks.filter((t) => t.phase === phase && t.actualStart);

  if (startedTasks.length === 0) return 0;

  // 找到最早开始的任务
  const earliestStart = Math.min(
    ...startedTasks.map(t => new Date(t.actualStart).getTime())
  );

  // 计算从最早开始时间到现在的时间差
  const diff = Math.floor((now - earliestStart) / 1000);
  return Math.max(0, diff);
}
function formatSecHMS(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}
function toISOLocal(s) {
  if (!s) return ""; // 空就返回空，避免无效时间

  // 将输入转为字符串（处理 Excel 数字格式）
  const str = String(s).trim();
  console.log('toISOLocal input:', str);

  // 处理 "YYYY-M-D HH:mm" 或 "YYYY-MM-DD HH:mm" 这类（支持单位数月日）
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(str)) {
    // 标准化：将单位数月日补零
    const normalized = str.replace(/^(\d{4})-(\d{1,2})-(\d{1,2})/, (match, year, month, day) => {
      const paddedMonth = month.padStart(2, '0');
      const paddedDay = day.padStart(2, '0');
      return `${year}-${paddedMonth}-${paddedDay}`;
    });

    const norm = normalized.replace(/\//g, "-");
    console.log('toISOLocal normalized:', norm);

    // 不添加 Z 后缀，让时间按本地时间解析
    const isoStr = norm.replace(" ", "T") + (/:\d{2}$/.test(norm) ? ":00" : ":00:00");
    console.log('toISOLocal isoStr:', isoStr);

    const dt = new Date(isoStr);
    console.log('toISOLocal Date object:', dt.toString());
    console.log('toISOLocal result:', dt.toISOString());

    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }

  // 已经是 ISO 或可被 Date 解析的字符串
  const direct = new Date(str);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();

  // 兜底：返回空，交由上层判断
  return "";
}

// 把 ISO（或任何可被 Date 解析的字符串）转为 datetime-local 需要的本地格式：YYYY-MM-DDTHH:mm
function isoToInputLocal(iso) {
  if (!iso || iso === "null" || iso === "undefined") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  return `${y}-${m}-${day}T${hh}:${mm}`;
}

// 把 datetime-local 的本地字符串转回标准 ISO（带 Z）
function inputLocalToISO(s) {
  if (!s || s.trim() === "") return "";
  const d = new Date(s); // 这里会按本地时区解析
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}


function minutesBetween(aISO, bISO) {
  const a = new Date(aISO);
  const b = new Date(bISO);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 60000);
}

// 精确计算两个时间之间的秒数差
function secondsBetween(aISO, bISO) {
  const a = new Date(aISO);
  const b = new Date(bISO);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 1000);
}

// 基于秒数格式化时:分:秒
function formatHMSFromSeconds(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

function addMinutes(iso, mins) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return ""; 
  const t = base.getTime() + (mins || 0) * 60000;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function smartSplit(line) {
  const out = []; let cur = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = (key) => header.findIndex((h) => h === key);
  const r = [];
  for (let i = 1; i < lines.length; i++) {
    const row = smartSplit(lines[i]);
    const get = (k) => { const j = idx(k); return j >= 0 ? row[j]?.trim?.() : ""; };
    const id = get("序号") || get("id") || String(i);
    const phase = get("阶段") || "未分组";
    const name = get("工作项") || get("名称") || `任务${id}`;
    const est = Number(get("预计耗时(分钟)") || get("预计耗时") || get("estMinutes") || 0);
    const planStart = toISOLocal(get("计划开始") || get("计划开始时间") || get("planStart") || new Date().toISOString());
    const planEndRaw = get("计划结束") || get("计划结束时间") || get("planEnd");
    const planEnd = planEndRaw
  ? toISOLocal(planEndRaw)
  : (addMinutes(planStart, est || 60) || planStart || new Date().toISOString());
    const leader = get("牵头人") || get("leader");
	const executor = get("执行人") || get("owner");
	const checker  = get("检查人") || get("checker");
    const dep = (get("依赖") || get("dependsOn") || "").split(/[,，]/).map(s=>s.trim()).filter(Boolean);
    r.push({
	  id,
	  phase,
	  name,
	  estMinutes: est || minutesBetween(planStart, planEnd),
	  planStart,
	  planEnd,
	  leader,
	  owner: executor,
	  checker,
	  dependsOn: dep,
	  status: "planned"
	});
  }
  return r;
}
function scheduleTasks(tasks) {
  const map = new Map(tasks.map((t) => [t.id, { ...t }]));
  const earliestStart = (t, stack = new Set()) => {
    if (!t.dependsOn || t.dependsOn.length === 0) return t.planStart;
    if (stack.has(t.id)) return t.planStart; // 循环依赖保护
    stack.add(t.id);
    const depsEnd = t.dependsOn
  .map((d) => map.get(d))
  .filter(Boolean)
  .map((dt) => {
    const cand = dt.actualEnd || dt.planEnd || "";
    return Number.isNaN(new Date(cand).getTime()) ? "" : cand;
  })
  .filter(Boolean);
const base = Number.isNaN(new Date(t.planStart).getTime()) ? new Date().toISOString() : t.planStart;
const maxEnd = depsEnd.length
  ? depsEnd.reduce((acc, cur) => (new Date(cur).getTime() > new Date(acc).getTime() ? cur : acc), depsEnd[0])
  : base;

    // 返回计划开始时间和依赖结束时间中较晚的那个
    // 如果计划开始时间本身就晚于依赖结束时间，则使用计划开始时间
    const planStartTime = new Date(base).getTime();
    const maxEndTime = new Date(maxEnd).getTime();
    return planStartTime > maxEndTime ? base : maxEnd;
  };
  const res = tasks.map((t) => ({ ...t }));
  for (const t of res) t.scheduledStart = earliestStart(t);
  return res;
}
// eslint-disable-next-line no-unused-vars
function phaseProgress(tasks, phase) {
  const list = tasks.filter((t) => t.phase === phase);
  if (list.length === 0) return 0;
  const done = list.filter((t) => t.status === "done").length;
  return Math.round((done / list.length) * 100);
}

export default function App() {
	// 是否显示"配置区"（与大屏分离）
	const [showConfig, setShowConfig] = useState(false);

	// 庆功页开关
	const [showCongrats, setShowCongrats] = useState(false);

	// 烟花粒子状态
	const [rockets, setRockets] = useState([]); // 火箭状态（需要DOM渲染）
	const rocketsRef = useRef([]); // 火箭ref，减少更新频率
	const particlesRef = useRef([]); // 存储粒子数据，避免频繁state更新
	const canvasRef = useRef(null); // Canvas引用，用于绘制烟花拖尾效果

	// 甘特图全屏状态
	const [ganttFullscreen, setGanttFullscreen] = useState(false);

	// 全屏时的自适应缩放
	const [autoFitZoom, setAutoFitZoom] = useState(false);

	// 甘特图容器引用，用于全屏时的尺寸计算
	const ganttContainerRef = useRef(null);

	// 即将开始任务提醒开关
	const [enableUpcomingAlert, setEnableUpcomingAlert] = useState(() => {
		const saved = localStorage.getItem("ioa_enable_upcoming_alert");
		return saved !== null ? JSON.parse(saved) : true; // 默认开启
	});

	// 已完成任务超时效果显示开关
	const [hideCompletedOverdue, setHideCompletedOverdue] = useState(() => {
		const saved = localStorage.getItem("ioa_hide_completed_overdue");
		return saved !== null ? JSON.parse(saved) : false; // 默认显示超时效果
	});

	// 操作记录折叠状态
	const [logsCollapsed, setLogsCollapsed] = useState(() => {
		const saved = localStorage.getItem("ioa_logs_collapsed");
		return saved !== null ? JSON.parse(saved) : false; // 默认展开
	});

	// 模拟时间模式（用于演示）
	const [demoTimeEnabled, setDemoTimeEnabled] = useState(() => {
		const saved = localStorage.getItem("ioa_demo_time_enabled");
		return saved !== null ? JSON.parse(saved) : false;
	});
	const [demoTime, setDemoTime] = useState(() => {
		const saved = localStorage.getItem("ioa_demo_time");
		return saved || new Date().toISOString();
	});

	// 已记录过风险/提前的任务，避免重复刷日志
	const riskLoggedRef = useRef(new Set());
	const earlyLoggedRef = useRef(new Set());

	// 记录已经提醒过的即将开始任务，避免重复提醒
	const notifiedTasksRef = useRef(new Set());

	// 记录是否已经自动触发过庆功，避免重复触发
	const autoCongratsTriggeredRef = useRef(false);

	// 甘特图滚动容器引用，用于定位功能
	const ganttScrollRef = useRef(null);

	// 甘特图滚动位置（用于日期标签的sticky效果）
	const [ganttScrollLeft, setGanttScrollLeft] = useState(0);

	// 任务详情弹窗状态
	const [selectedTask, setSelectedTask] = useState(null);

	// 搜索和筛选状态
	const [searchQuery, setSearchQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");

	// 获取当前时间（演示模式或真实时间）
	const getCurrentTime = () => {
		return demoTimeEnabled ? new Date(demoTime) : new Date();
	};
	const getCurrentTimeISO = () => {
		return demoTimeEnabled ? demoTime : new Date().toISOString();
	};

	// 计算任务的 ETA（基于 actualStart + estMinutes），返回 ISO 字符串；无起始则返回 ""
	function calcETA(task) {
	  if (!task.actualStart) return "";
	  const minutes = Number(task.estMinutes || 0) || minutesBetween(task.planStart, task.planEnd);
	  if (!minutes) return "";
	  return addMinutes(task.actualStart, minutes);
	}

	// 判断是否延期风险：剩余时间小于15分钟（用于当前任务卡片提示）
	function isDelayRisk(task) {
	  // 已完成的任务不判断延期风险
	  if (task.status !== "ongoing") return false;

	  // 计算剩余时间：当前时间距离计划结束时间
	  if (!task.planEnd) return false;

	  const now = getCurrentTimeISO();
	  const remainingMin = minutesBetween(now, task.planEnd);

	  // 剩余时间小于15分钟时触发预警
	  return remainingMin < 15;
	}

	// 判断是否已超时：超过计划结束时间（用于甘特图任务条颜色）
	function isOverdue(task) {
	  // 已完成的任务不判断超时
	  if (task.status !== "ongoing") return false;

	  // 计算是否超过计划结束时间
	  if (!task.planEnd) return false;

	  const now = getCurrentTimeISO();
	  const remainingMin = minutesBetween(now, task.planEnd);

	  // 剩余时间为负数表示已超时
	  return remainingMin < 0;
	}

	// 判断任务是否提前开始
	function isEarlyStart(task) {
	  if (!task.actualStart) return false;
	  return new Date(task.actualStart).getTime() < new Date(task.planStart).getTime();
	}

	// 判断已完成的任务是否超时完成
	function isCompletedOverdue(task) {
	  // 只检查已完成的任务
	  if (task.status !== "done") return false;

	  // 需要有实际结束时间和计划结束时间
	  if (!task.actualEnd || !task.planEnd) return false;

	  // 比较实际结束时间是否晚于计划结束时间
	  return new Date(task.actualEnd).getTime() > new Date(task.planEnd).getTime();
	}

	// 定位到当前进行中的任务
	function scrollToCurrentTask() {
	  const ongoingTask = scheduled.find(t => t.status === "ongoing");
	  if (!ongoingTask || !ganttScrollRef.current) return;

	  const start = ongoingTask.actualStart || ongoingTask.scheduledStart || ongoingTask.planStart;
	  const leftPx = toLeftPx(start);

	  // 滚动到任务位置，偏移一些距离使其居中显示
	  ganttScrollRef.current.scrollLeft = Math.max(0, leftPx - 200);
	}

	// 定位到当前时间
	function scrollToNow() {
	  if (!ganttScrollRef.current) return;
	  const nowPx = toLeftPx(getCurrentTimeISO());
	  ganttScrollRef.current.scrollLeft = Math.max(0, nowPx - 200);
	}

	// 绘制依赖关系连线的SVG路径
	// eslint-disable-next-line no-unused-vars
	function renderDependencyLines(phaseTasks, phaseIndex) {
	  const lines = [];

	  phaseTasks.forEach((task, taskIndex) => {
	    if (!task.dependsOn || task.dependsOn.length === 0) return;

	    task.dependsOn.forEach(depId => {
	      const depTask = scheduled.find(t => t.id === depId);
	      if (!depTask) return;

	      // 找到依赖任务在哪个阶段
	      const depPhaseIndex = phases.findIndex(ph => ph === depTask.phase);
	      const depTaskIndex = scheduled.filter(t => t.phase === depTask.phase).findIndex(t => t.id === depId);

	      const startX = toLeftPx(depTask.actualEnd || depTask.planEnd) + toWidthPx(depTask.actualEnd || depTask.planEnd, depTask.actualEnd || depTask.planEnd);
	      const startY = depPhaseIndex * 150 + 32 + depTaskIndex * 36 + 16; // 计算Y坐标

	      const endX = toLeftPx(task.actualStart || task.scheduledStart || task.planStart);
	      const endY = phaseIndex * 150 + 32 + taskIndex * 36 + 16;

	      lines.push({
	        key: `${depId}-${task.id}`,
	        path: `M${startX},${startY} L${endX},${endY}`,
	        color: depTask.status === "done" ? "#10b981" : "#6b7280"
	      });
	    });
	  });

	  return lines;
	}

	// 检查任务的依赖是否都已完成
	function areDependenciesComplete(task, taskList) {
	  if (!task.dependsOn || task.dependsOn.length === 0) {
	    return { ready: true, blocking: [] };
	  }

	  const blocking = [];
	  for (const depId of task.dependsOn) {
	    const depTask = taskList.find(t => t.id === depId);
	    if (!depTask) {
	      blocking.push({ id: depId, name: '未知任务', status: 'missing' });
	    } else if (depTask.status !== "done") {
	      blocking.push({ id: depId, name: depTask.name, status: depTask.status });
	    }
	  }

	  return { ready: blocking.length === 0, blocking };
	}

	// 获取任务被阻塞的原因描述
	function getBlockingReason(task, taskList) {
	  const { ready, blocking } = areDependenciesComplete(task, taskList);
	  if (ready) return null;

	  if (blocking.length === 1) {
	    const dep = blocking[0];
	    const statusText = dep.status === 'missing' ? '不存在' :
	                      dep.status === 'ongoing' ? '进行中' : '未开始';
	    return `等待 #${dep.id} ${dep.name} (${statusText})`;
	  }

	  return `等待 ${blocking.length} 个前置任务完成`;
	}

  const [windowStartISO, setWindowStartISO] = useState(() => localStorage.getItem("ioa_window_start") || new Date().toISOString());
  const [windowEndISO, setWindowEndISO] = useState(() => {
    const saved = localStorage.getItem("ioa_window_end");
    return saved === null ? "" : saved; // 区分null（未设置）和空字符串（已清空）
  });
  const [countdownMode, setCountdownMode] = useState(() => (localStorage.getItem("ioa_countdown") || "0") === "1");
  const [projectTitle, setProjectTitle] = useState(() => localStorage.getItem("ioa_project_title") || "XXX升级任务");

  const [tasks, setTasks] = useState(() => {
    const saved = localStorage.getItem("ioa_tasks");
    if (saved) return JSON.parse(saved);
    const now = new Date().toISOString();
    return [
      { id: "1", phase: "停机准备", name: "发布停机公告&窗口确认", estMinutes: 30, planStart: addMinutes(now, -60), planEnd: addMinutes(now, -30), owner: "指挥", checker: "PMO", status: "done", actualStart: addMinutes(now, -60), actualEnd: addMinutes(now, -35), actualMinutes: 25 },
      { id: "2", phase: "备份与切换", name: "数据库全量备份", estMinutes: 45, planStart: addMinutes(now, -30), planEnd: addMinutes(now, 15), owner: "DBA", checker: "质保", dependsOn: ["1"], status: "ongoing", actualStart: addMinutes(now, -25) },
      { id: "3", phase: "备份与切换", name: "应用停机&流量切断", estMinutes: 20, planStart: addMinutes(now, -20), planEnd: addMinutes(now, 0), owner: "运维", checker: "安全", dependsOn: ["1"], status: "done", actualStart: addMinutes(now, -18), actualEnd: addMinutes(now, -2), actualMinutes: 16 },
      { id: "4", phase: "升级实施", name: "版本包部署&脚本执行", estMinutes: 60, planStart: addMinutes(now, 5), planEnd: addMinutes(now, 65), owner: "实施", checker: "架构", dependsOn: ["2","3"] },
      { id: "5", phase: "验证与放行", name: "核心用例验证", estMinutes: 40, planStart: addMinutes(now, 65), planEnd: addMinutes(now, 105), owner: "测试", checker: "业务", dependsOn: ["4"] },
    ];
  });
  const [logs, setLogs] = useState(() => JSON.parse(localStorage.getItem("ioa_logs") || "[]"));

  useEffect(() => { localStorage.setItem("ioa_tasks", JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem("ioa_logs", JSON.stringify(logs)); }, [logs]);
  useEffect(() => { localStorage.setItem("ioa_enable_upcoming_alert", JSON.stringify(enableUpcomingAlert)); }, [enableUpcomingAlert]);
  useEffect(() => { localStorage.setItem("ioa_hide_completed_overdue", JSON.stringify(hideCompletedOverdue)); }, [hideCompletedOverdue]);
  useEffect(() => { localStorage.setItem("ioa_logs_collapsed", JSON.stringify(logsCollapsed)); }, [logsCollapsed]);
  useEffect(() => { localStorage.setItem("ioa_demo_time_enabled", JSON.stringify(demoTimeEnabled)); }, [demoTimeEnabled]);
  useEffect(() => { localStorage.setItem("ioa_demo_time", demoTime); }, [demoTime]);
  useEffect(() => {
    localStorage.setItem("ioa_window_start", windowStartISO);
    localStorage.setItem("ioa_window_end", windowEndISO); // 不需要条件判断，空字符串也应该保存
  }, [windowStartISO, windowEndISO]);
  useEffect(() => { localStorage.setItem("ioa_countdown", countdownMode ? "1" : "0"); }, [countdownMode]);
  useEffect(() => { localStorage.setItem("ioa_project_title", projectTitle); }, [projectTitle]);

  const [ticker, setTicker] = useState(0);
	useEffect(() => {
	  const t = setInterval(() => setTicker((v) => v + 1), 1000);
	  return () => clearInterval(t);
	}, []);

  // 自动庆功：当所有任务完成时自动显示庆功页面（只触发一次）
  useEffect(() => {
    if (tasks.length > 0 && tasks.every(t => t.status === "done") && !autoCongratsTriggeredRef.current) {
      autoCongratsTriggeredRef.current = true;
      setShowCongrats(true);
      setLogs((l) => [{ time: new Date().toISOString(), action: "全部完成", detail: "所有任务已完成，升级成功！" }, ...l].slice(0, 300));
    }
  }, [tasks]);

  // 监听甘特图滚动，用于日期标签的sticky效果
  useEffect(() => {
    const scrollContainer = ganttScrollRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      setGanttScrollLeft(scrollContainer.scrollLeft);
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, []);

  // 烟花效果：当庆功页显示时生成烟花
  useEffect(() => {
    if (!showCongrats) {
      setRockets([]);
      rocketsRef.current = [];
      particlesRef.current = [];
      return;
    }

    // 创建音频上下文
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // 播放爆炸音效
    const playExplosionSound = () => {
      // 使用白噪声模拟爆炸
      const bufferSize = audioContext.sampleRate * 0.5;
      const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = audioContext.createBufferSource();
      noise.buffer = buffer;

      const noiseGain = audioContext.createGain();
      const noiseFilter = audioContext.createBiquadFilter();
      noiseFilter.type = 'lowpass';
      noiseFilter.frequency.value = 1000;

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(audioContext.destination);

      // 快速衰减的音量包络
      noiseGain.gain.setValueAtTime(0.3, audioContext.currentTime);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      noise.start(audioContext.currentTime);
      noise.stop(audioContext.currentTime + 0.5);

      // 添加低频"砰"声
      const bass = audioContext.createOscillator();
      const bassGain = audioContext.createGain();

      bass.connect(bassGain);
      bassGain.connect(audioContext.destination);

      bass.frequency.setValueAtTime(80, audioContext.currentTime);
      bass.frequency.exponentialRampToValueAtTime(40, audioContext.currentTime + 0.2);

      bassGain.gain.setValueAtTime(0.4, audioContext.currentTime);
      bassGain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

      bass.start(audioContext.currentTime);
      bass.stop(audioContext.currentTime + 0.2);
    };

    // 生成烟花的函数
    const createFirework = () => {
      const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7', '#a29bfe', '#fd79a8', '#fdcb6e', '#ff9ff3', '#54a0ff'];

      // 围绕中央卡片（约30-70%区域）发射烟花
      // 随机选择发射区域：左侧、右侧、顶部、底部
      const area = Math.random();
      let startX, targetX, targetY;

      if (area < 0.35) {
        // 左侧区域 (35%概率)
        startX = 5 + Math.random() * 20;  // 5-25%
        targetX = startX;
        targetY = 15 + Math.random() * 40; // 15-55%
      } else if (area < 0.7) {
        // 右侧区域 (35%概率)
        startX = 75 + Math.random() * 20; // 75-95%
        targetX = startX;
        targetY = 15 + Math.random() * 40; // 15-55%
      } else if (area < 0.85) {
        // 顶部区域 (15%概率)
        startX = 10 + Math.random() * 80; // 10-90%
        targetX = startX;
        targetY = 10 + Math.random() * 15; // 10-25%
      } else {
        // 底部区域 (15%概率)
        startX = 10 + Math.random() * 80; // 10-90%
        targetX = startX;
        targetY = 60 + Math.random() * 25; // 60-85%
      }

      const color = colors[Math.floor(Math.random() * colors.length)];
      const id = Date.now() + Math.random();
      const hue = Math.random() * 360; // 随机色相

      // 第一阶段：发射火箭
      const rocket = {
        id: `rocket-${id}`,
        type: 'rocket',
        startX,
        startY: 100, // 从底部开始
        targetX,
        targetY,
        color,
        size: 16,
        createdAt: Date.now(),
      };

      rocketsRef.current.push(rocket);

      // 1秒后到达目标位置，爆炸成粒子
      setTimeout(() => {
        // 播放爆炸音效
        playExplosionSound();

        // 移除火箭
        rocketsRef.current = rocketsRef.current.filter(p => p.id !== rocket.id);

        // 创建爆炸粒子 - 直接添加到particlesRef
        const centerX = (targetX / 100) * window.innerWidth;
        const centerY = (targetY / 100) * window.innerHeight;

        // 保持粒子数量以提升性能
        const newParticles = Array.from({ length: 45 }, () => {
          const angle = Math.random() * 360; // 随机角度
          const speed = Math.random() * 10 + 2; // 速度范围：2-12
          const radian = (angle * Math.PI) / 180;

          return {
            x: centerX,
            y: centerY,
            vx: Math.cos(radian) * speed,
            vy: Math.sin(radian) * speed,
            hue, // 这个烟花的色相
            size: 2.5,
            alpha: 1,
            trail: [], // 存储历史位置用于绘制拖尾
          };
        });

        particlesRef.current.push(...newParticles);

        // 限制最大粒子数量，防止性能下降
        if (particlesRef.current.length > 600) {
          particlesRef.current = particlesRef.current.slice(-600);
        }
      }, 1000);
    };

    // 初始爆发：增加初始烟花数量
    createFirework();
    setTimeout(createFirework, 200);
    setTimeout(createFirework, 400);
    setTimeout(createFirework, 600);
    setTimeout(createFirework, 800);

    // 持续生成烟花，保持初始爆发的密度
    const scheduleNext = () => {
      const delay = 200 + Math.random() * 300; // 0.2-0.5秒，保持高密度
      const timeout = setTimeout(() => {
        createFirework();
        scheduleNext();
      }, delay);
      return timeout;
    };

    const timeout = scheduleNext();

    // 定期同步rockets state（降低频率）
    const syncInterval = setInterval(() => {
      setRockets([...rocketsRef.current]);
    }, 150); // 降低同步频率到150ms

    // 物理引擎和Canvas绘制
    const K = 0.92; // 稍微增加阻力系数，让粒子更快消失
    const GRAVITY = 1.2; // 稍微增加重力

    // 初始化Canvas
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext('2d', { alpha: true }); // 启用alpha通道以支持透明背景
      // 添加一层半透明黑色背景，让烟花效果更突出
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // 物理引擎和绘制 - 使用requestAnimationFrame代替setInterval
    let animationId;
    let lastTime = performance.now();
    const animate = (currentTime) => {
      const deltaTime = currentTime - lastTime;

      // 限制帧率，如果上一帧时间太短则跳过
      if (deltaTime < 16) { // 约60fps
        animationId = requestAnimationFrame(animate);
        return;
      }

      lastTime = currentTime;
      const particles = particlesRef.current;

      // 更新粒子物理
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        // 保存当前位置到拖尾数组
        if (!p.trail) p.trail = [];
        p.trail.push({ x: p.x, y: p.y });
        // 限制拖尾长度，保持最近的8个位置
        if (p.trail.length > 8) {
          p.trail.shift();
        }

        // 应用阻力
        p.vx *= K;
        p.vy *= K;

        // 更新位置（加上速度和重力）
        p.x += p.vx;
        p.y += p.vy + GRAVITY;

        // 色相递增（降低频率）
        p.hue = (p.hue + 0.5) % 360;

        // 尺寸衰减
        p.size = Math.max(0, p.size - 0.002);

        // 整体透明度衰减（加快衰减）
        p.alpha = Math.max(0, p.alpha - 0.02);

        // 移除透明度过低的粒子
        if (p.alpha <= 0.05) {
          particles.splice(i, 1);
        }
      }

      // 在Canvas上绘制所有粒子
      if (canvas) {
        const ctx = canvas.getContext('2d');
        // 每帧清空canvas，让背景图片显示出来
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // 添加半透明黑色背景，让烟花效果更突出
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        // 批量绘制，减少状态切换
        particles.forEach(p => {
          if (p.size > 0 && p.alpha > 0 && p.trail.length > 1) {
            // 绘制线状拖尾效果
            ctx.strokeStyle = `hsla(${p.hue}, 100%, 60%, ${p.alpha})`;
            ctx.lineWidth = p.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            ctx.beginPath();
            ctx.moveTo(p.trail[0].x, p.trail[0].y);

            // 绘制拖尾路径
            for (let i = 1; i < p.trail.length; i++) {
              ctx.lineTo(p.trail[i].x, p.trail[i].y);
            }

            // 连接到当前位置
            ctx.lineTo(p.x, p.y);
            ctx.stroke();

            // 在头部绘制一个亮点
            ctx.fillStyle = `hsla(${p.hue}, 100%, 80%, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        });
      }

      animationId = requestAnimationFrame(animate);
    };
    animate(performance.now());

    return () => {
      clearTimeout(timeout);
      clearInterval(syncInterval);
      cancelAnimationFrame(animationId);
      // 关闭音频上下文，停止所有音效
      if (audioContext) {
        audioContext.close();
      }
    };
  }, [showCongrats]);


  const scheduled = useMemo(() => scheduleTasks(tasks), [tasks]);

  // 过滤后的任务列表
  const filteredTasks = useMemo(() => {
    let filtered = scheduled;

    // 搜索过滤
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(task =>
        task.name.toLowerCase().includes(query) ||
        task.id.includes(query) ||
        task.phase.toLowerCase().includes(query) ||
        (task.owner && task.owner.toLowerCase().includes(query)) ||
        (task.leader && task.leader.toLowerCase().includes(query))
      );
    }

    // 状态过滤
    if (statusFilter !== "all") {
      filtered = filtered.filter(task => task.status === statusFilter);
    }

    return filtered;
  }, [scheduled, searchQuery, statusFilter]);

  const currentPhase = useMemo(() => {
    const og = scheduled.find((t) => t.status === "ongoing");
    if (og) return og.phase;
    const next = nextTasks(scheduled)[0];
    return next?.phase || (scheduled[0] && scheduled[0].phase) || "";
  }, [scheduled]);

  const phaseTimer = useMemo(() => {
  return phaseElapsedSeconds(scheduled, currentPhase, getCurrentTime().getTime());
}, [scheduled, currentPhase, ticker, demoTimeEnabled, demoTime]);
 
 //获取下一步任务列表方法
  function nextTasks(list) {
    const now = getCurrentTimeISO();
    return list
      .filter((t) => t.status !== "done" && t.status !== "ongoing")
      .filter((t) => areDependenciesComplete(t, list).ready) // 只返回依赖已完成的任务
      .sort((a, b) => new Date(a.scheduledStart || a.planStart).getTime() - new Date(b.scheduledStart || b.planStart).getTime())
      .slice(0, 10)
      .map((t) => ({ ...t, willStartInMin: minutesBetween(now, t.scheduledStart || t.planStart) }));
  }

  const nextList = useMemo(() => nextTasks(scheduled), [scheduled, ticker]);
  const notifyList = useMemo(() => nextList.filter((t) => (t.willStartInMin ?? 9999) <= 30), [nextList]);

  // 监听即将开始的任务，播放声音提醒
  useEffect(() => {
    if (!enableUpcomingAlert) return; // 如果开关关闭，不执行提醒

    notifyList.forEach((task) => {
      if (!notifiedTasksRef.current.has(task.id)) {
        notifiedTasksRef.current.add(task.id);

        // 播放提示音
        try {
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.frequency.value = 800;
          oscillator.type = 'sine';

          gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
          gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.5);
        } catch (e) {
          console.warn('无法播放提示音:', e);
        }

        // 记录日志
        setLogs((l) => [
          {
            time: getCurrentTimeISO(),
            action: "即将开始",
            taskId: task.id,
            detail: `任务将在 ${task.willStartInMin} 分钟后开始`
          },
          ...l
        ].slice(0, 300));
      }
    });
  }, [notifyList, enableUpcomingAlert]);

  // 获取被依赖阻塞的任务列表
  const blockedTasks = useMemo(() => {
    return scheduled
      .filter((t) => t.status !== "done" && t.status !== "ongoing")
      .filter((t) => !areDependenciesComplete(t, scheduled).ready)
      .slice(0, 10) // 限制显示数量
      .map((t) => ({
        ...t,
        blockingReason: getBlockingReason(t, scheduled),
        dependencyStatus: areDependenciesComplete(t, scheduled)
      }));
  }, [scheduled, ticker]);

  const globalTimerLabel = useMemo(() => {
  const now = getCurrentTime().getTime();

  // 查找第一个实际开始的任务时间
  const firstActualStart = scheduled
    .filter(t => t.actualStart)
    .map(t => new Date(t.actualStart).getTime())
    .filter(t => !Number.isNaN(t))
    .sort((a, b) => a - b)[0];

  // 使用第一个任务的实际开始时间，如果没有则使用窗口开始时间
  const startMs = firstActualStart || new Date(windowStartISO).getTime();
  const endMs = windowEndISO
    ? new Date(windowEndISO).getTime()
    : new Date(addMinutes(windowStartISO, 8 * 60)).getTime();

  if (Number.isNaN(startMs)) {
    return `00:00:00`;
  }

  let diffMs = countdownMode ? (endMs - now) : (now - startMs);
  const neg = diffMs < 0;
  diffMs = Math.abs(diffMs);

  const totalSec = Math.floor(diffMs / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  return `${neg ? "-" : ""}${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}, [scheduled, windowStartISO, windowEndISO, countdownMode, ticker]);


  const startTask = (id) => {
    // 先检查依赖是否完成
    const task = scheduled.find(t => t.id === id);
    if (!task) {
      setLogs((l) => [{ time: getCurrentTimeISO(), action: "启动失败", taskId: id, detail: "任务不存在" }, ...l].slice(0, 300));
      return false;
    }

    const { ready, blocking } = areDependenciesComplete(task, scheduled);
    if (!ready) {
      const blockingNames = blocking.map(b => `#${b.id} ${b.name}`).join('、');
      setLogs((l) => [{
        time: getCurrentTimeISO(),
        action: "启动失败",
        taskId: id,
        detail: `依赖未完成: ${blockingNames}`
      }, ...l].slice(0, 300));
      return false;
    }

    if (task.status === "ongoing") {
      setLogs((l) => [{ time: getCurrentTimeISO(), action: "启动失败", taskId: id, detail: "任务已在进行中" }, ...l].slice(0, 300));
      return false;
    }

    if (task.status === "done") {
      setLogs((l) => [{ time: getCurrentTimeISO(), action: "启动失败", taskId: id, detail: "任务已完成" }, ...l].slice(0, 300));
      return false;
    }

    // 依赖检查通过，启动任务
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: "ongoing", actualStart: getCurrentTimeISO() } : t)));
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "开始任务", taskId: id }, ...l].slice(0, 300));
    return true;
  };
  const completeTask = (id) => {
	  // 先完成状态
	  setTasks((prev) => prev.map((t) => {
		if (t.id !== id) return t;
		const end = getCurrentTimeISO();
		const start = t.actualStart || end;
		return { ...t, status: "done", actualEnd: end, actualMinutes: Math.max(1, minutesBetween(start, end)) };
	  }));

	  // 写"完成任务"日志
	  setLogs((l) => [{ time: getCurrentTimeISO(), action: "完成任务", taskId: id }, ...l].slice(0, 300));

	  // 判断是否提前：实际耗时 < 计划耗时
	  const me = scheduled.find(x => x.id === id);
	  if (me) {
		const plannedMin = Number(me.estMinutes || 0) || minutesBetween(me.planStart, me.planEnd);
		const actualMin = me.actualStart ? minutesBetween(me.actualStart, getCurrentTimeISO()) : plannedMin;
		const early = actualMin < plannedMin - 1; // 提前 >1 分钟算提前

		if (early && !earlyLoggedRef.current.has(id)) {
		  earlyLoggedRef.current.add(id);

		  // 找后续依赖它的任务
		  const affected = scheduled.filter(x => (x.dependsOn || []).includes(id) && x.status !== "done");
		  if (affected.length) {
			setLogs((l) => [
			  { time: getCurrentTimeISO(), action: "可提前开始", detail: `受 #${id} 提前完成影响：${affected.map(a=>`#${a.id}`).join("、")}` },
			  ...l,
			].slice(0, 300));
		  }
		}
	  }
	};

  const fileRef = useRef(null);
  const importCSV = async (file) => {
    const text = await file.text();
    const list = parseCSV(text);
    setTasks(list);
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "导入计划", detail: `${file.name} (${list.length}项)` }, ...l]);
  };
  const importJSON = async (file) => {
    const text = await file.text();
    const list = JSON.parse(text);
    setTasks(list);
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "导入计划(JSON)", detail: `${file.name} (${list.length}项)` }, ...l]);
  };
  const importExcel = async (file) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd hh:mm' });

    if (jsonData.length === 0) return;

    const header = jsonData[0];
    const idx = (key) => header.findIndex((h) => h === key);
    const r = [];

    // 辅助函数：从单元格获取原始值，优先处理日期
    const getCellValue = (rowIndex, colIndex) => {
      if (colIndex < 0) return "";

      // 获取单元格地址
      const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
      const cell = worksheet[cellAddress];

      if (!cell) return "";

      // 如果是日期类型，直接从 Date 对象提取并四舍五入
      if (cell.t === 'd' && cell.v instanceof Date) {
        // 加 60 秒用于四舍五入，避免浮点数精度问题（19:59:xx 会变成 20:00）
        const d = new Date(cell.v.getTime() + 60000);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        const result = `${year}-${month}-${day} ${hour}:${minute}`;
        console.log('Date cell result:', result, 'from', cell.v);
        return result;
      }

      // 如果是数字类型（Excel 序列号），转换为 Date 后处理
      if (cell.t === 'n' && cell.v) {
        // 检查是否是日期序列号（通常大于 1）
        if (cell.v > 1) {
          // 加上 60 秒的偏移量用于四舍五入（约 0.0007 天）
          const date = XLSX.SSF.parse_date_code(cell.v + 0.0006944);
          if (date) {
            const year = date.y;
            const month = String(date.m).padStart(2, '0');
            const day = String(date.d).padStart(2, '0');
            const hour = String(date.H || 0).padStart(2, '0');
            const minute = String(date.M || 0).padStart(2, '0');
            const result = `${year}-${month}-${day} ${hour}:${minute}`;
            console.log('Number cell result:', result, 'from', cell.v);
            return result;
          }
        }
      }

      // 优先使用单元格的格式化显示文本（避免浮点数精度问题）
      if (cell.w && /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(cell.w)) {
        // 标准化格式：将各种分隔符统一为 "-"，并补零
        let normalized = cell.w
          .replace(/年/g, '-')
          .replace(/月/g, '-')
          .replace(/日/g, ' ')
          .replace(/\//g, '-')
          .trim();

        console.log('Text cell normalized:', normalized);

        // 匹配并标准化日期时间格式
        const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
        if (match) {
          console.log('Match result:', match);
          const [, year, month, day, hour = '0', minute = '0', second = '0'] = match;
          // 四舍五入：如果秒数 >= 30，分钟数加 1
          let finalMinute = parseInt(minute);
          if (parseInt(second) >= 30) {
            finalMinute += 1;
          }
          // 处理分钟进位
          let finalHour = parseInt(hour);
          if (finalMinute >= 60) {
            finalMinute = 0;
            finalHour += 1;
          }
          const result = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')} ${String(finalHour).padStart(2, '0')}:${String(finalMinute).padStart(2, '0')}`;
          console.log('Final result:', result);
          return result;
        }
      }

      // 如果是日期类型，直接返回日期对象或格式化的值
      if (cell.t === 'd' && cell.v instanceof Date) {
        // 日期对象，格式化为本地时间字符串
        // 修复：加 30 秒后再提取时间，避免浮点数精度导致的时间截断问题
        const d = new Date(cell.v.getTime() + 30000); // 加 30 秒用于四舍五入
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
      }

      // 如果是数字但被格式化为日期（检测 Excel 日期序列号）
      if (cell.t === 'n' && cell.w) {
        // cell.w 是格式化后的显示文本
        // 尝试匹配日期格式
        if (/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(cell.w) || /\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(cell.w)) {
          // 使用 SheetJS 的日期转换函数
          // 修复：加上一个小的偏移量（约 30 秒）来处理浮点数精度问题
          const date = XLSX.SSF.parse_date_code(cell.v + 0.0003472); // 30秒 ≈ 30/(24*60*60) ≈ 0.0003472
          if (date) {
            const year = date.y;
            const month = String(date.m).padStart(2, '0');
            const day = String(date.d).padStart(2, '0');
            const hour = String(date.H || 0).padStart(2, '0');
            const minute = String(date.M || 0).padStart(2, '0');
            return `${year}-${month}-${day} ${hour}:${minute}`;
          }
          // 如果解析失败，返回格式化的显示文本
          return cell.w;
        }
      }

      // 默认返回单元格的显示值或原始值
      return cell.w || (cell.v?.toString?.().trim() || "");
    };

    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.length === 0) continue;

      // 使用新的 getCellValue 函数获取单元格值
      const get = (k) => {
        const colIdx = idx(k);
        if (colIdx < 0) return "";
        const cellValue = getCellValue(i, colIdx);
        return cellValue;
      };

      const id = get("序号") || get("id") || String(i);
      const phase = get("阶段") || "未分组";
      const name = get("工作项") || get("名称") || `任务${id}`;
      const est = Number(get("预计耗时(分钟)") || get("预计耗时") || get("estMinutes") || 0);
      const planStart = toISOLocal(get("计划开始") || get("计划开始时间") || get("planStart") || new Date().toISOString());
      const planEndRaw = get("计划结束") || get("计划结束时间") || get("planEnd");
      const planEnd = planEndRaw
        ? toISOLocal(planEndRaw)
        : (addMinutes(planStart, est || 60) || planStart || new Date().toISOString());
      const leader = get("牵头人") || get("leader");
      const executor = get("执行人") || get("owner");
      const checker = get("检查人") || get("checker");
      const dep = (get("依赖") || get("dependsOn") || "").split(/[,，]/).map(s=>s.trim()).filter(Boolean);

      // 读取实际执行数据
      const statusRaw = get("状态") || get("status") || "planned";
      const status = ["planned", "ongoing", "done"].includes(statusRaw) ? statusRaw : "planned";
      const actualStartRaw = get("实际开始") || get("actualStart");
      const actualStart = actualStartRaw ? toISOLocal(actualStartRaw) : undefined;
      const actualEndRaw = get("实际结束") || get("actualEnd");
      const actualEnd = actualEndRaw ? toISOLocal(actualEndRaw) : undefined;

      r.push({
        id,
        phase,
        name,
        estMinutes: est || minutesBetween(planStart, planEnd),
        planStart,
        planEnd,
        leader,
        owner: executor,
        checker,
        dependsOn: dep,
        status,
        actualStart,
        actualEnd
      });
    }

    setTasks(r);
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "导入计划(Excel)", detail: `${file.name} (${r.length}项)` }, ...l]);
  };
  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ioa_tasks_${Date.now()}.json`;
    a.click();
  };
  const exportExcel = () => {
    // 准备导出数据，包含实际执行数据
    const exportData = [
      ["序号", "阶段", "工作项", "预计耗时(分钟)", "计划开始", "计划结束", "牵头人", "执行人", "检查人", "依赖", "状态", "实际开始", "实际结束"],
    ];

    tasks.forEach(task => {
      // 格式化日期为本地时间字符串
      const formatDate = (iso) => {
        if (!iso) return "";
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hour = String(d.getHours()).padStart(2, '0');
        const minute = String(d.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
      };

      exportData.push([
        task.id || "",
        task.phase || "",
        task.name || "",
        task.estMinutes || 0,
        formatDate(task.planStart),
        formatDate(task.planEnd),
        task.leader || "",
        task.owner || "",
        task.checker || "",
        (task.dependsOn || []).join(","),
        task.status || "planned",
        formatDate(task.actualStart),
        formatDate(task.actualEnd),
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "任务执行数据");

    // 设置列宽
    worksheet['!cols'] = [
      { wch: 8 },  // 序号
      { wch: 12 }, // 阶段
      { wch: 25 }, // 工作项
      { wch: 15 }, // 预计耗时
      { wch: 18 }, // 计划开始
      { wch: 18 }, // 计划结束
      { wch: 10 }, // 牵头人
      { wch: 10 }, // 执行人
      { wch: 10 }, // 检查人
      { wch: 10 }, // 依赖
      { wch: 10 }, // 状态
      { wch: 18 }, // 实际开始
      { wch: 18 }, // 实际结束
    ];

    XLSX.writeFile(workbook, `IOA任务执行数据_${Date.now()}.xlsx`);
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "导出Excel", detail: "任务执行数据已导出" }, ...l]);
  };
  const downloadTemplate = () => {
    const templateData = [
      ["序号", "阶段", "工作项", "预计耗时(分钟)", "计划开始", "计划结束", "牵头人", "执行人", "检查人", "依赖", "状态", "实际开始", "实际结束"],
      ["1", "停机准备", "发布停机公告&窗口确认", "30", "2026-01-26 20:00", "2026-01-26 20:30", "指挥", "PMO", "质保", "", "planned", "", ""],
      ["2", "备份与切换", "数据库全量备份", "45", "2026-01-26 20:30", "2026-01-26 21:15", "DBA", "DBA", "质保", "1", "planned", "", ""],
      ["3", "备份与切换", "应用停机&流量切断", "20", "2026-01-26 20:30", "2026-01-26 20:50", "运维", "运维", "安全", "1", "planned", "", ""],
      ["4", "升级实施", "版本包部署&脚本执行", "60", "2026-01-26 21:15", "2026-01-26 22:15", "实施", "实施", "架构", "2,3", "planned", "", ""],
      ["5", "验证与放行", "核心用例验证", "40", "2026-01-26 22:15", "2026-01-26 22:55", "测试", "测试", "业务", "4", "planned", "", ""],
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "任务计划");

    // 设置列宽
    worksheet['!cols'] = [
      { wch: 8 },  // 序号
      { wch: 12 }, // 阶段
      { wch: 25 }, // 工作项
      { wch: 15 }, // 预计耗时
      { wch: 18 }, // 计划开始
      { wch: 18 }, // 计划结束
      { wch: 10 }, // 牵头人
      { wch: 10 }, // 执行人
      { wch: 10 }, // 检查人
      { wch: 10 }, // 依赖
      { wch: 10 }, // 状态
      { wch: 18 }, // 实际开始
      { wch: 18 }, // 实际结束
    ];

    XLSX.writeFile(workbook, `IOA升级任务计划模板_${Date.now()}.xlsx`);
    setLogs((l) => [{ time: getCurrentTimeISO(), action: "下载模板", detail: "Excel模板已下载" }, ...l]);
  };
  const resetTaskStatus = () => {
    if (!window.confirm("确定要清空所有任务的执行状态吗？此操作将重置所有任务为未开始状态，并清空操作日志。")) {
      return;
    }
    setTasks((prev) => prev.map((t) => ({
      ...t,
      status: "planned",
      actualStart: undefined,
      actualEnd: undefined,
      actualMinutes: undefined,
    })));
    riskLoggedRef.current.clear();
    earlyLoggedRef.current.clear();
    autoCongratsTriggeredRef.current = false;
    setShowCongrats(false);
    setLogs([]);
  };

  const phases = Array.from(new Set(scheduled.map((t) => t.phase)));

  const [gZoom, setGZoom] = useState(1);

  const bounds = useMemo(() => {
   // 计算开始时间：同时考虑计划开始和实际开始，取较早的时间
   const starts = scheduled.map(t => {
     const planStartTime = +new Date(t.planStart);
     const actualStartTime = t.actualStart ? +new Date(t.actualStart) : Infinity;
     return Math.min(planStartTime, actualStartTime);
   }).filter(n => !Number.isNaN(n) && n !== Infinity);

   const ends = scheduled.map(t => +new Date(t.actualEnd || t.planEnd)).filter(n => !Number.isNaN(n));
   const now = getCurrentTime().getTime();
   const minStartRaw = starts.length ? Math.min(...starts) : now;

   // 将开始时间向前取整到最近的整点或半点
   const minStartDate = new Date(minStartRaw);
   const minutes = minStartDate.getMinutes();
   if (minutes > 30) {
     // 如果分钟数大于30，向前取到当前小时的30分
     minStartDate.setMinutes(30, 0, 0);
   } else if (minutes > 0) {
     // 如果分钟数在1-30之间，向前取到当前小时的0分
     minStartDate.setMinutes(0, 0, 0);
   } else {
     // 如果已经是整点，保持不变
     minStartDate.setSeconds(0, 0);
   }
   const minStart = minStartDate.getTime();

   const maxEndRaw = ends.length ? Math.max(...ends) : now + 60 * 60000;
   const pad = 30 * 60000; // 末尾再多 30 分钟余量，便于滚到最右还能看到刻度
   return { min: new Date(minStart), max: new Date(maxEndRaw + pad) };
 }, [scheduled]);

  // 计算自适应缩放比例
  const calculateAutoFitZoom = () => {
    if (!ganttContainerRef.current) return 1;

    const container = ganttContainerRef.current;
    const containerWidth = container.clientWidth - 40; // 减去padding

    // 计算所需的总宽度和高度
    const totalMinutes = Math.max(30, Math.ceil((bounds.max - bounds.min) / 60000));
    const requiredWidth = totalMinutes * 2; // 基础pxPerMin是2

    // 计算宽度缩放比例
    const widthZoom = containerWidth / requiredWidth;

    // 限制缩放范围在0.1-4之间
    return Math.max(0.1, Math.min(4, widthZoom));
  };

  // 当进入全屏或自适应模式时，自动计算缩放
  useEffect(() => {
    if (ganttFullscreen && autoFitZoom) {
      const fitZoom = calculateAutoFitZoom();
      setGZoom(fitZoom);
    }
  }, [ganttFullscreen, autoFitZoom, bounds]);


  const pxPerMin = 2 * gZoom;
  const totalMin = Math.max(30, Math.ceil((bounds.max - bounds.min) / 60000));

	const toLeftPx = (iso) => {
	  const t = new Date(iso).getTime();
	  const min = bounds.min.getTime();
	  if (Number.isNaN(t) || Number.isNaN(min)) return 0;
	  return Math.max(0, Math.round((t - min) / 60000) * pxPerMin);
	};
	const toWidthPx = (startISO, endISO) => {
	  const s = new Date(startISO).getTime();
	  const e = new Date(endISO).getTime();
	  if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 6; // 至少给个可见宽度
	  return Math.max(6, Math.round((e - s) / 60000) * pxPerMin);
	};


return (
  <div className="w-full h-screen flex flex-col bg-slate-900 text-slate-100 p-4">
    {/* 顶部条 */}
	 <div className="text-center text-4xl font-bold mb-3 ">{projectTitle}指挥大屏</div>
    <div className="grid grid-cols-3 gap-3 items-center">
      {/* 左：全局计时器 + 控件 */}
      <div className="items-center">
        <div className="text-center">
          <div className="text-xs opacity-75 mb-1">{countdownMode ? "倒计时" : "全局计时"}</div>
          <div className="text-2xl font-bold">{globalTimerLabel}</div>
        </div>
      </div>

      {/* 中：北京时间 */}
      <div className="text-center">
        <div className="text-xs opacity-75 mb-1">北京时间</div>
        <div className="text-2xl font-bold">
          {new Intl.DateTimeFormat("zh-CN", {
            timeZone: tz,
            hour12: false,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }).format(getCurrentTime())}
        </div>
      </div>

      {/* 右1：当前阶段 & 累计计时 */}
      <div className="grid grid-cols-2 items-center">
		<div className="text-center">
			<div className="text-sm opacity-70">当前阶段</div>
			<div className="text-2xl font-semibold">{currentPhase || "-"}</div>
		</div>
		<div className="text-center">
			<div className="text-sm opacity-70">阶段累计已用：</div>
			<div className="text-2xl font-bold">{formatSecHMS(phaseTimer)}</div>
		</div>
      </div>
    </div>


    {/* 工具栏 */}
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        className="px-3 py-1 rounded-xl border border-slate-600"
        onClick={() => setShowConfig((v) => !v)}
      >
        {showConfig ? "返回大屏" : "进入配置区"}
      </button>

      {!showConfig && (
        <>
          <button
            className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 transition-colors tool-button"
            onClick={scrollToCurrentTask}
            title="定位到当前执行任务"
          >
            📍 定位当前任务
          </button>
          <button
            className="px-3 py-1 rounded-xl bg-slate-600 hover:bg-slate-700 transition-colors tool-button"
            onClick={scrollToNow}
            title="定位到当前时间"
          >
            ⏰ 定位现在
          </button>
          <button
            className="px-3 py-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 transition-colors tool-button"
            onClick={() => {
              const newFullscreen = !ganttFullscreen;
              setGanttFullscreen(newFullscreen);
              if (newFullscreen) {
                setAutoFitZoom(true);
              }
            }}
            title={ganttFullscreen ? "退出甘特图全屏" : "甘特图全屏（自适应）"}
          >
            {ganttFullscreen ? "⊟ 退出全屏" : "⊡ 甘特全屏"}
          </button>
          {ganttFullscreen && (
            <button
              className={`px-3 py-1 rounded-xl transition-colors ${autoFitZoom ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
              onClick={() => setAutoFitZoom(!autoFitZoom)}
              title={autoFitZoom ? "关闭自适应（可手动调整）" : "开启自适应缩放"}
            >
              {autoFitZoom ? "🔒 自适应" : "🔓 手动"}
            </button>
          )}

          {/* 搜索框 */}
          <div className="flex items-center gap-2 ml-4">
            <input
              type="text"
              placeholder="搜索任务..."
              className="px-3 py-1 bg-slate-800 border border-slate-600 rounded-lg text-sm w-40"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <select
              className="px-2 py-1 bg-slate-800 border border-slate-600 rounded-lg text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="planned">未开始</option>
              <option value="ongoing">进行中</option>
              <option value="done">已完成</option>
            </select>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 ml-4">
        <span className="text-xs opacity-70">甘特缩放</span>
        <input
          type="range"
          min={0.1}
          max={4}
          step={0.1}
          value={gZoom}
          onChange={(e) => {
            setGZoom(Number(e.target.value));
            if (ganttFullscreen && autoFitZoom) {
              setAutoFitZoom(false);
            }
          }}
          disabled={ganttFullscreen && autoFitZoom}
          className={ganttFullscreen && autoFitZoom ? 'opacity-50 cursor-not-allowed' : ''}
        />
        <span className="text-xs opacity-70 min-w-[3rem] text-right">{gZoom.toFixed(1)}x</span>
      </div>
    </div>

    {/* 主区域：配置区 vs 大屏 */}
    <div className="mt-4 flex-1 overflow-auto hide-scrollbar">
      {showConfig ? (
        // ===== 配置区 =====
        <div className="h-full overflow-y-auto hide-scrollbar">
          <div className="bg-slate-800/60 rounded-2xl p-4 space-y-4">
            <div className="text-lg font-semibold">升级计划配置区</div>
            <div className="text-xs opacity-80">
              在此导入/导出任务计划，并设置全局窗口时间，完成后点击“返回大屏”查看指挥大屏。
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                className="px-3 py-1 bg-indigo-600 rounded-xl hover:bg-indigo-700 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                导入计划
              </button>
              <input
                type="file"
                ref={fileRef}
                className="hidden"
                accept=".csv,.json,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.name.endsWith(".csv")) importCSV(f);
                  else if (f.name.endsWith(".json")) importJSON(f);
                  else if (f.name.endsWith(".xlsx") || f.name.endsWith(".xls")) importExcel(f);
                  e.currentTarget.value = "";
                }}
              />
              <button className="px-3 py-1 bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors" onClick={downloadTemplate}>
                下载Excel模板
              </button>
              <button className="px-3 py-1 bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors" onClick={exportExcel}>
                导出Excel(含执行数据)
              </button>
              <button className="px-3 py-1 bg-slate-700 rounded-xl hover:bg-slate-600 transition-colors" onClick={exportJSON}>
                导出JSON
              </button>
              <button className="px-3 py-1 bg-amber-600 rounded-xl hover:bg-amber-700 transition-colors" onClick={resetTaskStatus}>
                清空状态
              </button>
			  <button
				className={`px-3 py-1 rounded-xl ${showCongrats ? "bg-emerald-600" : "bg-slate-700"}`}
				onClick={() => setShowCongrats((v) => !v)}
			  >
				{showCongrats ? "关闭庆功" : "庆功"}
			  </button>
			  {/* 即将开始任务提醒开关 */}
			  <button
				className={`px-3 py-1 rounded-xl transition-colors ${enableUpcomingAlert ? "bg-amber-600 hover:bg-amber-700" : "bg-slate-700 hover:bg-slate-600"}`}
				onClick={() => setEnableUpcomingAlert((v) => !v)}
				title="开启后，30分钟内即将开始的任务会有声音提醒和高亮显示"
			  >
				{enableUpcomingAlert ? "⏰ 即将开始提醒：开" : "⏰ 即将开始提醒：关"}
			  </button>
			  {/* 已完成任务超时效果开关 */}
			  <button
				className={`px-3 py-1 rounded-xl transition-colors ${hideCompletedOverdue ? "bg-slate-700 hover:bg-slate-600" : "bg-red-600 hover:bg-red-700"}`}
				onClick={() => setHideCompletedOverdue((v) => !v)}
				title="关闭后，已完成但超时的任务将不再显示红色超时效果"
			  >
				{hideCompletedOverdue ? "🔴 已完成超时效果：关" : "🔴 已完成超时效果：开"}
			  </button>
              {/* 倒计时开关 */}
              <label className="text-sm opacity-80 ml-4">倒计时</label>
              <input
                type="checkbox"
                checked={countdownMode}
                onChange={(e) => setCountdownMode(e.target.checked)}
              />

              {/* 窗口时间 */}
              <div className="flex items-center gap-2 ml-6">
                <span className="text-xs opacity-70">窗口开始</span>
                <input
                  type="datetime-local"
                  className="bg-slate-900 rounded px-2 py-1"
                  value={isoToInputLocal(windowStartISO)}
                  onChange={(e) => {
                    const newValue = inputLocalToISO(e.target.value);
                    setWindowStartISO(newValue || new Date().toISOString());
                  }}
                />
                <span className="text-xs opacity-70 ml-4">窗口结束</span>
                <input
                  type="datetime-local"
                  className="bg-slate-900 rounded px-2 py-1"
                  value={isoToInputLocal(windowEndISO)}
                  onChange={(e) => {
                    const newValue = inputLocalToISO(e.target.value);
                    setWindowEndISO(newValue);
                  }}
                  placeholder="设置窗口结束时间"
                />
              </div>
            </div>

            {/* 项目标题配置 */}
            <div className="bg-slate-800/40 rounded-xl p-3">
              <div className="text-sm font-semibold mb-2">项目标题配置</div>
              <div className="flex items-center gap-2">
                <span className="text-xs opacity-70">标题名称</span>
                <input
                  type="text"
                  className="flex-1 bg-slate-900 rounded px-3 py-2 text-sm"
                  value={projectTitle}
                  onChange={(e) => setProjectTitle(e.target.value)}
                  placeholder="请输入项目标题（如：某某某切换升级任务）"
                />
              </div>
              <div className="text-xs opacity-60 mt-2">
                此标题将显示在指挥大屏顶部和庆功页面中
              </div>
            </div>

            {/* 演示时间配置 */}
            <div className="bg-slate-800/40 rounded-xl p-3">
              <div className="text-sm font-semibold mb-2">演示时间配置（用于演示）</div>
              <div className="flex items-center gap-3">
                <button
                  className={`px-3 py-1 rounded-xl transition-colors ${demoTimeEnabled ? "bg-purple-600 hover:bg-purple-700" : "bg-slate-700 hover:bg-slate-600"}`}
                  onClick={() => setDemoTimeEnabled((v) => !v)}
                  title="开启后，可以手动指定当前时间用于演示"
                >
                  {demoTimeEnabled ? "🕐 演示模式：开" : "🕐 演示模式：关"}
                </button>
                {demoTimeEnabled && (
                  <>
                    <span className="text-xs opacity-70">当前时间</span>
                    <input
                      type="datetime-local"
                      className="bg-slate-900 rounded px-2 py-1 text-sm"
                      value={isoToInputLocal(demoTime)}
                      onChange={(e) => {
                        const newValue = inputLocalToISO(e.target.value);
                        if (newValue) setDemoTime(newValue);
                      }}
                    />
                    <button
                      className="px-2 py-1 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs transition-colors"
                      onClick={() => setDemoTime(new Date().toISOString())}
                    >
                      重置为当前
                    </button>
                  </>
                )}
              </div>
              <div className="text-xs opacity-60 mt-2">
                开启演示模式后，系统将使用指定的时间而非真实时间，方便演示和测试
              </div>
            </div>

            {/* 底部：任务清单简表（便于核对） */}
            <div className="mt-6 bg-slate-800/40 rounded-2xl p-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">任务清单（{scheduled.length}）</div>
                <div className="text-xs opacity-70">
                  双击任务行可切换状态：未开始→进行中→已完成
                </div>
              </div>
              <div className="mt-2 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-800">
                    <tr className="text-left">
                      {"序号,阶段,工作项,计划开始,计划结束,动态预计开始,状态,牵头人,执行人,检查人,前置任务"
                        .split(",")
                        .map((h) => (
                          <th key={h} className="px-2 py-1 font-medium">
                            {h}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scheduled.map((t) => (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-900/60 cursor-default"
                        onDoubleClick={() => {
                          const task = scheduled.find(st => st.id === t.id);
                          if (!task) return;

                          setTasks((prev) =>
                            prev.map((x) => {
                              if (x.id !== t.id) return x;

                              if (x.status === "planned" || !x.status) {
                                // 检查依赖是否完成
                                const { ready } = areDependenciesComplete(x, scheduled);
                                if (!ready) {
                                  setLogs((l) => [{
                                    time: getCurrentTimeISO(),
                                    action: "状态切换失败",
                                    taskId: x.id,
                                    detail: "依赖未完成"
                                  }, ...l].slice(0, 300));
                                  return x; // 不改变状态
                                }
                                return {
                                  ...x,
                                  status: "ongoing",
                                  actualStart: getCurrentTimeISO(),
                                };
                              }

                              if (x.status === "ongoing") {
                                return {
                                  ...x,
                                  status: "done",
                                  actualEnd: getCurrentTimeISO(),
                                };
                              }

                              return {
                                ...x,
                                status: "planned",
                                actualStart: undefined,
                                actualEnd: undefined,
                                actualMinutes: undefined,
                              };
                            })
                          );
                        }}
                      >
                        <td className="px-2 py-1">{t.id}</td>
                        <td className="px-2 py-1">{t.phase}</td>
                        <td className="px-2 py-1">{t.name}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{df(t.planStart)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{df(t.planEnd)}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {df(t.scheduledStart || t.planStart)}
                        </td>
                        <td className="px-2 py-1">{t.status || "planned"}</td>
						<td className="px-2 py-1">{t.leader || "-"}</td>
						<td className="px-2 py-1">{t.owner  || "-"}</td>
						<td className="px-2 py-1">{t.checker|| "-"}</td>
                        <td className="px-2 py-1">{t.dependsOn?.join(",") || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 text-xs opacity-70 leading-6">
                <div>
				  导入模板（CSV/Excel列头）：序号,阶段,工作项,预计耗时(分钟),计划开始,计划结束,牵头人,执行人,检查人,依赖,状态,实际开始,实际结束
				</div>
                <div>
                  提示：依赖填前置"序号"，多个以英文逗号分隔；留空表示可与其他任务并行启动。
                </div>
                <div>
                  状态字段：planned(未开始) / ongoing(进行中) / done(已完成)；实际开始/结束格式：YYYY-MM-DD HH:mm
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
	          // ===== 指挥大屏 =====
        <div className="grid grid-cols-12 gap-4">
			{/* 左列：阶段甘特（单一横向滚动 + 行内左列 sticky） */}
			<div
				ref={ganttContainerRef}
				className={`${ganttFullscreen ? 'fixed inset-0 z-50 bg-slate-900' : 'col-span-6'} bg-slate-800/60 rounded-2xl p-3 flex flex-col`}
			>
			  {(() => {
				const labelColW = 0;
				const contentW  = totalMin * pxPerMin + 120;

				return (
				  <>
					{/* 阶段概览、日期条和时间轴 - 固定在顶部 */}
					<div className="shrink-0 bg-slate-800/60 -mx-3 px-3 pt-3 rounded-t-2xl">
					  {/* 阶段概览标题和按钮组 - 不跟随横向滚动 */}
					  <div className="flex items-center justify-between mb-2">
						<div className="flex items-center gap-3">
						  <div
							className="text-lg font-semibold cursor-default select-none"
							onDoubleClick={() => {
							  if (ganttFullscreen) {
								setShowCongrats(true);
							  }
							}}
							title={ganttFullscreen ? "双击打开庆功页" : ""}
						  >
							阶段概览
						  </div>
						  {ganttFullscreen && (
							<>
							  <button
								className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
								onClick={() => {
								  setGanttFullscreen(false);
								  setAutoFitZoom(false);
								}}
								title="退出全屏"
							  >
								✕ 退出全屏
							  </button>
							  {/* 自适应/手动切换按钮 */}
							  <button
								className={`px-3 py-1 text-sm rounded-lg transition-colors ${autoFitZoom ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-700 hover:bg-slate-600'}`}
								onClick={() => setAutoFitZoom(!autoFitZoom)}
								title={autoFitZoom ? "关闭自适应（可手动调整）" : "开启自适应缩放"}
							  >
								{autoFitZoom ? "🔒 自适应" : "🔓 手动"}
							  </button>
							  {/* 全屏模式下的缩放控制 */}
							  <div className="flex items-center gap-2 ml-4 pointer-events-auto">
								<span className="text-xs opacity-70">缩放</span>
								<input
								  type="range"
								  min={0.1}
								  max={4}
								  step={0.1}
								  value={gZoom}
								  onChange={(e) => {
									setGZoom(Number(e.target.value));
									if (autoFitZoom) {
									  setAutoFitZoom(false);
									}
								  }}
								  disabled={autoFitZoom}
								  className={`w-32 cursor-pointer ${autoFitZoom ? 'opacity-50 cursor-not-allowed' : ''}`}
								  style={{ pointerEvents: autoFitZoom ? 'none' : 'auto' }}
								/>
								<span className="text-xs opacity-70 min-w-[3rem] text-right">{gZoom.toFixed(1)}x</span>
							  </div>
							</>
						  )}
						</div>
						<div className="flex items-center gap-4">
							{/* 快速操作按钮组 */}
							<div className="flex items-center gap-2">
							  <button
								className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
								onClick={() => {
								  const ongoingTasks = scheduled.filter(t => t.status === "ongoing");
								  if (ongoingTasks.length > 0) {
									ongoingTasks.forEach(t => completeTask(t.id));
								  }
								}}
								disabled={scheduled.filter(t => t.status === "ongoing").length === 0}
								title="批量完成所有进行中任务"
							  >
								✓ 批量完成
							  </button>
							  <button
								className="px-2 py-1 text-xs bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
								onClick={() => {
								  const readyTasks = nextTasks(scheduled).slice(0, 3);
								  let successCount = 0;
								  readyTasks.forEach(t => {
									if (startTask(t.id)) {
									  successCount++;
									}
								  });
								  if (successCount > 0) {
									setLogs((l) => [{
									  time: getCurrentTimeISO(),
									  action: "批量启动",
									  detail: `成功启动${successCount}个任务`
									}, ...l].slice(0, 300));
								  }
								}}
								disabled={nextTasks(scheduled).length === 0}
								title="启动前3个就绪任务"
							  >
								▶ 批量启动
							  </button>
							</div>

							{/* 总进度显示 */}
							<div className="flex items-center gap-2">
							  <span className="text-xs opacity-70">总进度</span>
							  <div className="w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
								<div
								  className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-500 phase-progress"
								  style={{ width: `${Math.round((scheduled.filter(t => t.status === "done").length / scheduled.length) * 100)}%` }}
								/>
							  </div>
							  <span className="text-xs font-medium">
								{Math.round((scheduled.filter(t => t.status === "done").length / scheduled.length) * 100)}%
							  </span>
							  <span className="text-xs opacity-60">
								({scheduled.filter(t => t.status === "done").length}/{scheduled.length})
							  </span>
							</div>
						  </div>
						</div>

					  {/* 日期条 */}
					  <div
						className="overflow-hidden bg-slate-800/95 backdrop-blur-sm mb-1"
						style={{ marginLeft: ganttScrollLeft ? `-${ganttScrollLeft}px` : '0' }}
					  >
					  <div className="relative h-8 bg-slate-800/60 rounded-lg" style={{ width: contentW }}>
						  {(() => {
							// 计算每一天的范围
							const days = [];
							let currentDate = new Date(bounds.min);
							currentDate.setHours(0, 0, 0, 0); // 设置为当天的0点

							while (currentDate <= bounds.max) {
							  const dayStart = new Date(currentDate);
							  const dayEnd = new Date(currentDate);
							  dayEnd.setDate(dayEnd.getDate() + 1);
							  dayEnd.setMilliseconds(-1); // 当天的23:59:59.999

							  // 计算这一天在甘特图中的起始和结束位置
							  const startPx = toLeftPx(dayStart.toISOString());
							  const endPx = toLeftPx(dayEnd.toISOString());
							  const widthPx = endPx - startPx;

							  if (widthPx > 0) {
								days.push({
								  date: new Date(dayStart),
								  startPx,
								  widthPx
								});
							  }

							  currentDate.setDate(currentDate.getDate() + 1);
							}

							return days.map((day, idx) => {
							  // 计算日期标签的位置：在其所属日期区块的可见部分居中
							  const containerWidth = ganttScrollRef.current?.offsetWidth || 800;
							  const scrollLeft = ganttScrollLeft;
							  const scrollRight = scrollLeft + containerWidth;

							  // 日期区块的绝对位置
							  const dayLeft = day.startPx;
							  const dayRight = day.startPx + day.widthPx;

							  // 计算可见区域与日期区块的交集
							  const visibleLeft = Math.max(scrollLeft, dayLeft);
							  const visibleRight = Math.min(scrollRight, dayRight);
							  const visibleWidth = Math.max(0, visibleRight - visibleLeft);

							  // 日期标签的目标位置（在可见区域居中）
							  let labelLeft = day.widthPx / 2 - 60; // 默认居中（假设标签宽度约120px）

							  if (visibleWidth > 0) {
								// 如果有可见部分，计算标签应该在可见部分的中心位置
								const visibleCenter = (visibleLeft + visibleRight) / 2;
								labelLeft = visibleCenter - dayLeft - 60;

								// 限制标签不超出日期区块
								labelLeft = Math.max(10, Math.min(labelLeft, day.widthPx - 130));
							  }

							  return (
								<div
								  key={idx}
								  className="absolute top-0 h-full border-r border-slate-700"
								  style={{ left: day.startPx, width: day.widthPx }}
								>
								  {/* 日期标签：根据滚动位置动态调整 */}
								  <div className="relative h-full">
									<div
									  className="absolute top-1/2 -translate-y-1/2 text-sm font-semibold text-amber-400 bg-slate-900/90 px-3 py-1 rounded-lg whitespace-nowrap shadow-lg border border-amber-500/30 transition-all duration-150"
									  style={{ left: labelLeft }}
									>
									  {new Intl.DateTimeFormat("zh-CN", {
										year: "numeric",
										month: "2-digit",
										day: "2-digit",
										weekday: "short",
										timeZone: tz,
									  }).format(day.date)}
									</div>
								  </div>
								</div>
							  );
							});
						  })()}
						</div>
					  </div>

					  {/* 时间轴 */}
					  <div
						className="overflow-hidden bg-slate-800/95 backdrop-blur-sm mb-3 pb-2"
						style={{ marginLeft: ganttScrollLeft ? `-${ganttScrollLeft}px` : '0' }}
					  >
						<div className="relative h-10 overflow-visible bg-slate-900/40 rounded-lg" style={{ width: contentW }}>
						  <div className="absolute inset-x-0 bottom-4 border-b border-slate-600" />
						  {Array.from({ length: Math.ceil(totalMin / 30) + 1 }).map((_, i) => {
							const x = i * 30 * pxPerMin;
							const labelISO = addMinutes(bounds.min.toISOString(), i * 30);
							const labelDate = new Date(labelISO);
							const isHour = labelDate.getMinutes() === 0;
							const isMidnight = isHour && labelDate.getHours() === 0;

							// 当缩放比例 <= 0.5 时，只显示整点时间
							const isSmallZoom = gZoom <= 0.5;
							if (isSmallZoom && !isHour) {
							  return null; // 不显示30分钟刻度
							}

							// 检查是否是新的一天（或者第一个刻度）
							const prevLabelISO = i > 0 ? addMinutes(bounds.min.toISOString(), (i - 1) * 30) : null;
							const isNewDay = i === 0 || (prevLabelISO && new Date(prevLabelISO).getDate() !== labelDate.getDate());

							// 根据缩放比例调整字号
							const baseFontSize = isSmallZoom ? 9 : (isHour ? 11 : 10);
							const fontSize = `${baseFontSize}px`;

							return (
							  <div key={i} className="absolute bottom-0" style={{ left: x }}>
								<div className={`${isHour ? 'h-5 border-l-2 border-slate-500' : 'h-3 border-l border-slate-600'} ${isMidnight ? 'border-amber-500' : ''}`} />
								<div className={`${isHour ? 'opacity-90 font-medium' : 'opacity-60'} translate-y-1 whitespace-nowrap`} style={{ fontSize }}>
								  {isNewDay ? (
									<>
									  <div className="text-amber-400 font-semibold" style={{ fontSize: `${baseFontSize - 1}px` }}>
										{new Intl.DateTimeFormat("zh-CN", {
										  month: "2-digit", day: "2-digit", timeZone: tz,
										}).format(labelDate)}
									  </div>
									  <div>
										{isSmallZoom ? (
										  // 小缩放时只显示小时
										  String(labelDate.getHours()).padStart(2, '0') 
										) : (
										  // 正常缩放显示小时:分钟
										  new Intl.DateTimeFormat("zh-CN", {
											hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
										  }).format(labelDate)
										)}
									  </div>
									</>
								  ) : (
									isSmallZoom ? (
									  // 小缩放时只显示小时
									  String(labelDate.getHours()).padStart(2, '0') 
									) : (
									  // 正常缩放显示小时:分钟
									  new Intl.DateTimeFormat("zh-CN", {
										hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
									  }).format(labelDate)
									)
								  )}
								</div>
							  </div>
							);
						  })}
						  {/* 现在指示线（时间轴层） */}
						  <div
							className="absolute top-0 bottom-0 border-l-2 border-rose-500 z-50 pointer-events-none shadow-lg"
							style={{ left: toLeftPx(getCurrentTimeISO()) }}
						  >
						    <div className="absolute -top-1 -left-2 w-4 h-4 bg-rose-500 rounded-full shadow-lg animate-pulse" />
						  </div>
						</div>
					  </div>
					</div>
					{/* 结束固定头部 */}

					  {/* 阶段任务滚动区域 - 独立垂直和水平滚动 */}
					  <div
						ref={ganttScrollRef}
						className="overflow-auto scroll-smooth gantt-container flex-1 hide-scrollbar"
						style={{
							minHeight: 0,
							maxHeight: ganttFullscreen ? 'calc(100vh - 200px)' : 'calc(100vh - 350px)'
						}}
					  >
						<div style={{ width: contentW }}>
					  {/* 阶段行：每行一个 grid（左标签 sticky，右内容与时间轴同宽，同步滚动） */}
					  {phases.map((ph) => {
						const phaseTasksAll = scheduled.filter(t => t.phase === ph);
						const phaseTasks = filteredTasks.filter(t => t.phase === ph);
						const phaseProgress = Math.round((phaseTasksAll.filter(t => t.status === "done").length / Math.max(1, phaseTasksAll.length)) * 100);
						const phaseTaskCount = phaseTasksAll.length;
						const phaseDoneCount = phaseTasksAll.filter(t => t.status === "done").length;

						// 如果过滤后该阶段没有任务，则隐藏该阶段
						if (phaseTasks.length === 0 && (searchQuery || statusFilter !== "all")) {
						  return null;
						}

						// 动态计算阶段行高度：标题区40px + 顶部padding 8px + 每个任务18px + 底部padding 8px
						const phaseHeight = 40 + 8 + phaseTasks.length * 18 + 8;
						const minPhaseHeight = 70; // 最小高度（标题40px + 至少30px的任务区域）
						const actualPhaseHeight = Math.max(minPhaseHeight, phaseHeight);

						return (
						  <div
							key={ph}
							className="grid items-stretch"
							style={{ gridTemplateColumns: `${labelColW}px ${contentW}px` }}
						  >
							{/* 左：阶段标签 - 这部分现在为空，但保留布局结构 */}
							<div className="sticky left-0 z-20 rounded-l-xl flex flex-col justify-center p-3" style={{ width: labelColW, height: actualPhaseHeight }}>
							  {labelColW > 0 && (
								<>
								  <div className="font-medium text-sm truncate">{ph}</div>
								  <div className="text-xs opacity-70">{phaseDoneCount}/{phaseTaskCount}</div>
								  <div className="w-full h-1 bg-slate-700 rounded-full mt-1 overflow-hidden">
									<div className="h-full bg-emerald-500 transition-all duration-500 phase-progress" style={{ width: `${phaseProgress}%` }} />
								  </div>
								</>
							  )}
							</div>

							{/* 右：该阶段任务条（与时间轴同一滚动宽度） */}
							<div className="relative bg-slate-900/60 rounded-r-xl" style={{ minHeight: actualPhaseHeight }}>
							  {/* 阶段标题区域：固定高度，sticky横向定位 */}
							  <div className="h-10 flex items-center border-b border-slate-700/50">
								<div className="sticky left-3 z-30 bg-slate-800/95 backdrop-blur-sm px-3 py-1 rounded-lg shadow-lg border border-slate-600/50">
								  <span className="text-sm font-medium text-slate-200">{ph}</span>
								  <span className="ml-2 text-xs text-slate-400">({phaseDoneCount}/{phaseTaskCount})</span>
								  <span className="ml-2 text-xs text-emerald-400 font-medium">{phaseProgress}%</span>
								  {(searchQuery || statusFilter !== "all") && phaseTasks.length < phaseTasksAll.length && (
									<span className="ml-2 text-xs text-amber-400">
									  (显示 {phaseTasks.length} / {phaseTasksAll.length})
									</span>
								  )}
								</div>
							  </div>
							  {/* 任务区域：从标题下方开始 */}
							  <div className="relative px-3 pb-3" style={{ minHeight: actualPhaseHeight - 40 }}>
							  {/* 现在线（每行都画一条，便于对齐） */}
							  <div
								className="absolute inset-y-2 border-l-2 border-rose-500/80 z-40 pointer-events-none now-line"
								style={{ left: toLeftPx(getCurrentTimeISO()) }}
							  />
							  {phaseTasks
								.map((t, idx) => {
								  const barTop = 8 + idx * 18; // 任务区域内的垂直位置（减半）

								  // 检查是否匹配搜索查询
								  const isHighlighted = searchQuery && (
								    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
								    t.id.includes(searchQuery) ||
								    (t.owner && t.owner.toLowerCase().includes(searchQuery.toLowerCase()))
								  );

								  // 检查依赖状态
								  const { ready: dependenciesReady } = areDependenciesComplete(t, scheduled);
								  const isBlocked = (t.status === "planned" || !t.status) && !dependenciesReady;

								  // 判断是否提前开始
								  const earlyStart = isEarlyStart(t);

								  // 更丰富的颜色方案
								  const getTaskColor = () => {
								    if (t.status === "done") {
								      // 已完成的任务：根据配置决定是否显示超时效果
								      if (hideCompletedOverdue) {
								        return "task-done"; // 配置关闭时，所有已完成任务都显示绿色
								      }
								      return isCompletedOverdue(t) ? "task-ongoing-risk" : "task-done";
								    }
								    if (t.status === "ongoing") {
								      return isOverdue(t) ? "task-ongoing-risk" : "task-ongoing";
								    }
								    if (isBlocked) return "task-blocked";
								    return "task-planned";
								  };

								  // 根据任务状态计算显示位置和宽度
								  let taskBars = [];

								  if (t.status === "ongoing") {
								    // 进行中的任务：显示从actualStart到计划结束时间
								    const start = t.actualStart;
								    const now = getCurrentTimeISO();
								    const plannedEnd = t.planEnd;

								    // 已完成的部分（实线）
								    const completedLeft = toLeftPx(start);
								    const completedWidth = toWidthPx(start, now);

								    // 未来的部分（虚线）
								    const futureLeft = toLeftPx(now);
								    const futureWidth = toWidthPx(now, plannedEnd);

								    taskBars.push({
								      type: 'completed',
								      left: completedLeft,
								      width: completedWidth,
								      isDashed: false
								    });

								    if (futureWidth > 0) {
								      taskBars.push({
								        type: 'future',
								        left: futureLeft,
								        width: futureWidth,
								        isDashed: true
								      });
								    }
								  } else if (t.status === "done") {
								    // 已完成的任务：显示实际开始到实际结束
								    const start = t.actualStart || t.planStart;
								    const end = t.actualEnd || t.planEnd;
								    taskBars.push({
								      type: 'completed',
								      left: toLeftPx(start),
								      width: toWidthPx(start, end),
								      isDashed: false
								    });
								  } else {
								    // 未开始的任务：显示计划时间
								    const start = t.scheduledStart || t.planStart;
								    const end = t.planEnd;
								    taskBars.push({
								      type: 'planned',
								      left: toLeftPx(start),
								      width: toWidthPx(start, end),
								      isDashed: false
								    });
								  }

								  return (
								    <React.Fragment key={t.id}>
								      {/* 任务条 */}
								      {taskBars.map((bar, barIdx) => (
								        <div
								          key={`${t.id}-${barIdx}`}
								          className={`absolute h-4 ${getTaskColor()} rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 cursor-pointer border ${
								            isHighlighted ? 'border-yellow-400 border-2' :
								            isBlocked ? 'border-amber-500/50 border-dashed' :
								            earlyStart && barIdx === 0 ? 'border-l-4 border-l-cyan-400' :
								            'border-white/10'
								          } ${bar.isDashed ? 'gantt-future-dashed' : ''} gantt-task-bar ${isBlocked ? 'opacity-75' : ''}`}
								          style={{ left: bar.left, width: bar.width, top: barTop }}
								          title={`${t.name} | ${t.owner || '未分配'}${isBlocked ? ' (等待依赖)' : ''}${earlyStart ? ' (提前开始)' : ''}`}
								          onClick={() => setSelectedTask(t)}
								        />
								      ))}

								      {/* 文本和指示器层 - 覆盖整个任务条 */}
								      {taskBars.length > 0 && (
								        <div
								          className="absolute h-4 pointer-events-none"
								          style={{
								            left: taskBars[0].left,
								            width: taskBars.reduce((sum, bar) => sum + bar.width, 0),
								            top: barTop
								          }}
								        >
								          <div className="px-2 text-xs whitespace-nowrap leading-4 text-white font-medium">
								            #{t.id} {t.name}
								          </div>

								          {/* 进度指示器 */}
								          {t.status === "ongoing" && !isOverdue(t) && (
								            <div className="absolute right-1 top-1 w-2 h-2 bg-white rounded-full animate-ping" />
								          )}
								          {/* 超时指示器 */}
								          {isOverdue(t) && (
								            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full text-xs flex items-center justify-center text-white">!</div>
								          )}
								          {/* 提前开始标记 */}
								          {earlyStart && (
								            <div className="absolute -top-1 -left-1 w-4 h-4 bg-cyan-400 rounded-full flex items-center justify-center shadow-lg">
								              <span className="text-xs text-slate-900 font-bold">⚡</span>
								            </div>
								          )}
								          {/* 搜索高亮标记 */}
								          {isHighlighted && !earlyStart && (
								            <div className="absolute -top-1 -left-1 w-3 h-3 bg-yellow-400 rounded-full flex items-center justify-center">
								              <span className="text-xs text-black">★</span>
								            </div>
								          )}
								          {/* 被阻塞标记 */}
								          {isBlocked && (
								            <div className="absolute -top-1 left-1 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
								              <span className="text-xs text-white">🚫</span>
								            </div>
								          )}
								        </div>
								      )}
								    </React.Fragment>
								  );
								})}
							  </div>
							  {/* 闭合任务区域 */}
							</div>
							{/* 闭合阶段容器 */}
						  </div>
						);
					  })}
						</div>
					  </div>
				  </>
				);
			  })()}
			</div>

            {/* 中列：当前任务 */}
            {!ganttFullscreen && (
            <div className="col-span-3 bg-slate-800/60 rounded-2xl p-3 flex flex-col">
            <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="text-lg font-semibold">当前任务</div>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto" style={{ minHeight: 0 }}>
                {scheduled.filter((t) => t.status === "ongoing").length === 0 && (
                <div className="text-sm opacity-70">暂无进行中任务。可在“下一步”中启动。</div>
                )}
                {scheduled
                .filter((t) => t.status === "ongoing")
                .map((t) => {
                    const elapsedSeconds = t.actualStart
                    ? secondsBetween(t.actualStart, getCurrentTimeISO())
                    : 0;
                    const etaISO = calcETA(t);
                    const risk = isDelayRisk(t);

                    if (risk && !riskLoggedRef.current.has(t.id)) {
                    riskLoggedRef.current.add(t.id);
                    setLogs((l) =>
                        [
                        {
                            time: getCurrentTimeISO(),
                            action: "延期风险",
                            taskId: t.id,
                            detail: `ETA ${df(etaISO)} 超过计划或已用超出预计`,
                        },
                        ...l,
                        ].slice(0, 300)
                    );
                    }

                    // 计算计划耗时（分钟）
                    const plannedMin = Number(t.estMinutes || 0) || minutesBetween(t.planStart, t.planEnd);

                    // 计算剩余时间：当前时间距离计划结束时间
                    const now = getCurrentTimeISO();
                    const deltaSeconds = secondsBetween(now, t.planEnd);

                    return (
                    <div
                        key={t.id}
                        className={`bg-slate-900 rounded-xl p-3 ${risk ? "ring-2 ring-amber-500" : ""}`}
                    >
                        <div className="flex items-start justify-between gap-2">
                        <div className="font-medium flex-1 min-w-0">#{t.id} {t.name}</div>
                        <span className="text-xs opacity-70 shrink-0">{t.phase}</span>
                        </div>

                        <div className="mt-1 grid grid-cols-2 gap-2 text-xs opacity-80">
						  {/* 计划（跨两列，保证整行显示） */}
						  <div className="col-span-2">计划：{df(t.planStart)} → {df(t.planEnd)}</div>
						  <div>实际开始：{t.actualStart ? df(t.actualStart) : "-"}</div>
						  <div className="text-left">计划耗时：{plannedMin} 分钟</div>
						  <div className="col-span-2 text-left">ETA：{etaISO ? df(etaISO) : "—"}</div>
						  <div>执行人：{t.owner || "-"}</div>
						  <div className="text-left">检查人：{t.checker || "-"}</div>
						</div>

                        <div className="mt-2 flex items-center justify-between">
                        <div className="text-sm">
                            已用 {formatHMSFromSeconds(elapsedSeconds)}
                            {Number.isFinite(deltaSeconds) && (
                            <span
                                className={`ml-2 text-xs ${deltaSeconds < 0 ? "text-amber-400" : "text-emerald-400"}`}
                            >
                                {deltaSeconds < 0 ? `超时 ${formatHMSFromSeconds(Math.abs(deltaSeconds))}` : `剩余 ${formatHMSFromSeconds(deltaSeconds)}`}
                            </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button className="px-3 py-1 rounded-lg bg-emerald-600" onClick={() => completeTask(t.id)}>
                            标记完成
                            </button>
                        </div>
                        </div>

                        {risk && <div className="mt-2 text-xs text-amber-300">⚠ 延期风险：请关注资源与依赖，必要时调整后续任务。</div>}
                    </div>
                    );
                })}
            </div>

            {/* 操作记录（固定在底部，上面区域滚动） */}
            <div className="mt-4 shrink-0">
                <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setLogsCollapsed(!logsCollapsed)}>
                    <div className="text-sm font-semibold">操作记录</div>
                    <button className="text-xs opacity-70 hover:opacity-100 transition-opacity">
                        {logsCollapsed ? "▼ 展开" : "▲ 收起"}
                    </button>
                </div>
                {!logsCollapsed && (
                    <div className="max-h-48 overflow-auto space-y-1 text-xs hide-scrollbar">
                    {logs.map((g, i) => (
                        <div key={i} className="opacity-80">
                        [{df(g.time)}] {g.action} {g.taskId ? `#${g.taskId}` : ""} {g.detail ? `(${g.detail})` : ""}
                        </div>
                    ))}
                    </div>
                )}
            </div>
            </div>
            )}

            {/* 右列：下一步与通知 */}
            {!ganttFullscreen && (
            <div className="col-span-3 bg-slate-800/60 rounded-2xl p-3 flex flex-col">
            <div className="text-lg font-semibold mb-2 shrink-0">下一步任务</div>

            {/* 下一步任务列表 */}
            <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ minHeight: 0 }}>
                {nextList.length === 0 && (
                  <div className="text-sm opacity-70 text-center p-4">
                    <div>暂无可启动任务</div>
                    {blockedTasks.length > 0 && (
                      <div className="text-xs mt-1">有 {blockedTasks.length} 个任务在等待依赖</div>
                    )}
                  </div>
                )}
                {nextList.map((t) => {
                  const isUpcoming = enableUpcomingAlert && (t.willStartInMin ?? 9999) <= 30;
                  return (
                    <div
                      key={t.id}
                      className={`rounded-xl p-3 transition-all ${
                        isUpcoming
                          ? 'bg-amber-900/20 border border-amber-600/40'
                          : 'bg-slate-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium">
                          {isUpcoming && <span className="text-amber-500/70 mr-1 text-xs">⏰</span>}
                          #{t.id} {t.name}
                        </div>
                        <span className="text-xs opacity-70">{t.phase}</span>
                      </div>
                      <div className="mt-1 text-xs opacity-80 space-y-1">
                        <div>
                          预计开始：{df(t.scheduledStart || t.planStart)}
                          {isUpcoming && (
                            <span className="ml-2 text-amber-500/80 text-xs">
                              {t.willStartInMin > 0
                                ? `（计划${t.willStartInMin}分钟后开始）`
                                : `（应已开始，延迟${Math.abs(t.willStartInMin)}分钟）`
                              }
                            </span>
                          )}
                        </div>
                        <div>执行人：{t.owner || "-"} 检查人：{t.checker || "-"}</div>
                        <div>前置：{t.dependsOn?.length ? t.dependsOn.join(",") : "无"}</div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors"
                          onClick={() => startTask(t.id)}
                        >
                          开始任务
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* 被阻塞任务列表 */}
            {blockedTasks.length > 0 && (
              <div className="mt-4 shrink-0">
                <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                  被阻塞任务
                  <span className="text-xs bg-amber-600 text-white px-2 py-1 rounded-full">
                    {blockedTasks.length}
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto space-y-2 hide-scrollbar">
                  {blockedTasks.map((t) => (
                    <div key={t.id} className="bg-slate-900/60 rounded-lg p-2 border-l-4 border-amber-500">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-xs">#{t.id} {t.name}</div>
                        <span className="text-xs opacity-60">{t.phase}</span>
                      </div>
                      <div className="text-xs text-amber-300 mt-1">
                        🚫 {t.blockingReason}
                      </div>
                      <div className="text-xs opacity-70 mt-1">
                        执行人：{t.owner || "-"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 底部通知区（内容高度自适应，不抢占可滚动区） */}
            <div className="mt-4 shrink-0">
                <div className="text-sm font-semibold mb-2">即将开始（30分钟内）</div>
                <div className="space-y-2">
                {notifyList.length === 0 && <div className="text-xs opacity-70">无</div>}
                {notifyList.map((t) => (
                    <div key={t.id} className="text-xs bg-slate-900 rounded-lg p-2">
                    <div className="flex justify-between">
                        <span>#{t.id} {t.name}</span>
                        <span className="opacity-60">T-{t.willStartInMin}分</span>
                    </div>
                    <div className="opacity-80">联系人：{[t.owner, t.checker].filter(Boolean).join("、") || "-"}</div>
                    </div>
                ))}
                </div>
              </div>
            </div>
            )}
          </div>
      )}
    </div>

    {/* 庆功页（全屏覆盖，可手动开关） —— 重要：放在根容器内，且在根 </div> 之前 */}
    {showCongrats && (
      <div className="fixed inset-0 z-[999] flex items-center justify-center overflow-hidden">
        {/* 简洁背景 */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'url(/celebration-bg.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }} />

        {/* Canvas用于绘制烟花粒子拖尾效果 */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ display: 'block' }}
        />

        {/* 火箭发射效果（DOM渲染） */}
        <div className="absolute inset-0 pointer-events-none">
          {rockets.map((item) => {
            if (item.type === 'rocket') {
              // 火箭发射阶段 - 带拖尾效果
              return (
                <div
                  key={item.id}
                  className="absolute"
                  style={{
                    left: `${item.startX}%`,
                    top: `${item.startY}%`,
                    width: `${item.size}px`,
                    height: `${item.size}px`,
                  }}
                >
                  {/* 火箭本体 - 适度发光 */}
                  <div
                    className="absolute rounded-full"
                    style={{
                      width: `${item.size}px`,
                      height: `${item.size}px`,
                      backgroundColor: item.color,
                      boxShadow: `
                        0 0 ${item.size}px ${item.color},
                        0 0 ${item.size * 2}px ${item.color}
                      `,
                      animation: 'rocket-launch 1s linear forwards',
                      '--start-x': `0`,
                      '--start-y': `0`,
                      '--target-x': `calc(${item.targetX - item.startX}vw)`,
                      '--target-y': `calc(${item.targetY - item.startY}vh)`,
                    }}
                  />
                  {/* 拖尾效果 */}
                  <div
                    className="absolute"
                    style={{
                      width: `${item.size}px`,
                      height: `${item.size * 5}px`,
                      left: `0`,
                      top: `${item.size}px`,
                      background: `linear-gradient(to bottom, ${item.color}, transparent)`,
                      opacity: 0.7,
                      filter: 'blur(2px)',
                      animation: 'rocket-launch 1s linear forwards',
                      '--start-x': `0`,
                      '--start-y': `0`,
                      '--target-x': `calc(${item.targetX - item.startX}vw)`,
                      '--target-y': `calc(${item.targetY - item.startY}vh)`,
                    }}
                  />
                </div>
              );
            }
            // 粒子在Canvas上绘制，不需要DOM渲染
            return null;
          })}
        </div>

        {/* 主内容卡片 */}
        <div className="relative bg-gradient-to-br from-red-950/85 via-slate-900/85 to-amber-950/85 backdrop-blur-xl text-slate-100 rounded-3xl p-12 shadow-2xl text-center max-w-6xl mx-4 border-4 border-yellow-400/70 shadow-yellow-500/40">
          {/* 右上角关闭按钮 */}
          <button
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-700/50 hover:bg-slate-600 transition-all duration-200 text-slate-300 hover:text-white group"
            onClick={() => setShowCongrats(false)}
            aria-label="关闭"
          >
          </button>

          {/* 顶部标语 */}
          <div className="mb-6 px-4">
            <p className="text-xl font-bold text-yellow-400 tracking-widest flex justify-between px-8">
              <span>慎密组织</span>
              <span>听从指挥</span>
              <span>团结协作</span>
              <span>严格执行</span>
              <span>一次成功</span>
            </p>
          </div>

          {/* 标题 */}
          <div className="mb-6">
            <h1 className="text-5xl font-extrabold bg-gradient-to-r from-yellow-300 via-yellow-400 to-red-400 bg-clip-text text-transparent whitespace-nowrap drop-shadow-lg">
              🎉祝贺集团公司核智枢ERP 1.5升级成功！
            </h1>
          </div>

          {/* 副标题 */}
          <div className="text-3xl leading-relaxed">
            <span className="text-red-400 font-bold">感谢各团队的辛苦努力付出！</span>
          </div>
        </div>
      </div>
    )}

	{/* 任务详情弹窗 */}
	{selectedTask && (
	  <div className="fixed inset-0 z-[998] bg-black/70 flex items-center justify-center p-4">
	    <div className="bg-slate-800 text-slate-100 rounded-2xl p-6 shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
	      <div className="flex items-center justify-between mb-4">
	        <div className="flex items-center gap-3">
	          <div className={`w-4 h-4 rounded-full ${
	            selectedTask.status === "done" ? (hideCompletedOverdue ? "bg-emerald-500" : (isCompletedOverdue(selectedTask) ? "bg-red-500" : "bg-emerald-500")) :
	            selectedTask.status === "ongoing" ? "bg-amber-500 animate-pulse" :
	            "bg-sky-500"
	          }`} />
	          <h2 className="text-xl font-bold">#{selectedTask.id} {selectedTask.name}</h2>
	        </div>
	        <button
	          className="p-2 hover:bg-slate-700 rounded-lg transition-colors"
	          onClick={() => setSelectedTask(null)}
	        >
	          ✕
	        </button>
	      </div>

	      <div className="grid grid-cols-2 gap-4 text-sm">
	        <div className="space-y-2">
	          <div><span className="opacity-70">阶段：</span>{selectedTask.phase}</div>
	          <div><span className="opacity-70">状态：</span>
	            <span className={`ml-2 px-2 py-1 rounded text-xs ${
	              selectedTask.status === "done" ? (hideCompletedOverdue ? "bg-emerald-600" : (isCompletedOverdue(selectedTask) ? "bg-red-600" : "bg-emerald-600")) :
	              selectedTask.status === "ongoing" ? "bg-amber-600" :
	              "bg-slate-600"
	            }`}>
	              {selectedTask.status === "done" ? (hideCompletedOverdue ? "已完成" : (isCompletedOverdue(selectedTask) ? "已完成(超时)" : "已完成")) :
	               selectedTask.status === "ongoing" ? "进行中" : "未开始"}
	            </span>
	          </div>
	          <div><span className="opacity-70">牵头人：</span>{selectedTask.leader || "-"}</div>
	          <div><span className="opacity-70">执行人：</span>{selectedTask.owner || "-"}</div>
	          <div><span className="opacity-70">检查人：</span>{selectedTask.checker || "-"}</div>
	        </div>

	        <div className="space-y-2">
	          <div><span className="opacity-70">预计耗时：</span>{selectedTask.estMinutes || 0} 分钟</div>
	          <div><span className="opacity-70">计划开始：</span>{df(selectedTask.planStart)}</div>
	          <div><span className="opacity-70">计划结束：</span>{df(selectedTask.planEnd)}</div>
	          <div><span className="opacity-70">实际开始：</span>{selectedTask.actualStart ? df(selectedTask.actualStart) : "-"}</div>
	          <div><span className="opacity-70">实际结束：</span>{selectedTask.actualEnd ? df(selectedTask.actualEnd) : "-"}</div>
	        </div>
	      </div>

	      {selectedTask.dependsOn && selectedTask.dependsOn.length > 0 && (
	        <div className="mt-4">
	          <div className="text-sm opacity-70 mb-2">前置任务：</div>
	          <div className="space-y-2">
	            {selectedTask.dependsOn.map(depId => {
	              const depTask = scheduled.find(t => t.id === depId);
	              const isComplete = depTask && depTask.status === "done";
	              return (
	                <div key={depId} className={`px-3 py-2 rounded-lg flex items-center justify-between ${
	                  isComplete ? 'bg-emerald-900/50 border border-emerald-700' :
	                  depTask ? 'bg-amber-900/50 border border-amber-700' :
	                  'bg-red-900/50 border border-red-700'
	                }`}>
	                  <div className="flex items-center gap-2">
	                    <div className={`w-2 h-2 rounded-full ${
	                      isComplete ? 'bg-emerald-500' :
	                      depTask ? 'bg-amber-500' :
	                      'bg-red-500'
	                    }`} />
	                    <span className="text-sm">#{depId} {depTask?.name || "未知任务"}</span>
	                  </div>
	                  <span className={`text-xs px-2 py-1 rounded ${
	                    isComplete ? 'bg-emerald-600 text-white' :
	                    depTask?.status === 'ongoing' ? 'bg-amber-600 text-white' :
	                    depTask ? 'bg-slate-600 text-white' :
	                    'bg-red-600 text-white'
	                  }`}>
	                    {isComplete ? '已完成' :
	                     depTask?.status === 'ongoing' ? '进行中' :
	                     depTask ? '未开始' : '不存在'}
	                  </span>
	                </div>
	              );
	            })}
	          </div>

	          {/* 依赖状态总结 */}
	          {(() => {
	            const { ready } = areDependenciesComplete(selectedTask, scheduled);
	            if (!ready) {
	              return (
	                <div className="mt-3 p-3 bg-amber-900/30 border border-amber-700 rounded-lg">
	                  <div className="text-sm text-amber-300 font-medium">🚫 任务被阻塞</div>
	                  <div className="text-xs text-amber-200 mt-1">
	                    {getBlockingReason(selectedTask, scheduled)}
	                  </div>
	                </div>
	              );
	            } else {
	              return (
	                <div className="mt-3 p-3 bg-emerald-900/30 border border-emerald-700 rounded-lg">
	                  <div className="text-sm text-emerald-300 font-medium">✅ 依赖已满足</div>
	                  <div className="text-xs text-emerald-200 mt-1">所有前置任务已完成，可以启动</div>
	                </div>
	              );
	            }
	          })()}
	        </div>
	      )}

	      {selectedTask.status === "ongoing" && (
	        <div className="mt-4 p-3 bg-slate-900 rounded-lg">
	          <div className="text-sm font-medium mb-2">当前进度</div>
	          <div className="space-y-2 text-xs">
	            {(() => {
	              const elapsedSeconds = selectedTask.actualStart ? secondsBetween(selectedTask.actualStart, getCurrentTimeISO()) : 0;
	              // 计算剩余时间：当前时间距离计划结束时间
	              const now = getCurrentTimeISO();
	              const remainingSeconds = secondsBetween(now, selectedTask.planEnd);

	              return (
	                <>
	                  <div>已用时：{formatHMSFromSeconds(elapsedSeconds)}</div>
	                  <div>计划结束：{df(selectedTask.planEnd)}</div>
	                  {remainingSeconds >= 0 ? (
	                    <div className="text-emerald-400">剩余时间：{formatHMSFromSeconds(remainingSeconds)}</div>
	                  ) : (
	                    <div className="text-amber-400">超时：{formatHMSFromSeconds(Math.abs(remainingSeconds))}</div>
	                  )}
	                  <div>ETA：{calcETA(selectedTask) ? df(calcETA(selectedTask)) : "-"}</div>
	                </>
	              );
	            })()}
	            {isDelayRisk(selectedTask) && (
	              <div className="text-amber-300">⚠ 延期风险：请关注资源与依赖</div>
	            )}
	          </div>
	        </div>
	      )}

	      <div className="mt-6 flex gap-3">
	        {selectedTask.status === "planned" && (() => {
	          const { ready } = areDependenciesComplete(selectedTask, scheduled);
	          return (
	            <button
	              className={`px-4 py-2 rounded-lg transition-colors ${
	                ready
	                  ? 'bg-indigo-600 hover:bg-indigo-700'
	                  : 'bg-slate-600 cursor-not-allowed opacity-50'
	              }`}
	              onClick={() => {
	                if (ready && startTask(selectedTask.id)) {
	                  setSelectedTask(null);
	                }
	              }}
	              disabled={!ready}
	              title={ready ? "开始任务" : "依赖未完成，无法启动"}
	            >
	              {ready ? "开始任务" : "等待依赖"}
	            </button>
	          );
	        })()}
	        {selectedTask.status === "ongoing" && (
	          <button
	            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
	            onClick={() => {
	              completeTask(selectedTask.id);
	              setSelectedTask(null);
	            }}
	          >
	            标记完成
	          </button>
	        )}
	        <button
	          className="px-4 py-2 bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors"
	          onClick={() => setSelectedTask(null)}
	        >
	          关闭
	        </button>
	      </div>
	    </div>
	  </div>
	)}
  </div>
  );
}
