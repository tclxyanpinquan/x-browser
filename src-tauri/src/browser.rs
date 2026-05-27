use crate::{
    cdp::open_profile_target,
    models::{BrowserSession, Profile},
    store::{ensure_dir, find_browser_executable, now_label, slugify, InnerState},
};
use chrono::Local;
use reqwest::blocking::Client;
use serde_json::Value;
use std::{
    env, fs,
    net::TcpListener,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

struct ProxyLaunch {
    proxy_arg: String,
    child: Option<tokio::process::Child>,
}

pub fn ensure_browser_path(state: &mut InnerState) -> Result<String, String> {
    if !state.browser_path.trim().is_empty() && Path::new(&state.browser_path).exists() {
        return Ok(state.browser_path.clone());
    }

    if let Some(path) = find_browser_executable().or_else(find_playwright_chromium) {
        state.browser_path = path.clone();
        state.store.settings.browser_executable_path = path.clone();
        state.last_error.clear();
        return Ok(path);
    }

    let message = "未找到 Chromium/Chrome。请运行 npm run browser-install，或在设置中填写浏览器可执行文件路径。";
    state.last_error = message.into();
    Err(message.into())
}

pub fn find_playwright_chromium() -> Option<String> {
    let home = env::var("HOME").ok()?;
    let roots = [
        PathBuf::from(&home).join("Library/Caches/ms-playwright"),
        PathBuf::from(&home).join(".cache/ms-playwright"),
        PathBuf::from(&home).join(".local/share/ms-playwright"),
    ];

    for root in roots {
        if !root.exists() {
            continue;
        }
        if let Ok(entries) = fs::read_dir(root) {
            for entry in entries.flatten() {
                let path = entry.path();
                let name = path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("");
                if !name.starts_with("chromium-") {
                    continue;
                }
                let mac_path = path.join("chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing");
                if mac_path.exists() {
                    return Some(mac_path.to_string_lossy().into_owned());
                }
                let linux_path = path.join("chrome-linux/chrome");
                if linux_path.exists() {
                    return Some(linux_path.to_string_lossy().into_owned());
                }
                let win_path = path.join("chrome-win/chrome.exe");
                if win_path.exists() {
                    return Some(win_path.to_string_lossy().into_owned());
                }
            }
        }
    }
    None
}

pub fn start_profile(state: &mut InnerState, profile_id: &str) -> Result<BrowserSession, String> {
    if let Some(session) = state
        .store
        .browser_sessions
        .iter()
        .find(|item| item.profile_id == profile_id && item.status == "running")
        .cloned()
    {
        return Ok(session);
    }

    let browser_path = ensure_browser_path(state)?;
    let profile = state
        .store
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
        .ok_or_else(|| "Profile 不存在".to_string())?;

    if !profile.timezone.trim().is_empty() {
        env::set_var("TZ", profile.timezone.trim());
    }

    let user_data_dir = if profile.user_data_dir.trim().is_empty() {
        state.profile_root.join(slugify(&profile.name))
    } else {
        PathBuf::from(&profile.user_data_dir)
    };
    ensure_dir(&user_data_dir)?;

    let port = free_port()?;
    let mut command = Command::new(&browser_path);
    command
        .arg(format!("--user-data-dir={}", user_data_dir.display()))
        .arg(format!("--remote-debugging-port={port}"))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-background-mode")
        .arg("--new-window")
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    let mut proxy_launch = prepare_proxy(state, &profile)?;
    if let Some(proxy_launch) = proxy_launch.as_ref() {
        command.arg(format!("--proxy-server={}", proxy_launch.proxy_arg));
    }

    if !profile.locale.trim().is_empty() {
        command.arg(format!("--lang={}", profile.locale));
        command.arg(format!("--accept-lang={}", profile.locale));
    }

    if !profile.user_agent.trim().is_empty() {
        command.arg(format!("--user-agent={}", profile.user_agent));
    }

    if profile.window_width > 0 && profile.window_height > 0 {
        command.arg(format!(
            "--window-size={},{}",
            profile.window_width, profile.window_height
        ));
    }

    apply_browser_policy_args(&mut command, &profile);
    for arg in split_launch_args(&profile.launch_args) {
        command.arg(arg);
    }
    command.arg("about:blank");

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            if let Some(launch) = proxy_launch.take() {
                kill_proxy_launch(launch);
            }
            return Err(format!("无法启动 Chromium: {error}"));
        }
    };
    let pid = child.id();
    if let Err(error) = wait_for_cdp(port, Duration::from_secs(8)) {
        let _ = child.kill();
        let _ = child.wait();
        if let Some(launch) = proxy_launch.take() {
            kill_proxy_launch(launch);
        }
        return Err(error);
    }

    let target_url = primary_url(&profile.start_url);
    if let Err(error) = initialize_profile_page(port, target_url, &profile.cookie_json, &profile) {
        let _ = child.kill();
        let _ = child.wait();
        if let Some(launch) = proxy_launch.take() {
            kill_proxy_launch(launch);
        }
        return Err(error);
    }

    let mut profile_for_store = profile.clone();
    profile_for_store.status = "running".into();
    profile_for_store.last = "just now".into();
    profile_for_store.user_data_dir = user_data_dir.to_string_lossy().into_owned();
    state.upsert_profile(profile_for_store);

    let session = BrowserSession {
        id: profile.id.clone(),
        profile_id: profile.id.clone(),
        profile: profile.name.clone(),
        site: profile.note.clone(),
        runtime: "00:00:00".into(),
        memory: "待采样".into(),
        cpu: "待采样".into(),
        url: current_url(port).unwrap_or_else(|| target_url.to_string()),
        status: "running".into(),
        pid: Some(pid),
        port: Some(port),
        started_at: now_label(),
        error: String::new(),
    };

    state.browser_processes.insert(profile.id.clone(), child);
    if let Some(mut proxy_launch) = proxy_launch {
        if let Some(proxy_child) = proxy_launch.child.take() {
            state
                .proxy_processes
                .insert(profile.id.clone(), proxy_child);
        }
    }
    state.upsert_session(session.clone());
    state.log("info", format!("已启动 Profile {}", profile.name));
    Ok(session)
}

