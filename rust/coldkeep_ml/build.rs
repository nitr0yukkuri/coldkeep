use std::{env, fs, path::PathBuf};

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let source = manifest_dir
        .join("..")
        .join("..")
        .join("ml")
        .join("artifacts")
        .join("ice_presence_baseline.json");
    println!("cargo:rerun-if-changed={}", source.display());
    let shake_ice_source = manifest_dir
        .join("..")
        .join("..")
        .join("ml")
        .join("artifacts")
        .join("shake_ice_amount_pilot.json");
    println!("cargo:rerun-if-changed={}", shake_ice_source.display());
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("cargo OUT_DIR"));
    let destination = out_dir.join("ice_presence_model.json");
    let contents = fs::read_to_string(&source).unwrap_or_else(|_| "null".to_string());
    fs::write(destination, contents).expect("write optional ice model");
    let shake_ice_destination = out_dir.join("shake_ice_amount_model.json");
    let shake_ice_contents =
        fs::read_to_string(&shake_ice_source).unwrap_or_else(|_| "null".to_string());
    fs::write(shake_ice_destination, shake_ice_contents).expect("write optional shake ice model");
}
