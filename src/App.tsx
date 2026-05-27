import type * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

type Theme = "light" | "dark" | "aurora";
type View = "dashboard" | "profiles" | "sessions" | "tasks" | "results" | "settings";

type Profile = {
  id: string;
  profileNumber: number;
  name: string;
  tag: string;
  groupId?: string | null;
  group: string;
  proxyId?: string | null;
  platformId?: string | null;
  account: string;
  loginUsername: string;
  loginPassword: string;
  twoFaSecret: string;
  note: string;
  platformUrl: string;
  proxy: string;
  cookie: string;
  cookieJson: string;
  locale: string;
  timezone: string;
  userAgent: string;
  windowWidth: number;
  windowHeight: number;
  webrtcMode: string;
  blockImages: boolean;
  muteAudio: boolean;
  blockAutoplay: boolean;
  hardwareAcceleration: boolean;
  ignoreHttpsErrors: boolean;
  launchArgs: string;
  disableWebgl: boolean;
  disableCanvas: boolean;
  disableFonts: boolean;
  disablePlugins: boolean;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  last: string;
  status: string;
  startUrl: string;
  userDataDir: string;
  lastError: string;
};

type Group = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
};

type ProxyItem = {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  location: string;
  lastCheck: string;
  status: string;
};

type Platform = {
  id: string;
  name: string;
  url: string;
  logoPath: string;
  isBuiltin: boolean;
  createdAt: string;
};

type BrowserSession = {
  id: string;
  profileId: string;
  profile: string;
  site: string;
  runtime: string;
  memory: string;
  cpu: string;
  url: string;
  status: string;
  pid?: number | null;
  port?: number | null;
  startedAt: string;
  error: string;
};

type Task = {
  id: string;
  name: string;
  profileId: string;
  profile: string;
  adapter: string;
  site: string;
  startUrl: string;
  script: string;
  progress: number;
  lastRun: string;
  errors: number;
  status: string;
};

type ResultItem = {
  id: string;
  title: string;
  site: string;
  task: string;
  profile: string;
  fields: number;
  time: string;
  status: string;
  payload: unknown;
};

type SiteAdapter = {
  id: string;
  name: string;
  site: string;
  description: string;
  mode: string;
  script: string;
  enabled: boolean;
};

type Settings = {
  theme: string;
  browserExecutablePath: string;
  browserMode: string;
  maxConcurrentWindows: number;
  profileStoragePath: string;
  resultExportPath: string;
  logLevel: string;
};

type RuntimeStatus = {
  backendReady: boolean;
  browserReady: boolean;
  browserPath: string;
  serviceUrl: string;
  dataDir: string;
  error: string;
};

type LogEntry = {
  time: string;
  level: string;
  message: string;
};

type AppSnapshot = {
  groups: Group[];
  proxies: ProxyItem[];
  platforms: Platform[];
  profiles: Profile[];
  browserSessions: BrowserSession[];
  tasks: Task[];
  taskRuns: unknown[];
  resultItems: ResultItem[];
  siteAdapters: SiteAdapter[];
  settings: Settings;
  runtimeStatus: RuntimeStatus;
  logs: LogEntry[];
};

type ProfileInput = {
  id?: string;
  name: string;
  tag: string;
  groupId?: string | null;
  group: string;
  groupName: string;
  proxyId?: string | null;
  proxyUrl: string;
  proxyName: string;
  platformId?: string | null;
  account: string;
  loginUsername: string;
  loginPassword: string;
  twoFaSecret: string;
  note: string;
  platformUrl: string;
  platformName: string;
  customPlatformUrl: string;
  proxy: string;
  cookie: string;
  cookieJson: string;
  locale: string;
  timezone: string;
  userAgent: string;
  windowWidth: number;
  windowHeight: number;
  webrtcMode: string;
  blockImages: boolean;
  muteAudio: boolean;
  blockAutoplay: boolean;
  hardwareAcceleration: boolean;
  ignoreHttpsErrors: boolean;
  launchArgs: string;
  disableWebgl: boolean;
  disableCanvas: boolean;
  disableFonts: boolean;
  disablePlugins: boolean;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  startUrl: string;
};

type TaskInput = {
  id?: string;
  name: string;
  profileId: string;
  adapter: string;
  site: string;
  startUrl: string;
  script: string;
};

type Notice = {
  type: "info" | "error" | "success";
  text: string;
};

const emptySettings: Settings = {
  theme: "light",
  browserExecutablePath: "",
  browserMode: "visible",
  maxConcurrentWindows: 5,
  profileStoragePath: "",
  resultExportPath: "",
  logLevel: "info",
};

const TIMEZONE_OPTIONS = [
  "Asia/Shanghai", "Asia/Hong_Kong", "Asia/Tokyo", "Asia/Seoul", "Asia/Singapore",
  "Asia/Bangkok", "Asia/Kolkata", "Asia/Dubai", "Asia/Jakarta",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "America/Sao_Paulo", "America/Mexico_City", "America/Toronto",
  "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Moscow",
  "Australia/Sydney", "Pacific/Auckland", "UTC",
];

const LOCALE_OPTIONS = [
  { value: "zh-CN", label: "中文（简体）" },
  { value: "zh-TW", label: "中文（繁体）" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "es-ES", label: "Español" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "ru-RU", label: "Русский" },
  { value: "ar-SA", label: "العربية" },
  { value: "th-TH", label: "ไทย" },
  { value: "vi-VN", label: "Tiếng Việt" },
  { value: "id-ID", label: "Bahasa Indonesia" },
];


function generateRandomFingerprint(): Partial<ProfileInput> {
  const widths = [1280, 1366, 1440, 1536, 1600, 1920];
  const heights = [720, 768, 800, 900, 1024, 1080];
  const dprs = [1, 1.5, 2, 2.5, 3];
  const webrtcModes = ["default", "privacy", "disable"];
  const uas = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  ];
  const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];
  const w = pick(widths);
  const h = pick(heights);
  return {
    userAgent: pick(uas),
    screenWidth: w,
    screenHeight: h,
    windowWidth: w,
    windowHeight: h,
    devicePixelRatio: pick(dprs),
    webrtcMode: pick(webrtcModes),
    timezone: pick(TIMEZONE_OPTIONS),
    locale: pick(LOCALE_OPTIONS).value,
  };
}

const emptySnapshot: AppSnapshot = {
  groups: [{ id: "default", name: "默认", color: "#3b82f6", createdAt: "system" }],
  proxies: [],
  platforms: [],
  profiles: [],
  browserSessions: [],
  tasks: [],
  taskRuns: [],
  resultItems: [],
  siteAdapters: [],
  settings: emptySettings,
  runtimeStatus: {
    backendReady: false,
    browserReady: false,
    browserPath: "",
    serviceUrl: "",
    dataDir: "",
    error: "",
  },
  logs: [],
};

const defaultScript = `() => {
  const links = Array.from(document.querySelectorAll("a[href]"))
    .slice(0, 40)
    .map((node) => ({
      text: (node.textContent || "").trim().slice(0, 120),
      href: node.href,
    }));
  const description = document.querySelector('meta[name="description"]')?.content || "";
  return {
    title: document.title,
    url: location.href,
    description,
    links,
    textSample: (document.body?.innerText || "").replace(/\\s+/g, " ").slice(0, 1200),
  };
}`;