pub fn stop_profile(state: &mut InnerState, profile_id: &str) -> Result<(), String> {
    if let Some(mut child) = state.browser_processes.remove(profile_id) {
        let _ = child.kill();
        let _ = child.wait();
    }
    if let Some(child) = state.proxy_processes.remove(profile_id) {
        kill_proxy_child(child);
    }

    if let Some(profile) = state
        .store
        .profiles
        .iter_mut()
        .find(|item| item.id == profile_id)
    {
        profile.status = "stopped".into();
        profile.last = "just now".into();
    }
    state.remove_session(profile_id);
    state.log("info", format!("已停止 Profile {profile_id}"));
    Ok(())
}

pub fn refresh_sessions(state: &mut InnerState) -> bool {
    let mut changed = false;
    let now = Local::now();
    let sessions = state.store.browser_sessions.clone();
    for session in sessions {
        let mut dead = false;

        if let Some(child) = state.browser_processes.get_mut(&session.profile_id) {
            if let Ok(Some(_)) = child.try_wait() {
                dead = true;
            }
        } else {
            dead = true;
        }

        if !dead {
            if let Some(port) = session.port {
                if current_url(port).is_none() {
                    dead = true;
                }
            }
        }

        if dead {
            state.browser_processes.remove(&session.profile_id);
            if let Some(proxy_child) = state.proxy_processes.remove(&session.profile_id) {
                kill_proxy_child(proxy_child);
            }
            state.remove_session(&session.profile_id);
            if let Some(profile) = state
                .store
                .profiles
                .iter_mut()
                .find(|item| item.id == session.profile_id)
            {
                profile.status = "stopped".into();
            }
            state.log(
                "info",
                format!("检测到 Profile {} 浏览器窗口已关闭", session.profile),
            );
            changed = true;
            continue;
        }

        let mut next = session.clone();
        if let Ok(started) =
            chrono::NaiveDateTime::parse_from_str(&session.started_at, "%Y-%m-%d %H:%M:%S")
        {
            let started = started.and_local_timezone(Local).single();
            if let Some(started) = started {
                let duration = now.signed_duration_since(started);
                next.runtime = format_duration(duration.num_seconds().max(0));
            }
        }
        if let Some(pid) = session.pid {
            let (memory, cpu) = sample_process(pid);
            next.memory = memory;
            next.cpu = cpu;
        }
        if let Some(port) = session.port {
            if let Some(url) = current_url(port) {
                next.url = url;
            }
        }
        state.upsert_session(next);
    }
    changed
}

