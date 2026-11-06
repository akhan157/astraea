//! Astraea desktop shell: one window around the web app.
//!
//! The engine is not here. The app runs `crates/astraea-engine` as
//! WebAssembly in background workers, exactly as the website does, so the
//! desktop and the website compute identical results. This shell only hosts
//! the window and its download handling.

mod startup_trace;

use startup_trace::{NativeEvent, StartupTrace};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::{AppHandle, State, Webview, WebviewUrl, WebviewWindowBuilder};

/// Preferred inner size of the main window, logical pixels.
const PREFERRED_SIZE: (f64, f64) = (1280.0, 800.0);
/// Smallest inner size the layout is designed for, logical pixels.
const MINIMUM_SIZE: (f64, f64) = (800.0, 600.0);
/// Room the window frame (title bar, borders, shadow) takes outside the inner
/// size, logical pixels. `inner_size` excludes it, so a window sized to the
/// whole work area would still run under the taskbar.
const FRAME_ALLOWANCE: (f64, f64) = (16.0, 48.0);

/// Inner size and minimum inner size for the main window given the monitor's
/// usable work area in logical pixels (`None` when it is unknown). The window
/// is the preferred size, shrunk to fit the work area with room for its frame;
/// the minimum shrinks with it, so a small display is never forced off screen.
fn window_sizes(work_area: Option<(f64, f64)>) -> ((f64, f64), (f64, f64)) {
    let Some((work_w, work_h)) = work_area else {
        return (PREFERRED_SIZE, MINIMUM_SIZE);
    };
    let fit = |preferred: f64, work: f64, frame: f64| preferred.min((work - frame).max(1.0));
    let inner = (
        fit(PREFERRED_SIZE.0, work_w, FRAME_ALLOWANCE.0),
        fit(PREFERRED_SIZE.1, work_h, FRAME_ALLOWANCE.1),
    );
    let minimum = (MINIMUM_SIZE.0.min(inner.0), MINIMUM_SIZE.1.min(inner.1));
    (inner, minimum)
}


/// Environment variable that turns on the scripted smoke mode: the absolute
/// path the launched app writes its JSON report to. Only the process
/// environment can set it, never web content.
const SMOKE_ENV: &str = "ASTRAEA_SMOKE_OUT";
/// Largest report the smoke command will write, bytes.
const SMOKE_REPORT_LIMIT: usize = 1 << 20;
/// How long the window stays open after the report is written, so an outside
/// process can capture it before the app exits.
const SMOKE_EXIT_DELAY: Duration = Duration::from_secs(5);
/// Runs before any page script, in smoke mode only: opens the flag the app
/// checks and records page errors the app itself cannot see (script load and
/// CSP failures).
const SMOKE_INIT_SCRIPT: &str = r#"
(() => {
  const smoke = { errors: [] };
  const note = (message) => { if (smoke.errors.length < 50) smoke.errors.push(String(message).slice(0, 500)); };
  addEventListener('error', (event) => note(event.message || 'error event'));
  addEventListener('unhandledrejection', (event) => note(event.reason && event.reason.message ? event.reason.message : event.reason));
  addEventListener('securitypolicyviolation', (event) => note('CSP violation: ' + event.violatedDirective + ' ' + event.blockedURI));
  const original = console.error;
  console.error = (...args) => { note(args.map(String).join(' ')); original.apply(console, args); };
  Object.defineProperty(window, '__ASTRAEA_SMOKE__', { value: smoke, enumerable: false });
})();
"#;

/// Where the smoke report goes, or `None` when smoke mode is off. Smoke mode
/// is on only for a non-empty absolute path in the launch environment.
fn smoke_out_from(value: Option<std::ffi::OsString>) -> Option<PathBuf> {
    let path = PathBuf::from(value.filter(|v| !v.is_empty())?);
    path.is_absolute().then_some(path)
}

/// Managed state: the smoke report path, fixed at launch.
struct SmokeMode(Option<PathBuf>);

