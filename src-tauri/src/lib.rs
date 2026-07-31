/**
 * @file lib.rs
 * @description Native Tauri Rust entrypoint library for TellyX player across Desktop & Mobile targets (Windows, Linux, macOS, Android).
 * @author Armature.TN
 * @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
 */

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .setup(|_app| {
            println!("[TellyX Tauri Native] Starting embedded TellyX engine...");
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tellyx tauri application");
}