#[cfg(test)]
mod tests {
    use super::refresh_sessions;
    use crate::models::{AppStore, BrowserSession, Profile};
    use crate::store::InnerState;
    use std::{
        collections::HashMap,
        process::{Child, Command},
        thread,
        time::Duration,
    };
    use tempfile::tempdir;

    #[test]
    fn refresh_sessions_marks_dead_browser_as_stopped() {
        let temp = tempdir().expect("tempdir");
        let data_dir = temp.path().to_path_buf();
        let profile_root = data_dir.join("profiles");
        let export_root = data_dir.join("exports");
        let mut state = InnerState {
            data_dir: data_dir.clone(),
            store_path: data_dir.join("store.json"),
            profile_root: profile_root.clone(),
            export_root,
            store: AppStore::new(
                profile_root.to_string_lossy().into_owned(),
                String::new(),
            ),
            browser_processes: HashMap::<String, Child>::new(),
            proxy_processes: HashMap::new(),
            browser_path: String::new(),
            last_error: String::new(),
        };

        let profile = Profile {
            id: "profile-1".into(),
            profile_number: 1,
            name: "Demo".into(),
            tag: String::new(),
            group_id: Some("default".into()),
            group: "默认".into(),
            proxy_id: None,
            platform_id: None,
            account: String::new(),
            login_username: String::new(),
            login_password: String::new(),
            two_fa_secret: String::new(),
            note: String::new(),
            platform_url: String::new(),
            proxy: String::new(),
            cookie: String::new(),
            cookie_json: String::new(),
            locale: "zh-CN".into(),
            timezone: "Asia/Shanghai".into(),
            user_agent: String::new(),
            window_width: 1280,
            window_height: 720,
            webrtc_mode: "default".into(),
            block_images: false,
            mute_audio: false,
            block_autoplay: false,
            hardware_acceleration: true,
            ignore_https_errors: false,
            launch_args: String::new(),
            disable_webgl: false,
            disable_canvas: false,
            disable_fonts: false,
            disable_plugins: false,
            screen_width: 0,
            screen_height: 0,
            device_pixel_ratio: 0.0,
            last: "just now".into(),
            status: "running".into(),
            start_url: "about:blank".into(),
            user_data_dir: profile_root.join("demo").to_string_lossy().into_owned(),
            last_error: String::new(),
        };
        state.store.profiles.push(profile);
        state.store.browser_sessions.push(BrowserSession {
            id: "profile-1".into(),
            profile_id: "profile-1".into(),
            profile: "Demo".into(),
            site: String::new(),
            runtime: "00:01:00".into(),
            memory: "1 MB".into(),
            cpu: "1%".into(),
            url: "about:blank".into(),
            status: "running".into(),
            pid: Some(999_999),
            port: Some(9333),
            started_at: "2026-05-26 10:00:00".into(),
            error: String::new(),
        });
        let child = Command::new("sh")
            .arg("-c")
            .arg("exit 0")
            .spawn()
            .expect("spawn completed process");
        state.browser_processes.insert("profile-1".into(), child);
        thread::sleep(Duration::from_millis(50));

        let changed = refresh_sessions(&mut state);

        assert!(changed);
        assert!(state.store.browser_sessions.is_empty());
        assert_eq!(state.store.profiles[0].status, "stopped");
    }
}

