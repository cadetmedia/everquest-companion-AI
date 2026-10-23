//! The gaps: names the log mentions that the committed wiki data has no record of (owner ask,
//! 2026-10-11) — items looted, received, bought or crafted; mobs looted, killed or considered;
//! spells cast — one row per name, so the scrape or the wiki can be fixed.
//!
//! NOTHING HERE ASKS THE APP TO FETCH. Every check reads a committed table — the item titles the
//! knowledge hands over at install, `known_mob`, the spell catalog — and none of those notes a
//! miss. Nothing is checked until the knowledge is installed, so the parity construction, which
//! installs none, publishes empty rows and the goldens cannot see this module.
//!
//! WHO IS A PLAYER. The log spells players and pets exactly like named mobs: one capitalized word.
//! The rule, measured on the owner's log (2026-10-11; 3194 deaths, 279 cons, 3419 loots):
//!
//!   * a loot source is a corpse the player looted, so it is a mob whatever its shape — the eleven
//!     single-word sources were all named mobs (Terror, Gorgalosk, Bazzzazzt…);
//!   * a death's name is a mob when it is mob-shaped (an article, or more than one word), and a
//!     player-shaped name counts only when its killer is absent or player-shaped too (you, a
//!     player, a pet). Of the 26 single-word names that died, the 15 that pass were named mobs bar
//!     one pet; the 11 that died to a mob were the group's own characters and their pets. A name
//!     that dies to a mob is filed as a player for the rest of the fold and its row withdrawn;
//!   * a /con's name is a mob only when mob-shaped: of 21 single-word names conned, 18 were the
//!     group's characters and pets (the same name at a dozen rising levels), and a named mob that
//!     is only ever conned is the gap this leaves;
//!   * a name that speaks as a pet or names its leader is a player's pet, filed as a player.
//!
//! What counts as known beyond the exact lookups — the wiki's spellings of a mob, a mob's pet, an
//! AA or an item's effect cast as a spell — is in [`super::gaps_names`] and [`super::gaps_keys`].

use super::gaps_coin::KillCoin;
use super::gaps_details::{stamp_of, Details};
use super::gaps_keys::{aa_known, item_gap_key, loose_key, spell_gap_key, spell_known, spell_via_redirect, ItemIndex};
use super::gaps_names::{no_mob, no_spell, MobNames};
use super::gaps_offers::{offer_of, Offer, Standings};
use super::gaps_players::{caught_of, hail_of, speaker_of, Players};
use super::gaps_specials::MobSpecials;
use super::gaps_suggest::{item_candidates, spell_candidates, suggest, Candidate, Suggest};
use super::gaps_locs::MobLocs;
use super::gaps_trade::{merchant_of, KillFactions};
use crate::event::Event;
use crate::jsfn::item_base_name;
use crate::knowledge::Knowledge;
use crate::message_overlay::message_text_of;
use crate::modules::consider::mob_key;
use crate::modules::resist::world::is_player_shaped_name;
use crate::EqModule;
use eqlog::names::strip_rank_tail;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};

/// Rows served per domain; the rest are counted in `totals` and nowhere else.
const CAP_PER_DOMAIN: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Domain {
    Item,
    Mob,
    Spell,
    /// An NPC the log saw trading whom the wiki does not list as a merchant (`gaps_trade.rs`).
    Merchant,
    /// A KNOWN item the player foraged, with where (`gaps_craft.rs`): no unknown name, but the proof
    /// its page's `|foraged` is checked against (shared/gapForage.ts). Served after the four, with
    /// no total of its own.
    Forage,
    /// A known item or mob met whose page says it may not be in Legends (`gaps_notices.rs`).
    Notice,
    /// A task the log named: one row per quest, with its steps (`gaps_quest_log.rs`).
    Quest,
}

impl Domain {
    const ALL: [Domain; 6] = [Domain::Item, Domain::Mob, Domain::Spell, Domain::Merchant, Domain::Notice, Domain::Quest];

    fn as_str(self) -> &'static str {
        match self {
            Domain::Item => "item",
            Domain::Mob => "mob",
            Domain::Spell => "spell",
            Domain::Merchant => "merchant",
            Domain::Forage => "forage",
            Domain::Notice => "notice",
            Domain::Quest => "quest",
        }
    }
}

