use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, State, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct TrayState {
    toggle_record_item: MenuItem<tauri::Wry>,
}

static SIDECAR: Mutex<Option<Child>> = Mutex::new(None);

const PORT: u16 = 9847;

fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri has parent")
        .to_path_buf()
}

fn sidecar_dir() -> PathBuf {
    project_root().join("sidecar")
}

fn free_port(port: u16) {
    #[cfg(unix)]
    {
        let _ = Command::new("sh")
            .arg("-c")
            .arg(format!("fuser -k {port}/tcp 2>/dev/null || true"))
            .output();
        std::thread::sleep(Duration::from_millis(400));
    }
}

fn start_sidecar() -> Result<(), String> {
    free_port(PORT);
    let dir = sidecar_dir();
    let script = dir.join("main.py");
    if !script.exists() {
        return Err(format!("Sidecar not found: {}", script.display()));
    }

    let python = dir.join(".venv").join("bin").join("python3");
    let python_cmd = if python.exists() {
        python
    } else {
        PathBuf::from("python3")
    };

    let child = Command::new(&python_cmd)
        .arg("main.py")
        .current_dir(&dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start sidecar: {e}"))?;

    *SIDECAR.lock().unwrap() = Some(child);
    Ok(())
}

pub fn stop_sidecar() {
    if let Some(mut child) = SIDECAR.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn wait_for_sidecar(max_secs: u64) {
    for _ in 0..max_secs * 2 {
        if std::net::TcpStream::connect("127.0.0.1:9847").is_ok() {
            return;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

fn read_start_minimized() -> bool {
    let Ok(mut stream) = std::net::TcpStream::connect("127.0.0.1:9847") else {
        return true;
    };
    stream.set_read_timeout(Some(Duration::from_secs(2))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(2))).ok();
    use std::io::{Read, Write};
    let req = "GET /settings HTTP/1.1\r\nHost: 127.0.0.1:9847\r\nConnection: close\r\n\r\n";
    if stream.write_all(req.as_bytes()).is_err() {
        return true;
    }
    let mut buf = String::new();
    if stream.read_to_string(&mut buf).is_err() {
        return true;
    }
    if let Some(body) = buf.split("\r\n\r\n").nth(1) {
        if body.contains("\"start_minimized\":\"0\"") || body.contains("\"start_minimized\": \"0\"") {
            return false;
        }
    }
    true
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.hide();
    }
}

#[tauri::command]
fn set_recording_state(
    recording: bool,
    tray: State<'_, TrayState>,
) -> Result<(), String> {
    let label = if recording {
        "Stop recording"
    } else {
        "Start recording"
    };
    tray.toggle_record_item
        .set_text(label)
        .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    if let Err(e) = start_sidecar() {
        eprintln!("Sidecar start error: {e}");
    } else {
        std::thread::spawn(|| wait_for_sidecar(120));
    }

    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        let _ = app.emit("auris-shortcut-toggle-record", ());
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            show_main_window,
            hide_main_window,
            set_recording_state,
        ]);

    builder = builder.setup(|app| {
        let open_i = MenuItem::with_id(app, "open", "Open Auris", true, None::<&str>)?;
        let record_i =
            MenuItem::with_id(app, "toggle_record", "Start recording", true, None::<&str>)?;
        let quit_i = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
        let menu = Menu::with_items(app, &[&open_i, &record_i, &quit_i])?;

        app.manage(TrayState {
            toggle_record_item: record_i.clone(),
        });

        let shortcut =
            Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyR);
        let gs = app.global_shortcut();
        // Dev restarts often leave a zombie process holding this shortcut
        let _ = gs.unregister(shortcut);
        let _ = gs.unregister_all();
        if let Err(e) = gs.register(shortcut) {
            eprintln!(
                "Global shortcut Ctrl+Shift+R unavailable ({e}). \
                 Quit other Auris instances: pkill -f 'target/debug/auris'"
            );
        }

        let _tray = TrayIconBuilder::new()
            .icon(app.default_window_icon().unwrap().clone())
            .menu(&menu)
            .tooltip("Auris — Ctrl+Shift+R to record")
            .on_menu_event(|app, event| match event.id.as_ref() {
                "open" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
                "toggle_record" => {
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.eval(
                            "window.dispatchEvent(new CustomEvent('auris-tray-toggle-record'))",
                        );
                    }
                }
                "quit" => {
                    stop_sidecar();
                    app.exit(0);
                }
                _ => {}
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.show();
                        let _ = w.set_focus();
                    }
                }
            })
            .build(app)?;

        let app_handle = app.handle().clone();
        std::thread::spawn(move || {
            wait_for_sidecar(30);
            let minimized = read_start_minimized();
            if minimized {
                let handle = app_handle.clone();
                let _ = app_handle.run_on_main_thread(move || {
                    if let Some(w) = handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                });
            }
        });

        Ok(())
    });

    builder
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            if let RunEvent::Exit = event {
                let _ = app_handle.global_shortcut().unregister_all();
                stop_sidecar();
            }
            if let RunEvent::WindowEvent {
                label,
                event: WindowEvent::CloseRequested { api, .. },
                ..
            } = event
            {
                if label == "main" {
                    api.prevent_close();
                    if let Some(w) = app_handle.get_webview_window("main") {
                        let _ = w.hide();
                    }
                }
            }
        });
}