const navItems: Array<{ id: View; label: string; title: string; desc: string; icon: React.ReactNode }> = [
  {
    id: "dashboard",
    label: "控制台",
    title: "Browser Mission Control",
    desc: "可视化 Chromium 多 Profile 采集工作台",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h7v7H4z" />
        <path d="M13 5h7v4h-7z" />
        <path d="M13 11h7v8h-7z" />
        <path d="M4 14h7v5H4z" />
      </svg>
    ),
  },
  {
    id: "profiles",
    label: "Profile",
    title: "Profile Matrix",
    desc: "账号、代理、Cookie 与用户目录管理",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" />
        <path d="M4 12h16" />
        <path d="M4 17h16" />
        <path d="M8 5v4" />
        <path d="M15 10v4" />
        <path d="M11 15v4" />
      </svg>
    ),
  },
  {
    id: "sessions",
    label: "会话",
    title: "Visible Browser Sessions",
    desc: "可见 Chromium 窗口、资源和当前 URL",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M3 9h18" />
        <path d="M7 7h.01" />
        <path d="M10 7h.01" />
      </svg>
    ),
  },
  {
    id: "tasks",
    label: "任务",
    title: "Task Command Queue",
    desc: "adapter 驱动的采集任务队列",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6h11" />
        <path d="M9 12h11" />
        <path d="M9 18h11" />
        <path d="m4 6 1 1 2-2" />
        <path d="m4 12 1 1 2-2" />
        <path d="m4 18 1 1 2-2" />
      </svg>
    ),
  },
  {
    id: "results",
    label: "结果",
    title: "Result Stream",
    desc: "结构化 JSON 结果、筛选和导出",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "设置",
    title: "System Settings",
    desc: "并发、路径、浏览器行为和日志参数",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .57 1.7 1.7 0 0 0-.4 1.11V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-.4-1.11 1.7 1.7 0 0 0-1-.57 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.57-1A1.7 1.7 0 0 0 2.92 13H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.11-.4 1.7 1.7 0 0 0 .57-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.38-.15.7-.35 1-.57.3-.22.4-.67.4-1.11V3a2 2 0 1 1 4 0v.09c0 .44.1.89.4 1.11.3.22.62.42 1 .57a1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.15.38.35.7.57 1 .22.3.67.4 1.11.4H21a2 2 0 1 1 0 4h-.09c-.44 0-.89.1-1.11.4-.22.3-.42.62-.57 1Z" />
      </svg>
    ),
  },
];

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [query, setQuery] = useState("");
  const [profileFilter, setProfileFilter] = useState("all");
  const [profileGroupFilter, setProfileGroupFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState("all");
  const [selectedProfileId, setSelectedProfileId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [selectedResultId, setSelectedResultId] = useState("");
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [profileSort, setProfileSort] = useState<{ key: "number" | "name" | "group" | "proxy"; direction: "asc" | "desc" }>({
    key: "number",
    direction: "asc",
  });
  const [profileEditor, setProfileEditor] = useState<ProfileInput | null>(null);
  const [taskEditor, setTaskEditor] = useState<TaskInput | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Settings>(emptySettings);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const activeMeta = navItems.find((item) => item.id === activeView) ?? navItems[0];
  const theme = normalizeTheme(snapshot.settings.theme);

  const selectedProfile = useMemo(
    () => snapshot.profiles.find((item) => item.id === selectedProfileId) ?? snapshot.profiles[0],
    [selectedProfileId, snapshot.profiles],
  );
  const selectedSession = useMemo(
    () => snapshot.browserSessions.find((item) => item.id === selectedSessionId) ?? snapshot.browserSessions[0],
    [selectedSessionId, snapshot.browserSessions],
  );
  const selectedTask = useMemo(
    () => snapshot.tasks.find((item) => item.id === selectedTaskId) ?? snapshot.tasks[0],
    [selectedTaskId, snapshot.tasks],
  );
  const selectedResult = useMemo(
    () => snapshot.resultItems.find((item) => item.id === selectedResultId) ?? snapshot.resultItems[0],
    [selectedResultId, snapshot.resultItems],
  );
  const groupById = useMemo(() => new Map(snapshot.groups.map((group) => [group.id, group])), [snapshot.groups]);
  const proxyById = useMemo(() => new Map(snapshot.proxies.map((proxy) => [proxy.id, proxy])), [snapshot.proxies]);

  const filteredProfiles = useMemo(() => {
    const rows = snapshot.profiles.filter((profile) => {
      const matchesQuery = matches(
        query,
        profile.name,
        profile.account,
        profile.note,
        profileProxy(profile, proxyById),
        profileGroupName(profile, groupById),
        profile.startUrl,
      );
      const matchesFilter =
        profileFilter === "all" ||
        (profileFilter === "running" && profile.status === "running") ||
        (profileFilter === "stopped" && profile.status !== "running" && !profile.lastError) ||
        (profileFilter === "error" && Boolean(profile.lastError));
      const matchesGroup =
        profileGroupFilter === "all" || profile.groupId === profileGroupFilter;
      return matchesQuery && matchesFilter && matchesGroup;
    });
    return [...rows].sort((a, b) => {
      const direction = profileSort.direction === "asc" ? 1 : -1;
      const av = profileSortValue(a, profileSort.key, groupById, proxyById);
      const bv = profileSortValue(b, profileSort.key, groupById, proxyById);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * direction;
      return String(av).localeCompare(String(bv), "zh-Hans-CN") * direction;
    });
  }, [groupById, profileFilter, profileGroupFilter, profileSort, proxyById, query, snapshot.profiles]);

  const filteredTasks = useMemo(() => {
    return snapshot.tasks.filter((task) => {
      const matchesQuery = matches(query, task.name, task.profile, task.adapter, task.site, task.startUrl);
      const matchesFilter = taskFilter === "all" || task.status === taskFilter;
      return matchesQuery && matchesFilter;
    });
  }, [query, snapshot.tasks, taskFilter]);

  const filteredResults = useMemo(
    () =>
      snapshot.resultItems.filter((item) =>
        matches(query, item.title, item.site, item.task, item.profile, JSON.stringify(item.payload)),
      ),
    [query, snapshot.resultItems],
  );

  useEffect(() => {
    void loadSnapshot();
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<AppSnapshot>("browser-sessions-updated", (event) => {
      setSnapshot(event.payload);
    }).then((dispose) => {
      if (disposed) {
        dispose();
        return;
      }
      unlisten = dispose;
    });
    return () => {
      disposed = true;
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  useEffect(() => {
    if (!hasTauriRuntime()) return undefined;
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 4000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    setSettingsDraft(snapshot.settings);
  }, [snapshot.settings, theme]);

  useEffect(() => {
    if (!selectedProfileId && snapshot.profiles[0]) {
      setSelectedProfileId(snapshot.profiles[0].id);
    }
    if (!selectedSessionId && snapshot.browserSessions[0]) {
      setSelectedSessionId(snapshot.browserSessions[0].id);
    }
    if (!selectedTaskId && snapshot.tasks[0]) {
      setSelectedTaskId(snapshot.tasks[0].id);
    }
    if (!selectedResultId && snapshot.resultItems[0]) {
      setSelectedResultId(snapshot.resultItems[0].id);
    }
  }, [
    selectedProfileId,
    selectedResultId,
    selectedSessionId,
    selectedTaskId,
    snapshot.browserSessions,
    snapshot.profiles,
    snapshot.resultItems,
    snapshot.tasks,
  ]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function loadSnapshot() {
    setLoading(true);
    try {
      await refreshSnapshot();
    } finally {
      setLoading(false);
    }
  }

  async function refreshSnapshot() {
    if (!hasTauriRuntime()) {
      setSnapshot(emptySnapshot);
      return;
    }
    try {
      await runCommand("app_snapshot", {}, "状态已刷新", { silent: true });
    } catch {
      // keep current snapshot on error instead of wiping
    }
  }

  async function runCommand<T extends Record<string, unknown>>(
    command: string,
    args?: T,
    success?: string,
    options?: { silent?: boolean },
  ) {
    if (!hasTauriRuntime()) {
      if (!options?.silent) {
        setNotice({ type: "info", text: "请在 Tauri 桌面应用中使用后端操作" });
      }
      return snapshot;
    }
    try {
      const next = await invoke<AppSnapshot>(command, args ?? {});
      setSnapshot(next);
      if (success && !options?.silent) {
        setNotice({ type: "success", text: success });
      }
      return next;
    } catch (error) {
      const message = readableError(error);
      if (!options?.silent) {
        setNotice({ type: "error", text: message });
      }
      throw error;
    }
  }

  async function withBusy<T>(label: string, work: () => Promise<T>) {
    setBusy(label);
    try {
      return await work();
    } catch {
      return undefined;
    } finally {
      setBusy("");
    }
  }

  async function changeTheme(nextTheme: Theme) {
    await withBusy("theme", () => runCommand("set_theme", { theme: nextTheme }, "主题已切换"));
  }

  async function saveProfile() {
    if (!profileEditor) return;
    if (!profileEditor.name.trim()) {
      setNotice({ type: "error", text: "Profile 名称不能为空" });
      return;
    }
    await withBusy("profile", async () => {
      const next = await runCommand("save_profile", { input: profileEditor }, "Profile 已保存");
      const saved =
        (profileEditor.id ? next.profiles.find((item) => item.id === profileEditor.id) : undefined) ??
        next.profiles.find((item) => item.name === profileEditor.name.trim()) ??
        next.profiles[0];
      if (saved) setSelectedProfileId(saved.id);
      setProfileEditor(null);
    });
  }

  async function patchProfile(profile: Profile, patch: Partial<ProfileInput>) {
    const input = profileToInput(profile);
    await withBusy(`profile-${profile.id}`, async () => {
      await runCommand("save_profile", { input: { ...input, ...patch } }, "Profile 已更新");
    });
  }

  async function deleteProfile(profile: Profile) {
    const ok = window.confirm(`删除 Profile「${profile.name}」？本地用户数据目录也会一起删除。`);
    if (!ok) return;
    await withBusy("profile", async () => {
      await runCommand("delete_profile", { profileId: profile.id }, "Profile 已删除");
      setSelectedProfileId("");
      setSelectedProfileIds((current) => current.filter((id) => id !== profile.id));
    });
  }

  async function deleteSelectedProfiles() {
    if (!selectedProfileIds.length) return;
    const names = snapshot.profiles.filter((profile) => selectedProfileIds.includes(profile.id)).map((profile) => profile.name);
    const ok = window.confirm(`删除选中的 ${selectedProfileIds.length} 个 Profile？\n${names.join("、")}`);
    if (!ok) return;
    await withBusy("profiles-delete", async () => {
      await runCommand("delete_profiles", { profileIds: selectedProfileIds }, "Profile 已批量删除");
      setSelectedProfileIds([]);
      if (selectedProfileIds.includes(selectedProfileId)) {
        setSelectedProfileId("");
      }
    });
  }

  async function duplicateProfile(profile: Profile) {
    await withBusy(`duplicate-${profile.id}`, async () => {
      const next = await runCommand("duplicate_profile", { profileId: profile.id }, `Profile「${profile.name}」已复制`);
      const copied = next.profiles[0];
      if (copied) setSelectedProfileId(copied.id);
    });
  }

  async function clearProfileCache(profile: Profile) {
    await withBusy(`cache-${profile.id}`, () =>
      runCommand("clear_profile_cache", { profileId: profile.id }, `已清除「${profile.name}」缓存`)
    );
  }

  function toggleProfileSelection(profileId: string, checked: boolean) {
    setSelectedProfileIds((current) => {
      if (checked) {
        return current.includes(profileId) ? current : [...current, profileId];
      }
      return current.filter((id) => id !== profileId);
    });
  }

  function focusProfile(profileId: string) {
    setSelectedProfileId(profileId);
    const session = snapshot.browserSessions.find((item) => item.profileId === profileId);
    if (session) {
      setSelectedSessionId(session.id);
    } else {
      setSelectedSessionId("");
    }
  }

  function focusSession(sessionId: string) {
    setSelectedSessionId(sessionId);
    const session = snapshot.browserSessions.find((item) => item.id === sessionId);
    if (session) {
      setSelectedProfileId(session.profileId);
    }
  }

  async function startProfile(profile: Profile) {
    setSnapshot((prev) => ({
      ...prev,
      profiles: prev.profiles.map((p) =>
        p.id === profile.id ? { ...p, status: "starting" } : p
      ),
    }));
    await withBusy(profile.id, () => runCommand("start_profile", { profileId: profile.id }, "可见 Chromium 窗口已启动"));
    setActiveView("sessions");
  }

  async function stopProfile(profile: Profile) {
    await withBusy(profile.id, () => runCommand("stop_profile", { profileId: profile.id }, "浏览器进程已停止"));
  }

  async function saveTask() {
    if (!taskEditor) return;
    if (!taskEditor.name.trim()) {
      setNotice({ type: "error", text: "任务名称不能为空" });
      return;
    }
    if (!taskEditor.profileId) {
      setNotice({ type: "error", text: "请选择绑定 Profile" });
      return;
    }
    await withBusy("task", async () => {
      const next = await runCommand("save_task", { input: taskEditor }, "任务已保存");
      const saved = next.tasks.find((item) => item.name === taskEditor.name.trim()) ?? next.tasks[0];
      if (saved) setSelectedTaskId(saved.id);
      setTaskEditor(null);
    });
  }

  async function deleteTask(task: Task) {
    const ok = window.confirm(`删除任务「${task.name}」？`);
    if (!ok) return;
    await withBusy(task.id, async () => {
      await runCommand("delete_task", { taskId: task.id }, "任务已删除");
      setSelectedTaskId("");
    });
  }

  async function runTask(task: Task) {
    await withBusy(task.id, () => runCommand("run_task", { taskId: task.id }, "任务执行完成，结果已保存"));
    setActiveView("results");
  }

  async function exportResults(format: "json" | "csv") {
    try {
      setBusy(`export-${format}`);
      const path = await invoke<string>("export_results", { request: { format } });
      setNotice({ type: "success", text: `已导出 ${format.toUpperCase()}：${path}` });
    } catch (error) {
      setNotice({ type: "error", text: readableError(error) });
    } finally {
      setBusy("");
    }
  }

  async function saveSettings() {
    const nextSettings = {
      ...settingsDraft,
      maxConcurrentWindows: Number(settingsDraft.maxConcurrentWindows) || 1,
    };
    await withBusy("settings", () => runCommand("update_settings", { settings: nextSettings }, "设置已保存"));
  }

  async function saveGroup(input: { id?: string; name: string; color: string }) {
    await withBusy("group", () => runCommand("save_group", { input }, "分组已保存"));
  }

  async function deleteGroup(group: Group) {
    const ok = window.confirm(`删除分组「${group.name}」？非空分组下的 Profile 会移动到默认分组。`);
    if (!ok) return;
    await withBusy(`group-${group.id}`, () => runCommand("delete_group", { groupId: group.id }, "分组已删除"));
  }

  async function saveProxy(input: { id?: string; name: string; url: string; username?: string; password?: string }) {
    await withBusy("proxy", () => runCommand("save_proxy", { input }, "代理已保存"));
  }

  async function deleteProxy(proxy: ProxyItem) {
    const ok = window.confirm(`删除代理「${proxy.name}」？已绑定 Profile 会改为不使用代理。`);
    if (!ok) return;
    await withBusy(`proxy-${proxy.id}`, () => runCommand("delete_proxy", { proxyId: proxy.id }, "代理已删除"));
  }

  async function importProxies(text: string) {
    await withBusy("proxy-import", () => runCommand("import_proxies", { text }, "代理已导入"));
  }

  async function testProxy(proxy: ProxyItem) {
    await withBusy(`proxy-test-${proxy.id}`, () => runCommand("test_proxy", { proxyId: proxy.id }, "代理检测完成"));
  }

  async function savePlatform(input: { id?: string; name: string; url: string; logoPath?: string }) {
    await withBusy("platform", () => runCommand("save_platform", { input }, "平台已保存"));
  }

  async function deletePlatform(platform: Platform) {
    const ok = window.confirm(`删除平台「${platform.name}」？`);
    if (!ok) return;
    await withBusy(`platform-${platform.id}`, () => runCommand("delete_platform", { platformId: platform.id }, "平台已删除"));
  }

  async function chooseBrowserPath() {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "Executable", extensions: ["app", "exe", "bin"] }],
      });
      const path = Array.isArray(selected) ? selected[0] : selected;
      if (!path) return;
      setSettingsDraft((current) => ({ ...current, browserExecutablePath: path }));
      await withBusy("browser-path", () =>
        runCommand("set_browser_executable_path", { path }, "浏览器路径已更新"),
      );
    } catch (error) {
      setNotice({ type: "error", text: readableError(error) });
    }
  }

  function openProfileEditor(profile?: Profile) {
    setActiveView("profiles");
    setProfileEditor(
          profile
        ? profileToInput(profile)
        : {
            name: "Research Profile",
            tag: "",
            groupId: "default",
            group: "",
            groupName: "默认",
            account: "",
            loginUsername: "",
            loginPassword: "",
            twoFaSecret: "",
            note: "通用站点",
            platformId: snapshot.platforms[0]?.id ?? null,
            platformUrl: "",
            platformName: "",
            customPlatformUrl: "",
            proxyId: null,
            proxy: "",
            proxyUrl: "",
            proxyName: "",
            cookie: "",
            cookieJson: "",
            locale: "zh-CN",
            timezone: "Asia/Shanghai",
            userAgent: "",
            windowWidth: 1280,
            windowHeight: 720,
            webrtcMode: "privacy",
            blockImages: false,
            muteAudio: false,
            blockAutoplay: false,
            hardwareAcceleration: true,
            ignoreHttpsErrors: false,
            launchArgs: "",
            disableWebgl: false,
            disableCanvas: false,
            disableFonts: false,
            disablePlugins: false,
            screenWidth: 0,
            screenHeight: 0,
            devicePixelRatio: 0,
            startUrl: snapshot.platforms[0]?.url ?? "https://example.com",
          },
    );
  }

  function openTaskEditor(task?: Task) {
    setActiveView("tasks");
    const firstProfile = selectedProfile ?? snapshot.profiles[0];
    const firstAdapter = snapshot.siteAdapters[0];
    setTaskEditor(
      task
        ? {
            id: task.id,
            name: task.name,
            profileId: task.profileId,
            adapter: task.adapter,
            site: task.site,
            startUrl: task.startUrl,
            script: task.script,
          }
        : {
            name: "Page Snapshot",
            profileId: firstProfile?.id ?? "",
            adapter: firstAdapter?.id ?? "generic.page_snapshot",
            site: firstAdapter?.site ?? "Any Website",
            startUrl: firstProfile?.startUrl || "https://example.com",
            script: firstAdapter?.script || defaultScript,
          },
    );
  }

  const liveCount = snapshot.browserSessions.length;
  const readyProfiles = snapshot.profiles.filter((item) => !item.lastError).length;
  const activeTasks = snapshot.tasks.filter((item) => item.status === "running").length;
  const riskCount =
    snapshot.profiles.filter((item) => item.lastError).length +
    snapshot.tasks.filter((item) => item.status === "error").length;
  const cockpitProfile = selectedProfile ?? snapshot.profiles[0];
  const cockpitSession =
    cockpitProfile && snapshot.browserSessions.find((item) => item.profileId === cockpitProfile.id);

  return (
    <div className="app">
      <aside className="rail">
        <button className="mark" type="button" title="x-browser" onClick={() => setActiveView("dashboard")}>
          <LogoMark />
        </button>
        <nav className="nav" aria-label="主导航">
          {navItems.map((item) => (
            <button
              className={`nav-btn ${activeView === item.id ? "active" : ""}`}
              key={item.id}
              type="button"
              title={item.label}
              onClick={() => setActiveView(item.id)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="rail-status">
          <div className={`pulse ${snapshot.runtimeStatus.browserReady ? "" : "warn"}`} />
          <strong>{snapshot.runtimeStatus.browserReady ? "Chromium" : "Browser"}</strong>
          <span>{liveCount} live</span>
        </div>
      </aside>

      <main className="shell">
        <header className="topbar">
          <div className="title">
            <h1>{activeMeta.title}</h1>
            <p>{activeMeta.desc}</p>
          </div>
          <div className="command">
            <div className="theme-toggle" aria-label="切换主题">
              {(["light", "dark", "aurora"] as Theme[]).map((item) => (
                <button
                  className={theme === item ? "active" : ""}
                  key={item}
                  type="button"
                  title={themeLabel(item)}
                  onClick={() => void changeTheme(item)}
                  disabled={busy === "theme"}
                >
                  {themeIcon(item)}
                </button>
              ))}
            </div>
            <input
              className="search"
              placeholder="搜索 Profile、任务、结果"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <button className="btn" type="button" onClick={() => void loadSnapshot()} disabled={loading}>
              <RefreshIcon />
              刷新
            </button>
          </div>
        </header>

        <section className="content">
          {loading ? (
            <div className="empty-state">
              <LogoMark />
              <strong>正在连接 x-browser 后端</strong>
              <span>加载 Profile、浏览器会话和任务状态。</span>
            </div>
          ) : (
            <>
              {activeView === "dashboard" && (
                <DashboardView
                  activeTasks={activeTasks}
                  cockpitProfile={cockpitProfile}
                  cockpitSession={cockpitSession}
                  liveCount={liveCount}
                  logs={snapshot.logs}
                  profiles={snapshot.profiles}
                  readyProfiles={readyProfiles}
                  riskCount={riskCount}
                  runtime={snapshot.runtimeStatus}
                  tasks={snapshot.tasks}
                  onNewTask={() => openTaskEditor()}
                  onSelectProfileFocus={focusProfile}
                  onSelectProfile={(profile) => focusProfile(profile.id)}
                  onStart={startProfile}
                  onStop={stopProfile}
                  busy={busy}
                />
              )}

              {activeView === "profiles" && (
                <ProfilesView
                  busy={busy}
                  filter={profileFilter}
                  groupById={groupById}
                  groupFilter={profileGroupFilter}
                  groups={snapshot.groups}
                  platforms={snapshot.platforms}
                  profiles={filteredProfiles}
                  profileSort={profileSort}
                  proxyById={proxyById}
                  proxies={snapshot.proxies}
                  query={query}
                  selectedProfile={selectedProfile}
                  selectedProfileIds={selectedProfileIds}
                  setFilter={setProfileFilter}
                  setGroupFilter={setProfileGroupFilter}
                  setQuery={setQuery}
                  onDelete={deleteProfile}
                  onDeleteSelected={deleteSelectedProfiles}
                  onDuplicate={duplicateProfile}
                  onClearCache={clearProfileCache}
                  onEdit={openProfileEditor}
                  onNew={() => openProfileEditor()}
                  onPatch={patchProfile}
                  onSelect={setSelectedProfileId}
                  onSelectionChange={toggleProfileSelection}
                  onSort={(key) =>
                    setProfileSort((current) =>
                      current.key === key
                        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
                        : { key, direction: "asc" },
                    )
                  }
                  onStart={startProfile}
                  onStop={stopProfile}
                />
              )}

              {activeView === "sessions" && (
                <SessionsView
                  busy={busy}
                  profiles={snapshot.profiles}
                  selectedProfile={selectedProfile}
                  selectedSession={selectedSession}
                  sessions={snapshot.browserSessions}
                  onNewProfile={() => openProfileEditor()}
                  onSelectProfile={focusProfile}
                  onSelect={focusSession}
                  onStop={(session) => {
                    const profile = snapshot.profiles.find((item) => item.id === session.profileId);
                    if (profile) void stopProfile(profile);
                  }}
                />
              )}

              {activeView === "tasks" && (
                <TasksView
                  adapters={snapshot.siteAdapters}
                  busy={busy}
                  filter={taskFilter}
                  profiles={snapshot.profiles}
                  selectedTask={selectedTask}
                  setFilter={setTaskFilter}
                  tasks={filteredTasks}
                  onDelete={deleteTask}
                  onEdit={openTaskEditor}
                  onNew={() => openTaskEditor()}
                  onRun={runTask}
                  onSelect={setSelectedTaskId}
                />
              )}

              {activeView === "results" && (
                <ResultsView
                  busy={busy}
                  results={filteredResults}
                  selectedResult={selectedResult}
                  onExport={exportResults}
                  onSelect={setSelectedResultId}
                />
              )}

              {activeView === "settings" && (
                <SettingsView
                  busy={busy}
                  groups={snapshot.groups}
                  logs={snapshot.logs}
                  platforms={snapshot.platforms}
                  profiles={snapshot.profiles}
                  proxies={snapshot.proxies}
                  runtime={snapshot.runtimeStatus}
                  settings={settingsDraft}
                  onChooseBrowser={chooseBrowserPath}
                  onDeleteGroup={deleteGroup}
                  onDeletePlatform={deletePlatform}
                  onDeleteProxy={deleteProxy}
                  onImportProxies={importProxies}
                  onSave={saveSettings}
                  onSaveGroup={saveGroup}
                  onSavePlatform={savePlatform}
                  onSaveProxy={saveProxy}
                  onSettingsChange={setSettingsDraft}
                  onTestProxy={testProxy}
                />
              )}
            </>
          )}
        </section>
      </main>

      {profileEditor && (
        <ProfileModal
          groups={snapshot.groups}
          platforms={snapshot.platforms}
          proxies={snapshot.proxies}
          value={profileEditor}
          busy={busy === "profile"}
          onCancel={() => setProfileEditor(null)}
          onChange={setProfileEditor}
          onSave={saveProfile}
        />
      )}

      {taskEditor && (
        <TaskModal
          adapters={snapshot.siteAdapters}
          profiles={snapshot.profiles}
          value={taskEditor}
          busy={busy === "task"}
          onCancel={() => setTaskEditor(null)}
          onChange={setTaskEditor}
          onSave={saveTask}
        />
      )}

      {notice && <div className={`toast ${notice.type}`}>{notice.text}</div>}
    </div>
  );
}

function DashboardView({
  activeTasks,
  busy,
  cockpitProfile,
  cockpitSession,
  liveCount,
  logs,
  profiles,
  readyProfiles,
  riskCount,
  runtime,
  tasks,
  onNewTask,
  onSelectProfileFocus,
  onSelectProfile,
  onStart,
  onStop,
}: {
  activeTasks: number;
  busy: string;
  cockpitProfile?: Profile;
  cockpitSession?: BrowserSession;
  liveCount: number;
  logs: LogEntry[];
  profiles: Profile[];
  readyProfiles: number;
  riskCount: number;
  runtime: RuntimeStatus;
  tasks: Task[];
  onNewTask: () => void;
  onSelectProfileFocus: (profileId: string) => void;
  onSelectProfile: (profile: Profile) => void;
  onStart: (profile: Profile) => void;
  onStop: (profile: Profile) => void;
}) {
  const running = cockpitProfile?.status === "running";
  const cockpitIndex = profiles.findIndex((profile) => profile.id === cockpitProfile?.id);
  const previousProfile =
    cockpitIndex > 0 ? profiles[cockpitIndex - 1] : profiles.length > 1 ? profiles[profiles.length - 1] : undefined;
  const nextProfile =
    cockpitIndex >= 0 && cockpitIndex < profiles.length - 1 ? profiles[cockpitIndex + 1] : profiles.length > 1 ? profiles[0] : undefined;
  const activeProfile = cockpitProfile ?? profiles[0];
  const activeSession = cockpitSession ?? (activeProfile ? { url: activeProfile.startUrl || "about:blank" } : undefined);

  return (
    <div className="dashboard">
      <div className="metrics">
        <Metric label="Live Sessions" value={liveCount} meta="Visible Chromium windows" />
        <Metric className="accent-green" label="Healthy Profiles" value={readyProfiles} meta="Cookie / profile ready" />
        <Metric className="accent-amber" label="Tasks Running" value={activeTasks} meta="Adapter queue active" />
        <Metric className="accent-coral" label="Risk Events" value={riskCount} meta="Profile / task errors" />
      </div>

      <div className="cockpit">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Live Chromium Cockpit</div>
              <div className="panel-sub">
                {cockpitProfile
                  ? `当前选中 Profile：${cockpitProfile.name} · 可见窗口 · 独立用户目录`
                  : "创建 Profile 后即可启动独立 Chromium 窗口"}
              </div>
            </div>
            <div className="chips">
              <Chip color={running ? "green" : "blue"}>{running ? "Running" : "Stopped"}</Chip>
              <Chip color={runtime.browserReady ? "cyan" : "coral"}>
                {runtime.browserReady ? "Browser Ready" : "Browser Missing"}
              </Chip>
            </div>
          </div>
          <div className="browser-stage">
            <div className="chrome-window">
              <div className="chrome-top">
                <div className="traffic">
                  <span className="r" />
                  <span className="y" />
                  <span className="g" />
                </div>
                <div className="url">
                  <span>{running ? "remote" : "ready"}</span>
                  <span>{activeSession?.url || activeProfile?.startUrl || "about:blank"}</span>
                </div>
                <ProfileSwitcher
                  compact
                  profiles={profiles}
                  selectedProfileId={activeProfile?.id || ""}
                  onSelect={onSelectProfileFocus}
                  onPrevious={previousProfile ? () => onSelectProfileFocus(previousProfile.id) : undefined}
                  onNext={nextProfile ? () => onSelectProfileFocus(nextProfile.id) : undefined}
                />
              </div>
              <div className="chrome-body">
                <div className="site-hero">
                  <div>
                    <div className="site-label">{running ? "Chromium running" : "Ready to launch"}</div>
                    <div className="site-title">可见浏览器采集，不再像黑盒脚本</div>
                    <div className="site-copy">
                      每个 Profile 都是独立 Chromium 环境：Cookie、代理、缓存隔离。你可以手动登录、观察页面，再让 adapter 接管采集。
                    </div>
                    <div className="hero-actions">
                      {cockpitProfile ? (
                        running ? (
                          <button
                            className="btn danger"
                            type="button"
                            disabled={busy === cockpitProfile.id}
                            onClick={() => void onStop(cockpitProfile)}
                          >
                            停止窗口
                          </button>
                        ) : (
                          <button
                            className="btn primary"
                            type="button"
                            disabled={busy === cockpitProfile.id}
                            onClick={() => void onStart(cockpitProfile)}
                          >
                            启动 Chromium
                          </button>
                        )
                      ) : null}
                      <button className="btn" type="button" onClick={onNewTask}>
                        新建任务
                      </button>
                    </div>
                  </div>
                  <div className="site-card">
                    <div className="dial">
                      <div className="dial-inner">
                        <strong>{running ? "Live" : "Idle"}</strong>
                        <span>headed mode</span>
                      </div>
                    </div>
                    <div className="chips center">
                      <Chip color="cyan">CDP</Chip>
                      <Chip color="green">JSON</Chip>
                    </div>
                  </div>
                </div>
                <div className="site-grid">
                  <MiniTile kicker="Browser context" title="Persistent profile directory" widthA={74} widthB={58} />
                  <MiniTile kicker="Result stream" title="Structured JSON captured" widthA={86} widthB={52} />
                </div>
                <div className="signal-grid">
                  <Signal label="CPU" value={cockpitSession?.cpu || "0%"} />
                  <Signal label="Memory" value={cockpitSession?.memory || "待采样"} />
                  <Signal label="Proxy" value={cockpitProfile?.proxy ? proxyType(cockpitProfile.proxy) : "未设置"} />
                  <Signal label="Adapter" value={tasks[0]?.adapter || "Generic"} />
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="board-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Mission Board</div>
                <div className="panel-sub">任务执行与采集进度</div>
              </div>
              <button className="btn primary" type="button" onClick={onNewTask}>
                新建任务
              </button>
            </div>
            {tasks.length ? (
              <table>
                <thead>
                  <tr>
                    <th>任务</th>
                    <th>Profile</th>
                    <th>站点</th>
                    <th>进度</th>
                    <th>状态</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.slice(0, 5).map((task) => (
                    <tr key={task.id}>
                      <td>{task.name}</td>
                      <td>{task.profile}</td>
                      <td>{task.site}</td>
                      <td>
                        <Progress value={task.progress} />
                      </td>
                      <td>
                        <StatusChip status={task.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyPanel title="还没有任务" text="创建一个 Page Snapshot 任务后，就可以用 Profile 打开页面并保存 JSON 结果。" />
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">Adapter Pipeline</div>
                <div className="panel-sub">通用站点适配流程</div>
              </div>
            </div>
            <div className="pipeline">
              <PipelineRow index="1" title="Launch profile" sub="独立 Chromium + 用户目录" status="OK" color="green" />
              <PipelineRow index="2" title="Apply context" sub="Cookie、代理注入" status="OK" color="green" />
              <PipelineRow index="3" title="Run adapter" sub="打开页面并解析结构化数据" status="Live" color="cyan" />
              <PipelineRow index="4" title="Persist result" sub="写入本地 store 并支持导出" status="Next" color="amber" />
            </div>
          </section>
        </div>
      </div>

      <aside className="side-stack">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Profile Stack</div>
              <div className="panel-sub">点击切换当前焦点</div>
            </div>
            <Chip color="cyan">{profiles.length} total</Chip>
          </div>
          <ProfileSwitcher
            profiles={profiles}
            selectedProfileId={cockpitProfile?.id ?? ""}
            onSelect={(profileId) => {
              const profile = profiles.find((item) => item.id === profileId);
              if (profile) onSelectProfile(profile);
            }}
            onPrevious={previousProfile && profiles.length > 1 ? () => onSelectProfile(previousProfile) : undefined}
            onNext={nextProfile && profiles.length > 1 ? () => onSelectProfile(nextProfile) : undefined}
          />
          <div className="profile-list">
            {profiles.length ? (
              profiles.slice(0, 6).map((profile) => (
                <button
                  className={`profile-card ${cockpitProfile?.id === profile.id ? "selected" : ""}`}
                  key={profile.id}
                  type="button"
                  onClick={() => onSelectProfile(profile)}
                >
                  <div className="profile-top">
                    <div>
                      <div className="profile-name">{profile.name}</div>
                      <div className="profile-note">{profile.note || profile.startUrl || "通用站点"}</div>
                    </div>
                    <StatusChip status={profile.status} />
                  </div>
                  <div className="profile-meta">
                    <MetaCell label="Proxy" value={profile.proxy ? proxyType(profile.proxy) : "未设置"} />
                    <MetaCell label="Cookie" value={profile.cookie || "Valid"} />
                  </div>
                </button>
              ))
            ) : (
              <EmptyPanel title="没有 Profile" text="先新建 Profile，x-browser 才能启动隔离浏览器窗口。" />
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Runtime Feed</div>
              <div className="panel-sub">实时事件流</div>
            </div>
          </div>
          <LogFeed logs={logs} />
        </section>
      </aside>
    </div>
  );
}

function ProfilesView({
  busy,
  filter,
  groups,
  groupFilter,
  platforms,
  profiles,
  groupById,
  proxyById,
  query,
  selectedProfile,
  selectedProfileIds,
  setFilter,
  setGroupFilter,
  setQuery,
  onDelete,
  onDeleteSelected,
  onDuplicate,
  onClearCache,
  onEdit,
  onNew,
  onPatch,
  onSelect,
  onSelectionChange,
  onSort,
  onStart,
  onStop,
}: {
  busy: string;
  filter: string;
  groupFilter: string;
  groups: Group[];
  platforms: Platform[];
  profiles: Profile[];
  profileSort: { key: "number" | "name" | "group" | "proxy"; direction: "asc" | "desc" };
  proxies: ProxyItem[];
  groupById: Map<string, Group>;
  proxyById: Map<string, ProxyItem>;
  query: string;
  selectedProfile?: Profile;
  selectedProfileIds: string[];
  setFilter: (filter: string) => void;
  setGroupFilter: (filter: string) => void;
  setQuery: (query: string) => void;
  onDelete: (profile: Profile) => void;
  onDeleteSelected: () => void;
  onDuplicate: (profile: Profile) => void;
  onClearCache: (profile: Profile) => void;
  onEdit: (profile: Profile) => void;
  onNew: () => void;
  onPatch: (profile: Profile, patch: Partial<ProfileInput>) => void;
  onSelect: (id: string) => void;
  onSelectionChange: (profileId: string, checked: boolean) => void;
  onSort: (key: "number" | "name" | "group" | "proxy") => void;
  onStart: (profile: Profile) => void;
  onStop: (profile: Profile) => void;
}) {
  const selectableIds = profiles.map((profile) => profile.id);
  const visibleSelectedCount = selectableIds.filter((id) => selectedProfileIds.includes(id)).length;
  const allVisibleSelected = selectableIds.length > 0 && visibleSelectedCount === selectableIds.length;

  return (
    <div className="page-grid">
      <div className="wide-stack">
        <div className="toolbar">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "全部"],
              ["running", "运行中"],
              ["stopped", "已停止"],
              ["error", "异常"],
            ]}
          />
          <select
            className="filter-select"
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
          >
            <option value="all">全部分组</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <input
            className="toolbar-search"
            placeholder="搜索名称..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="toolbar-actions">
            <span className="toolbar-count">{profiles.length} 个 Profile</span>
            <button className="btn" type="button" onClick={() => void onNew()}>
              + 新建
            </button>
            {selectedProfileIds.length > 0 && (
              <button
                className="btn danger-text"
                type="button"
                disabled={busy === "profiles-delete"}
                onClick={() => void onDeleteSelected()}
              >
                删除 ({selectedProfileIds.length})
              </button>
            )}
          </div>
        </div>
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Profile Matrix</div>
              <div className="panel-sub">序号、分组、代理、备注与可见浏览器状态</div>
            </div>
          </div>
          {profiles.length ? (
            <table>
              <thead>
                <tr>
                  <th className="select-col">
                    <input
                      aria-label="选择当前列表全部 Profile"
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        for (const id of selectableIds) {
                          onSelectionChange(id, event.target.checked);
                        }
                      }}
                    />
                  </th>
                  <th onClick={() => onSort("number")}>序号</th>
                  <th onClick={() => onSort("name")}>名称</th>
                  <th onClick={() => onSort("group")}>分组</th>
                  <th onClick={() => onSort("proxy")}>代理</th>
                  <th>备注</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr
                    className={selectedProfile?.id === profile.id ? "row-selected" : ""}
                    key={profile.id}
                    onClick={() => onSelect(profile.id)}
                  >
                    <td className="select-col" onClick={(event) => event.stopPropagation()}>
                      <input
                        aria-label={`选择 ${profile.name}`}
                        type="checkbox"
                        checked={selectedProfileIds.includes(profile.id)}
                        onChange={(event) => onSelectionChange(profile.id, event.target.checked)}
                      />
                    </td>
                    <td>{profile.profileNumber}</td>
                    <td>
                      <InlineText
                        value={profile.name}
                        onCommit={(name) => {
                          if (name.trim() && name.trim() !== profile.name) {
                            void onPatch(profile, { name: name.trim() });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <InlineSelect
                        value={profile.groupId || "default"}
                        options={groups.map((g) => ({ value: g.id, label: g.name }))}
                        onCommit={(val) => {
                          const nextGroup = groups.find((g) => g.id === val);
                          void onPatch(profile, {
                            groupId: nextGroup?.id ?? "default",
                            groupName: nextGroup?.name ?? "默认",
                          });
                        }}
                      />
                    </td>
                    <td>{profileProxy(profile, proxyById)}</td>
                    <td>
                      <InlineText
                        value={profile.note}
                        placeholder="备注"
                        onCommit={(note) => {
                          if (note !== profile.note) {
                            void onPatch(profile, { note });
                          }
                        }}
                      />
                    </td>
                    <td>
                      <StatusChip status={profile.lastError ? "error" : profile.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        {profile.status === "running" ? (
                          <button
                            className="mini-btn danger"
                            type="button"
                            disabled={busy === profile.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onStop(profile);
                            }}
                          >
                            停止
                          </button>
                        ) : (
                          <button
                            className="mini-btn primary"
                            type="button"
                            disabled={busy === profile.id || profile.status === "starting"}
                            onClick={(event) => {
                              event.stopPropagation();
                              void onStart(profile);
                            }}
                          >
                            {profile.status === "starting" ? "启动中..." : "启动"}
                          </button>
                        )}
                        <RowMenu items={[
                          { label: "编辑", onClick: () => onEdit(profile) },
                          { label: "复制", onClick: () => void onDuplicate(profile) },
                          { label: "清除缓存", onClick: () => void onClearCache(profile) },
                          { label: "删除", danger: true, onClick: () => void onDelete(profile) },
                        ]} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel title="没有匹配的 Profile" text="调整搜索条件，或新建一个用于采集的浏览器身份。" />
          )}
        </section>
      </div>
      <aside className="inspector">
        <div className="panel-head">
          <div>
            <div className="panel-title">Profile Inspector</div>
            <div className="panel-sub">{selectedProfile?.name || "未选择"}</div>
          </div>
          {selectedProfile ? <StatusChip status={selectedProfile.status} /> : null}
        </div>
        {selectedProfile ? (
          <div className="inspector-body">
            <InfoBox label="User Data Dir" value={selectedProfile.userDataDir || "保存后自动生成"} />
            <div className="info-box">
              <div className="kv">
                <span>Cookie</span>
                <span>{selectedProfile.cookie || "无 Cookie"}</span>
                <span>Group</span>
                <span>{profileGroupName(selectedProfile, groupById)}</span>
                <span>Proxy</span>
                <span>{profileProxy(selectedProfile, proxyById)}</span>
                <span>Locale</span>
                <span>{selectedProfile.locale || "zh-CN"}</span>
                <span>Timezone</span>
                <span>{selectedProfile.timezone || "Asia/Shanghai"}</span>
                <span>Platform</span>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {(() => {
                    const plat = platforms.find((p) => p.id === selectedProfile.platformId);
                    return plat ? (
                      <>
                        <PlatformLogo logoPath={plat.logoPath} name={plat.name} size={16} />
                        {plat.name}
                      </>
                    ) : (selectedProfile.platformUrl || "未设置");
                  })()}
                </span>
              </div>
            </div>
            {selectedProfile.lastError ? <div className="error-box">{selectedProfile.lastError}</div> : null}
            <div className="chips">
              {selectedProfile.status === "running" ? (
                <button className="btn danger" type="button" onClick={() => void onStop(selectedProfile)}>
                  停止
                </button>
              ) : (
                <button
                  className="btn primary"
                  type="button"
                  disabled={busy === selectedProfile.id || selectedProfile.status === "starting"}
                  onClick={() => void onStart(selectedProfile)}
                >
                  {selectedProfile.status === "starting" ? "启动中..." : "启动 Chromium"}
                </button>
              )}
              <button className="btn" type="button" onClick={() => onEdit(selectedProfile)}>
                编辑
              </button>
              <RowMenu items={[
                { label: "复制 Profile", onClick: () => void onDuplicate(selectedProfile) },
                { label: "清除缓存", onClick: () => void onClearCache(selectedProfile) },
                { label: "删除", danger: true, onClick: () => void onDelete(selectedProfile) },
              ]} />
            </div>
          </div>
        ) : (
          <EmptyPanel title="未选择 Profile" text="从左侧列表选择一个 Profile 查看详情。" />
        )}
      </aside>
    </div>
  );
}

function SessionsView({
  busy,
  profiles,
  selectedProfile,
  selectedSession,
  sessions,
  onNewProfile,
  onSelectProfile,
  onSelect,
  onStop,
}: {
  busy: string;
  profiles: Profile[];
  selectedProfile?: Profile;
  selectedSession?: BrowserSession;
  sessions: BrowserSession[];
  onNewProfile: () => void;
  onSelectProfile: (id: string) => void;
  onSelect: (id: string) => void;
  onStop: (session: BrowserSession) => void;
}) {
  const activeProfile = selectedProfile ?? profiles.find((profile) => profile.id === selectedSession?.profileId);
  const previewSession = activeProfile ? sessions.find((session) => session.profileId === activeProfile.id) : selectedSession;
  const activeProfileIndex = profiles.findIndex((profile) => profile.id === activeProfile?.id);
  const previousProfile =
    activeProfileIndex > 0 ? profiles[activeProfileIndex - 1] : profiles.length > 1 ? profiles[profiles.length - 1] : undefined;
  const nextProfile =
    activeProfileIndex >= 0 && activeProfileIndex < profiles.length - 1
      ? profiles[activeProfileIndex + 1]
      : profiles.length > 1
        ? profiles[0]
        : undefined;
  return (
    <div className="page-grid">
      <div className="wide-stack">
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Visible Browser Sessions</div>
              <div className="panel-sub">所有 Chromium 可见窗口</div>
            </div>
            <button className="btn primary" type="button" onClick={onNewProfile}>
              新建 Profile
            </button>
          </div>
          {sessions.length ? (
            <table>
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>站点</th>
                  <th>运行时长</th>
                  <th>内存</th>
                  <th>CPU</th>
                  <th>当前 URL</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr
                    className={selectedSession?.id === session.id ? "row-selected" : ""}
                    key={session.id}
                    onClick={() => onSelect(session.id)}
                  >
                    <td>{session.profile}</td>
                    <td>{session.site || "通用站点"}</td>
                    <td>{session.runtime}</td>
                    <td>{session.memory}</td>
                    <td>{session.cpu}</td>
                    <td>{session.url || "about:blank"}</td>
                    <td>
                      <StatusChip status={session.status} />
                    </td>
                    <td>
                      <button
                        className="mini-btn danger"
                        type="button"
                        disabled={busy === session.profileId}
                        onClick={(event) => {
                          event.stopPropagation();
                          void onStop(session);
                        }}
                      >
                        停止
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel title="没有运行中的可见窗口" text="到 Profile 页启动一个 Profile，x-browser 会拉起独立 Chromium 窗口。" />
          )}
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Session Preview</div>
              <div className="panel-sub">当前窗口视觉状态</div>
            </div>
            <Chip color="cyan">{activeProfile?.name || "No Profile"}</Chip>
          </div>
          <div className="browser-stage compact">
            <div className="chrome-window">
              <div className="chrome-top">
                <div className="traffic">
                  <span className="r" />
                  <span className="y" />
                  <span className="g" />
                </div>
                <div className="url">
                  <span>{previewSession ? "remote" : "idle"}</span>
                  <span>{previewSession?.url || activeProfile?.startUrl || "about:blank"}</span>
                </div>
                <ProfileSwitcher
                  compact
                  profiles={profiles}
                  selectedProfileId={activeProfile?.id || ""}
                  onSelect={onSelectProfile}
                  onPrevious={previousProfile ? () => onSelectProfile(previousProfile.id) : undefined}
                  onNext={nextProfile ? () => onSelectProfile(nextProfile.id) : undefined}
                />
              </div>
              <div className="chrome-body compact">
                <div className="site-hero compact">
                  <div>
                    <div className="site-label">Focused window</div>
                    <div className="site-title">真实 Chromium 窗口独立运行</div>
                    <div className="site-copy">
                      采集浏览器不是 Tauri WebView，而是独立可见的 Chrome/Chromium 进程。你可以在这里切换当前 Profile，而不离开会话页。
                    </div>
                  </div>
                  <div className="site-card">
                    <div className="dial">
                      <div className="dial-inner">
                        <strong>{previewSession ? "Live" : activeProfile ? "Ready" : "Idle"}</strong>
                        <span>headed mode</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <aside className="inspector">
        <div className="panel-head">
          <div>
            <div className="panel-title">Session Control</div>
            <div className="panel-sub">{selectedProfile?.name || selectedSession?.profile || "未选择"}</div>
          </div>
          {selectedProfile ? <Chip color="cyan">Focus: {selectedProfile.name}</Chip> : null}
        </div>
        {selectedSession ? (
          <div className="inspector-body">
            <InfoBox label="Current URL" value={selectedSession.url || "about:blank"} />
            <div className="info-box">
              <div className="kv">
                <span>Memory</span>
                <span>{selectedSession.memory}</span>
                <span>CPU</span>
                <span>{selectedSession.cpu}</span>
                <span>PID</span>
                <span>{selectedSession.pid ?? "-"}</span>
                <span>Port</span>
                <span>{selectedSession.port ?? "-"}</span>
                <span>Started</span>
                <span>{selectedSession.startedAt}</span>
              </div>
            </div>
            <div className="chips">
              <button className="btn danger" type="button" onClick={() => void onStop(selectedSession)}>
                停止
              </button>
            </div>
          </div>
        ) : (
          <div className="inspector-body">
            <EmptyPanel title="等待浏览器窗口" text={`当前有 ${profiles.length} 个 Profile，可从 Profile 页选择启动。`} />
          </div>
        )}
      </aside>
    </div>
  );
}

function TasksView({
  adapters,
  busy,
  filter,
  profiles,
  selectedTask,
  setFilter,
  tasks,
  onDelete,
  onEdit,
  onNew,
  onRun,
  onSelect,
}: {
  adapters: SiteAdapter[];
  busy: string;
  filter: string;
  profiles: Profile[];
  selectedTask?: Task;
  setFilter: (filter: string) => void;
  tasks: Task[];
  onDelete: (task: Task) => void;
  onEdit: (task?: Task) => void;
  onNew: () => void;
  onRun: (task: Task) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="page-grid">
      <div className="wide-stack">
        <div className="toolbar">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              ["all", "队列"],
              ["running", "运行中"],
              ["error", "失败"],
              ["done", "历史"],
            ]}
          />
          <button className="btn primary" type="button" onClick={onNew}>
            <PlusIcon />
            新建任务
          </button>
        </div>
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Task Command Queue</div>
              <div className="panel-sub">adapter 驱动的采集任务</div>
            </div>
          </div>
          {tasks.length ? (
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>Profile</th>
                  <th>Adapter</th>
                  <th>进度</th>
                  <th>最近运行</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    className={selectedTask?.id === task.id ? "row-selected" : ""}
                    key={task.id}
                    onClick={() => onSelect(task.id)}
                  >
                    <td>{task.name}</td>
                    <td>{task.profile}</td>
                    <td>{task.adapter}</td>
                    <td>
                      <Progress value={task.progress} />
                    </td>
                    <td>{task.lastRun}</td>
                    <td>
                      <StatusChip status={task.status} />
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="mini-btn primary"
                          type="button"
                          disabled={busy === task.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            void onRun(task);
                          }}
                        >
                          运行
                        </button>
                        <button
                          className="mini-btn"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onEdit(task);
                          }}
                        >
                          编辑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel
              title={profiles.length ? "还没有任务" : "先创建 Profile"}
              text={
                profiles.length
                  ? "新建任务，选择 Profile、目标 URL 和 adapter 脚本。"
                  : "任务必须绑定 Profile，先创建一个 Profile 再添加任务。"
              }
            />
          )}
        </section>
      </div>
      <aside className="inspector">
        <div className="panel-head">
          <div>
            <div className="panel-title">Task Inspector</div>
            <div className="panel-sub">{selectedTask?.name || "未选择"}</div>
          </div>
          {selectedTask ? <StatusChip status={selectedTask.status} /> : null}
        </div>
        {selectedTask ? (
          <div className="inspector-body">
            <InfoBox label="Target" value={selectedTask.startUrl} />
            <div className="info-box">
              <div className="kv">
                <span>Adapter</span>
                <span>{selectedTask.adapter}</span>
                <span>Profile</span>
                <span>{selectedTask.profile}</span>
                <span>Progress</span>
                <span>{selectedTask.progress}%</span>
                <span>Errors</span>
                <span>{selectedTask.errors}</span>
              </div>
            </div>
            <pre className="json-box compact">{selectedTask.script || defaultScript}</pre>
            <div className="chips">
              <button className="btn primary" type="button" onClick={() => void onRun(selectedTask)}>
                运行
              </button>
              <button className="btn" type="button" onClick={() => onEdit(selectedTask)}>
                编辑
              </button>
              <button className="btn danger" type="button" onClick={() => void onDelete(selectedTask)}>
                删除
              </button>
            </div>
          </div>
        ) : (
          <div className="inspector-body">
            <EmptyPanel title="未选择任务" text={`可用 adapter：${adapters.length} 个。`} />
          </div>
        )}
      </aside>
    </div>
  );
}

function ResultsView({
  busy,
  results,
  selectedResult,
  onExport,
  onSelect,
}: {
  busy: string;
  results: ResultItem[];
  selectedResult?: ResultItem;
  onExport: (format: "json" | "csv") => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="page-grid">
      <div className="wide-stack">
        <div className="toolbar">
          <div className="seg static">
            <span>全部结果</span>
          </div>
          <div className="chips">
            <button className="btn" type="button" disabled={busy === "export-csv"} onClick={() => void onExport("csv")}>
              导出 CSV
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={busy === "export-json"}
              onClick={() => void onExport("json")}
            >
              导出 JSON
            </button>
          </div>
        </div>
        <section className="panel">
          <div className="panel-head">
            <div>
              <div className="panel-title">Result Stream</div>
              <div className="panel-sub">本地存储中的结构化 JSON 结果</div>
            </div>
          </div>
          {results.length ? (
            <table>
              <thead>
                <tr>
                  <th>标题</th>
                  <th>站点</th>
                  <th>任务</th>
                  <th>Profile</th>
                  <th>字段</th>
                  <th>时间</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr
                    className={selectedResult?.id === item.id ? "row-selected" : ""}
                    key={item.id}
                    onClick={() => onSelect(item.id)}
                  >
                    <td>{item.title}</td>
                    <td>{item.site}</td>
                    <td>{item.task}</td>
                    <td>{item.profile}</td>
                    <td>{item.fields}</td>
                    <td>{item.time}</td>
                    <td>
                      <StatusChip status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyPanel title="还没有采集结果" text="运行任务后，页面返回的 JSON 会保存在这里，并支持 JSON/CSV 导出。" />
          )}
        </section>
      </div>
      <aside className="inspector">
        <div className="panel-head">
          <div>
            <div className="panel-title">Raw JSON</div>
            <div className="panel-sub">{selectedResult?.title || "未选择"}</div>
          </div>
        </div>
        <div className="inspector-body">
          {selectedResult ? (
            <>
              <pre className="json-box">{JSON.stringify(selectedResult.payload, null, 2)}</pre>
              <div className="chips">
                <button
                  className="btn primary"
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(JSON.stringify(selectedResult.payload, null, 2))}
                >
                  复制 JSON
                </button>
              </div>
            </>
          ) : (
            <EmptyPanel title="未选择结果" text="从结果表中点击一行查看原始 JSON。" />
          )}
        </div>
      </aside>
    </div>
  );
}

function GroupManager({
  busy,
  groups,
  profiles,
  onDelete,
  onSave,
}: {
  busy: string;
  groups: Group[];
  profiles: Profile[];
  onDelete: (item: Group) => void;
  onSave: (input: { id?: string; name: string; color: string }) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const groupProfileCount = (id: string) => profiles.filter((p) => p.groupId === id).length;

  return (
    <>
      <div className="panel-head">
        <div>
          <div className="panel-title">分组管理</div>
          <div className="panel-sub">管理 Profile 分组，支持颜色标记</div>
        </div>
        <button className="btn primary" type="button" onClick={() => { setShowAdd(true); setName(""); setColor("#3b82f6"); }}>
          添加分组
        </button>
      </div>
      {showAdd && (
        <div className="inline-inputs" style={{ padding: "12px 16px" }}>
          <input placeholder="分组名称" value={name} onChange={(e) => setName(e.target.value)} />
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 48 }} />
          <button className="btn primary" type="button" disabled={!name.trim() || busy === "group"} onClick={async () => { await onSave({ name: name.trim(), color }); setName(""); setShowAdd(false); }}>
            保存
          </button>
          <button className="btn" type="button" onClick={() => setShowAdd(false)}>取消</button>
        </div>
      )}
      {groups.length ? (
        <table>
          <thead>
            <tr><th>名称</th><th>颜色</th><th>关联 Profile</th><th>操作</th></tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>
                  {editingId === g.id ? (
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: 120 }} />
                  ) : (
                    <span>{g.name}</span>
                  )}
                </td>
                <td><span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 4, background: g.color, verticalAlign: "middle" }} /></td>
                <td>{groupProfileCount(g.id)}</td>
                <td>
                  <div className="row-actions">
                    {editingId === g.id ? (
                      <>
                        <button className="mini-btn primary" type="button" onClick={async () => { await onSave({ id: g.id, name: editName, color: g.color }); setEditingId(null); }}>保存</button>
                        <button className="mini-btn" type="button" onClick={() => setEditingId(null)}>取消</button>
                      </>
                    ) : (
                      <button className="mini-btn" type="button" onClick={() => { setEditingId(g.id); setEditName(g.name); }} disabled={g.name === "默认"}>重命名</button>
                    )}
                    <button className="mini-btn danger" type="button" disabled={g.name === "默认"} onClick={() => onDelete(g)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyPanel title="还没有分组" text="添加分组后在 Profile 编辑中即可选择。" />
      )}
    </>
  );
}

