use crate::{
    browser::{copy_dir_recursive, validate_extension_manifest},
    models::ExtensionItem,
    store::{ensure_dir, now_label, slugify, InnerState},
};
use std::{
    fs,
    io::Cursor,
    path::{Path, PathBuf},
};
use uuid::Uuid;
use zip::ZipArchive;

pub fn import_extension_directory(
    state: &mut InnerState,
    source: &str,
) -> Result<ExtensionItem, String> {
    let source_path = PathBuf::from(source);
    if !source_path.exists() {
        return Err("插件目录不存在".into());
    }
    let (name, manifest_version) = validate_extension_manifest(&source_path)?;
    let id = Uuid::new_v4().to_string();
    let install_path = state
        .extension_root
        .join(format!("{}-{}", slugify(&name), &id[..8]));
    copy_dir_recursive(&source_path, &install_path)?;
    let item = ExtensionItem {
        id: id.clone(),
        name,
        kind: "unpacked".into(),
        source_path: source_path.to_string_lossy().into_owned(),
        install_path: install_path.to_string_lossy().into_owned(),
        manifest_version,
        status: "ready".into(),
        enabled: true,
        message: String::new(),
        created_at: now_label(),
    };
    state.upsert_extension(item.clone());
    state.log("info", format!("已导入插件目录 {}", item.name));
    Ok(item)
}

pub fn import_extension_crx(state: &mut InnerState, source: &str) -> Result<ExtensionItem, String> {
    let source_path = PathBuf::from(source);
    if !source_path.exists() {
        return Err("CRX 文件不存在".into());
    }
    let bytes = fs::read(&source_path).map_err(|error| error.to_string())?;
    let archive_bytes = extract_crx_zip(&bytes)?;
    let target_root = state.extension_root.join(slugify(
        file_stem(&source_path).as_deref().unwrap_or("extension"),
    ));
    ensure_dir(&target_root)?;
    let cursor = Cursor::new(archive_bytes);
    let mut archive = ZipArchive::new(cursor).map_err(|error| error.to_string())?;
    archive
        .extract(&target_root)
        .map_err(|error| error.to_string())?;
    let (name, manifest_version) = validate_extension_manifest(&target_root)?;
    let id = Uuid::new_v4().to_string();
    let install_path = state
        .extension_root
        .join(format!("{}-{}", slugify(&name), &id[..8]));
    if install_path.exists() {
        fs::remove_dir_all(&install_path).map_err(|error| error.to_string())?;
    }
    fs::rename(&target_root, &install_path).map_err(|error| error.to_string())?;
    let item = ExtensionItem {
        id: id.clone(),
        name,
        kind: "crx".into(),
        source_path: source_path.to_string_lossy().into_owned(),
        install_path: install_path.to_string_lossy().into_owned(),
        manifest_version,
        status: "ready".into(),
        enabled: true,
        message: String::new(),
        created_at: now_label(),
    };
    state.upsert_extension(item.clone());
    state.log("info", format!("已导入 CRX 插件 {}", item.name));
    Ok(item)
}

pub fn reimport_extension(state: &mut InnerState, id: &str) -> Result<ExtensionItem, String> {
    let item = state
        .store
        .extensions
        .iter()
        .find(|item| item.id == id)
        .cloned()
        .ok_or_else(|| "插件不存在".to_string())?;

    let running_profiles: Vec<String> = state
        .store
        .profiles
        .iter()
        .filter(|profile| {
            let uses_extension = profile
                .extension_ids
                .iter()
                .any(|extension_id| extension_id == id);
            let has_running_session = state
                .store
                .browser_sessions
                .iter()
                .any(|session| session.profile_id == profile.id && session.status == "running");
            uses_extension
                && (profile.status == "running"
                    || has_running_session
                    || state.browser_processes.contains_key(&profile.id))
        })
        .map(|profile| profile.name.clone())
        .collect();
    if !running_profiles.is_empty() {
        return Err(format!(
            "插件正在被运行中的 Profile 使用，请先停止浏览器窗口：{}",
            running_profiles.join("、")
        ));
    }

    let source_path = PathBuf::from(&item.source_path);
    if !source_path.exists() {
        return Err("源文件不存在".into());
    }

    let install_path = PathBuf::from(&item.install_path);
    let short_id: String = item.id.chars().take(8).collect();
    let temp_path = state
        .extension_root
        .join(format!(".reimport-{}-{short_id}", slugify(&item.name)));
    let backup_path = state
        .extension_root
        .join(format!(".backup-{}-{short_id}", slugify(&item.name)));
    remove_path_if_exists(&temp_path)?;
    remove_path_if_exists(&backup_path)?;

    let imported = (|| -> Result<ExtensionItem, String> {
        let (name, manifest_version) = import_source_to_path(&item.kind, &source_path, &temp_path)?;
        if install_path.exists() {
            fs::rename(&install_path, &backup_path).map_err(|error| {
                let _ = remove_path_if_exists(&temp_path);
                format!("无法备份旧插件目录: {error}")
            })?;
        }
        if let Err(error) = fs::rename(&temp_path, &install_path) {
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, &install_path);
            }
            let _ = remove_path_if_exists(&temp_path);
            return Err(format!("无法替换插件目录: {error}"));
        }
        let _ = remove_path_if_exists(&backup_path);

        Ok(ExtensionItem {
            id: item.id.clone(),
            name,
            kind: item.kind.clone(),
            source_path: item.source_path.clone(),
            install_path: item.install_path.clone(),
            manifest_version,
            status: "ready".into(),
            enabled: item.enabled,
            message: String::new(),
            created_at: now_label(),
        })
    })();

    match imported {
        Ok(next) => {
            state.upsert_extension(next.clone());
            state.log("info", format!("已重新导入插件 {}", next.name));
            Ok(next)
        }
        Err(error) => {
            if backup_path.exists() && !install_path.exists() {
                let _ = fs::rename(&backup_path, &install_path);
            }
            let _ = remove_path_if_exists(&temp_path);
            let _ = remove_path_if_exists(&backup_path);
            Err(error)
        }
    }
}

