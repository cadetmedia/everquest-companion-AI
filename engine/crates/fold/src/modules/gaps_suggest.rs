//! A near-miss suggestion on a gap row (owner ask, 2026-10-11): when one known name is a character
//! or two from the unknown one, the row says so and names the wiki page, so the owner can fix the
//! page's spelling. The motivating case: the log's ``Teir`Dal Arcane Insignia`` against the wiki's
//! `Tier'Dal Arcane Insignia` — one transposition after the quote fold.
//!
//! IT SPEAKS ONLY WHEN IT LOOKS RIGHT (owner refinement, same day): a doubtful suggestion confuses
//! people, so the rule prefers silence. Distance 1 for any name; 2 only when the folded name is 16
//! characters or longer; never 3. The candidate must be UNIQUE at that distance, have the same
//! number of words, and not differ only by a trailing parenthetical or a leading article. Names are
//! compared after the same quote fold and loose fold the check uses, so a difference the check
//! already forgives is a match, never a suggestion. Items are compared against the database's
//! keys and name the page; spells against the catalog's names, which are the pages. Mobs are
//! skipped: `known_mob` answers a question and hands out no list.
//!
//! The distance is Damerau-Levenshtein in its optimal-string-alignment form (a transposition
//! counts 1), computed within a bound: a candidate whose length differs by more than the bound is
//! never scored, and scoring stops at the first row whose minimum exceeds it.

use super::gaps_keys::{loose_key, spell_gap_key};
use serde::Serialize;
use std::sync::OnceLock;

/// A folded name of 16 characters or more may be 2 off; a shorter one, 1.
const LONG_NAME: usize = 16;

/// What a row carries when one known name is within reach.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Suggest {
    pub name: String,
    pub page: String,
    pub distance: u8,
}

/// One known name to compare against: its loose key, its name, and the page to link.
#[derive(Debug, Clone)]
pub struct Candidate {
    pub key: String,
    pub name: String,
    pub page: String,
}

/// The one candidate within reach of `key` (a row's loose key), or nothing — see the header.
pub fn suggest(key: &str, candidates: &[Candidate]) -> Option<Suggest> {
    let bound = if key.chars().count() >= LONG_NAME { 2 } else { 1 };
    let words = key.split_whitespace().count();
    let mut best: Option<(usize, &Candidate)> = None;
    let mut tied = false;
    for c in candidates {
        if c.key.split_whitespace().count() != words || trivially_apart(key, &c.key) {
            continue;
        }
        let Some(d) = distance_within(key, &c.key, bound) else {
            continue;
        };
        match best {
            Some((bd, _)) if d > bd => {}
            Some((bd, bc)) if d == bd => tied |= bc.page != c.page,
            _ if d == 0 => {}
            _ => {
                best = Some((d, c));
                tied = false;
            }
        }
    }
    let (distance, c) = best.filter(|_| !tied)?;
    Some(Suggest {
        name: c.name.clone(),
        page: c.page.clone(),
        distance: u8::try_from(distance).unwrap_or(u8::MAX),
    })
}

/// The same name but for a trailing parenthetical or a leading article: not a misspelling.
fn trivially_apart(a: &str, b: &str) -> bool {
    let paren = |s: &str| s.rfind(" (").map_or(s.to_string(), |i| s[..i].to_string());
    let article = |s: &str| {
        ["a ", "an ", "the "]
            .iter()
            .find_map(|art| s.strip_prefix(art))
            .unwrap_or(s)
            .to_string()
    };
    paren(a) == paren(b) || article(a) == article(b)
}

/// Optimal-string-alignment distance when it is at most `bound`, else `None`.
fn distance_within(a: &str, b: &str, bound: usize) -> Option<usize> {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len().abs_diff(b.len()) > bound {
        return None;
    }
    let m = b.len();
    let mut two_back: Vec<usize> = vec![0; m + 1];
    let mut back: Vec<usize> = (0..=m).collect();
    let mut row: Vec<usize> = vec![0; m + 1];
    for i in 1..=a.len() {
        row[0] = i;
        let mut row_min = i;
        for j in 1..=m {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            let mut d = (back[j] + 1).min(row[j - 1] + 1).min(back[j - 1] + cost);
            if i > 1 && j > 1 && a[i - 1] == b[j - 2] && a[i - 2] == b[j - 1] {
                d = d.min(two_back[j - 2] + 1);
            }
            row[j] = d;
            row_min = row_min.min(d);
        }
        if row_min > bound {
            return None;
        }
        let spent = std::mem::replace(&mut two_back, back);
        back = std::mem::replace(&mut row, spent);
    }
    let d = back[m];
    (d <= bound).then_some(d)
}

/// Item candidates off the database's keys and pages, as [`super::gaps_keys::item_gap_key`] and
/// [`loose_key`] spell them.
pub fn item_candidates(pages: &[(String, String)]) -> Vec<Candidate> {
    pages
        .iter()
        .map(|(key, page)| Candidate {
            key: loose_key(&super::gaps_keys::item_gap_key(key)),
            name: page.clone(),
            page: page.clone(),
        })
        .collect()
}

/// Spell candidates off the effective catalog, once per process; a spell's name is its page.
pub fn spell_candidates() -> &'static [Candidate] {
    static ALL: OnceLock<Vec<Candidate>> = OnceLock::new();
    ALL.get_or_init(|| {
        eqlog::spelldb::shared()
            .spells
            .iter()
            .map(|s| Candidate {
                key: loose_key(&spell_gap_key(&s.name)),
                name: s.name.clone(),
                page: s.name.clone(),
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::distance_within;

    #[test]
    fn a_transposition_counts_one_and_the_bound_cuts_the_work_short() {
        assert_eq!(distance_within("teir'dal arcane insignia", "tier'dal arcane insignia", 2), Some(1));
        assert_eq!(distance_within("bone chips", "bone chops", 1), Some(1));
        assert_eq!(distance_within("bane chaps", "bone chips", 1), None);
        assert_eq!(distance_within("bane chaps", "bone chips", 2), Some(2));
        assert_eq!(distance_within("a", "abcd", 2), None, "the length gap alone refuses it");
        assert_eq!(distance_within("same", "same", 1), Some(0));
    }
}
