mod browser;
mod cdp;
mod commands;
mod extensions;
mod models;
mod store;

use crate::store::{init_state, AppState};
use std::time::Duration;
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_snapshot,
            commands::set_theme,
            commands::update_settings,
            commands::set_browser_executable_path,
            commands::save_profile,
            commands::duplicate_profile,
            commands::delete_profile,
            commands::delete_profiles,
            commands::save_group,
            commands::delete_group,
            commands::save_proxy,
            commands::delete_proxy,
            commands::import_proxies,
            commands::test_proxy,
            commands::save_platform,
            commands::delete_platform,
            commands::start_profile,
            commands::stop_profile,
            commands::import_extension_from_directory,
            commands::import_extension_from_crx,
            commands::set_extension_enabled,
            commands::delete_extension_item,
            commands::reimport_extension_item,
            commands::save_task,
            commands::delete_task,
            commands::run_task,
            commands::export_results,
            commands::refresh_runtime,
        ])
        .setup(|app| {
            let state = init_state(&app.handle())
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(state);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(Duration::from_secs(2));
                loop {
                    interval.tick().await;
                    crate::commands::poll_browser_sessions(&app_handle);
                }
            });
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let app_handle = window.app_handle();
                let state = app_handle.state::<AppState>();
                if let Ok(mut guard) = state.inner.lock() {
                    for (_, mut child) in guard.browser_processes.drain() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                    for (_, mut child) in guard.proxy_processes.drain() {
                        let _ = child.start_kill();
                    }
                    let _ = guard.save();
                }
                app_handle.exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running x-browser");
}