pub fn toggle_extension(
    state: &mut InnerState,
    id: &str,
    enabled: bool,
) -> Result<ExtensionItem, String> {
    let message = {
        let item = state
            .store
            .extensions
            .iter_mut()
            .find(|item| item.id == id)
            .ok_or_else(|| "插件不存在".to_string())?;
        item.enabled = enabled;
        item.message.clear();
        format!(
            "插件 {} {}",
            item.name,
            if enabled { "已启用" } else { "已停用" }
        )
    };
    state.log("info", message);
    state
        .store
        .extensions
        .iter()
        .find(|item| item.id == id)
        .cloned()
        .ok_or_else(|| "插件不存在".to_string())
}

pub fn delete_extension(state: &mut InnerState, id: &str) -> Result<(), String> {
    let item = state
        .store
        .extensions
        .iter()
        .find(|item| item.id == id)
        .cloned()
        .ok_or_else(|| "插件不存在".to_string())?;
    if Path::new(&item.install_path).exists() {
        fs::remove_dir_all(&item.install_path).map_err(|error| error.to_string())?;
    }
    state.store.extensions.retain(|existing| existing.id != id);
    for profile in &mut state.store.profiles {
        profile
            .extension_ids
            .retain(|extension_id| extension_id != id);
        profile.plugins = profile.extension_ids.len();
    }
    state.log("info", format!("已删除插件 {}", item.name));
    Ok(())
}

fn import_source_to_path(
    kind: &str,
    source_path: &Path,
    target_path: &Path,
) -> Result<(String, String), String> {
    match kind {
        "unpacked" => {
            if !source_path.is_dir() {
                return Err("源文件不存在".into());
            }
            let (name, manifest_version) = validate_extension_manifest(source_path)?;
            copy_dir_recursive(source_path, target_path)?;
            Ok((name, manifest_version))
        }
        "crx" => {
            if !source_path.is_file() {
                return Err("源文件不存在".into());
            }
            let bytes = fs::read(source_path).map_err(|error| error.to_string())?;
            let archive_bytes = extract_crx_zip(&bytes)?;
            ensure_dir(target_path)?;
            let cursor = Cursor::new(archive_bytes);
            let mut archive = ZipArchive::new(cursor).map_err(|error| error.to_string())?;
            archive
                .extract(target_path)
                .map_err(|error| error.to_string())?;
            validate_extension_manifest(target_path)
        }
        other => Err(format!("不支持重新导入插件类型 {other}")),
    }
}

fn remove_path_if_exists(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|error| error.to_string())
    } else {
        fs::remove_file(path).map_err(|error| error.to_string())
    }
}

fn file_stem(path: &Path) -> Option<String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(String::from)
}

