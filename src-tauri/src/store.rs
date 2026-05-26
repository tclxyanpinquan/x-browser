use crate::models::{
    builtin_platforms, AppSnapshot, AppStore, BrowserSession, ExtensionItem, Group, LogEntry,
    Profile, Proxy, ResultItem, RuntimeStatus, Task, TaskRun,
};
use chrono::Local;
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Child,
    sync::Mutex,
};
use tauri::{AppHandle, Manager};

pub struct AppState {
    pub inner: Mutex<InnerState>,
}

pub struct InnerState {
    pub data_dir: PathBuf,
    pub store_path: PathBuf,
    pub profile_root: PathBuf,
    pub extension_root: PathBuf,
    pub export_root: PathBuf,
    pub store: AppStore,
    pub browser_processes: HashMap<String, Child>,
    pub proxy_processes: HashMap<String, tokio::process::Child>,
    pub browser_path: String,
    pub last_error: String,
}

impl InnerState {
    pub fn snapshot(&self) -> AppSnapshot {
        AppSnapshot {
            groups: self.store.groups.clone(),
            proxies: self.store.proxies.clone(),
            platforms: self.store.platforms.clone(),
            profiles: self.store.profiles.clone(),
            browser_sessions: self.store.browser_sessions.clone(),
            tasks: self.store.tasks.clone(),
            task_runs: self.store.task_runs.clone(),
            result_items: self.store.result_items.clone(),
            extensions: self.store.extensions.clone(),
            site_adapters: self.store.site_adapters.clone(),
            settings: self.store.settings.clone(),
            runtime_status: self.runtime_status(),
            logs: self.store.logs.clone(),
        }
    }

    pub fn runtime_status(&self) -> RuntimeStatus {
        RuntimeStatus {
            backend_ready: true,
            browser_ready: !self.browser_path.is_empty(),
            browser_path: self.browser_path.clone(),
            service_url: "tauri://local-commands".into(),
            data_dir: self.data_dir.to_string_lossy().into_owned(),
            error: self.last_error.clone(),
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let payload =
            serde_json::to_string_pretty(&self.store).map_err(|error| error.to_string())?;
        fs::write(&self.store_path, payload).map_err(|error| error.to_string())
    }

    pub fn log(&mut self, level: &str, message: impl Into<String>) {
        let normalized = normalize_log_level(level);
        let current = normalize_log_level(&self.store.settings.log_level);
        if log_level_priority(normalized) < log_level_priority(current) {
            return;
        }
        self.store.logs.insert(
            0,
            LogEntry {
                time: now_label(),
                level: normalized.into(),
                message: message.into(),
            },
        );
        self.store.logs.truncate(120);
    }

    pub fn upsert_profile(&mut self, profile: Profile) {
        if let Some(existing) = self
            .store
            .profiles
            .iter_mut()
            .find(|item| item.id == profile.id)
        {
            *existing = profile;
        } else {
            self.store.profiles.insert(0, profile);
        }
    }

    pub fn upsert_group(&mut self, group: Group) {
        if let Some(existing) = self
            .store
            .groups
            .iter_mut()
            .find(|item| item.id == group.id)
        {
            *existing = group;
        } else {
            self.store.groups.push(group);
        }
    }

    pub fn upsert_proxy(&mut self, proxy: Proxy) {
        if let Some(existing) = self
            .store
            .proxies
            .iter_mut()
            .find(|item| item.id == proxy.id)
        {
            *existing = proxy;
        } else {
            self.store.proxies.insert(0, proxy);
        }
    }

    pub fn upsert_task(&mut self, task: Task) {
        if let Some(existing) = self.store.tasks.iter_mut().find(|item| item.id == task.id) {
            *existing = task;
        } else {
            self.store.tasks.insert(0, task);
        }
    }

    pub fn upsert_extension(&mut self, extension: ExtensionItem) {
        if let Some(existing) = self
            .store
            .extensions
            .iter_mut()
            .find(|item| item.id == extension.id)
        {
            *existing = extension;
        } else {
            self.store.extensions.insert(0, extension);
        }
    }

    pub fn upsert_session(&mut self, session: BrowserSession) {
        if let Some(existing) = self
            .store
            .browser_sessions
            .iter_mut()
            .find(|item| item.id == session.id)
        {
            *existing = session;
        } else {
            self.store.browser_sessions.insert(0, session);
        }
    }

    pub fn remove_session(&mut self, profile_id: &str) {
        self.store
            .browser_sessions
            .retain(|item| item.profile_id != profile_id);
    }

    pub fn append_task_run(&mut self, run: TaskRun) {
        self.store.task_runs.insert(0, run);
        self.store.task_runs.truncate(200);
    }

    pub fn append_result(&mut self, result: ResultItem) {
        self.store.result_items.insert(0, result);
        self.store.result_items.truncate(1000);
    }
}

pub fn init_state(app: &AppHandle) -> Result<AppState, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("无法解析应用数据目录: {error}"))?;
    let profile_root = data_dir.join("profiles");
    let extension_root = data_dir.join("extensions");
    let export_root = data_dir.join("exports");
    ensure_dir(&data_dir)?;
    ensure_dir(&profile_root)?;
    ensure_dir(&extension_root)?;
    ensure_dir(&export_root)?;

    let store_path = data_dir.join("store.json");
    let mut store = if store_path.exists() {
        let raw = fs::read_to_string(&store_path).map_err(|error| error.to_string())?;
        serde_json::from_str::<AppStore>(&raw).unwrap_or_else(|_| {
            AppStore::new(
                profile_root.to_string_lossy().into_owned(),
                extension_root.to_string_lossy().into_owned(),
                export_root.to_string_lossy().into_owned(),
            )
        })
    } else {
        AppStore::new(
            profile_root.to_string_lossy().into_owned(),
            extension_root.to_string_lossy().into_owned(),
            export_root.to_string_lossy().into_owned(),
        )
    };

    store.settings.profile_storage_path = profile_root.to_string_lossy().into_owned();
    store.settings.plugin_storage_path = extension_root.to_string_lossy().into_owned();
    store.settings.result_export_path = export_root.to_string_lossy().into_owned();
    store.browser_sessions.clear();
    normalize_store(&mut store);
    for profile in &mut store.profiles {
        profile.status = "stopped".into();
    }

    let browser_path = if store.settings.browser_executable_path.trim().is_empty() {
        find_browser_executable().unwrap_or_default()
    } else {
        store.settings.browser_executable_path.clone()
    };

    Ok(AppState {
        inner: Mutex::new(InnerState {
            data_dir,
            store_path,
            profile_root,
            extension_root,
            export_root,
            store,
            browser_processes: HashMap::new(),
            proxy_processes: HashMap::new(),
            browser_path,
            last_error: String::new(),
        }),
    })
}