/// One name nothing committed knows, with every way the log named it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GapRow {
    domain: &'static str,
    /// As the log spelled it; for a spell, with the rank stripped.
    name: String,
    /// `looted`, `dropped-by`, `received`, `bought`, `crafted`, `killed`, `considered`, `cast` — in
    /// the order first seen.
    kinds: Vec<&'static str>,
    count: u32,
    /// The log's own stamp, `2026-09-23 17:54:48`.
    first: String,
    last: String,
    /// Where, from whom, and the lines themselves — see [`super::gaps_details`].
    details: Details,
    /// A one-word name only hailed or conned that the log has not yet shown to be an NPC — see
    /// [`super::gaps_players`]. Set when served.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    maybe_player: bool,
    /// A Notices row's page and notices (`gaps_notices.rs`).
    #[serde(flatten, skip_serializing_if = "Option::is_none")]
    notice: Option<Noticed>,
    /// The page a wiki redirect sends this name to, when only that redirect knows it (`gaps_redirects.rs`).
    #[serde(skip_serializing_if = "Option::is_none")]
    via_redirect: Option<String>,
}

#[derive(Default)]
pub struct GapsModule {
    knowledge: Option<Arc<dyn Knowledge>>,
    /// Every key the committed item database is keyed by, exactly and loosely (`gaps_keys.rs`).
    items: ItemIndex,
    /// The same keys with their pages, for a near-miss suggestion — see [`super::gaps_suggest`].
    item_candidates: Vec<Candidate>,
    /// Every effect an item states, under [`loose_key`]: a cast of one is a known spell.
    item_effects: HashSet<String>,
    /// The mob catalog's names under the wiki's spellings — see [`super::gaps_names`].
    mob_names: MobNames,
    /// Suggestions already made, per (domain, key): a snapshot re-serve costs nothing.
    suggests: Mutex<HashMap<(Domain, String), Option<Suggest>>>,
    rows: HashMap<(Domain, String), GapRow>,
    /// Every distinct key checked per domain, known or not: the denominator the tab prints.
    seen: HashMap<Domain, HashSet<String>>,
    /// Mob keys the log showed dying to a mob: players and pets, never rows again.
    players: HashSet<String>,
    /// Pages with a not-Legends or deletion notice, for the Notices domain (`gaps_notices.rs`).
    notices: Notices,
    /// Who gave each item, who took it, which quest it moved (`gaps_quests.rs`). Served as `questFacts`.
    quests: QuestFacts,
    /// Each task's steps, for the Quests rows (`gaps_quest_log.rs`).
    quest_log: QuestLogs,
    /// Each NPC's role from the client's target line (`gaps_roles.rs`).
    roles: Roles,
    /// Where each item was fished (`gaps_fished.rs`).
    fish: Fished,
    /// The player's own pets, as the log spells them (`petClaim`/`petSay`): their kills are the
    /// player's (owner, 2026-10-22: Gonekn's kill moved the player's factions). Served as `ownPets`.
    own_pets: std::collections::BTreeSet<String>,
    /// The last `zone` event: the label a mention is filed under.
    zone: Option<String>,
    /// Which factions each kill moved, for the tab's check against the mob pages.
    kill_factions: KillFactions,
    /// What each mob's corpse paid, for a page's `MONEY DROPS` (`gaps_coin.rs`).
    kill_coin: KillCoin,
    /// Where a con or hail beside a `/loc` placed each mob (`gaps_locs.rs`).
    mob_locs: MobLocs,
    /// Who chats (a player) and which hailed or conned one-word names are NPCs (`gaps_players.rs`).
    who: Players,
    /// What each mob was seen to do, Rampage or Flurry, and its fight numbers (`gaps_specials.rs`).
    specials: MobSpecials,
    /// Each name's last /con rung: the standing a merchant's offer is made at (`gaps_offers.rs`).
    standings: Standings,
    /// The last tradeskill tick and combine, paired by their second (`gaps_craft.rs`).
    combines: craft::Combines,
    /// What each merchant quoted or sold the player, for its page's `items_sold` (`gaps_stock.rs`).
    stock: stock::Stock,
    /// The slot the event feed reads each con's marks from (`gaps_marks.rs`).
    con_marks: ConMarks,
    seq: i64,
    announce: crate::announce::Announce,
}

impl GapsModule {
    pub fn new() -> Self {
        Self::default()
    }

    fn clear(&mut self) {
        self.rows.clear();
        self.seen.clear();
        self.players.clear();
        self.own_pets.clear();
        self.quests.clear();
        self.quest_log.clear();
        self.roles.clear();
        self.fish.clear();
        self.kill_factions.clear();
        self.kill_coin.clear();
        self.mob_locs.clear();
        self.who.clear();
        self.specials.clear();
        self.standings.clear();
        self.combines.clear();
        self.stock.clear();
        if let Ok(mut cache) = self.suggests.lock() {
            cache.clear();
        }
    }