/// Write the smoke report atomically and return the process exit code it
/// asks for: 0 when the report says `ok: true`, 1 otherwise. Refuses when
/// smoke mode is off or the report is not a JSON object of sane size.
fn write_smoke_report(out: Option<&Path>, report: &serde_json::Value) -> Result<i32, String> {
    let out = out.ok_or("smoke mode is not enabled")?;
    if !report.is_object() {
        return Err("smoke report must be a JSON object".into());
    }
    let text = serde_json::to_string_pretty(report).map_err(|e| e.to_string())?;
    if text.len() > SMOKE_REPORT_LIMIT {
        return Err("smoke report is too large".into());
    }
    let staging = out.with_extension("json.tmp");
    std::fs::write(&staging, text).map_err(|e| format!("write {}: {e}", staging.display()))?;
    std::fs::rename(&staging, out).map_err(|e| format!("rename to {}: {e}", out.display()))?;
    Ok(if report.get("ok") == Some(&serde_json::Value::Bool(true)) { 0 } else { 1 })
}

/// Smoke mode's one command: record the report, then exit the app. The
/// destination is the launch environment's, never the caller's, and only the
/// main window may call it.
#[tauri::command]
fn smoke_report(
    app: AppHandle,
    webview: Webview,
    mode: State<'_, SmokeMode>,
    report: serde_json::Value,
) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("smoke report refused: not the main window".into());
    }
    let code = write_smoke_report(mode.0.as_deref(), &report)?;
    std::thread::spawn(move || {
        std::thread::sleep(SMOKE_EXIT_DELAY);
        app.exit(code);
    });
    Ok(())
}

/// Fixed launch destination; only the main webview may submit allowlisted codes.
#[tauri::command]
fn startup_trace_event(
    webview: Webview,
    trace: State<'_, StartupTrace>,
    event: String,
) -> Result<(), String> {
    trace.page(webview.label(), &event).map_err(str::to_owned)
}

// This report sink and driver are compiled out of every default/release build.
// The path is fixed by the fixture mount, never supplied by page content.
#[cfg(all(feature = "updater-fixture", debug_assertions))]
fn fixture_overlay_matches(identifier: &str, version: &str, updater: Option<&serde_json::Value>) -> bool {
    identifier == "com.astraea.fixture.updater-verify"
        && version == "1.0.0"
        && updater.and_then(|v| v.get("endpoints")) == Some(&serde_json::json!(["http://127.0.0.1:18750/feed"]))
        && updater.and_then(|v| v.get("requireSignedVersion")) == Some(&serde_json::Value::Bool(true))
}