fn normalize_store(store: &mut AppStore) {
    if store.groups.is_empty() {
        store.groups.push(Group {
            id: "default".into(),
            name: "默认".into(),
            color: "#3b82f6".into(),
            created_at: "system".into(),
        });
    }
    if !store.groups.iter().any(|item| item.id == "default") {
        store.groups.insert(
            0,
            Group {
                id: "default".into(),
                name: "默认".into(),
                color: "#3b82f6".into(),
                created_at: "system".into(),
            },
        );
    }

    let builtin = builtin_platforms();
    let existing_ids: std::collections::HashSet<String> =
        store.platforms.iter().map(|p| p.id.clone()).collect();
    for platform in builtin {
        if !existing_ids.contains(&platform.id) {
            store.platforms.push(platform);
        }
    }
    // keep logo_path in sync for builtins that are still present
    for platform in &mut store.platforms {
        if platform.is_builtin && platform.logo_path.is_empty() {
            platform.logo_path = crate::models::builtin_logo_path_pub(&platform.id);
        }
    }

    let mut next_profile_number = store.next_profile_number.max(1);
    for profile in &mut store.profiles {
        if profile.profile_number == 0 {
            profile.profile_number = next_profile_number;
            next_profile_number += 1;
        } else {
            next_profile_number = next_profile_number.max(profile.profile_number + 1);
        }
        if profile.group_id.is_none() {
            let group_name = profile.group.trim();
            profile.group_id = store
                .groups
                .iter()
                .find(|group| !group_name.is_empty() && group.name == group_name)
                .map(|group| group.id.clone())
                .or_else(|| Some("default".into()));
        }
        if profile.proxy_id.is_none() && !profile.proxy.trim().is_empty() {
            if let Some(proxy) = store
                .proxies
                .iter()
                .find(|proxy| proxy.url == profile.proxy)
            {
                profile.proxy_id = Some(proxy.id.clone());
            } else {
                let id = format!("proxy-{}", slugify(&profile.proxy));
                store.proxies.push(Proxy {
                    id: id.clone(),
                    name: profile.proxy.clone(),
                    url: profile.proxy.clone(),
                    username: String::new(),
                    password: String::new(),
                    location: "未知".into(),
                    last_check: String::new(),
                    status: "active".into(),
                });
                profile.proxy_id = Some(id);
            }
        }
        if profile.cookie.is_empty() {
            profile.cookie = cookie_status(&profile.cookie_json);
        }
        profile.plugins = profile.extension_ids.len();
    }
    store.next_profile_number = next_profile_number;
}

pub fn cookie_status(cookie_json: &str) -> String {
    if cookie_json.trim().is_empty() {
        "无 Cookie".into()
    } else {
        "已导入".into()
    }
}

pub fn normalize_log_level(level: &str) -> &'static str {
    match level.to_ascii_lowercase().as_str() {
        "error" => "error",
        "warn" | "warning" => "warn",
        "debug" => "debug",
        _ => "info",
    }
}

pub fn log_level_priority(level: &str) -> u8 {
    match normalize_log_level(level) {
        "error" => 4,
        "warn" => 3,
        "info" => 2,
        "debug" => 1,
        _ => 2,
    }
}

pub fn ensure_dir(path: &Path) -> Result<(), String> {
    fs::create_dir_all(path).map_err(|error| format!("无法创建目录 {}: {error}", path.display()))
}

pub fn now_label() -> String {
    Local::now().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn short_time() -> String {
    Local::now().format("%H:%M:%S").to_string()
}

pub fn slugify(input: &str) -> String {
    let mut out = String::new();
    for ch in input.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
        } else if !out.ends_with('-') {
            out.push('-');
        }
    }
    let cleaned = out.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "profile".into()
    } else {
        cleaned
    }
}

pub fn find_browser_executable() -> Option<String> {
    let candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/Applications/Arc.app/Contents/MacOS/Arc",
    ];
    candidates
        .iter()
        .find(|candidate| Path::new(candidate).exists())
        .map(|candidate| (*candidate).into())
}
