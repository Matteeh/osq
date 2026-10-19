//! An example outside `src/`, which is not runtime code.

fn main() {
    let _ = std::process::Command::new("node").arg("example.js").status();
}