fn extract_crx_zip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    if bytes.len() < 12 || &bytes[0..4] != b"Cr24" {
        return Err("不是有效的 CRX 文件".into());
    }
    let version = u32::from_le_bytes(bytes[4..8].try_into().unwrap_or([0; 4]));
    let offset = match version {
        3 => {
            if bytes.len() < 12 {
                return Err("CRX 头部不完整".into());
            }
            let header_size =
                u32::from_le_bytes(bytes[8..12].try_into().unwrap_or([0; 4])) as usize;
            12 + header_size
        }
        2 => {
            let public_key_len =
                u32::from_le_bytes(bytes[8..12].try_into().unwrap_or([0; 4])) as usize;
            let signature_len =
                u32::from_le_bytes(bytes[12..16].try_into().unwrap_or([0; 4])) as usize;
            16 + public_key_len + signature_len
        }
        _ => return Err(format!("不支持的 CRX 版本 {version}")),
    };
    if offset >= bytes.len() {
        return Err("CRX 压缩体为空".into());
    }
    Ok(bytes[offset..].to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        models::{AppStore, ExtensionItem, Profile},
        store::InnerState,
    };
    use std::{collections::HashMap, fs, process::Child};
    use tempfile::tempdir;

    #[test]
    fn reimport_unpacked_keeps_id_and_rolls_back_on_failure() {
        let temp = tempdir().expect("tempdir");
        let data_dir = temp.path().join("data");
        let profile_root = data_dir.join("profiles");
        let extension_root = data_dir.join("extensions");
        let export_root = data_dir.join("exports");
        let source = temp.path().join("source");
        let install = extension_root.join("demo-ext");
        fs::create_dir_all(&source).expect("source dir");
        fs::create_dir_all(&install).expect("install dir");
        fs::create_dir_all(&profile_root).expect("profile root");
        fs::create_dir_all(&extension_root).expect("extension root");
        fs::create_dir_all(&export_root).expect("export root");
        write_manifest(&source, "Demo Extension", 3);
        write_manifest(&install, "Old Extension", 3);

        let mut state = test_state(
            data_dir,
            profile_root,
            extension_root,
            export_root,
            source.to_string_lossy().into_owned(),
            install.to_string_lossy().into_owned(),
        );

        let updated = reimport_extension(&mut state, "ext-1").expect("reimport succeeds");
        assert_eq!(updated.id, "ext-1");
        assert!(updated.enabled);
        assert_eq!(updated.name, "Demo Extension");
        assert_eq!(
            state.store.profiles[0].extension_ids,
            vec!["ext-1".to_string()]
        );
        let installed_manifest =
            fs::read_to_string(install.join("manifest.json")).expect("installed manifest");
        assert!(installed_manifest.contains("Demo Extension"));

        fs::write(source.join("manifest.json"), "{ broken json").expect("invalid manifest");
        let error = reimport_extension(&mut state, "ext-1").expect_err("reimport fails");
        assert!(error.contains("manifest.json"));
        let preserved_manifest =
            fs::read_to_string(install.join("manifest.json")).expect("preserved manifest");
        assert!(preserved_manifest.contains("Demo Extension"));
    }

    #[test]
    fn reimport_blocks_running_profiles_using_extension() {
        let temp = tempdir().expect("tempdir");
        let data_dir = temp.path().join("data");
        let profile_root = data_dir.join("profiles");
        let extension_root = data_dir.join("extensions");
        let export_root = data_dir.join("exports");
        let source = temp.path().join("source");
        let install = extension_root.join("demo-ext");
        fs::create_dir_all(&source).expect("source dir");
        fs::create_dir_all(&install).expect("install dir");
        fs::create_dir_all(&profile_root).expect("profile root");
        fs::create_dir_all(&extension_root).expect("extension root");
        fs::create_dir_all(&export_root).expect("export root");
        write_manifest(&source, "Demo Extension", 3);
        write_manifest(&install, "Old Extension", 3);

        let mut state = test_state(
            data_dir,
            profile_root,
            extension_root,
            export_root,
            source.to_string_lossy().into_owned(),
            install.to_string_lossy().into_owned(),
        );
        state.store.profiles[0].status = "running".into();

        let error =
            reimport_extension(&mut state, "ext-1").expect_err("running profile blocks reimport");
        assert!(error.contains("请先停止浏览器窗口"));
    }

    fn test_state(
        data_dir: PathBuf,
        profile_root: PathBuf,
        extension_root: PathBuf,
        export_root: PathBuf,
        source_path: String,
        install_path: String,
    ) -> InnerState {
        let mut store = AppStore::new(
            profile_root.to_string_lossy().into_owned(),
            extension_root.to_string_lossy().into_owned(),
            export_root.to_string_lossy().into_owned(),
        );
        store.extensions.push(ExtensionItem {
            id: "ext-1".into(),
            name: "Old Extension".into(),
            kind: "unpacked".into(),
            source_path,
            install_path,
            manifest_version: "3".into(),
            status: "ready".into(),
            enabled: true,
            message: String::new(),
            created_at: "old".into(),
        });
        store.profiles.push(Profile {
            id: "profile-1".into(),
            profile_number: 1,
            name: "Research".into(),
            tag: String::new(),
            group_id: Some("default".into()),
            group: String::new(),
            proxy_id: None,
            platform_id: None,
            account: String::new(),
            login_username: String::new(),
            login_password: String::new(),
            two_fa_secret: String::new(),
            note: String::new(),
            platform_url: String::new(),
            proxy: String::new(),
            plugins: 1,
            cookie: "Valid".into(),
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
            extension_ids: vec!["ext-1".into()],
            start_url: "about:blank".into(),
            user_data_dir: String::new(),
            last_error: String::new(),
        });
        InnerState {
            store_path: data_dir.join("store.json"),
            data_dir,
            profile_root,
            extension_root,
            export_root,
            store,
            browser_processes: HashMap::<String, Child>::new(),
            proxy_processes: HashMap::<String, tokio::process::Child>::new(),
            browser_path: String::new(),
            last_error: String::new(),
        }
    }

    fn write_manifest(path: &Path, name: &str, version: i64) {
        fs::write(
            path.join("manifest.json"),
            format!(
                r#"{{
  "manifest_version": {version},
  "name": "{name}",
  "version": "1.0.0"
}}"#
            ),
        )
        .expect("write manifest");
    }
}
