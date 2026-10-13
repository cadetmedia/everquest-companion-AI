//! `progression`'s coin and death columns, driven through the real module with the owner's lines.

use fold::event::Event;
use fold::modules::progression::ProgressionModule;
use fold::EqModule;
use serde_json::{json, Value};

fn fold(lines: &[&str]) -> Value {
    let mut m = ProgressionModule::new();
    for line in lines {
        m.on_event(&Event::from_json(line).expect("object"), false);
    }
    m.snapshot()["state"].clone()
}

#[test]
fn corpse_coin_and_auto_sold_loot_are_summed_in_copper() {
    let s = fold(&[
        r#"{"kind":"coin","seq":0,"ts":1000,"raw":"[Tue Oct 06 18:14:40 2026] You receive 4 silver and 1 copper from the corpse.","source":"corpse","coins":{"silver":4,"copper":1}}"#,
        r#"{"kind":"loot","seq":1,"ts":2000,"raw":"[Tue Oct 06 18:14:47 2026] You looted a Rat Eye from a pack rat's corpse and sold it for 1 gold, 7 silver and 9 copper.","item":"Rat Eye","disposition":"sold"}"#,
    ]);
    assert_eq!(s["coinTs"], json!([1000, 2000]));
    assert_eq!(s["coinCopper"], json!([41, 179]));
}

#[test]
fn every_denomination_counts_and_the_merchant_clause_is_not_read() {
    let s = fold(&[
        r#"{"kind":"coin","seq":0,"ts":1000,"raw":"[x] You receive 1 platinum 1 gold 4 silver 3 copper from Klok Koglin for the Cracked Staff(s).","source":"vendor"}"#,
        r#"{"kind":"coin","seq":1,"ts":2000,"raw":"[x] You received 2 platinum, 3 gold, 5 silver and 8 copper from that item.","source":"item"}"#,
        r#"{"kind":"coin","seq":2,"ts":3000,"raw":"[x] You receive 1,200 platinum from the corpse.","source":"corpse"}"#,
    ]);
    assert_eq!(s["coinCopper"], json!([1143, 2358, 1_200_000]));
}

#[test]
fn ordinary_loot_and_a_free_sale_carry_no_coin() {
    let s = fold(&[
        r#"{"kind":"loot","seq":0,"ts":1000,"raw":"[x] You have looted a Rat Eye from a pack rat's corpse.","item":"Rat Eye"}"#,
        r#"{"kind":"loot","seq":1,"ts":2000,"raw":"[x] You looted a Rat Eye from a pack rat's corpse and sold it for free.","disposition":"sold"}"#,
    ]);
    assert_eq!(s["coinTs"], json!([]));
}

#[test]
fn deaths_keep_their_killer_and_a_bare_you_died_after_one_is_not_a_second_death() {
    let s = fold(&[
        r#"{"kind":"playerDeath","seq":0,"ts":1000,"raw":"[x] You have been slain by Trooper Axyl!","killer":"Trooper Axyl"}"#,
        r#"{"kind":"playerDeath","seq":1,"ts":1000,"raw":"[x] You died."}"#,
        r#"{"kind":"playerDeath","seq":2,"ts":9000,"raw":"[x] You have been slain by a shiverback!","killer":"a shiverback"}"#,
        r#"{"kind":"playerDeath","seq":3,"ts":60000,"raw":"[x] You died."}"#,
    ]);
    assert_eq!(s["deathTs"], json!([1000, 9000, 60000]));
    assert_eq!(
        s["deathKiller"],
        json!(["Trooper Axyl", "a shiverback", ""])
    );
}

#[test]
fn a_rebirth_clears_both_columns() {
    let s = fold(&[
        r#"{"kind":"coin","seq":0,"ts":1000,"raw":"[x] You receive 5 gold from the corpse."}"#,
        r#"{"kind":"playerDeath","seq":1,"ts":2000,"raw":"[x] You have been slain by a bat!","killer":"a bat"}"#,
        r#"{"kind":"epoch","seq":2,"ts":3000,"raw":""}"#,
    ]);
    assert_eq!(s["coinTs"], json!([]));
    assert_eq!(s["deathTs"], json!([]));
}
