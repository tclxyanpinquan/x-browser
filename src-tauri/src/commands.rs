use crate::{
    browser::{
        refresh_sessions, start_profile as start_browser_profile,
        stop_profile as stop_browser_profile,
    },
    cdp::run_page_script,
    models::{
        AppSnapshot, ExportRequest, Group, GroupInput, Platform, PlatformInput, Profile,
        ProfileInput, Proxy, ProxyInput, ResultItem, Settings, Task, TaskInput, TaskRun,
    },
    store::{cookie_status, now_label, short_time, slugify, AppState, InnerState},
};
use csv::Writer;
use serde_json::Value;
use std::{fs, path::PathBuf};
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

fn lock_state<'a>(
    state: &'a State<AppState>,
) -> Result<std::sync::MutexGuard<'a, InnerState>, String> {
    Ok(state.inner.lock().unwrap_or_else(|poisoned| poisoned.into_inner()))
}

fn persist(state: &InnerState) -> Result<(), String> {
    state.save()
}

fn snapshot(state: &mut InnerState) -> AppSnapshot {
    if refresh_sessions(state) {
        let _ = state.save();
    }
    state.snapshot()
}

fn build_profile(input: ProfileInput, state: &mut InnerState) -> Profile {
    let existing = input
        .id
        .as_deref()
        .and_then(|id| state.store.profiles.iter().find(|profile| profile.id == id))
        .cloned();
    let id = input
        .id
        .clone()
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let name = input.name.trim().to_string();
    let user_data_dir = existing
        .as_ref()
        .filter(|profile| !profile.user_data_dir.trim().is_empty())
        .map(|profile| profile.user_data_dir.clone())
        .unwrap_or_else(|| profile_user_data_dir(state, &name, &id));
    let group_id = resolve_group_id(state, &input, existing.as_ref());
    let proxy_id = resolve_proxy_id(state, &input, existing.as_ref());
    let platform_id = resolve_platform_id(state, &input, existing.as_ref());
    let platform_url = resolve_platform_url(state, &platform_id, &input);
    let proxy_url = resolve_proxy_url(state, &proxy_id, &input);
    let cookie_json = input.cookie_json.trim().to_string();
    let cookie_state = if input.cookie == "Expired" {
        "Expired".into()
    } else {
        cookie_status(&cookie_json)
    };
    Profile {
        id,
        profile_number: existing
            .as_ref()
            .map(|profile| profile.profile_number)
            .filter(|value| *value > 0)
            .unwrap_or_else(|| allocate_profile_number(state)),
        name,
        tag: input.tag.trim().to_string(),
        group_id: Some(group_id.clone()),
        group: resolve_group_name(state, &group_id),
        proxy_id,
        platform_id,
        account: input.account.trim().to_string(),
        login_username: input.login_username.trim().to_string(),
        login_password: input.login_password.trim().to_string(),
        two_fa_secret: input.two_fa_secret.trim().to_string(),
        note: input.note.trim().to_string(),
        platform_url: platform_url.clone(),
        proxy: proxy_url,
        cookie: cookie_state,
        cookie_json,
        locale: normalize_locale(&input.locale),
        timezone: normalize_timezone(&input.timezone),
        user_agent: input.user_agent.trim().to_string(),
        window_width: if input.window_width == 0 {
            1280
        } else {
            input.window_width
        },
        window_height: if input.window_height == 0 {
            720
        } else {
            input.window_height
        },
        webrtc_mode: normalize_webrtc_mode(&input.webrtc_mode),
        block_images: input.block_images,
        mute_audio: input.mute_audio,
        block_autoplay: input.block_autoplay,
        hardware_acceleration: input.hardware_acceleration,
        ignore_https_errors: input.ignore_https_errors,
        launch_args: input.launch_args.trim().to_string(),
        disable_webgl: input.disable_webgl,
        disable_canvas: input.disable_canvas,
        disable_fonts: input.disable_fonts,
        disable_plugins: input.disable_plugins,
        screen_width: input.screen_width,
        screen_height: input.screen_height,
        device_pixel_ratio: input.device_pixel_ratio,
        last: existing
            .as_ref()
            .map(|profile| profile.last.clone())
            .unwrap_or_else(|| "未启动".into()),
        status: existing
            .as_ref()
            .map(|profile| profile.status.clone())
            .unwrap_or_else(|| "stopped".into()),
        start_url: primary_profile_url(&input.start_url, &platform_url),
        user_data_dir,
        last_error: String::new(),
    }
}

