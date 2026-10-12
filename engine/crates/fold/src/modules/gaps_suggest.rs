//! A near-miss suggestion on a gap row (owner ask, 2026-10-11): when one known name is a character
//! or two from the unknown one, the row says so and names the wiki page, so the owner can fix the
//! page's spelling. The motivating case: the log's ``Teir`Dal Arcane Insignia`` against the wiki's
//! `Tier'Dal Arcane Insignia` — one transposition after the quote fold.
//!
//! IT SPEAKS ONLY WHEN IT LOOKS RIGHT (owner refinement, same day, tightened 2026-10-12 after
//! "Bat Meat — probably Rat Meat"): a doubtful suggestion confuses people, so the rule prefers
//! silence. One substituted letter in a short name is a different word, so at distance 1 a
//! SUBSTITUTION counts only for a folded name of 16 characters or more, while a transposition
//! (Teir/Tier), an insertion or a deletion (Sac/Sack) counts from 8; distance 2 only from 16;
//! never 3. The candidate must be UNIQUE at that distance, have the same number of words, and
//! not differ only by a trailing parenthetical or a leading article. Names are
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

/// A folded name of 16 characters or more may be 2 off, or 1 by any edit; from 8 it may be 1 off
/// by a transposition, an insertion or a deletion; shorter, nothing is suggested.
const LONG_NAME: usize = 16;
const SHORT_NAME: usize = 8;

/// The one edit a distance-1 pair differs by.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Edit {
    Substitution,
    Transposition,
    InsertDelete,
}

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
    let len = key.chars().count();
    let bound = match len {
        n if n >= LONG_NAME => 2,
        n if n >= SHORT_NAME => 1,
        _ => return None,
    };
    let words = key.split_whitespace().count();
    let mut best: Option<(usize, &Candidate)> = None;
    let mut tied = false;
    for c in candidates {
        let Some(d) = within_reach(key, &c.key, (len, words, bound)) else {
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

/// A candidate's distance from the key when it passes every screen — the same number of words,
/// not trivially apart, within the bound, and not a lone substitution in a name under 16 — or
/// `None`. `shape` is the key's (length, words, bound), computed once.
fn within_reach(key: &str, candidate: &str, shape: (usize, usize, usize)) -> Option<usize> {
    let (len, words, bound) = shape;
    if candidate.split_whitespace().count() != words || trivially_apart(key, candidate) {
        return None;
    }
    let d = distance_within(key, candidate, bound)?;
    if d == 1 && len < LONG_NAME && single_edit(key, candidate) == Edit::Substitution {
        return None;
    }
    Some(d)
}

/// Which edit a distance-1 pair differs by: a length difference is an insertion or deletion, two
/// adjacent characters swapped a transposition, anything else a substitution.
fn single_edit(a: &str, b: &str) -> Edit {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.len() != b.len() {
        return Edit::InsertDelete;
    }
    let Some(i) = (0..a.len()).find(|&i| a[i] != b[i]) else {
        return Edit::Substitution;
    };
    if i + 1 < a.len() && a[i] == b[i + 1] && a[i + 1] == b[i] {
        Edit::Transposition
    } else {
        Edit::Substitution
    }
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
    use super::{distance_within, single_edit, Edit};

    #[test]
    fn the_one_edit_is_named() {
        assert_eq!(single_edit("bat meat", "rat meat"), Edit::Substitution);
        assert_eq!(single_edit("teir'dal", "tier'dal"), Edit::Transposition);
        assert_eq!(single_edit("egg sac", "egg sack"), Edit::InsertDelete);
        assert_eq!(single_edit("egg sack", "egg sac"), Edit::InsertDelete);
        assert_eq!(single_edit("same", "same"), Edit::Substitution, "no edit reads as the strictest kind");
    }

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