pub fn current_url(port: u16) -> Option<String> {
    let client = Client::builder()
        .timeout(Duration::from_millis(900))
        .build()
        .ok()?;
    let value: Value = client
        .get(format!("http://127.0.0.1:{port}/json"))
        .send()
        .ok()?
        .json()
        .ok()?;
    let pages = value.as_array()?;
    pages
        .iter()
        .find_map(|item| item.get("url").and_then(|url| url.as_str()))
        .map(String::from)
}

fn prepare_proxy(state: &mut InnerState, profile: &Profile) -> Result<Option<ProxyLaunch>, String> {
    if let Some(child) = state.proxy_processes.remove(&profile.id) {
        kill_proxy_child(child);
    }

    let Some(proxy_arg) = normalize_proxy(&profile.proxy) else {
        return Ok(None);
    };
    if !is_socks5_with_auth(&proxy_arg) {
        return Ok(Some(ProxyLaunch {
            proxy_arg,
            child: None,
        }));
    }

    let local_port = free_port()?;
    let gost = find_gost_executable().ok_or_else(|| {
        "SOCKS5 用户名密码代理需要 gost，请安装 gost 或将 gost 加入 PATH".to_string()
    })?;
    let local_proxy = format!("socks5://127.0.0.1:{local_port}");
    let mut child = tokio::process::Command::new(gost)
        .arg(format!("-L={local_proxy}"))
        .arg(format!("-F={proxy_arg}"))
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("无法启动 gost SOCKS5 转发: {error}"))?;

    thread::sleep(Duration::from_millis(300));
    if let Ok(Some(status)) = child.try_wait() {
        return Err(format!("gost SOCKS5 转发启动失败，退出状态: {status}"));
    }

    Ok(Some(ProxyLaunch {
        proxy_arg: local_proxy,
        child: Some(child),
    }))
}

fn kill_proxy_child(mut child: tokio::process::Child) {
    let _ = child.start_kill();
}

fn kill_proxy_launch(mut launch: ProxyLaunch) {
    if let Some(child) = launch.child.take() {
        kill_proxy_child(child);
    }
}