    fn fold(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            "zone" => {
                self.zone = ev.str("zone").map(str::to_string);
                self.specials.zone(ev.str("zone"))
            }
            // The player's own `/who` row, parsed apart, names a player like any /who row (gaps_players.rs),
            // so a self-con (a /con with nothing targeted) is never a row (owner, 2026-10-22: "this is me").
            "selfWho" => self.unparsed(ev),
            "loot" | "itemReceived" | "itemMerge" => self.item_event(ev),
            "purchase" | "coin" | "unknown" => self.trade(ev),
            "death" => self.kill_factions_of(ev) | self.specials.death(ev) | self.death(ev),
            "consider" => self.considered(ev),
            "damage" | "miss" => self.specials.event(ev),
            "castBegin" | "otherCastBegin" => self.spell(ev),
            "petClaim" | "petSay" => self.own_pet(ev.str("name")),
            // Handing an item to it is meeting it (owner, 2026-10-19: a fallen froglok, only traded with).
            "offer" => self.turn_in(ev) | self.npc_met(ev.str("npc"), "offered", ev),
            "allyPetLeader" => self.player_pet(ev.str("pet")),
            "skillUp" => self.skill_up(ev),
            // `You complete the trade with X.` spends the open trade (gaps_quest_log.rs); nothing else.
            _ => self.quest_trade(ev),
        }
    }

    /// The four events that name an item; a loot line names its corpse too.
    fn item_event(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            // A destroy line is the parser's one loot shape that is a later disposal rather than
            // the loot itself: it says what became of the item, not where it came from.
            "loot" if ev.str("disposition") == Some("destroyed") => self.disposal(ev),
            "loot" => self.item(ev, "looted") | self.mob(ev.str("source"), "dropped-by", ev),
            "itemReceived" => self.quest_give(ev) | self.received(ev),
            "purchase" => self.item(ev, "bought"),
            _ => self.merge(ev),
        }
    }

    /// An item merge names what the merge made — and a spell-rank merge (`Odium IX`) makes a
    /// spell, not an item, so a name the spell catalog knows is no gap and is not even a name
    /// checked. Only a merge that is neither a known item nor a known spell is filed.
    fn merge(&mut self, ev: &Event) -> bool {
        let is_spell = ev.str("item").is_some_and(spell_known);
        // A merge on Legends is a mote fusion, not a tradeskill: no Player Crafted on its page.
        !is_spell && self.item(ev, "fused")
    }

    fn item(&mut self, ev: &Event, kind: &'static str) -> bool {
        ev.str("item").is_some_and(|name| self.item_named(name, kind, ev))
    }

    fn item_named(&mut self, name: &str, kind: &'static str, ev: &Event) -> bool {
        // A known scroll is an item the log named and we could place: checked, never a row.
        let known = self.items.known(name);
        if let Some(page) = self.items.via_redirect(name) {
            return self.redirected(Domain::Item, item_gap_key(name), &item_base_name(name), page, kind, ev);
        }
        self.note(Domain::Item, item_gap_key(name), &item_base_name(name), known, kind, ev)
    }

    /// A later disposal of an item already filed: its disposition and its line go on the row,
    /// and nothing else — not the zone (the item is not from here), not the count, not a kind.
    /// A name the log only ever destroyed has no row to carry it and is not filed.
    fn disposal(&mut self, ev: &Event) -> bool {
        let Some(row) = ev.str("item").and_then(|name| self.rows.get_mut(&(Domain::Item, item_gap_key(name)))) else {
            return false;
        };
        row.details.disposal(ev);
        true
    }

    fn mob(&mut self, name: Option<&str>, kind: &'static str, ev: &Event) -> bool {
        let Some(name) = name else {
            return false;
        };
        if self.players.contains(&mob_key(name)) || no_mob(name) {
            return false;
        }
        let (known, filed) = self.knowledge.as_deref().map_or((false, name), |k| self.filed_as(k, name));
        if let Some(page) = (self.knowledge.as_ref()).and_then(|k| self.mob_names.via_redirect(k.as_ref(), name)) {
            return self.redirected(Domain::Mob, mob_key(name), name, page, kind, ev);
        }
        self.note(Domain::Mob, mob_key(filed), filed, known, kind, ev)
    }

    /// A purchase (an item and its merchant), a vendor sale or a corpse's coin (held for the kill
    /// after it), or an unparsed line (a price quote, or a faction line held for the kill after it).
    fn trade(&mut self, ev: &Event) -> bool {
        match ev.kind() {
            "purchase" => self.item_event(ev) | self.merchant(ev) | self.stocked(ev),
            "coin" => {
                self.kill_coin.line(ev);
                self.merchant(ev)
            }
            "unknown" => {
                self.kill_factions.line(ev);
                let zone = self.zone.clone();
                self.mob_locs.line(ev, zone.as_deref()) | self.quest_line(ev) | self.unparsed(ev) | self.merchant(ev) | self.offered(ev) | self.stocked(ev)
            }
            _ => self.merchant(ev),
        }
    }

    /// A merchant's offer for an item (owner, 2026-10-20: "more information is gathered about the
    /// items if a merchant tries to sell"): an unknown item is filed as `appraised`, placed nowhere,
    /// with the offer and the player's standing with that merchant on its row (`gaps_offers.rs`).
    fn offered(&mut self, ev: &Event) -> bool {
        let filed = |o: &Offer| self.item_named(o.item, "appraised", ev);
        let Some(o) = offer_of(message_text_of(ev.raw())).filter(filed) else {
            return false;
        };
        let (at, standing) = (stamp_of(ev.raw()).unwrap_or_default(), self.standings.of(o.merchant));
        let row = self.rows.get_mut(&(Domain::Item, item_gap_key(o.item)));
        row.is_some_and(|r| r.details.offer(&o, standing, self.zone.as_deref(), &at))
    }

    /// An unparsed line the parser has no family for: a forage, a hail, or a player's chat.
    fn unparsed(&mut self, ev: &Event) -> bool {
        let text = message_text_of(ev.raw());
        if let Some(t) = target_of(text) {
            return self.targeted(&t);
        }
        if let Some(item) = caught_of(text) {
            return self.fished(item, ev);
        }
        if let Some(filed) = self.item_line(text, ev) {
            return filed;
        }
        if let Some(name) = hail_of(text) {
            return self.met(name, true, ev);
        }
        // `A fallen froglok says, '...'` (owner, 2026-10-19): a mob-shaped name speaking is an NPC met.
        if let Some(name) = speaker_of(text) {
            if self.npc_met(Some(name), "spoke", ev) {
                return true;
            }
        }
        match self.who.line(text, ev.ts()) {
            Some(player) => self.rows.remove(&(Domain::Mob, mob_key(&player))).is_some(),
            None => false,
        }
    }

    /// An NPC met by giving it an item or hearing it speak. Only a mob-shaped name (`a fallen
    /// froglok`): a one-word name says and trades as players do, so it takes the hail/con path.
    fn npc_met(&mut self, name: Option<&str>, kind: &'static str, ev: &Event) -> bool {
        match name {
            Some(n) if !is_player_shaped_name(n) => self.mob(Some(n), kind, ev),
            _ => false,
        }
    }

    /// A mob hailed or conned. A mob-shaped name is filed as before; a one-word name is filed too
    /// (owner, 2026-10-19) unless the log showed it to be a player, and served "may be a player"
    /// until it shows an NPC.
    fn met(&mut self, name: &str, hail: bool, ev: &Event) -> bool {
        let kind = if hail { "hailed" } else { "considered" };
        if !is_player_shaped_name(name) {
            return self.mob(Some(name), kind, ev);
        }
        // A con above any player's level is an NPC outright (gaps_players.rs, PLAYER_LEVEL_CAP).
        if !hail && self.who.conned_at(name, ev.int("level")) {
            self.players.remove(&mob_key(name));
        } else if self.who.is_player(name) {
            return false;
        }
        let zone = self.zone.clone();
        self.who.candidate(name, zone.as_deref(), ev.ts(), hail);
        self.mob(Some(name), kind, ev)
    }

    /// An NPC the event shows trading, filed unless the wiki lists it as a merchant.
    fn merchant(&mut self, ev: &Event) -> bool {
        let Some((name, kind)) = merchant_of(ev) else {
            return false;
        };
        let known = (self.knowledge.as_ref()).is_some_and(|k| k.known_merchant(name));
        self.note(Domain::Merchant, mob_key(name), name, known, kind, ev)
    }

    /// A death claims the faction lines and the corpse coin just before it (`gaps_trade.rs`,
    /// `gaps_coin.rs`).
    fn kill_factions_of(&mut self, ev: &Event) -> bool {
        let zone = self.zone.clone();
        ev.str("name").is_some_and(|mob| self.kill_factions.death(ev, mob, zone.as_deref()) | self.kill_coin.death(mob, ev.ts()))
    }

    /// The death rule from the module header: a player-shaped name that dies to a mob is a player
    /// (or a pet), filed as one, and its row — if a kill or a /con filed one earlier — withdrawn.
    fn death(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("name") else {
            return false;
        };
        // A one-word killer the catalog has (`Terror`) is a mob too, so its victim is a pet.
        let known = |k: &str| self.knowledge.as_ref().is_some_and(|kn| kn.known_mob(k));
        let killer_is_mob = ev.str("killer").is_some_and(|k| !is_player_shaped_name(k) || known(k));
        if is_player_shaped_name(name) && killer_is_mob {
            let key = mob_key(name);
            self.players.insert(key.clone());
            return self.rows.remove(&(Domain::Mob, key)).is_some();
        }
        self.mob(Some(name), "killed", ev)
    }

    /// A player's pet, by its own words: filed as a player, and any row it had withdrawn.
    /// The player's own pet: never a row, and its kills count as the player's.
    fn own_pet(&mut self, name: Option<&str>) -> bool {
        let added = name.is_some_and(|n| self.own_pets.insert(n.to_string()));
        self.player_pet(name) | added
    }

    fn player_pet(&mut self, name: Option<&str>) -> bool {
        let Some(key) = name.map(mob_key) else {
            return false;
        };
        self.players.insert(key.clone());
        self.rows.remove(&(Domain::Mob, key)).is_some()
    }

    fn spell(&mut self, ev: &Event) -> bool {
        let Some(name) = ev.str("spell").filter(|n| !no_spell(n)) else {
            return false;
        };
        let key = spell_gap_key(name);
        let known =
            spell_known(name) || aa_known(name) || self.item_effects.contains(&loose_key(&key));
        let display = strip_rank_tail(name);
        let effect = self.item_effects.contains(&loose_key(&key));
        if let Some(spell) = spell_via_redirect(name).filter(|_| !aa_known(name) && !effect) {
            return self.redirected(Domain::Spell, key, display.trim(), spell, "cast", ev);
        }
        self.note(Domain::Spell, key, display.trim(), known, "cast", ev)
    }

    /// One mention. Counted as seen either way; a row only when nothing committed knows the name.
    fn note(
        &mut self,
        domain: Domain,
        key: String,
        name: &str,
        known: bool,
        kind: &'static str,
        ev: &Event,
    ) -> bool {
        self.seen.entry(domain).or_default().insert(key.clone());
        if known {
            return self.noticed(domain, &key, name, kind, ev);
        }
        let at = stamp_of(ev.raw()).unwrap_or_default();
        let row = self.rows.entry((domain, key)).or_insert_with(|| GapRow {
            domain: domain.as_str(),
            name: name.to_string(),
            kinds: Vec::new(),
            count: 0,
            first: at.clone(),
            last: String::new(),
            details: Details::default(),
            maybe_player: false,
            notice: None,
            via_redirect: None,
        });
        // An offer is a sale's start: it says where the item went, not where it came from.
        let zone = if kind == "appraised" { None } else { self.zone.as_deref() };
        row.details.record(domain.as_str(), ev, zone);
        row.count += 1;
        row.last = at;
        if !row.kinds.contains(&kind) {
            row.kinds.push(kind);
        }
        // A consider line sentence-cases the article ("A gorgon"); the loot line's lowercase
        // spelling is the mob's own, so it wins once seen.
        let lower_initial = |s: &str| s.starts_with(|c: char| c.is_ascii_lowercase());
        if domain == Domain::Mob && lower_initial(name) && !lower_initial(&row.name) {
            row.name = name.to_string();
        }
        true
    }

    /// The domain's rows with their keys, most mentioned first, then by name; the first
    /// CAP_PER_DOMAIN of them.
    fn served(&self, domain: Domain) -> Vec<(&String, &GapRow)> {
        let mut rows: Vec<(&String, &GapRow)> = self
            .rows
            .iter()
            .filter(|((d, _), _)| *d == domain)
            .map(|((_, k), r)| (k, r))
            .collect();
        rows.sort_by(|a, b| b.1.count.cmp(&a.1.count).then_with(|| a.1.name.cmp(&b.1.name)));
        rows.truncate(CAP_PER_DOMAIN);
        rows
    }

    /// The row as served: its fields, and `suggest` when one known name is within reach.
    fn serve_row(&self, domain: Domain, key: &str, row: &GapRow) -> Value {
        let mut v = serde_json::to_value(row).unwrap_or(Value::Null);
        if domain == Domain::Mob && self.maybe_player(row) {
            v["maybePlayer"] = json!(true);
        }
        self.serve_extras(domain, key, &mut v);
        if let Some(s) = self.suggestion(domain, key) {
            v["suggest"] = json!(s);
        }
        v
    }

    /// Computed once per (domain, key) and cached; mobs have no list to compare against.
    fn suggestion(&self, domain: Domain, key: &str) -> Option<Suggest> {
        let candidates: &[Candidate] = match domain {
            Domain::Item => &self.item_candidates,
            Domain::Spell => spell_candidates(),
            Domain::Mob | Domain::Merchant | Domain::Forage | Domain::Notice | Domain::Quest => return None,
        };
        let mut cache = self.suggests.lock().ok()?;
        cache
            .entry((domain, key.to_string()))
            .or_insert_with(|| suggest(&loose_key(key), candidates))
            .clone()
    }
}

