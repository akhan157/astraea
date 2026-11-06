//! Opt-in, local startup evidence. No URLs, errors, project data or caller paths.
//! This module uses only std so its boundary tests run without native GUI libraries.
use std::ffi::OsString;
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const ENV: &str = "ASTRAEA_STARTUP_TRACE_OUT";
pub const INIT_SCRIPT: &str = include_str!("startup_trace.js");
const MAX_BYTES: usize = 16 * 1024;
const MAX_NATIVE_EVENTS: usize = 32;
const MAX_PAGE_EVENTS: usize = 96;
const PAGE_EVENTS_PER_SECOND: usize = 8;

#[derive(Clone, Copy)]
pub enum NativeEvent {
    Run,
    Setup,
    WindowBuildStarted,
    WindowBuilt,
    WindowBuildFailed,
    PageLoadStarted,
    PageLoadFinished,
    RunFailed,
}
impl NativeEvent {
    fn name(self) -> &'static str {
        match self {
            Self::Run => "native_run",
            Self::Setup => "native_setup",
            Self::WindowBuildStarted => "native_window_build_started",
            Self::WindowBuilt => "native_window_built",
            Self::WindowBuildFailed => "native_window_build_failed",
            Self::PageLoadStarted => "native_page_load_started",
            Self::PageLoadFinished => "native_page_load_finished",
            Self::RunFailed => "native_run_failed",
        }
    }
}

#[derive(Clone, Default)]
pub struct StartupTrace(Option<Arc<Mutex<Writer>>>);
struct Writer {
    file: Option<File>,
    started: Instant,
    bytes: usize,
    native_events: usize,
    page_events: usize,
    page_window_started: Instant,
    page_window_events: usize,
}

impl StartupTrace {
    /// Fixed once at launch. Never overwrite an existing file or create directories.
    /// Invalid/unwritable output disables tracing and never prevents application launch.
    pub fn from_env(value: Option<OsString>) -> Self {
        let Some(value) = value.filter(|value| !value.is_empty()) else { return Self::default() };
        let path = PathBuf::from(value);
        if !path.is_absolute() { return Self::default() }
        let Ok(file) = OpenOptions::new().write(true).create_new(true).open(path) else { return Self::default() };
        let started = Instant::now();
        Self(Some(Arc::new(Mutex::new(Writer {
            file: Some(file), started, bytes: 0, native_events: 0, page_events: 0,
            page_window_started: started, page_window_events: 0,
        }))))
    }

    pub fn enabled(&self) -> bool { self.0.is_some() }

    pub fn native(&self, event: NativeEvent) {
        if let Some(writer) = &self.0 {
            if let Ok(mut writer) = writer.lock() {
                if writer.native_events < MAX_NATIVE_EVENTS {
                    writer.native_events += 1;
                    let _ = writer.write(event.name());
                }
            }
        }
    }