fn normalize_proxy(proxy: &str) -> Option<String> {
    let trimmed = proxy.trim();
    if trimmed.is_empty() || trimmed == "未设置" {
        return None;
    }
    if let Some((protocol, rest)) = split_manual_proxy(trimmed) {
        return Some(format!(
            "{}://{}",
            protocol.to_ascii_lowercase(),
            rest.trim()
        ));
    }
    let lower = trimmed.to_ascii_lowercase();
    if lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("socks5://")
        || lower.starts_with("socks4://")
    {
        return Some(trimmed.into());
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() == 2 {
        return Some(format!("{}://{}", parts[0].to_ascii_lowercase(), parts[1]));
    }
    Some(trimmed.into())
}

fn split_manual_proxy(proxy: &str) -> Option<(&str, &str)> {
    let lower = proxy.to_ascii_lowercase();
    ["socks5 ", "socks4 ", "http ", "https "]
        .iter()
        .find_map(|prefix| {
            lower
                .strip_prefix(prefix)
                .map(|_| (prefix.trim(), &proxy[prefix.len()..]))
        })
}

fn is_socks5_with_auth(proxy: &str) -> bool {
    let lower = proxy.to_ascii_lowercase();
    lower.starts_with("socks5://")
        && proxy.split("://").nth(1).is_some_and(|rest| {
            let host_part = rest.split('/').next().unwrap_or(rest);
            host_part.contains('@')
        })
}

fn find_gost_executable() -> Option<String> {
    if let Ok(path) = env::var("GOST_PATH") {
        let trimmed = path.trim();
        if !trimmed.is_empty() && Path::new(trimmed).exists() {
            return Some(trimmed.to_string());
        }
    }
    env::var_os("PATH").and_then(|paths| {
        env::split_paths(&paths)
            .map(|path| path.join(if cfg!(windows) { "gost.exe" } else { "gost" }))
            .find(|path| path.exists())
            .map(|path| path.to_string_lossy().into_owned())
    })
}

fn apply_browser_policy_args(command: &mut Command, profile: &Profile) {
    let mut disabled_features = vec![
        "Translate".to_string(),
        "InterestFeedContentSuggestions".to_string(),
        "MediaRouter".to_string(),
        "PasswordManager".to_string(),
    ];
    command.arg("--disable-blink-features=AutomationControlled");
    command.arg("--disable-dev-shm-usage");
    command.arg("--disable-background-networking");
    command.arg("--disable-default-apps");
    command.arg("--disable-component-extensions-with-background-pages");
    command.arg("--disable-password-generation");
    command.arg("--disable-single-click-autofill");
    command.arg("--disable-autofill-keyboard-accessory-view[8]");
    command.arg("--disable-breakpad");
    command.arg("--disable-client-side-phishing-detection");
    command.arg("--disable-sync");
    if profile.block_autoplay {
        command.arg("--autoplay-policy=user-gesture-required");
    }
    if profile.block_images {
        command.arg("--blink-settings=imagesEnabled=false");
    }
    if profile.mute_audio {
        command.arg("--mute-audio");
    }
    if !profile.hardware_acceleration {
        command.arg("--disable-gpu");
        command.arg("--disable-software-rasterizer");
    }
    if profile.ignore_https_errors {
        command.arg("--ignore-certificate-errors");
    }
    if profile.disable_webgl {
        command.arg("--disable-webgl");
    }
    if profile.disable_fonts {
        command.arg("--disable-remote-fonts");
    }
    match profile.webrtc_mode.as_str() {
        "disable" => {
            disabled_features.push("WebRtcHideLocalIpsWithMdns".into());
            command.arg("--disable-webrtc");
        }
        "privacy" => {
            command.arg("--force-webrtc-ip-handling-policy=disable_non_proxied_udp");
            command.arg("--disable-features=WebRtcHideLocalIpsWithMdns");
        }
        _ => {}
    }
    command.arg(format!(
        "--disable-features={}",
        disabled_features.join(",")
    ));
}

fn split_launch_args(input: &str) -> Vec<String> {
    input
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(String::from)
        .collect()
}

fn primary_url(input: &str) -> &str {
    input
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("about:blank")
}

fn initialize_profile_page(
    port: u16,
    target_url: &str,
    cookie_json: &str,
    profile: &Profile,
) -> Result<(), String> {
    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .map_err(|error| error.to_string())?;
    runtime.block_on(open_profile_target(port, target_url, cookie_json, profile))
}

fn free_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|error| error.to_string())?;
    let port = listener
        .local_addr()
        .map_err(|error| error.to_string())?
        .port();
    drop(listener);
    Ok(port)
}

fn wait_for_cdp(port: u16, timeout: Duration) -> Result<(), String> {
    let started = Instant::now();
    let client = Client::builder()
        .timeout(Duration::from_millis(600))
        .build()
        .map_err(|error| error.to_string())?;
    while started.elapsed() < timeout {
        if client
            .get(format!("http://127.0.0.1:{port}/json/version"))
            .send()
            .map(|response| response.status().is_success())
            .unwrap_or(false)
        {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(180));
    }
    Err("Chromium 已启动，但调试端口未响应".into())
}

fn sample_process(pid: u32) -> (String, String) {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("ps")
            .args(["-o", "rss=,%cpu=", "-p", &pid.to_string()])
            .output();
        if let Ok(output) = output {
            if output.status.success() {
                let text = String::from_utf8_lossy(&output.stdout);
                let parts: Vec<&str> = text.split_whitespace().collect();
                if parts.len() >= 2 {
                    let rss = parts[0].parse::<f64>().unwrap_or(0.0);
                    let memory = format!("{:.0} MB", rss / 1024.0);
                    let cpu = format!("{}%", parts[1]);
                    return (memory, cpu);
                }
            }
        }
    }
    ("待采样".into(), "待采样".into())
}

fn format_duration(total_seconds: i64) -> String {
    let hours = total_seconds / 3600;
    let minutes = (total_seconds % 3600) / 60;
    let seconds = total_seconds % 60;
    format!("{hours:02}:{minutes:02}:{seconds:02}")
}

