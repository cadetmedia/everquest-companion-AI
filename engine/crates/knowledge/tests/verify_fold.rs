//! The fold `scripts/community/verify-gaps.mts` checks the Gaps tab against: one whole log, built the
//! way engined's attach builds it (`engined/src/foldsink.rs`: the log's own character and clock, the
//! combat engine, the committed corpora installed), and the chosen modules' served states written as
//! one JSON object. Nothing listens, nothing is persisted, and the log is only read.
//!
//! Ignored: it needs a log. `VERIFY_LOG` names it, `VERIFY_OUT` the JSON file to write, and
//! `VERIFY_MODULES` (comma-separated, default `gaps,loot,kills,consider`) which states go in:
//!
//! `VERIFY_LOG=<eqlog_Name_server.txt> VERIFY_OUT=<out.json> cargo test --release -p knowledge --test verify_fold -- --ignored`

use std::collections::HashSet;
use std::sync::Arc;

/// The character and server out of a log's file name, both shapes engined reads
/// (`ingest::character_of`, `foldsink::server_of`): the oracle's slice form, else
/// `eqlog_<Name>_<server>.txt` split at the last underscore.
fn identity_of(file_name: &str) -> Option<(String, String)> {
    if let (Some(c), Some(s)) = (eqlog::character_of(file_name), eqlog::server_of(file_name)) {
        return Some((c, s));
    }
    let lower = file_name.to_ascii_lowercase();
    if !lower.starts_with("eqlog_") || !lower.ends_with(".txt") {
        return None;
    }
    let rest = &file_name[6..file_name.len() - 4];
    let split = rest.rfind('_')?;
    let (character, server) = (&rest[..split], &rest[split + 1..]);
    (!character.is_empty() && !server.is_empty())
        .then(|| (character.to_string(), server.to_string()))
}

#[test]
#[ignore]
fn verify_fold() {
    let path = std::env::var("VERIFY_LOG").expect("VERIFY_LOG");
    let out = std::env::var("VERIFY_OUT").expect("VERIFY_OUT");
    let wanted =
        std::env::var("VERIFY_MODULES").unwrap_or_else(|_| "gaps,loot,kills,consider".into());
    let file_name = std::path::Path::new(&path)
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let (character, server) = identity_of(&file_name).expect("eqlog_<Name>_<server>.txt");
    let bytes = std::fs::read(&path).expect("the log");
    let tz = eqlog::host_timezone();
    let parser = eqlog::parser_for(&character, tz);
    let clock = eqlog::Clock::new(tz);
    let launch_ms = fold::epoch::launch_ms(&clock);
    let attached_at_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as i64);

    // `foldsink::cluster_deps`, field for field.
    let deps = fold::ClusterDeps {
        known_spell: parser
            .spell_db()
            .map(|db| db.keys().map(str::to_string).collect::<HashSet<String>>())
            .unwrap_or_default(),
        spell_classes: parser
            .spell_db()
            .map(fold::modules::combo::evidence::spell_class_index)
            .unwrap_or_default(),
        facts: parser
            .spell_db()
            .map(fold::spell_facts::SpellFacts::project)
            .unwrap_or_default(),
        launch_ms,
        construction_now_ms: attached_at_ms,
        character: Some(serde_json::json!({
            "name": character,
            "server": server,
            "logPath": path,
        })),
        self_name: None,
        respawn_prefs: fold::modules::respawn::RespawnPrefs::default(),
    };
    let mut registry = fold::registered(deps);
    let lookups: Arc<dyn fold::knowledge::Knowledge> = knowledge::shared();
    registry.install_knowledge(&lookups);
    // `foldsink::combat_for`.
    let mut engine = fold::combat::CombatEngine::new();
    engine.reset();
    engine.set_player_name(&character);
    let started = std::time::Instant::now();
    let mut folder = fold::Fold::new(registry, launch_ms).with_combat(engine);
    folder.fold_bytes(&parser, &bytes);
    let fold_ms = started.elapsed().as_millis();

    let all = folder.registry.snapshots();
    let mut states = serde_json::Map::new();
    for m in all["modules"].as_array().expect("modules") {
        let id = m["id"].as_str().unwrap_or_default();
        if wanted.split(',').any(|w| w.trim() == id) {
            states.insert(id.to_string(), m["snapshot"]["state"].clone());
        }
    }
    let meta = serde_json::json!({
        "character": character,
        "server": server,
        "events": folder.events(),
        "foldMs": fold_ms,
        "lastEventTs": folder.last_ts(),
        "bytes": bytes.len(),
    });
    let body = serde_json::json!({ "meta": meta, "modules": states });
    std::fs::write(&out, body.to_string()).expect("VERIFY_OUT is writable");
    println!(
        "verify_fold: {} events in {fold_ms} ms -> {out}",
        folder.events()
    );
}