#[cfg(all(feature = "updater-fixture", debug_assertions))]
#[tauri::command]
fn updater_fixture_report(webview: Webview, report: serde_json::Value) -> Result<(), String> {
    if webview.label() != "main" || !report.is_object() {
        return Err("invalid fixture report".into());
    }
    let text = serde_json::to_vec_pretty(&report).map_err(|e| e.to_string())?;
    if text.len() > 131_072 {
        return Err("fixture report exceeds bound".into());
    }
    let staging = "/evidence/native-report.json.tmp";
    std::fs::write(staging, text).map_err(|e| e.to_string())?;
    std::fs::rename(staging, "/evidence/native-report.json").map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let smoke_out = smoke_out_from(std::env::var_os(SMOKE_ENV));
    let startup_trace = StartupTrace::from_env(std::env::var_os(startup_trace::ENV));
    startup_trace.native(NativeEvent::Run);
    let setup_trace = startup_trace.clone();
    let builder = tauri::Builder::default();
    #[cfg(all(feature = "updater-fixture", debug_assertions))]
    let builder = builder.invoke_handler(tauri::generate_handler![smoke_report, startup_trace_event, updater_fixture_report]);
    #[cfg(not(all(feature = "updater-fixture", debug_assertions)))]
    let builder = builder.invoke_handler(tauri::generate_handler![smoke_report, startup_trace_event]);
    builder
        .manage(SmokeMode(smoke_out.clone()))
        .manage(startup_trace.clone())
        // Native Save dialogs: the app writes project and export files to the
        // path the user picks (the dialog adds that path to the fs scope).
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // Signed updates from the GitHub release feed; the app asks before
        // installing (src/desktop/updates.ts).
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(move |app| {
            setup_trace.native(NativeEvent::Setup);
            // The main window is created here instead of in tauri.conf.json so
            // the `on_download` hook can be attached: WebView2's default
            // (unhandled) download path completed only the first download per
            // process and silently dropped every later one (desktop acceptance
            // row 2.5, 2026-09-27). An explicit handler makes each download
            // visible and writes under host control to WebView2's proposed
            // path (the Downloads folder with a uniquified name).
            // Size the window to the monitor it opens on: a fixed 1280x800
            // inner size plus frame overflowed a 1280x800 display (status bar
            // under the taskbar, desktop acceptance D6, 2026-10-21).
            let work_area = app
                .primary_monitor()
                .ok()
                .flatten()
                .map(|monitor| {
                    let area = monitor.work_area();
                    let scale = monitor.scale_factor();
                    (f64::from(area.size.width) / scale, f64::from(area.size.height) / scale)
                });
            let (inner, minimum) = window_sizes(work_area);
            let mut window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("app/index.html".into()));
            #[cfg(all(feature = "updater-fixture", debug_assertions))]
            {
                if !fixture_overlay_matches(
                    &app.config().identifier,
                    &app.package_info().version.to_string(),
                    app.config().plugins.0.get("updater"),
                ) {
                    return Err("updater fixture requires its fixed compile-time overlay".into());
                }
                window = window.initialization_script(include_str!("../../scripts/updater-fixture/driver.js"));
            }
            if setup_trace.enabled() {
                window = window.initialization_script(startup_trace::INIT_SCRIPT);
            }
            if smoke_out.is_some() {
                window = window.initialization_script(SMOKE_INIT_SCRIPT);
            }
            setup_trace.native(NativeEvent::WindowBuildStarted);
            let page_trace = setup_trace.clone();
            window
                .on_page_load(move |_, payload| {
                    page_trace.native(match payload.event() {
                        tauri::webview::PageLoadEvent::Started => NativeEvent::PageLoadStarted,
                        tauri::webview::PageLoadEvent::Finished => NativeEvent::PageLoadFinished,
                    });
                })
                .title("Astraea Workstation")
                .inner_size(inner.0, inner.1)
                .min_inner_size(minimum.0, minimum.1)
                .center()
                // Chromium gates the 2nd+ download from one origin behind the
                // "multiple automatic downloads" permission. WebView2 has no UI
                // for that prompt, so without an explicit Allow the request is
                // silently dropped: DownloadStarting never fires and the export
                // produces no file (first file per process worked, every later
                // one vanished — desktop acceptance row 2.5, 2026-09-27).
                .on_permission_request(|_, kind| match kind {
                    PermissionKind::AutomaticDownloads => PermissionResponse::Allow,
                    _ => PermissionResponse::Default,
                })
                // Allow every download event. The handler deliberately records
                // nothing: no URL and no destination/path reach disk or a log.
                .on_download(|_webview, _event| true)
                .build()
                .map_err(|error| {
                    setup_trace.native(NativeEvent::WindowBuildFailed);
                    error
                })?;
            setup_trace.native(NativeEvent::WindowBuilt);
            Ok(())
        })
        .run(tauri::generate_context!())
        .map_err(|error| {
            startup_trace.native(NativeEvent::RunFailed);
            error
        })
        .expect("error while running astraea workstation");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(all(feature = "updater-fixture", debug_assertions))]
    #[test]
    fn fixture_guard_refuses_missing_or_nonfixture_configuration() {
        let id = "com.astraea.fixture.updater-verify";
        let config = serde_json::json!({"endpoints": ["http://127.0.0.1:18750/feed"], "requireSignedVersion": true});
        assert!(fixture_overlay_matches(id, "1.0.0", Some(&config)));
        assert!(!fixture_overlay_matches("com.astraea.workstation", "1.0.0", Some(&config)));
        assert!(!fixture_overlay_matches(id, "0.9.0", Some(&config)));
        assert!(!fixture_overlay_matches(id, "1.0.0", None));
        for invalid in [
            serde_json::json!({"endpoints": ["https://example.invalid/feed"], "requireSignedVersion": true}),
            serde_json::json!({"endpoints": ["http://127.0.0.1:18750/feed", "https://example.invalid/feed"], "requireSignedVersion": true}),
            serde_json::json!({"endpoints": ["http://127.0.0.1:18750/feed"], "requireSignedVersion": false}),
            serde_json::json!({"endpoints": ["http://127.0.0.1:18750/feed"]}),
        ] {
            assert!(!fixture_overlay_matches(id, "1.0.0", Some(&invalid)));
        }
    }

    #[test]
    fn roomy_display_gets_the_preferred_size() {
        assert_eq!(window_sizes(Some((1920.0, 1040.0))), (PREFERRED_SIZE, MINIMUM_SIZE));
        assert_eq!(window_sizes(None), (PREFERRED_SIZE, MINIMUM_SIZE));
    }

    #[test]
    fn window_with_its_frame_fits_a_1280x800_display() {
        // 1280x800 monitor with a 40 px taskbar leaves a 1280x760 work area.
        let ((w, h), _) = window_sizes(Some((1280.0, 760.0)));
        assert!(w + FRAME_ALLOWANCE.0 <= 1280.0, "width {w} plus frame overflows");
        assert!(h + FRAME_ALLOWANCE.1 <= 760.0, "height {h} plus frame overflows");
    }

    #[test]
    fn minimum_never_exceeds_the_window_on_a_small_display() {
        let (inner, minimum) = window_sizes(Some((700.0, 500.0)));
        assert!(minimum.0 <= inner.0 && minimum.1 <= inner.1);
        assert!(inner.0 + FRAME_ALLOWANCE.0 <= 700.0 && inner.1 + FRAME_ALLOWANCE.1 <= 500.0);
    }

    #[test]
    fn smoke_mode_needs_a_non_empty_absolute_path() {
        assert_eq!(smoke_out_from(None), None);
        assert_eq!(smoke_out_from(Some("".into())), None);
        assert_eq!(smoke_out_from(Some("report.json".into())), None);
        let absolute = std::env::temp_dir().join("report.json");
        assert_eq!(smoke_out_from(Some(absolute.clone().into_os_string())), Some(absolute));
    }

    #[test]
    fn smoke_report_refuses_when_smoke_mode_is_off() {
        let err = write_smoke_report(None, &serde_json::json!({ "ok": true })).unwrap_err();
        assert!(err.contains("not enabled"), "{err}");
    }

    #[test]
    fn smoke_report_writes_the_report_and_maps_ok_to_the_exit_code() {
        let dir = std::env::temp_dir().join(format!("astraea-smoke-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let out = dir.join("report.json");
        let passed = serde_json::json!({ "ok": true, "apogeeM": 533.1 });
        assert_eq!(write_smoke_report(Some(&out), &passed), Ok(0));
        let written: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).unwrap()).unwrap();
        assert_eq!(written, passed);
        assert_eq!(write_smoke_report(Some(&out), &serde_json::json!({ "ok": false })), Ok(1));
        assert_eq!(write_smoke_report(Some(&out), &serde_json::json!({})), Ok(1));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn smoke_report_rejects_non_objects_and_oversize_reports() {
        let out = std::env::temp_dir().join("astraea-smoke-never-written.json");
        assert!(write_smoke_report(Some(&out), &serde_json::json!("ok")).is_err());
        let huge = serde_json::json!({ "ok": true, "pad": "x".repeat(SMOKE_REPORT_LIMIT) });
        assert!(write_smoke_report(Some(&out), &huge).is_err());
        assert!(!out.exists());
    }
}
