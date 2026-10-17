//! The gaps module over a whole log with the real corpora installed, for measuring its rule and
//! its volume against the owner's log. Ignored: it needs a log file, named by `GAPS_LOG`.
//!
//! `GAPS_LOG=<eqlog_Name_server.txt> cargo test -p knowledge gaps_corpus -- --ignored --nocapture`

use std::sync::Arc;

#[test]
#[ignore]
fn gaps_corpus() {
    let path = std::env::var("GAPS_LOG").expect("GAPS_LOG");
    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let character = eqlog::character_of(&file_name).expect("a character in the file name");
    let bytes = std::fs::read(&path).expect("the log");
    let parser = eqlog::parser_for(&character, eqlog::host_timezone());

    let mut registry = fold::registered(fold::ClusterDeps::default());
    let lookups: Arc<dyn fold::knowledge::Knowledge> = knowledge::shared();
    registry.install_knowledge(&lookups);
    let mut folder = fold::Fold::new(registry, i64::MAX);
    folder.fold_bytes(&parser, &bytes);

    let started = std::time::Instant::now();
    let all = folder.registry.snapshots();
    let cold_ms = started.elapsed().as_millis();
    let started = std::time::Instant::now();
    let _again = folder.registry.snapshots();
    println!("snapshot: {cold_ms} ms cold, {} ms cached", started.elapsed().as_millis());
    let gaps = all["modules"]
        .as_array()
        .expect("modules")
        .iter()
        .find(|m| m["id"] == "gaps")
        .expect("the gaps module");
    let state = &gaps["snapshot"]["state"];
    println!("events: {}", folder.events());
    println!("totals: {}  seen: {}", state["totals"], state["seen"]);
    // `GAPS_OUT=<file>` writes every served row, for an offline audit of the whole list.
    if let Ok(out) = std::env::var("GAPS_OUT") {
        std::fs::write(&out, state.to_string()).expect("GAPS_OUT is writable");
    }
    for domain in ["item", "mob", "spell"] {
        println!("\n== {domain} ==");
        let rows = state["rows"].as_array().expect("rows");
        for (i, r) in rows.iter().filter(|r| r["domain"] == domain).take(15).enumerate() {
            println!(
                "{:>5}  {:<40} {:<28} {}  {}",
                r["count"],
                r["name"].as_str().unwrap_or(""),
                r["kinds"].to_string(),
                r["first"].as_str().unwrap_or(""),
                r["last"].as_str().unwrap_or("")
            );
            if r.get("suggest").is_some() {
                println!("       suggest: {}", r["suggest"]);
            }
            if domain == "item" || i < 2 {
                println!("       details: {}", r["details"]);
            }
        }
    }
    assert!(lookups.take_misses().is_empty(), "the gaps module noted a miss");
}