impl EqModule for GapsModule {
    fn id(&self) -> &'static str {
        "gaps"
    }

    fn reset(&mut self) {
        self.clear();
        self.seq = 0;
        self.announce.reset();
    }

    fn on_event(&mut self, ev: &Event, _live: bool) {
        self.seq = ev.seq();
        if ev.kind() == "epoch" {
            self.clear();
            self.announce.changed(self.seq);
            return;
        }
        if self.knowledge.is_some() && self.fold(ev) {
            self.announce.changed(self.seq);
        }
    }

    /// Moves when a row is filed, grows or is withdrawn. See [`crate::announce`].
    fn published_seq(&self) -> Option<i64> {
        Some(self.announce.cursor())
    }

    fn snapshot(&self) -> Value {
        let mut rows: Vec<Value> = Vec::new();
        let mut totals = serde_json::Map::new();
        let mut seen = serde_json::Map::new();
        for d in Domain::ALL {
            rows.extend(self.served(d).into_iter().map(|(k, r)| self.serve_row(d, k, r)));
            let gaps = self.rows.keys().filter(|(k, _)| *k == d).count();
            totals.insert(d.as_str().to_string(), json!(gaps));
            let checked = self.seen.get(&d).map_or(0, HashSet::len);
            seen.insert(d.as_str().to_string(), json!(checked));
        }
        rows.extend(self.served(Domain::Forage).into_iter().map(|(k, r)| self.serve_row(Domain::Forage, k, r)));
        let kill_factions = self.kill_factions.serve();
        let mob_locs = self.mob_locs.serve();
        let mob_specials = self.specials.serve();
        json!({ "seq": self.seq, "state": { "rows": rows, "totals": totals, "seen": seen, "killFactions": kill_factions, "mobLocs": mob_locs, "mobSpecials": mob_specials, "mobCoin": self.kill_coin.serve(), "ownPets": self.own_pets } })
    }

    fn install_knowledge(&mut self, k: &Arc<dyn Knowledge>) {
        let index = k.gap_index();
        self.items = ItemIndex::new(&index.item_pages).with_redirects(&index.item_redirects);
        self.item_candidates = item_candidates(&index.item_pages);
        let effect_key = |n: &String| loose_key(&spell_gap_key(n));
        self.item_effects = index.item_effects.iter().map(|(n, _)| effect_key(n)).collect();
        self.mob_names = MobNames::new(&index.mob_names).with_redirects(&index.mob_redirects);
        self.notices = Notices::new(&index);
        self.knowledge = Some(Arc::clone(k));
    }
}

/// A forage's zone and a combine's tradeskill: a child module, so it files onto the rows.
#[path = "gaps_craft.rs"]
mod craft;
#[path = "gaps_quests.rs"]
mod quests;
use quests::QuestFacts;
#[path = "gaps_quest_log.rs"]
mod quest_log;
use quest_log::QuestLogs;
#[path = "gaps_roles.rs"]
mod roles;
use roles::{target_of, Roles};
#[path = "gaps_fished.rs"]
mod fished;
use fished::Fished;
#[path = "gaps_notices.rs"]
mod notices;
#[path = "gaps_redirects.rs"]
mod redirects;
#[path = "gaps_stock.rs"]
mod stock;
#[path = "gaps_marks.rs"]
pub mod marks;
use marks::ConMarks;
use notices::{Noticed, Notices};

#[cfg(test)]
#[path = "gaps_tests.rs"]
mod tests;