    /// The IPC boundary accepts one allowlisted code, never free text or a path.
    pub fn page(&self, label: &str, event: &str) -> Result<(), &'static str> {
        if label != "main" { return Err("startup trace refused: not the main window") }
        let writer = self.0.as_ref().ok_or("startup tracing is disabled")?;
        if !page_event_allowed(event) { return Err("startup trace refused: unknown event") }
        let mut writer = writer.lock().map_err(|_| "startup trace unavailable")?;
        if writer.page_events >= MAX_PAGE_EVENTS { return Err("startup trace event limit reached") }
        if writer.page_window_started.elapsed() >= Duration::from_secs(1) {
            writer.page_window_started = Instant::now();
            writer.page_window_events = 0;
        }
        if writer.page_window_events >= PAGE_EVENTS_PER_SECOND { return Err("startup trace rate limit reached") }
        writer.page_window_events += 1;
        writer.page_events += 1;
        writer.write(event)
    }
}
impl Writer {
    fn write(&mut self, event: &str) -> Result<(), &'static str> {
        // event is always static/allowlisted; no JSON escaping or untrusted text needed.
        let line = format!("{{\"event\":\"{event}\",\"elapsed_ms\":{}}}\n", self.started.elapsed().as_millis());
        if self.bytes + line.len() > MAX_BYTES { return Err("startup trace byte limit reached") }
        let file = self.file.as_mut().ok_or("startup trace output unavailable")?;
        if file.write_all(line.as_bytes()).is_err() {
            self.file = None;
            return Err("startup trace output unavailable");
        }
        self.bytes += line.len();
        Ok(())
    }
}
fn page_event_allowed(event: &str) -> bool {
    matches!(event,
        "document_init" | "dom_content_loaded" | "window_load" |
        "js_error" | "script_resource_error" | "style_resource_error" | "other_resource_error" |
        "rejected_promise" | "csp_script" | "csp_worker" | "csp_connect" | "csp_style" | "csp_other" |
        "root_present_5s" | "root_empty_5s" | "root_present_15s" | "root_empty_15s" |
        "root_present_60s" | "root_empty_60s")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    static NEXT: AtomicUsize = AtomicUsize::new(0);
    fn output() -> PathBuf {
        std::env::temp_dir().join(format!("astraea-startup-{}-{}.jsonl", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)))
    }
    fn trace() -> (StartupTrace, PathBuf) {
        let path = output();
        (StartupTrace::from_env(Some(path.clone().into_os_string())), path)
    }
    #[test]
    fn disabled_for_absent_empty_relative_or_unwritable_path() {
        for value in [None, Some("".into()), Some("relative.jsonl".into()), Some(output().join("missing/report.jsonl").into_os_string())] {
            let trace = StartupTrace::from_env(value);
            assert!(!trace.enabled());
            trace.native(NativeEvent::Run);
            assert!(trace.page("main", "document_init").is_err());
        }
    }
    #[test]
    fn refuses_existing_output_without_modifying_it() {
        let path = output();
        std::fs::write(&path, b"preserve").unwrap();
        assert!(!StartupTrace::from_env(Some(path.clone().into_os_string())).enabled());
        assert_eq!(std::fs::read(&path).unwrap(), b"preserve");
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn fixed_destination_only_main_and_allowlisted_codes() {
        let (trace, path) = trace();
        assert!(trace.enabled());
        trace.native(NativeEvent::Run);
        let clone = trace.clone();
        assert!(clone.page("other", "document_init").is_err());
        for event in ["private project", "https://example.test/secret", "../../other.jsonl", "document_init\nsecret", &"x".repeat(20000)] {
            assert!(clone.page("main", event).is_err());
        }
        clone.page("main", "document_init").unwrap();
        let text = std::fs::read_to_string(&path).unwrap();
        assert_eq!(text.lines().count(), 2);
        assert!(text.contains("native_run") && text.contains("document_init"));
        assert!(!text.contains("secret") && !text.contains("private"));
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn page_rate_total_native_and_byte_limits_are_independent() {
        let (trace, path) = trace();
        for _ in 0..PAGE_EVENTS_PER_SECOND { trace.page("main", "js_error").unwrap(); }
        assert!(trace.page("main", "js_error").unwrap_err().contains("rate"));
        {
            let mut writer = trace.0.as_ref().unwrap().lock().unwrap();
            writer.page_window_started -= Duration::from_secs(2);
        }
        // Advance only the test rate clock, exercising the total cap without sleeps.
        for _ in PAGE_EVENTS_PER_SECOND..MAX_PAGE_EVENTS {
            trace.0.as_ref().unwrap().lock().unwrap().page_window_started -= Duration::from_secs(2);
            trace.page("main", "js_error").unwrap();
        }
        assert!(trace.page("main", "js_error").unwrap_err().contains("event limit"));
        for _ in 0..MAX_NATIVE_EVENTS + 20 { trace.native(NativeEvent::WindowBuilt); }
        assert_eq!(std::fs::read_to_string(&path).unwrap().lines().count(), MAX_PAGE_EVENTS + MAX_NATIVE_EVENTS);
        {
            let mut writer = trace.0.as_ref().unwrap().lock().unwrap();
            writer.bytes = MAX_BYTES;
            assert!(writer.write("native_run").unwrap_err().contains("byte limit"));
        }
        assert!(std::fs::metadata(&path).unwrap().len() <= MAX_BYTES as u64);
        std::fs::remove_file(path).unwrap();
    }
    #[test]
    fn output_failure_does_not_escape_native_callback() {
        let (trace, path) = trace();
        trace.0.as_ref().unwrap().lock().unwrap().file = Some(File::open(&path).unwrap());
        trace.native(NativeEvent::RunFailed);
        assert!(trace.page("main", "document_init").unwrap_err().contains("unavailable"));
        std::fs::remove_file(path).unwrap();
    }
}