fn unique_profile_name(base_name: &str, profiles: &[Profile]) -> String {
    let base = if base_name.trim().is_empty() {
        "Profile".to_string()
    } else {
        format!("{} Copy", base_name.trim())
    };
    if !profiles.iter().any(|profile| profile.name == base) {
        return base;
    }

    for index in 2.. {
        let candidate = format!("{base} {index}");
        if !profiles.iter().any(|profile| profile.name == candidate) {
            return candidate;
        }
    }
    unreachable!("profile copy name generation should always find a candidate")
}

fn profile_user_data_dir(state: &InnerState, name: &str, id: &str) -> String {
    let short_id: String = id.chars().take(8).collect();
    state
        .profile_root
        .join(format!("{}-{short_id}", slugify(name)))
        .to_string_lossy()
        .into_owned()
}

fn allocate_profile_number(state: &mut InnerState) -> u64 {
    let next = state.store.next_profile_number.max(1);
    state.store.next_profile_number = next + 1;
    next
}

fn normalize_locale(locale: &str) -> String {
    if locale.trim().is_empty() {
        "zh-CN".into()
    } else {
        locale.trim().to_string()
    }
}

fn normalize_timezone(timezone: &str) -> String {
    if timezone.trim().is_empty() {
        "Asia/Shanghai".into()
    } else {
        timezone.trim().to_string()
    }
}

fn normalize_webrtc_mode(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "disable" => "disable".into(),
        "privacy" => "privacy".into(),
        _ => "default".into(),
    }
}

fn primary_profile_url(input: &str, platform_url: &str) -> String {
    let trimmed = input.trim();
    if !trimmed.is_empty() {
        return trimmed
            .split_whitespace()
            .next()
            .unwrap_or("about:blank")
            .to_string();
    }
    if !platform_url.trim().is_empty() {
        return platform_url.trim().to_string();
    }
    "about:blank".into()
}

fn resolve_group_id(
    state: &mut InnerState,
    input: &ProfileInput,
    existing: Option<&Profile>,
) -> String {
    if let Some(group_id) = input
        .group_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        if state.store.groups.iter().any(|group| group.id == group_id) {
            return group_id.to_string();
        }
    }

    if let Some(name) = non_empty_name(&input.group_name).or_else(|| non_empty_name(&input.group)) {
        if let Some(group) = state.store.groups.iter().find(|group| group.name == name) {
            return group.id.clone();
        }
        let id = format!("group-{}", slugify(name));
        state.upsert_group(Group {
            id: id.clone(),
            name: name.to_string(),
            color: "#3b82f6".into(),
            created_at: now_label(),
        });
        return id;
    }

    existing
        .and_then(|profile| profile.group_id.clone())
        .unwrap_or_else(|| "default".into())
}

fn resolve_group_name(state: &InnerState, group_id: &str) -> String {
    state
        .store
        .groups
        .iter()
        .find(|group| group.id == group_id)
        .map(|group| group.name.clone())
        .unwrap_or_else(|| "默认".into())
}

