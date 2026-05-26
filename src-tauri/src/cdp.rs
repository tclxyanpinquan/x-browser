use crate::models::Profile;
use futures_util::{SinkExt, StreamExt};
use reqwest::blocking::Client;
use serde_json::{json, Value};
use std::time::Duration;
use tokio_tungstenite::{connect_async, tungstenite::Message};

pub async fn run_page_script(port: u16, url: &str, script: &str) -> Result<Value, String> {
    let websocket_url = create_target(port).await?;
    let (mut socket, _) = connect_async(websocket_url.as_str())
        .await
        .map_err(|error| format!("无法连接 Chromium 调试端口: {error}"))?;

    send(&mut socket, 1, "Page.enable", json!({})).await?;
    send(&mut socket, 2, "Runtime.enable", json!({})).await?;
    send(&mut socket, 3, "Page.navigate", json!({ "url": url })).await?;
    wait_for_load(&mut socket).await?;

    let expression = format!("Promise.resolve(({} )()).then(value => value)", script);
    let response = send(
        &mut socket,
        4,
        "Runtime.evaluate",
        json!({
            "expression": expression,
            "awaitPromise": true,
            "returnByValue": true,
            "userGesture": true
        }),
    )
    .await?;

    if let Some(exception) = response
        .get("result")
        .and_then(|value| value.get("exceptionDetails"))
    {
        return Err(format!("脚本执行失败: {exception}"));
    }

    let result = response
        .get("result")
        .and_then(|value| value.get("result"))
        .and_then(|value| value.get("value"))
        .cloned()
        .unwrap_or(Value::Null);
    let _ = socket.close(None).await;
    Ok(result)
}

pub async fn open_profile_target(
    port: u16,
    target_url: &str,
    cookie_json: &str,
    profile: &Profile,
) -> Result<(), String> {
    let websocket_url = create_target(port).await?;
    let (mut socket, _) = connect_async(websocket_url.as_str())
        .await
        .map_err(|error| format!("无法连接 Chromium 调试端口: {error}"))?;
    send(&mut socket, 1, "Network.enable", json!({})).await?;
    send(&mut socket, 2, "Page.enable", json!({})).await?;
    send(&mut socket, 3, "Runtime.enable", json!({})).await?;
    let script = apply_fingerprint_masking_script(profile);
    send(
        &mut socket,
        4,
        "Page.addScriptToEvaluateOnNewDocument",
        json!({ "source": script }),
    )
    .await?;
    if !cookie_json.trim().is_empty() {
        let cookies = normalize_cookie_payload(cookie_json, target_url)?;
        if !cookies.is_empty() {
            send(
                &mut socket,
                5,
                "Network.setCookies",
                json!({ "cookies": cookies }),
            )
            .await?;
        }
    }
    send(
        &mut socket,
        6,
        "Page.navigate",
        json!({ "url": target_url }),
    )
    .await?;
    if target_url != "about:blank" {
        wait_for_load(&mut socket).await?;
    }
    let _ = socket.close(None).await;
    Ok(())
}

pub fn apply_fingerprint_masking_script(profile: &Profile) -> String {
    let locale = if profile.locale.trim().is_empty() {
        "zh-CN"
    } else {
        profile.locale.trim()
    };
    let language_root = locale.split('-').next().unwrap_or(locale);
    let mut lines = vec![
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });".to_string(),
        format!(
            "Object.defineProperty(navigator, 'languages', {{ get: () => [{}] }});",
            if language_root == locale {
                format!("'{}'", js_escape(locale))
            } else {
                format!("'{}','{}'", js_escape(locale), js_escape(language_root))
            }
        ),
    ];
    if profile.disable_plugins {
        lines.push("Object.defineProperty(navigator, 'plugins', { get: () => [] });".into());
    }
    if profile.disable_canvas {
        lines.push(
            r#"(function() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, ...args) {
    const context = getContext.call(this, type, ...args);
    if (!context || type !== '2d') return context;
    const originalGetImageData = context.getImageData.bind(context);
    context.getImageData = function(...innerArgs) {
      const imageData = originalGetImageData(...innerArgs);
      for (let i = 0; i < imageData.data.length; i += 37) {
        imageData.data[i] = imageData.data[i] ^ 1;
      }
      return imageData;
    };
    const originalToDataURL = this.toDataURL?.bind(this);
    if (originalToDataURL) {
      this.toDataURL = function(...innerArgs) {
        return originalToDataURL(...innerArgs);
      };
    }
    return context;
  };
})();"#
                .into(),
        );
    }
    if profile.disable_webgl {
        lines.push(
            r#"(function() {
  const getParameter = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(parameter) {
    if (parameter === 37445) return 'Intel Inc.';
    if (parameter === 37446) return 'Intel Iris OpenGL Engine';
    return getParameter.call(this, parameter);
  };
})();"#
                .into(),
        );
    }
    if profile.screen_width > 0 || profile.screen_height > 0 || profile.device_pixel_ratio > 0.0 {
        let width = if profile.screen_width > 0 {
            profile.screen_width
        } else {
            profile.window_width
        };
        let height = if profile.screen_height > 0 {
            profile.screen_height
        } else {
            profile.window_height
        };
        let ratio = if profile.device_pixel_ratio > 0.0 {
            profile.device_pixel_ratio
        } else {
            1.0
        };
        lines.push(format!(
            "Object.defineProperty(window, 'outerWidth', {{ get: () => {width} }}); Object.defineProperty(window, 'outerHeight', {{ get: () => {height} }}); Object.defineProperty(window, 'devicePixelRatio', {{ get: () => {ratio} }});"
        ));
    }
    lines.join("\n")
}

