//! The bazaar parser over a whole chat corpus, for measuring a change to its rules against the
//! owner's log. Ignored: it needs a corpus file, named by `BAZAAR_CORPUS`.

use super::super::bazaar_parse::{parse_trade, ItemIndex, Offer};

fn short(o: &Offer) -> String {
    let mut s = format!("{} {}", o.dir.as_str(), o.item);
    if o.tier > 0 {
        s += &format!(" +{}", o.tier);
    }
    if let Some(q) = o.qty {
        s += &format!(" x{q}");
    }
    if let Some(p) = o.unit_pp() {
        s += &format!(" {p}pp");
    }
    if !o.sure {
        s += " ?";
    }
    s
}

/// The whole parser over a chat corpus with the real item database, for measuring against the
/// prototype: `BAZAAR_CORPUS=<chat lines> [BAZAAR_ITEMS=<items.json>] [BAZAAR_DUMP=1] cargo test -p fold bazaar_corpus -- --ignored --nocapture`.
#[test]
#[ignore]
fn bazaar_corpus() {
    let corpus = std::env::var("BAZAAR_CORPUS").expect("BAZAAR_CORPUS");
    let db: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(std::env::var("BAZAAR_ITEMS").unwrap_or_else(|_| {
            concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../../src/main/data/items.json"
            )
            .to_string()
        }))
        .unwrap(),
    )
    .unwrap();
    let names = db["items"]
        .as_object()
        .unwrap()
        .values()
        .filter_map(|e| e["page"].as_str().map(str::to_string));
    let ix = ItemIndex::new(names);
    let (mut trade, mut with_item, mut with_price, mut offers, mut priced) = (0, 0, 0, 0, 0);
    let mut counted = 0;
    for l in std::fs::read_to_string(corpus).unwrap().lines() {
        let Some((_, msg)) = super::chat_of(crate::message_overlay::message_text_of(l)) else {
            continue;
        };
        let lead = msg
            .trim_start_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        let opens = ["wts", "wtb", "wtt", "selling", "buying", "trading"]
            .iter()
            .any(|w| {
                lead.starts_with(w) && !lead[w.len()..].starts_with(|c: char| c.is_alphanumeric())
            });
        if !opens {
            continue;
        }
        trade += 1;
        let o = parse_trade(msg, &ix);
        offers += o.len();
        priced += o.iter().filter(|x| x.price_pp.is_some()).count();
        counted += o.iter().filter(|x| x.price_pp.is_some() && x.sure).count();
        with_item += usize::from(!o.is_empty());
        if std::env::var("BAZAAR_DUMP").is_ok() {
            println!(
                "DUMP	{msg}	{}",
                o.iter().map(short).collect::<Vec<_>>().join(" | ")
            );
        }
        with_price += usize::from(o.iter().any(|x| x.price_pp.is_some()));
    }
    println!(
        "trade {trade} withItem {with_item} withPrice {with_price} offers {offers} priced {priced} counted {counted}"
    );
}