function ProxyManager({
  busy,
  proxies,
  onDelete,
  onImport,
  onSave,
  onTest,
}: {
  busy: string;
  proxies: ProxyItem[];
  onDelete: (item: ProxyItem) => void;
  onImport: (text: string) => void;
  onSave: (input: { id?: string; name: string; url: string; username?: string; password?: string }) => void;
  onTest: (item: ProxyItem) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showBatch, setShowBatch] = useState(false);
  const [batchText, setBatchText] = useState("");

  return (
    <>
      <div className="panel-head">
        <div>
          <div className="panel-title">代理管理</div>
          <div className="panel-sub">管理代理地址，检测连通性和归属地</div>
        </div>
        <div className="chips">
          <button className="btn" type="button" onClick={() => setShowBatch(!showBatch)}>批量导入</button>
          <button className="btn primary" type="button" onClick={() => { setShowAdd(true); setName(""); setUrl(""); setUsername(""); setPassword(""); }}>
            添加代理
          </button>
        </div>
      </div>
      {showBatch && (
        <div style={{ padding: "12px 16px" }}>
          <textarea className="short-textarea" rows={4} placeholder="每行一个代理地址，如 http://user:pass@host:port" value={batchText} onChange={(e) => setBatchText(e.target.value)} />
          <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
            <button className="btn primary" type="button" disabled={!batchText.trim() || busy === "proxy-import"} onClick={async () => { await onImport(batchText); setBatchText(""); setShowBatch(false); }}>
              导入
            </button>
            <button className="btn" type="button" onClick={() => setShowBatch(false)}>取消</button>
          </div>
        </div>
      )}
      {showAdd && (
        <div className="settings-grid" style={{ padding: "12px 16px" }}>
          <Field label="代理名称">
            <input placeholder="如 美国住宅IP-01" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="代理地址">
            <input placeholder="socks5://127.0.0.1:7890" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="用户名">
            <input placeholder="可选" value={username} onChange={(e) => setUsername(e.target.value)} />
          </Field>
          <Field label="密码">
            <input placeholder="可选" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <button className="btn primary" type="button" disabled={!name.trim() || !url.trim() || busy === "proxy"} onClick={async () => { await onSave({ name: name.trim(), url: url.trim(), username: username.trim() || undefined, password: password.trim() || undefined }); setName(""); setUrl(""); setUsername(""); setPassword(""); setShowAdd(false); }}>
              保存
            </button>
            <button className="btn" type="button" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}
      {proxies.length ? (
        <table>
          <thead>
            <tr><th>名称</th><th>地址</th><th>归属地</th><th>状态</th><th>操作</th></tr>
          </thead>
          <tbody>
            {proxies.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.url}</td>
                <td>{p.location || "未知"}</td>
                <td><StatusChip status={p.status || "unknown"} /></td>
                <td>
                  <div className="row-actions">
                    <button className="mini-btn" type="button" disabled={busy === `proxy-test-${p.id}`} onClick={() => onTest(p)}>
                      检测
                    </button>
                    <button className="mini-btn danger" type="button" onClick={() => onDelete(p)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyPanel title="还没有代理" text="添加代理地址后可在 Profile 编辑中选择使用。" />
      )}
    </>
  );
}

function PlatformLogo({ logoPath, name, size = 28 }: { logoPath: string; name: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const src = logoPath
    ? logoPath.startsWith("/logos/")
      ? logoPath
      : convertFileSrc(logoPath)
    : "";
  if (!src || failed) {
    return (
      <span className="platform-logo-fallback" style={{ width: size, height: size, fontSize: size * 0.55 }}>
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="platform-logo-img"
      onError={() => setFailed(true)}
    />
  );
}

function PlatformPicker({
  platforms,
  value,
  onChange,
}: {
  platforms: Platform[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = platforms.find((p) => p.id === value);
  return (
    <div className="platform-picker" role="combobox" aria-expanded={open}>
      <button
        type="button"
        className="platform-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        onBlur={(e) => { if (!e.currentTarget.parentElement?.contains(e.relatedTarget as Node)) setOpen(false); }}
      >
        {selected ? (
          <>
            <PlatformLogo logoPath={selected.logoPath} name={selected.name} size={20} />
            <span>{selected.name}</span>
          </>
        ) : (
          <span className="muted-text">请选择平台</span>
        )}
        <span className="picker-arrow">▾</span>
      </button>
      {open && (
        <div className="platform-picker-dropdown" role="listbox">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={p.id === value}
              className={`platform-picker-option${p.id === value ? " selected" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); onChange(p.id); setOpen(false); }}
            >
              <PlatformLogo logoPath={p.logoPath} name={p.name} size={20} />
              <span>{p.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformManager({
  busy,
  platforms,
  onDelete,
  onSave,
}: {
  busy: string;
  platforms: Platform[];
  onDelete: (item: Platform) => void;
  onSave: (input: { id?: string; name: string; url: string; logoPath?: string }) => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [logoPath, setLogoPath] = useState("");

  async function pickLogo() {
    const selected = await open({ directory: false, multiple: false, filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "svg", "webp"] }] });
    if (typeof selected === "string") setLogoPath(selected);
  }

  return (
    <>
      <div className="panel-head">
        <div>
          <div className="panel-title">平台管理</div>
          <div className="panel-sub">管理采集目标平台，支持自定义 Logo</div>
        </div>
        <button className="btn primary" type="button" onClick={() => { setShowAdd(true); setName(""); setUrl(""); setLogoPath(""); }}>
          添加平台
        </button>
      </div>
      {showAdd && (
        <div className="settings-grid" style={{ padding: "12px 16px" }}>
          <Field label="平台名称">
            <input placeholder="如 Shopee" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="平台 URL">
            <input placeholder="https://shopee.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
          <Field label="Logo（可选）">
            <div className="logo-upload-row">
              {logoPath && (
                <PlatformLogo logoPath={logoPath} name={name || "?"} size={32} />
              )}
              <button className="mini-btn" type="button" onClick={() => void pickLogo()}>
                {logoPath ? "重新选择" : "上传 Logo"}
              </button>
              {logoPath && (
                <span className="logo-filename">{logoPath.split("/").pop()}</span>
              )}
            </div>
          </Field>
          <div style={{ display: "flex", gap: 8, alignItems: "end" }}>
            <button className="btn primary" type="button" disabled={!name.trim() || !url.trim() || busy === "platform"} onClick={async () => { await onSave({ name: name.trim(), url: url.trim(), logoPath: logoPath.trim() || undefined }); setName(""); setUrl(""); setLogoPath(""); setShowAdd(false); }}>
              保存
            </button>
            <button className="btn" type="button" onClick={() => setShowAdd(false)}>取消</button>
          </div>
        </div>
      )}
      {platforms.length ? (
        <table>
          <thead>
            <tr><th>平台</th><th>URL</th><th>类型</th><th>操作</th></tr>
          </thead>
          <tbody>
            {platforms.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="platform-cell">
                    <PlatformLogo logoPath={p.logoPath} name={p.name} size={24} />
                    <strong>{p.name}</strong>
                  </span>
                </td>
                <td>{p.url}</td>
                <td><Chip color={p.isBuiltin ? "cyan" : "green"}>{p.isBuiltin ? "内置" : "自定义"}</Chip></td>
                <td>
                  <div className="row-actions">
                    <button className="mini-btn danger" type="button" onClick={() => onDelete(p)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyPanel title="还没有平台" text="添加后在 Profile 编辑中即可选择。" />
      )}
    </>
  );
}

function SettingsView({
  busy,
  groups,
  logs,
  platforms,
  profiles,
  proxies,
  runtime,
  settings,
  onChooseBrowser,
  onDeleteGroup,
  onDeletePlatform,
  onDeleteProxy,
  onImportProxies,
  onSave,
  onSaveGroup,
  onSavePlatform,
  onSaveProxy,
  onSettingsChange,
  onTestProxy,
}: {
  busy: string;
  groups: Group[];
  logs: LogEntry[];
  platforms: Platform[];
  profiles: Profile[];
  proxies: ProxyItem[];
  runtime: RuntimeStatus;
  settings: Settings;
  onChooseBrowser: () => void;
  onDeleteGroup: (item: Group) => void;
  onDeletePlatform: (item: Platform) => void;
  onDeleteProxy: (item: ProxyItem) => void;
  onImportProxies: (text: string) => void;
  onSave: () => void;
  onSaveGroup: (input: { id?: string; name: string; color: string }) => void;
  onSavePlatform: (input: { id?: string; name: string; url: string; logoPath?: string }) => void;
  onSaveProxy: (input: { id?: string; name: string; url: string; username?: string; password?: string }) => void;
  onSettingsChange: (settings: Settings) => void;
  onTestProxy: (item: ProxyItem) => void;
}) {
  const [settingsTab, setSettingsTab] = useState<string>("basic");
  const tabs = [
    { id: "basic", label: "基本设置" },
    { id: "groups", label: "分组管理" },
    { id: "proxies", label: "代理管理" },
    { id: "platforms", label: "平台管理" },
  ];

  return (
    <div className="page-grid">
      <div className="wide-stack">
        <div className="settings-tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`settings-tab ${settingsTab === tab.id ? "active" : ""}`}
              type="button"
              onClick={() => setSettingsTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {settingsTab === "basic" && (
          <section className="panel">
            <div className="panel-head">
              <div>
                <div className="panel-title">System Settings</div>
                <div className="panel-sub">运行、路径和日志</div>
              </div>
              <button className="btn primary" type="button" disabled={busy === "settings"} onClick={() => void onSave()}>
                保存设置
              </button>
            </div>
            <div className="settings-grid">
              <Field label="最大并发窗口数" hint="超过上限后进入等待队列。">
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxConcurrentWindows}
                  onChange={(event) =>
                    onSettingsChange({ ...settings, maxConcurrentWindows: Number(event.target.value) })
                  }
                />
              </Field>
              <Field label="浏览器模式" hint="当前实现以可见窗口为主，便于登录和调试。">
                <select
                  value={settings.browserMode}
                  onChange={(event) => onSettingsChange({ ...settings, browserMode: event.target.value })}
                >
                  <option value="visible">可见窗口</option>
                  <option value="headless">Headless</option>
                </select>
              </Field>
              <Field label="浏览器可执行文件路径" hint="留空时自动查找 Chrome、Chromium、Edge、Brave 或 Playwright Chromium。">
                <div className="field-combo">
                  <input
                    value={settings.browserExecutablePath}
                    onChange={(event) =>
                      onSettingsChange({ ...settings, browserExecutablePath: event.target.value })
                    }
                    placeholder="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
                  />
                  <button className="mini-btn" type="button" onClick={() => void onChooseBrowser()}>
                    选择
                  </button>
                </div>
              </Field>
              <Field label="Profile 存储路径">
                <input readOnly value={settings.profileStoragePath} />
              </Field>
              <Field label="结果导出路径">
                <input readOnly value={settings.resultExportPath} />
              </Field>
              <Field label="日志级别">
                <select
                  value={settings.logLevel}
                  onChange={(event) => onSettingsChange({ ...settings, logLevel: event.target.value })}
                >
                  <option value="debug">Debug</option>
                  <option value="info">Info</option>
                  <option value="warn">Warn</option>
                  <option value="error">Error</option>
                </select>
              </Field>
            </div>
          </section>
        )}

        {settingsTab === "groups" && (
          <section className="panel">
            <GroupManager
              busy={busy}
              groups={groups}
              profiles={profiles}
              onDelete={onDeleteGroup}
              onSave={onSaveGroup}
            />
          </section>
        )}

        {settingsTab === "proxies" && (
          <section className="panel">
            <ProxyManager
              busy={busy}
              proxies={proxies}
              onDelete={onDeleteProxy}
              onImport={onImportProxies}
              onSave={onSaveProxy}
              onTest={onTestProxy}
            />
          </section>
        )}

        {settingsTab === "platforms" && (
          <section className="panel">
            <PlatformManager
              busy={busy}
              platforms={platforms}
              onDelete={onDeletePlatform}
              onSave={onSavePlatform}
            />
          </section>
        )}
      </div>
      <aside className="inspector">
        <div className="panel-head">
          <div>
            <div className="panel-title">Runtime Status</div>
            <div className="panel-sub">本地后端和浏览器发现状态</div>
          </div>
          <Chip color={runtime.browserReady ? "green" : "coral"}>{runtime.browserReady ? "Ready" : "Missing"}</Chip>
        </div>
        <div className="inspector-body">
          <div className="info-box">
            <div className="kv">
              <span>Backend</span>
              <span>{runtime.backendReady ? "Ready" : "Down"}</span>
              <span>Browser</span>
              <span>{runtime.browserReady ? "Ready" : "Missing"}</span>
              <span>Service</span>
              <span>{runtime.serviceUrl}</span>
              <span>Data Dir</span>
              <span>{runtime.dataDir}</span>
            </div>
          </div>
          <InfoBox label="Browser Path" value={runtime.browserPath || "未设置"} />
          {runtime.error ? <div className="error-box">{runtime.error}</div> : null}
          <section className="panel nested-flat">
            <div className="panel-head">
              <div>
                <div className="panel-title">Runtime Feed</div>
                <div className="panel-sub">最近事件</div>
              </div>
            </div>
            <LogFeed logs={logs} />
          </section>
        </div>
      </aside>
    </div>
  );
}

function ProfileModal({
  busy,
  groups,
  platforms,
  proxies,
  value,
  onCancel,
  onChange,
  onSave,
}: {
  busy: boolean;
  groups: Group[];
  platforms: Platform[];
  proxies: ProxyItem[];
  value: ProfileInput;
  onCancel: () => void;
  onChange: (value: ProfileInput) => void;
  onSave: () => void;
}) {
  const [proxyMode, setProxyMode] = useState<"library" | "custom" | "none">(
    value.proxyId ? "library" : value.proxy.trim() ? "custom" : "none",
  );

  useEffect(() => {
    setProxyMode(value.proxyId ? "library" : value.proxy.trim() ? "custom" : "none");
  }, [value.id]);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal profile-modal" role="dialog" aria-modal="true" aria-label="Profile 编辑器">
        <div className="modal-head">
          <div>
            <div className="panel-title">{value.id ? "编辑 Profile" : "新建 Profile"}</div>
            <div className="panel-sub">保存后会分配独立用户数据目录</div>
          </div>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body profile-editor">
          <FormSection title="基础设置">
            <FormRow label="窗口名称" required>
              <input maxLength={50} value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
              <Counter value={value.name} max={50} />
            </FormRow>
            <FormRow label="标签">
              <input placeholder="请选择标签" value={value.tag} onChange={(event) => onChange({ ...value, tag: event.target.value })} />
            </FormRow>
            <FormRow label="选择分组" required>
              <select
                value={value.groupId ?? ""}
                onChange={(event) => {
                  const groupId = event.target.value || null;
                  const group = groups.find((g) => g.id === groupId);
                  onChange({
                    ...value,
                    groupId,
                    group: group?.name ?? "",
                    groupName: group?.name ?? "",
                  });
                }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </FormRow>
            <FormRow label="平台">
              <PlatformPicker
                platforms={platforms}
                value={value.platformId ?? ""}
                onChange={(platformId) => {
                  const platform = platforms.find((p) => p.id === platformId);
                  onChange({
                    ...value,
                    platformId: platformId || null,
                    platformName: platform?.name ?? "",
                    platformUrl: platform?.url ?? "",
                    startUrl: platform?.url ?? value.startUrl,
                  });
                }}
              />
            </FormRow>
            <FormRow label="用户名">
              <input
                maxLength={100}
                placeholder="设置平台登录用户名"
                value={value.loginUsername}
                onChange={(event) => onChange({ ...value, loginUsername: event.target.value })}
              />
              <Counter value={value.loginUsername} max={100} />
            </FormRow>
            <FormRow label="密码">
              <input
                maxLength={100}
                placeholder="设置平台登录密码"
                type="password"
                value={value.loginPassword}
                onChange={(event) => onChange({ ...value, loginPassword: event.target.value })}
              />
              <Counter value={value.loginPassword} max={100} />
            </FormRow>
            <FormRow label="2FA 秘钥">
              <input
                maxLength={100}
                placeholder="请输入秘钥"
                value={value.twoFaSecret}
                onChange={(event) => onChange({ ...value, twoFaSecret: event.target.value })}
              />
              <Counter value={value.twoFaSecret} max={100} />
            </FormRow>
            <FormRow label="备注">
              <textarea
                className="short-textarea"
                maxLength={500}
                placeholder="请填写浏览器窗口备注"
                value={value.note}
                onChange={(event) => onChange({ ...value, note: event.target.value })}
              />
              <Counter value={value.note} max={500} />
            </FormRow>
            <FormRow label="Cookie">
              <textarea
                placeholder='粘贴 Cookie JSON 数组，或 {"cookies":[...]}'
                value={value.cookieJson}
                onChange={(event) =>
                  onChange({
                    ...value,
                    cookieJson: event.target.value,
                    cookie: event.target.value.trim() ? "Imported" : "Valid",
                  })
                }
              />
            </FormRow>
            <FormRow label="打开指定网址">
              <textarea
                className="short-textarea"
                placeholder="每行一个网址。当前版本启动时打开第一行。"
                value={value.startUrl}
                onChange={(event) => onChange({ ...value, startUrl: event.target.value })}
              />
            </FormRow>
          </FormSection>

          <FormSection title="代理设置">
            <FormRow label="代理方式" required>
              <Segmented
                value={proxyMode}
                onChange={(next) => {
                  setProxyMode(next as "library" | "custom" | "none");
                  if (next === "none") {
                    onChange({ ...value, proxy: "", proxyId: null, proxyUrl: "" });
                  } else if (next === "library") {
                    const first = proxies[0];
                    onChange({
                      ...value,
                      proxyId: first?.id ?? null,
                      proxy: first?.url ?? "",
                      proxyUrl: first?.url ?? "",
                      proxyName: first?.name ?? "",
                    });
                  }
                }}
                options={[
                  ["library", "代理库"],
                  ["custom", "自定义"],
                  ["none", "不使用"],
                ]}
              />
            </FormRow>
            {proxyMode === "library" ? (
              <FormRow label="选择代理" required>
                <select
                  value={value.proxyId ?? ""}
                  onChange={(event) => {
                    const proxyId = event.target.value || null;
                    const proxy = proxies.find((p) => p.id === proxyId);
                    onChange({
                      ...value,
                      proxyId,
                      proxy: proxy?.url ?? "",
                      proxyUrl: proxy?.url ?? "",
                      proxyName: proxy?.name ?? "",
                    });
                  }}
                >
                  {proxies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {p.url} {p.location ? `(${p.location})` : ""}
                    </option>
                  ))}
                </select>
              </FormRow>
            ) : proxyMode === "custom" ? (
              <FormRow label="代理地址" required>
                <input
                  placeholder="http://user:pass@host:port 或 socks5://user:pass@host:port"
                  value={value.proxy}
                  onChange={(event) => {
                    const next = event.target.value;
                    onChange({ ...value, proxy: next, proxyUrl: next });
                  }}
                />
              </FormRow>
            ) : null}
          </FormSection>

          <FormSection title="常用设置">
            <FormRow label="语言">
              <select value={value.locale} onChange={(event) => onChange({ ...value, locale: event.target.value })}>
                {LOCALE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="时区">
              <select value={value.timezone} onChange={(event) => onChange({ ...value, timezone: event.target.value })}>
                {TIMEZONE_OPTIONS.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </FormRow>
            <FormRow label="窗口尺寸">
              <div className="inline-inputs">
                <input
                  min={320}
                  type="number"
                  value={value.windowWidth}
                  onChange={(event) => onChange({ ...value, windowWidth: Number(event.target.value) || 1280 })}
                />
                <span>x</span>
                <input
                  min={320}
                  type="number"
                  value={value.windowHeight}
                  onChange={(event) => onChange({ ...value, windowHeight: Number(event.target.value) || 720 })}
                />
              </div>
            </FormRow>
            <FormRow label="禁止加载图片">
              <Toggle checked={value.blockImages} onChange={(checked) => onChange({ ...value, blockImages: checked })} />
            </FormRow>
            <FormRow label="禁止视频自动播放">
              <Toggle checked={value.blockAutoplay} onChange={(checked) => onChange({ ...value, blockAutoplay: checked })} />
            </FormRow>
            <FormRow label="禁止网站播放声音">
              <Toggle checked={value.muteAudio} onChange={(checked) => onChange({ ...value, muteAudio: checked })} />
            </FormRow>
            <FormRow label="使用硬件加速模式">
              <Toggle
                checked={value.hardwareAcceleration}
                onChange={(checked) => onChange({ ...value, hardwareAcceleration: checked })}
              />
            </FormRow>
            <FormRow label="忽略 HTTPS 证书错误">
              <Toggle
                checked={value.ignoreHttpsErrors}
                onChange={(checked) => onChange({ ...value, ignoreHttpsErrors: checked })}
              />
            </FormRow>
          </FormSection>

          <FormSection title="指纹设置">
            <FormRow label="User Agent">
              <textarea
                className="short-textarea"
                placeholder="留空使用浏览器默认 User Agent"
                value={value.userAgent}
                onChange={(event) => onChange({ ...value, userAgent: event.target.value })}
              />
            </FormRow>
            <FormRow label="WebRTC">
              <Segmented
                value={value.webrtcMode}
                onChange={(webrtcMode) => onChange({ ...value, webrtcMode })}
                options={[
                  ["default", "默认"],
                  ["privacy", "代理模式"],
                  ["disable", "完全禁用"],
                ]}
              />
            </FormRow>
            <FormRow label="屏幕指纹尺寸">
              <div className="inline-inputs">
                <input
                  min={0}
                  type="number"
                  placeholder="宽度"
                  value={value.screenWidth || ""}
                  onChange={(event) => onChange({ ...value, screenWidth: Number(event.target.value) || 0 })}
                />
                <span>x</span>
                <input
                  min={0}
                  type="number"
                  placeholder="高度"
                  value={value.screenHeight || ""}
                  onChange={(event) => onChange({ ...value, screenHeight: Number(event.target.value) || 0 })}
                />
              </div>
              <small className="field-hint">CDP Emulation 覆盖屏幕尺寸，留空使用窗口尺寸</small>
            </FormRow>
            <FormRow label="设备像素比">
              <input
                min={0}
                step={0.5}
                type="number"
                placeholder="留空使用默认（如 2.0）"
                value={value.devicePixelRatio || ""}
                onChange={(event) => onChange({ ...value, devicePixelRatio: Number(event.target.value) || 0 })}
              />
            </FormRow>
            <FormRow label="禁用 WebGL">
              <Toggle
                checked={value.disableWebgl}
                onChange={(checked) => onChange({ ...value, disableWebgl: checked })}
              />
            </FormRow>
            <FormRow label="Canvas 指纹混淆">
              <Toggle
                checked={value.disableCanvas}
                onChange={(checked) => onChange({ ...value, disableCanvas: checked })}
              />
            </FormRow>
            <FormRow label="禁用远程字体">
              <Toggle
                checked={value.disableFonts}
                onChange={(checked) => onChange({ ...value, disableFonts: checked })}
              />
            </FormRow>
            <FormRow label="禁用插件信息">
              <Toggle
                checked={value.disablePlugins}
                onChange={(checked) => onChange({ ...value, disablePlugins: checked })}
              />
            </FormRow>
            <FormRow label="启动参数">
              <textarea
                className="short-textarea"
                placeholder="浏览器启动参数，如 --mute-audio，多个参数以逗号分隔"
                value={value.launchArgs}
                onChange={(event) => onChange({ ...value, launchArgs: event.target.value })}
              />
            </FormRow>
          </FormSection>

        </div>
        <div className="modal-foot" style={{ justifyContent: "space-between" }}>
          <button
            className="btn"
            type="button"
            onClick={() => onChange({ ...value, ...generateRandomFingerprint() })}
          >
            🎲 一键生成随机指纹
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="button" onClick={onCancel}>
              取消
            </button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => void onSave()}>
              保存 Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaskModal({
  adapters,
  busy,
  profiles,
  value,
  onCancel,
  onChange,
  onSave,
}: {
  adapters: SiteAdapter[];
  busy: boolean;
  profiles: Profile[];
  value: TaskInput;
  onCancel: () => void;
  onChange: (value: TaskInput) => void;
  onSave: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal wide" role="dialog" aria-modal="true" aria-label="任务编辑器">
        <div className="modal-head">
          <div>
            <div className="panel-title">{value.id ? "编辑任务" : "新建任务"}</div>
            <div className="panel-sub">任务会启动绑定 Profile，并通过 CDP 执行 adapter 脚本</div>
          </div>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body form-grid">
          <Field label="任务名称">
            <input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} />
          </Field>
          <Field label="绑定 Profile">
            <select
              value={value.profileId}
              onChange={(event) => onChange({ ...value, profileId: event.target.value })}
            >
              <option value="">请选择 Profile</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Adapter">
            <select
              value={value.adapter}
              onChange={(event) => {
                const adapter = adapters.find((item) => item.id === event.target.value);
                onChange({
                  ...value,
                  adapter: event.target.value,
                  site: adapter?.site ?? value.site,
                  script: adapter?.script ?? value.script,
                });
              }}
            >
              {adapters.map((adapter) => (
                <option key={adapter.id} value={adapter.id}>
                  {adapter.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="站点">
            <input value={value.site} onChange={(event) => onChange({ ...value, site: event.target.value })} />
          </Field>
          <Field label="目标 URL">
            <input value={value.startUrl} onChange={(event) => onChange({ ...value, startUrl: event.target.value })} />
          </Field>
          <div className="field full">
            <label>Adapter Script</label>
            <textarea value={value.script} onChange={(event) => onChange({ ...value, script: event.target.value })} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" type="button" onClick={onCancel}>
            取消
          </button>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void onSave()}>
            保存任务
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ className = "", label, meta, value }: { className?: string; label: string; meta: string; value: number }) {
  return (
    <div className={`metric ${className}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      <div className="meta">{meta}</div>
    </div>
  );
}

function MiniTile({
  kicker,
  title,
  widthA,
  widthB,
}: {
  kicker: string;
  title: string;
  widthA: number;
  widthB: number;
}) {
  return (
    <div className="site-tile">
      <div className="tile-kicker">{kicker}</div>
      <div className="tile-main">{title}</div>
      <div className="mini-bars">
        <span style={{ "--w": `${widthA}%` } as React.CSSProperties} />
        <span style={{ "--w": `${widthB}%` } as React.CSSProperties} />
      </div>
    </div>
  );
}

function Signal({ label, value }: { label: string; value: string }) {
  return (
    <div className="signal">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PipelineRow({
  color,
  index,
  status,
  sub,
  title,
}: {
  color: "green" | "cyan" | "amber" | "coral" | "blue";
  index: string;
  status: string;
  sub: string;
  title: string;
}) {
  return (
    <div className="pipe-row">
      <div className="pipe-icon">{index}</div>
      <div>
        <div className="pipe-title">{title}</div>
        <div className="pipe-sub">{sub}</div>
      </div>
      <Chip color={color}>{status}</Chip>
    </div>
  );
}

function Segmented({
  onChange,
  options,
  value,
}: {
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <div className="seg">
      {options.map(([id, label]) => (
        <button className={value === id ? "active" : ""} key={id} type="button" onClick={() => onChange(id)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ "--w": `${Math.max(0, Math.min(100, value))}%` } as React.CSSProperties} />
    </div>
  );
}

function ProfileSwitcher({
  compact = false,
  profiles,
  selectedProfileId,
  onNext,
  onPrevious,
  onSelect,
}: {
  compact?: boolean;
  profiles: Profile[];
  selectedProfileId: string;
  onNext?: () => void;
  onPrevious?: () => void;
  onSelect: (profileId: string) => void;
}) {
  return (
    <div className={`profile-switcher ${compact ? "compact" : ""}`}>
      <button className="sw-btn" type="button" disabled={!onPrevious} onClick={onPrevious} aria-label="上一个 Profile">
        ‹
      </button>
      <select value={selectedProfileId} onChange={(event) => onSelect(event.target.value)}>
        {profiles.length ? (
          profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))
        ) : (
          <option value="">无 Profile</option>
        )}
      </select>
      <button className="sw-btn" type="button" disabled={!onNext} onClick={onNext} aria-label="下一个 Profile">
        ›
      </button>
    </div>
  );
}

function InlineText({
  value,
  onCommit,
  placeholder,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="inline-input"
        placeholder={placeholder}
        value={draft}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => {
          onCommit(draft);
          setEditing(false);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
      />
    );
  }

  return (
    <span className="inline-cell" onClick={(e) => e.stopPropagation()}>
      <span className="cell-text">{value || placeholder || ""}</span>
      <svg className="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={() => setEditing(true)}>
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </span>
  );
}

function InlineSelect({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: { value: string; label: string }[];
  onCommit: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  if (editing) {
    return (
      <select
        ref={selectRef}
        className="inline-input"
        value={value}
        onClick={(e) => e.stopPropagation()}
        onBlur={() => setEditing(false)}
        onChange={(e) => {
          onCommit(e.target.value);
          setEditing(false);
        }}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    );
  }
  const display = options.find((o) => o.value === value)?.label || value;
  return (
    <span className="inline-cell" onClick={(e) => e.stopPropagation()}>
      <span className="cell-text">{display}</span>
      <svg className="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" onClick={() => setEditing(true)}>
        <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      </svg>
    </span>
  );
}

function RowMenu({
  items,
}: {
  items: { label: string; danger?: boolean; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.right });
    }
    setOpen(!open);
  }

  return (
    <div className="row-menu" ref={ref}>
      <button ref={triggerRef} className="mini-btn row-menu-trigger" type="button" onClick={toggle}>⋮</button>
      {open && (
        <div className="row-menu-dropdown" style={{ top: pos.top, right: window.innerWidth - pos.left }}>
          {items.map((item) => (
            <button
              key={item.label}
              className={`row-menu-item${item.danger ? " danger" : ""}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); item.onClick(); setOpen(false); }}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const color =
    normalized === "running" || normalized === "ready" || normalized === "saved"
      ? "green"
      : normalized === "error" || normalized === "failed"
        ? "coral"
        : normalized === "waiting" || normalized === "starting"
          ? "amber"
          : "blue";
  return <Chip color={color}>{statusLabel(status)}</Chip>;
}

function Chip({
  children,
  color,
}: {
  children: React.ReactNode;
  color: "green" | "cyan" | "amber" | "coral" | "blue";
}) {
  return <span className={`chip ${color}`}>{children}</span>;
}

function MetaCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="meta-cell">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="info-box">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );
}

function EmptyPanel({ text, title }: { text: string; title: string }) {
  return (
    <div className="empty-panel">
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function Field({
  children,
  hint,
  label,
}: {
  children: React.ReactNode;
  hint?: string;
  label: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

function FormSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="form-section">
      <div className="form-section-title">{title}</div>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function FormRow({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div className="form-row">
      <label>
        {required ? <span>*</span> : null}
        {label}
      </label>
      <div className="form-control">{children}</div>
    </div>
  );
}

function Counter({ max, value }: { max: number; value: string }) {
  return <span className="counter">{value.length}/{max}</span>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button className={`toggle ${checked ? "on" : ""}`} type="button" onClick={() => onChange(!checked)}>
      <span />
    </button>
  );
}

function LogFeed({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="terminal">
      {logs.length ? (
        logs.slice(0, 8).map((entry, index) => (
          <div key={`${entry.time}-${index}`}>
            <span>{entry.time.split(" ").pop()}</span>
            <span>{entry.message}</span>
          </div>
        ))
      ) : (
        <div>
          <span>--:--:--</span>
          <span>等待运行事件</span>
        </div>
      )}
    </div>
  );
}

function LogoMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="logo-gradient" x1="4" x2="60" y1="4" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="14" fill="url(#logo-gradient)" />
      <rect x="14" y="16" width="30" height="22" rx="4" fill="white" fillOpacity="0.15" stroke="white" strokeWidth="2" />
      <rect x="14" y="16" width="30" height="5" rx="2" fill="white" fillOpacity="0.25" />
      <rect x="22" y="24" width="28" height="22" rx="4" fill="white" fillOpacity="0.35" stroke="white" strokeWidth="2" />
      <rect x="22" y="24" width="28" height="5" rx="2" fill="white" fillOpacity="0.45" />
      <circle cx="18" cy="19" r="1.5" fill="#60a5fa" />
      <circle cx="22" cy="19" r="1.5" fill="#34d399" />
      <circle cx="26" cy="19" r="1.5" fill="#fbbf24" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 0 1-15.5 6.2" />
      <path d="M3 12A9 9 0 0 1 18.5 5.8" />
      <path d="M3 20v-6h6" />
      <path d="M21 4v6h-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

function themeIcon(theme: Theme) {
  if (theme === "dark") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    );
  }
  if (theme === "aurora") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 2 7l10 5 10-5-10-5Z" />
        <path d="m2 17 10 5 10-5" />
        <path d="m2 12 10 5 10-5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2" />
      <path d="M12 21v2" />
      <path d="m4.2 4.2 1.4 1.4" />
      <path d="m18.4 18.4 1.4 1.4" />
      <path d="M1 12h2" />
      <path d="M21 12h2" />
      <path d="m4.2 19.8 1.4-1.4" />
      <path d="m18.4 5.6 1.4-1.4" />
    </svg>
  );
}

function normalizeTheme(value: string): Theme {
  if (value === "dark" || value === "aurora" || value === "light") return value;
  return "light";
}

function themeLabel(theme: Theme) {
  return theme === "light" ? "浅色" : theme === "dark" ? "深色" : "极光";
}

function matches(query: string, ...values: string[]) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(needle));
}

function profileToInput(profile: Profile): ProfileInput {
  return {
    id: profile.id,
    name: profile.name,
    tag: profile.tag || "",
    groupId: profile.groupId ?? null,
    group: profile.group || "",
    groupName: profile.group || "默认",
    proxyId: profile.proxyId ?? null,
    proxy: profile.proxy || "",
    proxyUrl: profile.proxy || "",
    proxyName: profile.proxy || "",
    platformId: profile.platformId ?? null,
    account: profile.account || "",
    loginUsername: profile.loginUsername || "",
    loginPassword: profile.loginPassword || "",
    twoFaSecret: profile.twoFaSecret || "",
    platformName: "",
    platformUrl: profile.platformUrl || "",
    customPlatformUrl: profile.platformUrl || "",
    note: profile.note || "",
    cookieJson: profile.cookieJson || "",
    locale: profile.locale || "zh-CN",
    timezone: profile.timezone || "Asia/Shanghai",
    userAgent: profile.userAgent || "",
    windowWidth: profile.windowWidth || 1280,
    windowHeight: profile.windowHeight || 720,
    webrtcMode: profile.webrtcMode || "default",
    blockImages: Boolean(profile.blockImages),
    muteAudio: Boolean(profile.muteAudio),
    blockAutoplay: Boolean(profile.blockAutoplay),
    hardwareAcceleration: profile.hardwareAcceleration !== false,
    ignoreHttpsErrors: Boolean(profile.ignoreHttpsErrors),
    launchArgs: profile.launchArgs || "",
    disableWebgl: Boolean(profile.disableWebgl),
    disableCanvas: Boolean(profile.disableCanvas),
    disableFonts: Boolean(profile.disableFonts),
    disablePlugins: Boolean(profile.disablePlugins),
    screenWidth: profile.screenWidth || 0,
    screenHeight: profile.screenHeight || 0,
    devicePixelRatio: profile.devicePixelRatio || 0,
    startUrl: profile.startUrl,
    cookie: profile.cookie || "",
  };
}

function profileGroupName(profile: Profile, groups: Map<string, Group>) {
  return groups.get(profile.groupId || "")?.name || profile.group || "默认";
}

function profileProxy(profile: Profile, proxies: Map<string, ProxyItem>) {
  return proxies.get(profile.proxyId || "")?.url || profile.proxy || "未设置";
}

function profileSortValue(profile: Profile, key: "number" | "name" | "group" | "proxy", groups: Map<string, Group>, proxies: Map<string, ProxyItem>) {
  if (key === "number") return profile.profileNumber;
  if (key === "group") return profileGroupName(profile, groups);
  if (key === "proxy") return profileProxy(profile, proxies);
  return profile.name;
}

function proxyType(proxy: string) {
  const lower = proxy.toLowerCase();
  if (lower.includes("socks5")) return "SOCKS5";
  if (lower.includes("socks4")) return "SOCKS4";
  if (lower.includes("http")) return "HTTP";
  return "Custom";
}

function statusLabel(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "running") return "Running";
  if (normalized === "stopped") return "Stopped";
  if (normalized === "starting") return "启动中...";
  if (normalized === "waiting") return "Waiting";
  if (normalized === "done") return "Done";
  if (normalized === "ready") return "Ready";
  if (normalized === "saved") return "Saved";
  if (normalized === "error") return "Error";
  return status || "Unknown";
}

function readableError(error: unknown) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return JSON.stringify(error);
}

function hasTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export default App;
