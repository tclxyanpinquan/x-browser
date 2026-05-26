use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    #[serde(default)]
    pub profile_number: u64,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tag: String,
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub group: String,
    #[serde(default)]
    pub proxy_id: Option<String>,
    #[serde(default)]
    pub platform_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub account: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub login_username: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub login_password: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub two_fa_secret: String,
    #[serde(default)]
    pub note: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub platform_url: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub proxy: String,
    #[serde(default)]
    pub plugins: usize,
    #[serde(default)]
    pub cookie: String,
    #[serde(default)]
    pub cookie_json: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default = "default_timezone")]
    pub timezone: String,
    #[serde(default)]
    pub user_agent: String,
    #[serde(default = "default_window_width")]
    pub window_width: u32,
    #[serde(default = "default_window_height")]
    pub window_height: u32,
    #[serde(default)]
    pub webrtc_mode: String,
    #[serde(default)]
    pub block_images: bool,
    #[serde(default)]
    pub mute_audio: bool,
    #[serde(default)]
    pub block_autoplay: bool,
    #[serde(default = "default_true")]
    pub hardware_acceleration: bool,
    #[serde(default)]
    pub ignore_https_errors: bool,
    #[serde(default)]
    pub launch_args: String,
    #[serde(default)]
    pub disable_webgl: bool,
    #[serde(default)]
    pub disable_canvas: bool,
    #[serde(default)]
    pub disable_fonts: bool,
    #[serde(default)]
    pub disable_plugins: bool,
    #[serde(default)]
    pub screen_width: u32,
    #[serde(default)]
    pub screen_height: u32,
    #[serde(default)]
    pub device_pixel_ratio: f64,
    #[serde(default)]
    pub last: String,
    #[serde(default)]
    pub status: String,
    #[serde(default)]
    pub extension_ids: Vec<String>,
    #[serde(default)]
    pub start_url: String,
    #[serde(default)]
    pub user_data_dir: String,
    #[serde(default)]
    pub last_error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: Option<String>,
    pub name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub tag: String,
    #[serde(default)]
    pub group_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub group: String,
    #[serde(default)]
    pub group_name: String,
    #[serde(default)]
    pub proxy_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub proxy: String,
    #[serde(default)]
    pub proxy_url: String,
    #[serde(default)]
    pub proxy_name: String,
    #[serde(default)]
    pub platform_id: Option<String>,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub account: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub login_username: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub login_password: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub two_fa_secret: String,
    #[serde(default)]
    pub platform_name: String,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub platform_url: String,
    #[serde(default)]
    pub custom_platform_url: String,
    #[serde(default)]
    pub note: String,
    #[serde(default)]
    pub cookie_json: String,
    #[serde(default = "default_locale")]
    pub locale: String,
    #[serde(default = "default_timezone")]
    pub timezone: String,
    #[serde(default)]
    pub user_agent: String,
    #[serde(default = "default_window_width")]
    pub window_width: u32,
    #[serde(default = "default_window_height")]
    pub window_height: u32,
    #[serde(default)]
    pub webrtc_mode: String,
    #[serde(default)]
    pub block_images: bool,
    #[serde(default)]
    pub mute_audio: bool,
    #[serde(default)]
    pub block_autoplay: bool,
    #[serde(default = "default_true")]
    pub hardware_acceleration: bool,
    #[serde(default)]
    pub ignore_https_errors: bool,
    #[serde(default)]
    pub launch_args: String,
    #[serde(default)]
    pub cookie: String,
    #[serde(default)]
    pub disable_webgl: bool,
    #[serde(default)]
    pub disable_canvas: bool,
    #[serde(default)]
    pub disable_fonts: bool,
    #[serde(default)]
    pub disable_plugins: bool,
    #[serde(default)]
    pub screen_width: u32,
    #[serde(default)]
    pub screen_height: u32,
    #[serde(default)]
    pub device_pixel_ratio: f64,
    #[serde(default)]
    pub extension_ids: Vec<String>,
    pub start_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupInput {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Proxy {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub location: String,
    #[serde(default)]
    pub last_check: String,
    #[serde(default)]
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyInput {
    pub id: Option<String>,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Platform {
    pub id: String,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub logo_path: String,
    pub is_builtin: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformInput {
    pub id: Option<String>,
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub logo_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSession {
    pub id: String,
    pub profile_id: String,
    pub profile: String,
    pub site: String,
    pub runtime: String,
    pub memory: String,
    pub cpu: String,
    pub url: String,
    pub status: String,
    pub pid: Option<u32>,
    pub port: Option<u16>,
    pub started_at: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub name: String,
    pub profile_id: String,
    pub profile: String,
    pub adapter: String,
    pub site: String,
    pub start_url: String,
    pub script: String,
    pub progress: u8,
    pub last_run: String,
    pub errors: u32,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub id: Option<String>,
    pub name: String,
    pub profile_id: String,
    pub adapter: String,
    pub site: String,
    pub start_url: String,
    pub script: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskRun {
    pub id: String,
    pub task_id: String,
    pub profile_id: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: String,
    pub error: String,
    pub result_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResultItem {
    pub id: String,
    pub title: String,
    pub site: String,
    pub task: String,
    pub profile: String,
    pub fields: usize,
    pub time: String,
    pub status: String,
    pub payload: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionItem {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub source_path: String,
    pub install_path: String,
    pub manifest_version: String,
    pub status: String,
    pub enabled: bool,
    pub message: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteAdapter {
    pub id: String,
    pub name: String,
    pub site: String,
    pub description: String,
    pub mode: String,
    pub script: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    pub browser_executable_path: String,
    pub browser_mode: String,
    pub max_concurrent_windows: u8,
    pub profile_storage_path: String,
    pub plugin_storage_path: String,
    pub result_export_path: String,
    pub log_level: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub time: String,
    pub level: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub backend_ready: bool,
    pub browser_ready: bool,
    pub browser_path: String,
    pub service_url: String,
    pub data_dir: String,
    pub error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStore {
    #[serde(default)]
    pub groups: Vec<Group>,
    #[serde(default)]
    pub proxies: Vec<Proxy>,
    #[serde(default)]
    pub platforms: Vec<Platform>,
    #[serde(default)]
    pub profiles: Vec<Profile>,
    #[serde(default)]
    pub next_profile_number: u64,
    #[serde(default)]
    pub browser_sessions: Vec<BrowserSession>,
    #[serde(default)]
    pub tasks: Vec<Task>,
    #[serde(default)]
    pub task_runs: Vec<TaskRun>,
    #[serde(default)]
    pub result_items: Vec<ResultItem>,
    #[serde(default)]
    pub extensions: Vec<ExtensionItem>,
    #[serde(default)]
    pub site_adapters: Vec<SiteAdapter>,
    #[serde(default)]
    pub settings: Settings,
    #[serde(default)]
    pub logs: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub groups: Vec<Group>,
    pub proxies: Vec<Proxy>,
    pub platforms: Vec<Platform>,
    pub profiles: Vec<Profile>,
    pub browser_sessions: Vec<BrowserSession>,
    pub tasks: Vec<Task>,
    pub task_runs: Vec<TaskRun>,
    pub result_items: Vec<ResultItem>,
    pub extensions: Vec<ExtensionItem>,
    pub site_adapters: Vec<SiteAdapter>,
    pub settings: Settings,
    pub runtime_status: RuntimeStatus,
    pub logs: Vec<LogEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub format: String,
}

pub fn default_true() -> bool {
    true
}

pub fn default_locale() -> String {
    "zh-CN".into()
}

pub fn default_timezone() -> String {
    "Asia/Shanghai".into()
}

pub fn default_window_width() -> u32 {
    1280
}

pub fn default_window_height() -> u32 {
    720
}

impl AppStore {
    pub fn new(profile_root: String, extension_root: String, export_root: String) -> Self {
        Self {
            groups: vec![Group {
                id: "default".into(),
                name: "默认".into(),
                color: "#3b82f6".into(),
                created_at: "system".into(),
            }],
            proxies: Vec::new(),
            platforms: builtin_platforms(),
            profiles: Vec::new(),
            next_profile_number: 1,
            browser_sessions: Vec::new(),
            tasks: Vec::new(),
            task_runs: Vec::new(),
            result_items: Vec::new(),
            extensions: Vec::new(),
            site_adapters: vec![SiteAdapter {
                id: "generic.page_snapshot".into(),
                name: "Generic Page Snapshot".into(),
                site: "Any Website".into(),
                description: "打开目标 URL，提取 title、URL、meta 描述和页面链接。".into(),
                mode: "browser-js".into(),
                enabled: true,
                script: default_page_snapshot_script(),
            }],
            settings: Settings {
                theme: "light".into(),
                browser_executable_path: String::new(),
                browser_mode: "visible".into(),
                max_concurrent_windows: 5,
                profile_storage_path: profile_root,
                plugin_storage_path: extension_root,
                result_export_path: export_root,
                log_level: "info".into(),
            },
            logs: Vec::new(),
        }
    }
}

pub fn builtin_logo_path_pub(id: &str) -> String {
    builtin_logo_path(id)
}

pub fn builtin_platforms() -> Vec<Platform> {
    vec![
        builtin_platform("facebook", "Facebook", "https://www.facebook.com"),
        builtin_platform("tiktok", "TikTok", "https://www.tiktok.com"),
        builtin_platform("instagram", "Instagram", "https://www.instagram.com"),
        builtin_platform("x-twitter", "X / Twitter", "https://x.com"),
        builtin_platform("whatsapp-web", "WhatsApp Web", "https://web.whatsapp.com"),
        builtin_platform("line", "LINE", "https://line.me"),
        builtin_platform("linkedin", "LinkedIn", "https://www.linkedin.com"),
        builtin_platform("linkedin-cn", "LinkedIn CN", "https://www.linkedin.cn"),
        builtin_platform("tinder", "Tinder", "https://tinder.com"),
        builtin_platform("youtube", "YouTube", "https://www.youtube.com"),
        builtin_platform("amazon", "Amazon", "https://www.amazon.com"),
        builtin_platform("paypal", "PayPal", "https://www.paypal.com"),
        builtin_platform("google-accounts", "Google Accounts", "https://accounts.google.com"),
        builtin_platform("aliexpress", "AliExpress", "https://www.aliexpress.com"),
        builtin_platform("alibaba", "Alibaba", "https://www.alibaba.com"),
        builtin_platform("vinted", "Vinted", "https://www.vinted.com"),
        builtin_platform("ebay", "eBay", "https://www.ebay.com"),
        builtin_platform("lazada", "Lazada", "https://www.lazada.com"),
        builtin_platform("mail-com", "Mail.com", "https://www.mail.com"),
        builtin_platform("outlook", "Outlook", "https://outlook.com"),
        builtin_platform("payoneer", "Payoneer", "https://www.payoneer.com"),
        builtin_platform("shopify", "Shopify", "https://www.shopify.com"),
        builtin_platform("shopline", "Shopline", "https://shoplineapp.com"),
        builtin_platform("stripe", "Stripe", "https://stripe.com"),
        builtin_platform("walmart", "Walmart", "https://www.walmart.com"),
        builtin_platform("wish", "Wish", "https://www.wish.com"),
        builtin_platform("shopee", "Shopee", "https://shopee.com"),
        builtin_platform("etsy", "Etsy", "https://www.etsy.com"),
        builtin_platform("dhgate", "DHgate", "https://www.dhgate.com"),
    ]
}

fn builtin_logo_path(id: &str) -> String {
    let filename = match id {
        "x-twitter" => "twitter",
        "whatsapp-web" => "whatsapp",
        "google-accounts" => "google",
        "mail-com" => "mail",
        "linkedin-cn" => "linkedin",
        _ => id,
    };
    format!("/logos/{}.svg", filename)
}

fn builtin_platform(id: &str, name: &str, url: &str) -> Platform {
    Platform {
        id: id.into(),
        name: name.into(),
        url: url.into(),
        logo_path: builtin_logo_path(id),
        is_builtin: true,
        created_at: "system".into(),
    }
}

pub fn default_page_snapshot_script() -> String {
    r#"() => {
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
    textSample: (document.body?.innerText || "").replace(/\s+/g, " ").slice(0, 1200),
  };
}"#
    .into()
}