fn resolve_proxy_id(
    state: &mut InnerState,
    input: &ProfileInput,
    existing: Option<&Profile>,
) -> Option<String> {
    if let Some(proxy_id) = input
        .proxy_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        if state.store.proxies.iter().any(|proxy| proxy.id == proxy_id) {
            return Some(proxy_id.to_string());
        }
    }

    let proxy_text = input.proxy_url.trim();
    let manual_proxy = if proxy_text.is_empty() {
        input.proxy.trim()
    } else {
        proxy_text
    };
    if manual_proxy.trim().is_empty() {
        return existing.and_then(|profile| profile.proxy_id.clone());
    }

    if let Some(proxy) = state
        .store
        .proxies
        .iter()
        .find(|proxy| proxy.url == manual_proxy)
    {
        return Some(proxy.id.clone());
    }

    let id = format!("proxy-{}", slugify(manual_proxy));
    state.upsert_proxy(Proxy {
        id: id.clone(),
        name: non_empty_name(&input.proxy_name)
            .unwrap_or(manual_proxy)
            .to_string(),
        url: manual_proxy.to_string(),
        username: String::new(),
        password: String::new(),
        location: "未知".into(),
        last_check: String::new(),
        status: "active".into(),
    });
    Some(id)
}

fn resolve_proxy_url(
    state: &InnerState,
    proxy_id: &Option<String>,
    input: &ProfileInput,
) -> String {
    if let Some(proxy_id) = proxy_id {
        if let Some(proxy) = state
            .store
            .proxies
            .iter()
            .find(|proxy| &proxy.id == proxy_id)
        {
            return proxy.url.clone();
        }
    }
    let manual_proxy = input.proxy_url.trim();
    if !manual_proxy.is_empty() {
        return manual_proxy.to_string();
    }
    input.proxy.trim().to_string()
}

fn resolve_platform_id(
    state: &mut InnerState,
    input: &ProfileInput,
    existing: Option<&Profile>,
) -> Option<String> {
    if let Some(platform_id) = input
        .platform_id
        .as_deref()
        .filter(|value| !value.trim().is_empty())
    {
        if state
            .store
            .platforms
            .iter()
            .any(|platform| platform.id == platform_id)
        {
            return Some(platform_id.to_string());
        }
    }

    let name = non_empty_name(&input.platform_name);
    let url = non_empty_name(&input.custom_platform_url)
        .or_else(|| non_empty_name(&input.platform_url))
        .unwrap_or("");
    if let Some(name) = name {
        if let Some(platform) = state
            .store
            .platforms
            .iter()
            .find(|platform| platform.name == name)
        {
            return Some(platform.id.clone());
        }
        if !url.is_empty() {
            let id = format!("platform-{}", slugify(name));
            state.store.platforms.push(Platform {
                id: id.clone(),
                name: name.to_string(),
                url: url.to_string(),
                logo_path: String::new(),
                is_builtin: false,
                created_at: now_label(),
            });
            return Some(id);
        }
    }

    existing.and_then(|profile| profile.platform_id.clone())
}

fn resolve_platform_url(
    state: &InnerState,
    platform_id: &Option<String>,
    input: &ProfileInput,
) -> String {
    if let Some(platform_id) = platform_id {
        if let Some(platform) = state
            .store
            .platforms
            .iter()
            .find(|platform| &platform.id == platform_id)
        {
            return platform.url.clone();
        }
    }
    let custom = input.custom_platform_url.trim();
    if !custom.is_empty() {
        return custom.to_string();
    }
    let legacy = input.platform_url.trim();
    if !legacy.is_empty() {
        return legacy.to_string();
    }
    String::new()
}

