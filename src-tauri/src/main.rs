//
// @file main.rs
// @description Tauri desktop binary entrypoint for TellyX Player.
// @author Armature.TN
// @license Dual License: GNU AGPL-3.0 or Commercial License (SPDX: AGPL-3.0-or-later OR Commercial)
//

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tellyx_lib::run();
}