fn js_escape(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "\\'")
}

async fn create_target(port: u16) -> Result<String, String> {
    let url = format!("http://127.0.0.1:{port}/json/new?about:blank");
    let text = tokio::task::spawn_blocking(move || {
        Client::builder()
            .timeout(Duration::from_secs(3))
            .build()
            .map_err(|error| error.to_string())?
            .put(url)
            .send()
            .map_err(|error| error.to_string())?
            .text()
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())??;
    let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
    value
        .get("webSocketDebuggerUrl")
        .and_then(|value| value.as_str())
        .map(String::from)
        .ok_or_else(|| "Chromium 没有返回 webSocketDebuggerUrl".into())
}

fn normalize_cookie_payload(raw: &str, default_url: &str) -> Result<Vec<Value>, String> {
    let value: Value =
        serde_json::from_str(raw).map_err(|error| format!("Cookie JSON 无法解析: {error}"))?;
    let source = if let Some(items) = value.as_array() {
        items.clone()
    } else if let Some(items) = value.get("cookies").and_then(|items| items.as_array()) {
        items.clone()
    } else {
        return Err("Cookie JSON 必须是数组，或包含 cookies 数组".into());
    };

    let mut cookies = Vec::new();
    for item in source {
        if !item.is_object() {
            continue;
        }
        let name = item
            .get("name")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        let value_text = item
            .get("value")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if name.is_empty() {
            continue;
        }

        let mut cookie = serde_json::Map::new();
        cookie.insert("name".into(), json!(name));
        cookie.insert("value".into(), json!(value_text));

        if let Some(url) = item
            .get("url")
            .or_else(|| item.get("URL"))
            .and_then(|value| value.as_str())
            .filter(|url| !url.trim().is_empty())
        {
            cookie.insert("url".into(), json!(url.trim()));
        } else if let Some(domain) = item.get("domain").and_then(|value| value.as_str()) {
            let clean_domain = domain.trim().trim_start_matches('.');
            if !clean_domain.is_empty() {
                cookie.insert("domain".into(), json!(domain.trim()));
                cookie.insert("url".into(), json!(format!("https://{clean_domain}/")));
            }
        } else if !default_url.trim().is_empty() && default_url != "about:blank" {
            cookie.insert("url".into(), json!(default_url.trim()));
        }

        if let Some(path) = item.get("path").and_then(|value| value.as_str()) {
            cookie.insert("path".into(), json!(path));
        }
        if let Some(expires) = cookie_expires(&item) {
            cookie.insert("expires".into(), json!(expires));
        }
        if let Some(http_only) = item
            .get("httpOnly")
            .or_else(|| item.get("httponly"))
            .and_then(|value| value.as_bool())
        {
            cookie.insert("httpOnly".into(), json!(http_only));
        }
        if let Some(secure) = item.get("secure").and_then(|value| value.as_bool()) {
            cookie.insert("secure".into(), json!(secure));
        }
        if let Some(same_site) = item
            .get("sameSite")
            .or_else(|| item.get("same_site"))
            .and_then(|value| value.as_str())
            .and_then(normalize_same_site)
        {
            cookie.insert("sameSite".into(), json!(same_site));
        }
        if cookie.contains_key("url") || cookie.contains_key("domain") {
            cookies.push(Value::Object(cookie));
        }
    }
    if cookies.is_empty() {
        return Err(
            "Cookie JSON 中没有可注入的 Cookie，请确认包含 name/value 以及 domain 或 url".into(),
        );
    }
    Ok(cookies)
}

fn cookie_expires(item: &Value) -> Option<f64> {
    item.get("expires")
        .or_else(|| item.get("expirationDate"))
        .or_else(|| item.get("expiry"))
        .and_then(|value| {
            if let Some(number) = value.as_f64() {
                if number > 0.0 {
                    return Some(number);
                }
            }
            value
                .as_str()
                .and_then(|text| text.parse::<f64>().ok())
                .filter(|number| *number > 0.0)
        })
}

fn normalize_same_site(value: &str) -> Option<&'static str> {
    match value.to_ascii_lowercase().as_str() {
        "strict" => Some("Strict"),
        "lax" => Some("Lax"),
        "none" | "no_restriction" | "no-restriction" => Some("None"),
        _ => None,
    }
}

async fn send(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    id: u64,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    socket
        .send(Message::Text(
            json!({
                "id": id,
                "method": method,
                "params": params
            })
            .to_string(),
        ))
        .await
        .map_err(|error| error.to_string())?;

    while let Some(message) = socket.next().await {
        let message = message.map_err(|error| error.to_string())?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
            if value.get("id").and_then(|value| value.as_u64()) == Some(id) {
                if let Some(error) = value.get("error") {
                    return Err(format!("CDP 调用失败 {method}: {error}"));
                }
                return Ok(value);
            }
        }
    }
    Err(format!("CDP 调用没有响应: {method}"))
}

async fn wait_for_load(
    socket: &mut tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    loop {
        if tokio::time::Instant::now() > deadline {
            return Err("页面加载超时".into());
        }
        let Some(message) = socket.next().await else {
            return Err("CDP 连接已关闭".into());
        };
        let message = message.map_err(|error| error.to_string())?;
        if let Message::Text(text) = message {
            let value: Value = serde_json::from_str(&text).map_err(|error| error.to_string())?;
            if value.get("method").and_then(|value| value.as_str()) == Some("Page.loadEventFired") {
                return Ok(());
            }
        }
    }
}
