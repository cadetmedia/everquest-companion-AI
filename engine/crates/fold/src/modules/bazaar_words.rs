//! Trade chat's words before [`super::bazaar_parse`] reads them: the message split into tokens,
//! its shorthands spelled out, and a price read off one to three tokens.
//!
//! The shorthands were measured on the owner's archived log (2026-08-12 to 2026-10-07, 58,890 chat
//! lines). An acronym is here only when one item fits it and the chat around it agrees: `CoF` is
//! dropped by Nagafen and called "cloak of flame" in the same breath, `RBB` was spelled out by its
//! seller ("Runed Bolster Belt +4 send tell saying RBB"). Acronyms that fit several items or none
//! (`KR`, `SBoZ`, `BoC`) are left out; reading one wrong prices the wrong item.

use regex::Regex;
use std::sync::OnceLock;

/// Lowercase, apostrophes gone, anything but letters, digits and `:` a space, spaces single:
/// "Bone Clasped Girdle" is the Bone-Clasped Girdle.
pub fn loose(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars().flat_map(char::to_lowercase) {
        match c {
            '`' | '\'' | '\u{2019}' => {}
            'a'..='z' | '0'..='9' | ':' => out.push(c),
            _ => out.push(' '),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// A name with a lowercase letter run into a capital split there (`McVaxius` → `Mc Vaxius`), the
/// spelling a name has once [`tokens`] has pulled two glued item links apart.
pub fn unglued(s: &str) -> String {
    static CAMEL: OnceLock<Regex> = OnceLock::new();
    re(&CAMEL, r"([a-z])([A-Z])")
        .replace_all(s, "$1 $2")
        .into_owned()
}

pub fn re(cell: &'static OnceLock<Regex>, pattern: &str) -> &'static Regex {
    cell.get_or_init(|| Regex::new(pattern).expect("a valid pattern"))
}

pub struct Tok {
    pub raw: String,
    pub n: String,
}

/// Word shorthands and item acronyms, each read as a whole word in any case.
const SHORTHAND: &[(&str, &str)] = &[
    ("champ", "champion"),
    ("mith", "mithril"),
    ("hq", "high quality"),
    ("mq", "medium quality"),
    ("lq", "low quality"),
    ("cof", "Cloak of Flames"),
    ("rbb", "Runed Bolster Belt"),
    ("fbss", "Flowing Black Silk Sash"),
    ("ssoy", "Short Sword of the Ykesha"),
    ("bcg", "Bone-Clasped Girdle"),
];

fn expand(s: &str) -> String {
    static SHORT: OnceLock<Regex> = OnceLock::new();
    let words = SHORTHAND
        .iter()
        .map(|(w, _)| *w)
        .collect::<Vec<_>>()
        .join("|");
    let rx =
        SHORT.get_or_init(|| Regex::new(&format!(r"(?i)\b({words})\b")).expect("a valid pattern"));
    rx.replace_all(s, |c: &regex::Captures| {
        let w = c[1].to_lowercase();
        SHORTHAND
            .iter()
            .find(|(k, _)| *k == w)
            .map_or(w, |(_, full)| (*full).to_string())
    })
    .into_owned()
}

/// Split glued prices, tiers and counts off words, expand the shorthands, and pad separators.
pub fn tokens(msg: &str, split_glued: bool) -> Vec<Tok> {
    static GLUED_PRICE: OnceLock<Regex> = OnceLock::new();
    static PRICE_WORD: OnceLock<Regex> = OnceLock::new();
    static GLUED_QTY: OnceLock<Regex> = OnceLock::new();
    static TIER_PRICE: OnceLock<Regex> = OnceLock::new();
    static SEP: OnceLock<Regex> = OnceLock::new();
    // "Arrow(s)" is the plural.
    let s = msg.replace("(s)", "s");
    // Acronyms first: the split below would take `CoF` apart.
    let s = expand(&s);
    // Two item links pasted back to back lose the space between them: "Stonemelder's BandFleeting Quiver".
    let s = if split_glued { unglued(&s) } else { s };
    // A tier runs into its price: "+43k" is +4 at 3k, since no tier passes +10.
    let s = re(&TIER_PRICE, r"\+(10|[1-9])(\d+(?:\.\d+)?k)\b").replace_all(&s, "+$1 $2");
    let s = re(&GLUED_PRICE, r"(?i)([a-z])(\d+(?:\.\d+)?k)\b").replace_all(&s, "$1 $2");
    let s = re(&PRICE_WORD, r"(?i)(\d(?:k|pp))([a-z]{2,})").replace_all(&s, "$1 $2");
    let s = re(&GLUED_QTY, r"(?i)([a-z]{3,})(x\d+)\b").replace_all(&s, "$1 $2");
    let s = re(&SEP, r"([|/,;:!?()]|\s-\s)").replace_all(&s, " $1 ");
    s.split_whitespace()
        .map(|raw| Tok {
            raw: raw.to_string(),
            n: loose(raw),
        })
        .collect()
}

fn unit_of(word: &str) -> f64 {
    match word {
        "g" | "gp" | "gold" => 0.1,
        "s" | "sp" | "silver" => 0.01,
        "c" | "cp" | "copper" => 0.001,
        _ => 1.0,
    }
}

/// A price starting at `t[i]`, in platinum, and how many tokens it spans.
pub fn price_at(t: &[Tok], i: usize) -> Option<(f64, usize)> {
    static PRICE: OnceLock<Regex> = OnceLock::new();
    let rx = re(
        &PRICE,
        r"(?i)^(\d{1,3}(?:[ ,]\d{3})+|\d+(?:\.\d+)?)\s*(k|m|mil)?\s*(pp|p|plat|platinum|g|gp|gold|s|sp|silver|c|cp|copper)?$",
    );
    (1..=3)
        .rev()
        .filter(|span| i + span <= t.len())
        .find_map(|span| {
            let joined: Vec<&str> = t[i..i + span].iter().map(|x| x.raw.as_str()).collect();
            let s = joined.join(" ");
            let s = s.trim_end_matches(['.', '!']);
            let m = rx.captures(s)?;
            // Two bare numbers side by side are a count and a price, unless they are `10 000`.
            let lettered = s.chars().any(|c| c.is_ascii_alphabetic());
            let thousands = s.split(' ').skip(1).all(|g| g.len() == 3);
            // ...and `40 100 each` is forty at a hundred, not 40,100 (owner report, 2026-10-13).
            let each_after = t
                .get(i + span)
                .is_some_and(|x| matches!(x.n.as_str(), "each" | "ea" | "per"));
            if span > 1 && !lettered && (!thousands || each_after) {
                return None;
            }
            let num: f64 = m[1].replace([' ', ','], "").parse().ok()?;
            let mult = m.get(2).map_or(1.0, |k| {
                if k.as_str().eq_ignore_ascii_case("k") {
                    1e3
                } else {
                    1e6
                }
            });
            let unit = m
                .get(3)
                .map_or(1.0, |u| unit_of(&u.as_str().to_lowercase()));
            if m.get(2).is_none() && m.get(3).is_none() && num < 1.0 {
                return None;
            }
            Some((num * mult * unit, span))
        })
}

/// Words a bare number may stand before and still be a price ("2k" never needs this: its unit says so).
pub const AFTER_BARE_PRICE: &[&str] = &[
    "each", "ea", "per", "pst", "at", "in", "obo", "ono", "firm", "neg", "or", "and", "for",
    "total", "wts", "wtb", "wtt", "selling", "buying", "trading", "paying", "offering",
];

/// A price with no `k`, `pp` or coin, over all the tokens it spans: `40`, `100`, and `10 000` too,
/// which is 10,000 or ten for a thousand (review, 2026-10-13).
pub fn bare_at(t: &[Tok], i: usize, used: usize) -> bool {
    !t[i..i + used]
        .iter()
        .any(|x| x.raw.bytes().any(|b| b.is_ascii_alphabetic()))
}

/// Mark the offers read through a guess `sure = false`: listed, never counted (owner, 2026-10-13).
/// An `or` before another price or count ("400p each or 700p for both", "20k or 2x Lion Skins")
/// makes the line a choice, where "or best offer" and "A or B 15pp each" do not; and a count over
/// one with a price but neither `each` nor a `for` total ("800x Powder 6k") is the lot or each.
/// `starts[k]` is the token where `out[k]` began: a `for` total is the offer's it follows, up to
/// where the next offer starts, so "800x Powder 6k, Bone Chips 1000 for 10k" leaves the powder a
/// guess (review, 2026-10-13).
pub fn mark_guesses(t: &[Tok], out: &mut [super::bazaar_parse::Offer], starts: &[usize]) {
    let number_after = |k: &str, span: &[Tok]| {
        span.windows(2)
            .any(|w| w[0].n == k && w[1].raw.bytes().next().is_some_and(|b| b.is_ascii_digit()))
    };
    let alternatives = number_after("or", t);
    for (k, o) in out.iter_mut().enumerate() {
        let from = if k == 0 { 0 } else { starts[k] };
        let to = starts.get(k + 1).copied().unwrap_or(t.len());
        let stated_total = number_after("for", &t[from..to]);
        let lot_or_each =
            o.qty.is_some_and(|q| q > 1) && o.price_pp.is_some() && !o.each && !stated_total;
        if alternatives || lot_or_each {
            o.sure = false;
        }
    }
}