fn non_empty_name(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn proxy_location_hint(url: &str) -> String {
    let lower = url.to_ascii_lowercase();
    if lower.contains(".us") || lower.contains("usa") || lower.contains("unitedstates") {
        "美国".into()
    } else if lower.contains(".jp") || lower.contains("japan") {
        "日本".into()
    } else if lower.contains(".sg") || lower.contains("singapore") {
        "新加坡".into()
    } else if lower.contains(".hk") || lower.contains("hongkong") {
        "中国香港".into()
    } else {
        "未知".into()
    }
}

fn duplicate_profile_record(state: &mut InnerState, profile_id: &str) -> Result<Profile, String> {
    let source = state
        .store
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
        .ok_or_else(|| "Profile 不存在".to_string())?;
    let id = Uuid::new_v4().to_string();
    let name = unique_profile_name(&source.name, &state.store.profiles);

    Ok(Profile {
        id: id.clone(),
        profile_number: allocate_profile_number(state),
        name: name.clone(),
        tag: source.tag,
        group_id: source.group_id,
        group: source.group,
        proxy_id: source.proxy_id,
        platform_id: source.platform_id,
        account: source.account,
        login_username: source.login_username,
        login_password: source.login_password,
        two_fa_secret: source.two_fa_secret,
        note: source.note,
        platform_url: source.platform_url,
        proxy: source.proxy,
        cookie: source.cookie,
        cookie_json: source.cookie_json,
        locale: source.locale,
        timezone: source.timezone,
        user_agent: source.user_agent,
        window_width: source.window_width,
        window_height: source.window_height,
        webrtc_mode: source.webrtc_mode,
        block_images: source.block_images,
        mute_audio: source.mute_audio,
        block_autoplay: source.block_autoplay,
        hardware_acceleration: source.hardware_acceleration,
        ignore_https_errors: source.ignore_https_errors,
        launch_args: source.launch_args,
        disable_webgl: source.disable_webgl,
        disable_canvas: source.disable_canvas,
        disable_fonts: source.disable_fonts,
        disable_plugins: source.disable_plugins,
        screen_width: source.screen_width,
        screen_height: source.screen_height,
        device_pixel_ratio: source.device_pixel_ratio,
        last: "未启动".into(),
        status: "stopped".into(),
        user_data_dir: profile_user_data_dir(state, &name, &id),
        last_error: String::new(),
        start_url: source.start_url,
    })
}

fn delete_profile_record(state: &mut InnerState, profile_id: &str) -> Result<bool, String> {
    let Some(profile) = state
        .store
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .cloned()
    else {
        return Ok(false);
    };

    stop_browser_profile(state, profile_id)?;
    let _ = fs::remove_dir_all(&profile.user_data_dir);
    state.store.profiles.retain(|item| item.id != profile_id);
    state.log("info", format!("已删除 Profile {}", profile.name));
    Ok(true)
}

fn delete_profiles_record(state: &mut InnerState, profile_ids: &[String]) -> Result<usize, String> {
    let mut deleted = 0usize;
    for profile_id in profile_ids {
        if delete_profile_record(state, profile_id)? {
            deleted += 1;
        }
    }
    Ok(deleted)
}

#[tauri::command]
pub fn app_snapshot(state: State<AppState>) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn set_theme(state: State<AppState>, theme: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.store.settings.theme = theme;
    guard.log("info", "已切换主题");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn update_settings(state: State<AppState>, settings: Settings) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.store.settings = settings.clone();
    guard.browser_path = settings.browser_executable_path.clone();
    guard.last_error.clear();
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn set_browser_executable_path(
    state: State<AppState>,
    path: String,
) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.store.settings.browser_executable_path = path.clone();
    guard.browser_path = path;
    guard.last_error.clear();
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn save_profile(state: State<AppState>, input: ProfileInput) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let profile = build_profile(input, &mut guard);
    guard.upsert_profile(profile);
    guard.log("info", "已保存 Profile");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn duplicate_profile(
    state: State<AppState>,
    profile_id: String,
) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let profile = duplicate_profile_record(&mut guard, &profile_id)?;
    let name = profile.name.clone();
    guard.upsert_profile(profile);
    guard.log("info", format!("已复制 Profile {name}"));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_profile(state: State<AppState>, profile_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let _ = delete_profile_record(&mut guard, &profile_id)?;
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_profiles(
    state: State<AppState>,
    profile_ids: Vec<String>,
) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let deleted = delete_profiles_record(&mut guard, &profile_ids)?;
    guard.log("info", format!("已批量删除 {deleted} 个 Profile"));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn save_group(state: State<AppState>, input: GroupInput) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let name = input.name.trim();
    if name.is_empty() {
        return Err("分组名称不能为空".into());
    }
    let id = input
        .id
        .unwrap_or_else(|| format!("group-{}", slugify(name)));
    let group = Group {
        id,
        name: name.into(),
        color: if input.color.trim().is_empty() {
            "#3b82f6".into()
        } else {
            input.color.trim().into()
        },
        created_at: now_label(),
    };
    guard.upsert_group(group);
    guard.log("info", "已保存分组");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_group(state: State<AppState>, group_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    if group_id == "default" {
        return Err("默认分组不可删除".into());
    }
    let exists = guard.store.groups.iter().any(|group| group.id == group_id);
    if !exists {
        return Err("分组不存在".into());
    }
    for profile in &mut guard.store.profiles {
        if profile.group_id.as_deref() == Some(&group_id) {
            profile.group_id = Some("default".into());
            profile.group = "默认".into();
        }
    }
    guard.store.groups.retain(|group| group.id != group_id);
    guard.log("info", "已删除分组");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn save_proxy(state: State<AppState>, input: ProxyInput) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let url = input.url.trim();
    if url.is_empty() {
        return Err("代理地址不能为空".into());
    }
    let id = input
        .id
        .unwrap_or_else(|| format!("proxy-{}", slugify(url)));
    guard.upsert_proxy(Proxy {
        id,
        name: if input.name.trim().is_empty() {
            url.into()
        } else {
            input.name.trim().into()
        },
        url: url.into(),
        username: input.username.trim().into(),
        password: input.password.trim().into(),
        location: "未知".into(),
        last_check: String::new(),
        status: "active".into(),
    });
    guard.log("info", "已保存代理");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_proxy(state: State<AppState>, proxy_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.store.proxies.retain(|proxy| proxy.id != proxy_id);
    for profile in &mut guard.store.profiles {
        if profile.proxy_id.as_deref() == Some(&proxy_id) {
            profile.proxy_id = None;
            profile.proxy.clear();
        }
    }
    guard.log("info", "已删除代理");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn import_proxies(state: State<AppState>, text: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let mut count = 0usize;
    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
        if guard.store.proxies.iter().any(|proxy| proxy.url == line) {
            continue;
        }
        guard.upsert_proxy(Proxy {
            id: format!("proxy-{}", slugify(line)),
            name: line.into(),
            url: line.into(),
            username: String::new(),
            password: String::new(),
            location: "未知".into(),
            last_check: String::new(),
            status: "active".into(),
        });
        count += 1;
    }
    guard.log("info", format!("已批量导入 {count} 个代理"));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn test_proxy(state: State<AppState>, proxy_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let proxy_name = {
        let proxy = guard
            .store
            .proxies
            .iter_mut()
            .find(|proxy| proxy.id == proxy_id)
            .ok_or_else(|| "代理不存在".to_string())?;
        proxy.last_check = now_label();
        proxy.status = if proxy.url.trim().is_empty() {
            "error".into()
        } else {
            "active".into()
        };
        proxy.location = proxy_location_hint(&proxy.url);
        proxy.name.clone()
    };
    guard.log("info", format!("代理 {proxy_name} 检测完成"));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn save_platform(state: State<AppState>, input: PlatformInput) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let name = input.name.trim();
    let url = input.url.trim();
    if name.is_empty() || url.is_empty() {
        return Err("平台名称和 URL 不能为空".into());
    }
    let id = input
        .id
        .unwrap_or_else(|| format!("platform-{}", slugify(name)));
    if let Some(existing) = guard
        .store
        .platforms
        .iter_mut()
        .find(|platform| platform.id == id)
    {
        if existing.is_builtin {
            return Err("内置平台不可编辑".into());
        }
        existing.name = name.into();
        existing.url = url.into();
        existing.logo_path = input.logo_path.trim().into();
    } else {
        guard.store.platforms.push(Platform {
            id,
            name: name.into(),
            url: url.into(),
            logo_path: input.logo_path.trim().into(),
            is_builtin: false,
            created_at: now_label(),
        });
    }
    guard.log("info", "已保存平台");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_platform(state: State<AppState>, platform_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard
        .store
        .platforms
        .retain(|platform| platform.id != platform_id);
    for profile in &mut guard.store.profiles {
        if profile.platform_id.as_deref() == Some(&platform_id) {
            profile.platform_id = None;
        }
    }
    guard.log("info", "已删除平台");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn start_profile(state: State<AppState>, profile_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let _ = start_browser_profile(&mut guard, &profile_id)?;
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn stop_profile(state: State<AppState>, profile_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    stop_browser_profile(&mut guard, &profile_id)?;
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn clear_profile_cache(
    state: State<AppState>,
    profile_id: String,
) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let profile = guard
        .store
        .profiles
        .iter()
        .find(|item| item.id == profile_id)
        .ok_or_else(|| "Profile 不存在".to_string())?;
    let user_data_dir = profile.user_data_dir.clone();
    let name = profile.name.clone();
    if !user_data_dir.trim().is_empty() {
        let base = std::path::Path::new(&user_data_dir);
        for dir_name in ["Cache", "Code Cache", "GPUCache", "DawnCache", "ShaderCache"] {
            let _ = fs::remove_dir_all(base.join(dir_name));
            let _ = fs::remove_dir_all(base.join("Default").join(dir_name));
        }
    }
    guard.log("info", format!("已清除 Profile 缓存: {name}"));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn save_task(state: State<AppState>, input: TaskInput) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let profile = guard
        .store
        .profiles
        .iter()
        .find(|item| item.id == input.profile_id)
        .cloned()
        .ok_or_else(|| "任务绑定的 Profile 不存在".to_string())?;
    let task = Task {
        id,
        name: input.name.trim().to_string(),
        profile_id: profile.id.clone(),
        profile: profile.name.clone(),
        adapter: input.adapter.trim().to_string(),
        site: input.site.trim().to_string(),
        start_url: input.start_url.trim().to_string(),
        script: input.script.trim().to_string(),
        progress: 0,
        last_run: "未运行".into(),
        errors: 0,
        status: "waiting".into(),
    };
    guard.upsert_task(task);
    guard.log("info", "已保存任务");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn delete_task(state: State<AppState>, task_id: String) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    guard.store.tasks.retain(|item| item.id != task_id);
    guard.log("info", "已删除任务");
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub async fn run_task(state: State<'_, AppState>, task_id: String) -> Result<AppSnapshot, String> {
    let (port, task, profile_name) = {
        let mut guard = lock_state(&state)?;
        let task = guard
            .store
            .tasks
            .iter()
            .find(|item| item.id == task_id)
            .cloned()
            .ok_or_else(|| "任务不存在".to_string())?;
        let profile = guard
            .store
            .profiles
            .iter()
            .find(|item| item.id == task.profile_id)
            .cloned()
            .ok_or_else(|| "任务绑定的 Profile 不存在".to_string())?;
        let session = start_browser_profile(&mut guard, &profile.id)?;
        let port = session
            .port
            .ok_or_else(|| "浏览器调试端口不可用".to_string())?;
        guard.log("info", format!("开始执行任务 {}", task.name));
        persist(&guard)?;
        (port, task, profile.name)
    };

    let script = if task.script.trim().is_empty() {
        crate::models::default_page_snapshot_script()
    } else {
        task.script.clone()
    };
    let value = run_page_script(port, &task.start_url, &script).await?;

    let mut guard = lock_state(&state)?;
    let now = now_label();
    let result_count = count_result_fields(&value);
    let run_id = Uuid::new_v4().to_string();
    let run = TaskRun {
        id: run_id.clone(),
        task_id: task.id.clone(),
        profile_id: task.profile_id.clone(),
        status: "done".into(),
        started_at: now.clone(),
        finished_at: now.clone(),
        error: String::new(),
        result_count,
    };
    guard.append_task_run(run);
    guard.upsert_task(Task {
        progress: 100,
        last_run: short_time(),
        errors: 0,
        status: "done".into(),
        ..task.clone()
    });
    let result = ResultItem {
        id: Uuid::new_v4().to_string(),
        title: task.name.clone(),
        site: task.site.clone(),
        task: task.name.clone(),
        profile: profile_name,
        fields: result_count,
        time: short_time(),
        status: "saved".into(),
        payload: value,
    };
    guard.append_result(result);
    guard.log("info", format!("任务 {} 已完成", task.name));
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

#[tauri::command]
pub fn export_results(state: State<AppState>, request: ExportRequest) -> Result<String, String> {
    let guard = lock_state(&state)?;
    let export_dir = PathBuf::from(&guard.export_root);
    fs::create_dir_all(&export_dir).map_err(|error| error.to_string())?;
    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let format = request.format.to_ascii_lowercase();
    match format.as_str() {
        "csv" => {
            let path = export_dir.join(format!("x-browser-results-{timestamp}.csv"));
            let mut writer = Writer::from_path(&path).map_err(|error| error.to_string())?;
            writer
                .write_record([
                    "title", "site", "task", "profile", "fields", "time", "status", "payload",
                ])
                .map_err(|error| error.to_string())?;
            for item in &guard.store.result_items {
                writer
                    .write_record([
                        item.title.as_str(),
                        item.site.as_str(),
                        item.task.as_str(),
                        item.profile.as_str(),
                        &item.fields.to_string(),
                        item.time.as_str(),
                        item.status.as_str(),
                        &item.payload.to_string(),
                    ])
                    .map_err(|error| error.to_string())?;
            }
            writer.flush().map_err(|error| error.to_string())?;
            Ok(path.to_string_lossy().into_owned())
        }
        _ => {
            let path = export_dir.join(format!("x-browser-results-{timestamp}.json"));
            fs::write(
                &path,
                serde_json::to_string_pretty(&guard.store.result_items)
                    .map_err(|error| error.to_string())?,
            )
            .map_err(|error| error.to_string())?;
            Ok(path.to_string_lossy().into_owned())
        }
    }
}

#[tauri::command]
pub fn refresh_runtime(state: State<AppState>) -> Result<AppSnapshot, String> {
    let mut guard = lock_state(&state)?;
    persist(&guard)?;
    Ok(snapshot(&mut guard))
}

pub fn poll_browser_sessions(app: &tauri::AppHandle) {
    let snapshot = {
        let state = app.state::<AppState>();
        let mut guard = state.inner.lock().unwrap_or_else(|e| e.into_inner());
        if !refresh_sessions(&mut guard) {
            return;
        }
        let _ = guard.save();
        guard.snapshot()
    };
    let _ = app.emit("browser-sessions-updated", snapshot);
}

fn count_result_fields(value: &Value) -> usize {
    match value {
        Value::Object(map) => map.len(),
        Value::Array(items) => items.len(),
        Value::Null => 0,
        _ => 1,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AppStore;
    use std::{collections::HashMap, process::Child};
    use tempfile::tempdir;

    fn test_profile(id: &str, name: &str, user_data_dir: String) -> Profile {
        Profile {
            id: id.into(),
            profile_number: 1,
            name: name.into(),
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
            cookie: "无 Cookie".into(),
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
            last: "未启动".into(),
            status: "stopped".into(),
            start_url: "about:blank".into(),
            user_data_dir,
            last_error: String::new(),
        }
    }

    #[test]
    fn duplicate_profile_copies_config_with_new_identity_and_clean_runtime() {
        let temp = tempdir().expect("tempdir");
        let data_dir = temp.path().join("data");
        let profile_root = data_dir.join("profiles");
        let export_root = data_dir.join("exports");
        let mut state = InnerState {
            store_path: data_dir.join("store.json"),
            data_dir,
            profile_root: profile_root.clone(),
            export_root,
            store: AppStore::new(
                profile_root.to_string_lossy().into_owned(),
                String::new(),
            ),
            browser_processes: HashMap::<String, Child>::new(),
            proxy_processes: HashMap::<String, tokio::process::Child>::new(),
            browser_path: String::new(),
            last_error: String::new(),
        };

        let mut source = test_profile(
            "source-profile",
            "Research",
            profile_root
                .join("research-source")
                .to_string_lossy()
                .into_owned(),
        );
        source.tag = "team-a".into();
        source.group = "Ads".into();
        source.account = "account@example.com".into();
        source.login_username = "login".into();
        source.login_password = "secret".into();
        source.two_fa_secret = "2fa".into();
        source.note = "TikTok".into();
        source.platform_url = "https://example.com".into();
        source.proxy = "socks5://user:pass@127.0.0.1:1080".into();
        source.cookie = "已导入".into();
        source.cookie_json = r#"{"cookies":[]}"#.into();
        source.locale = "en-US".into();
        source.timezone = "America/Los_Angeles".into();
        source.user_agent = "UA".into();
        source.window_width = 1440;
        source.window_height = 900;
        source.webrtc_mode = "privacy".into();
        source.block_images = true;
        source.mute_audio = true;
        source.block_autoplay = true;
        source.hardware_acceleration = false;
        source.ignore_https_errors = true;
        source.launch_args = "--disable-features=Demo".into();
        source.last = "just now".into();
        source.status = "running".into();
        source.start_url = "https://example.com/start".into();
        source.last_error = "old error".into();
        state.store.profiles.push(source);

        let copy =
            duplicate_profile_record(&mut state, "source-profile").expect("duplicate profile");

        assert_ne!(copy.id, "source-profile");
        assert_eq!(copy.name, "Research Copy");
        assert_eq!(copy.proxy, "socks5://user:pass@127.0.0.1:1080");
        assert_eq!(copy.cookie_json, r#"{"cookies":[]}"#);
        assert_eq!(copy.status, "stopped");
        assert_eq!(copy.last, "未启动");
        assert!(copy.last_error.is_empty());
        assert_ne!(
            copy.user_data_dir,
            profile_root.join("research-source").to_string_lossy()
        );
        assert!(copy.user_data_dir.contains(&copy.id[..8]));
    }

    #[test]
    fn delete_profiles_removes_multiple_entries_and_directories() {
        let temp = tempdir().expect("tempdir");
        let data_dir = temp.path().join("data");
        let profile_root = data_dir.join("profiles");
        let export_root = data_dir.join("exports");
        let mut state = InnerState {
            store_path: data_dir.join("store.json"),
            data_dir,
            profile_root: profile_root.clone(),
            export_root,
            store: AppStore::new(
                profile_root.to_string_lossy().into_owned(),
                String::new(),
            ),
            browser_processes: HashMap::<String, Child>::new(),
            proxy_processes: HashMap::<String, tokio::process::Child>::new(),
            browser_path: String::new(),
            last_error: String::new(),
        };

        let profile_a_dir = profile_root.join("alpha");
        let profile_b_dir = profile_root.join("beta");
        std::fs::create_dir_all(&profile_a_dir).expect("profile a dir");
        std::fs::create_dir_all(&profile_b_dir).expect("profile b dir");
        state.store.profiles.push(test_profile(
            "profile-a",
            "Alpha",
            profile_a_dir.to_string_lossy().into_owned(),
        ));
        state.store.profiles.push(Profile {
            id: "profile-b".into(),
            name: "Beta".into(),
            profile_number: 2,
            user_data_dir: profile_b_dir.to_string_lossy().into_owned(),
            ..state.store.profiles[0].clone()
        });

        let deleted = delete_profiles_record(&mut state, &["profile-a".into(), "profile-b".into()])
            .expect("bulk delete");

        assert_eq!(deleted, 2);
        assert!(state.store.profiles.is_empty());
        assert!(!profile_a_dir.exists());
        assert!(!profile_b_dir.exists());
    }
}
