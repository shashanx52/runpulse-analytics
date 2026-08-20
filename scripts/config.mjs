// Shared world definition for the Velocity Run Series 2026 simulation.
//
// Everything fictional: the event, the organiser, the publications, every campaign
// name. Campaign naming follows a plausible ad-ops convention
// (vrs26_<channel>_<objective>_<audience>_<geo>) so the drill-down tabs have something
// structured to parse, the way a real account would.

export const SEASON_START = "2026-03-01";
export const SEASON_END = "2026-08-19"; // yesterday, relative to the demo "today"
export const EVENT_DATE = "2026-08-23";

export const CITIES = [
  { name: "Mumbai", code: "mum", share: 0.26, wealth: 1.14 },
  { name: "Delhi NCR", code: "del", share: 0.22, wealth: 1.06 },
  { name: "Bengaluru", code: "blr", share: 0.2, wealth: 1.18 },
  { name: "Hyderabad", code: "hyd", share: 0.14, wealth: 0.98 },
  { name: "Pune", code: "pun", share: 0.1, wealth: 0.94 },
  { name: "Chennai", code: "che", share: 0.08, wealth: 0.9 },
];

export const DEVICES = [
  { name: "mobile", share: 0.72, convMult: 0.92 },
  { name: "desktop", share: 0.2, convMult: 1.28 },
  { name: "tablet", share: 0.08, convMult: 1.05 },
];

// Ticket ladder. price drives GTV; propensity drives who buys what.
export const PRODUCTS = [
  { code: "FUN5K", name: "5K Fun Run", price: 799, share: 0.3, convMult: 1.22 },
  { code: "CHL10K", name: "10K Challenge", price: 1299, share: 0.24, convMult: 1.05 },
  { code: "HALF21K", name: "Half Marathon 21K", price: 1999, share: 0.17, convMult: 0.92 },
  { code: "FULL42K", name: "Full Marathon 42K", price: 2999, share: 0.07, convMult: 0.74 },
  { code: "CORP5", name: "Corporate Team Pack", price: 6499, share: 0.05, convMult: 0.55 },
  { code: "ELITE21K", name: "Elite Wave 21K", price: 3499, share: 0.04, convMult: 0.62 },
  { code: "KIDS2K", name: "Kids Dash 2K", price: 499, share: 0.09, convMult: 1.34 },
  { code: "CHAR10K", name: "Charity Bib 10K", price: 2499, share: 0.04, convMult: 0.7 },
];

// channel-level economics. cpm in rupees, ctr is click-through on impressions,
// q is a downstream quality multiplier applied to the lead rate.
// `sat` is the auction-saturation exponent: the effective CPM rises as
// (daily channel spend / ref)^sat, so landings grow like spend^(1-sat) rather than
// linearly. Without this the simulated world has constant returns to ad spend, every
// response curve fits an elasticity of 1, and a budget optimiser has nothing to say.
// Search saturates fastest because query volume is finite no matter what you bid;
// broad social saturates slowly; LinkedIn is spending so little it is nowhere near its
// ceiling; print is bought by the insertion, so it barely saturates at all.
export const CHANNELS = {
  meta: { label: "Meta", paid: true, cpm: 168, ctr: 0.0138, q: 1.0, decay: 0.86, sat: 0.22, ref: 150000 },
  google: { label: "Google", paid: true, cpm: 260, ctr: 0.021, q: 1.24, decay: 0.9, sat: 0.38, ref: 62000 },
  linkedin: { label: "LinkedIn", paid: true, cpm: 486, ctr: 0.0061, q: 0.82, decay: 0.8, sat: 0.12, ref: 32000 },
  print: { label: "Print", paid: true, cpm: 0, ctr: 0, q: 0.6, decay: 1, sat: 0.04, ref: 200000 },
  organic: { label: "Organic", paid: false, q: 1.35 },
  email: { label: "Email", paid: false, q: 1.62 },
  referral: { label: "Referral", paid: false, q: 1.12 },
  affiliate: { label: "Affiliate", paid: false, q: 0.78 },
};

const C = (name, city, objective, budget, from, to, extra = {}) => ({
  name,
  city,
  objective,
  budget,
  from,
  to,
  ...extra,
});

// --- Meta ------------------------------------------------------------------
export const META_CAMPAIGNS = [
  C("vrs26_meta_prospect_broad_natl", null, "prospecting", 0.185, "2026-03-01", "2026-08-19"),
  C("vrs26_meta_prospect_interest_mum", "Mumbai", "prospecting", 0.088, "2026-03-01", "2026-08-19"),
  C("vrs26_meta_prospect_interest_blr", "Bengaluru", "prospecting", 0.074, "2026-03-08", "2026-08-19"),
  C("vrs26_meta_lookalike_1p_natl", null, "lookalike", 0.096, "2026-04-02", "2026-08-19"),
  C("vrs26_meta_retarget_landers_natl", null, "retargeting", 0.081, "2026-03-18", "2026-08-19"),
  C("vrs26_meta_retarget_cart_natl", null, "retargeting", 0.062, "2026-03-22", "2026-08-19"),
  C("vrs26_meta_brand_video_natl", null, "brand", 0.07, "2026-03-01", "2026-06-30"),
  C("vrs26_meta_conv_earlybird_mum", "Mumbai", "conversion", 0.058, "2026-03-01", "2026-05-15"),
  C("vrs26_meta_conv_earlybird_del", "Delhi NCR", "conversion", 0.052, "2026-03-01", "2026-05-15"),
  C("vrs26_meta_conv_lastcall_natl", null, "conversion", 0.079, "2026-07-10", "2026-08-19"),
  C("vrs26_meta_adv_shopping_natl", null, "advantage", 0.068, "2026-05-01", "2026-08-19"),
  C("vrs26_meta_prospect_runclub_pun", "Pune", "prospecting", 0.035, "2026-04-10", "2026-08-19"),
  C("vrs26_meta_prospect_corp_hyd", "Hyderabad", "prospecting", 0.032, "2026-04-18", "2026-08-19"),
  // deliberately fatigues and is switched off — the Analysis tab should catch it
  C("vrs26_meta_retarget_abandon_che", "Chennai", "retargeting", 0.02, "2026-05-05", "2026-07-24", {
    fatigueFrom: "2026-06-20",
  }),
];

export const META_SEGMENTS = [
  "broad_18_34",
  "broad_35_54",
  "int_running",
  "int_fitness",
  "lal_purchasers_2pct",
  "lal_leads_5pct",
  "rt_web_30d",
  "rt_cart_7d",
  "rt_video_75",
  "corp_wellness",
];

export const CREATIVE_TYPES = [
  { name: "video", share: 0.32, ctrMult: 1.18, convMult: 1.06, fatigue: 0.82 },
  { name: "carousel", share: 0.24, ctrMult: 1.05, convMult: 1.12, fatigue: 0.9 },
  { name: "static", share: 0.26, ctrMult: 0.88, convMult: 0.95, fatigue: 0.95 },
  { name: "story", share: 0.12, ctrMult: 1.24, convMult: 0.86, fatigue: 0.75 },
  { name: "collection", share: 0.06, ctrMult: 0.96, convMult: 1.2, fatigue: 0.93 },
];

export const CREATIVE_THEMES = [
  "finishline",
  "citystreets",
  "medalshot",
  "trainingplan",
  "teamrun",
  "sunrise",
  "kidsdash",
  "testimonial",
  "countdown",
  "pricedrop",
];

// --- Google ----------------------------------------------------------------
export const GOOGLE_CAMPAIGNS = [
  C("vrs26_gads_search_brand_natl", null, "search_brand", 0.104, "2026-03-01", "2026-08-19", { qMult: 1.9 }),
  C("vrs26_gads_search_generic_marathon_natl", null, "search_generic", 0.152, "2026-03-01", "2026-08-19", { qMult: 1.15 }),
  C("vrs26_gads_search_generic_10k_natl", null, "search_generic", 0.096, "2026-03-14", "2026-08-19", { qMult: 1.1 }),
  C("vrs26_gads_pmax_all_natl", null, "pmax", 0.146, "2026-04-01", "2026-08-19", { qMult: 1.0 }),
  C("vrs26_gads_pmax_mum", "Mumbai", "pmax", 0.078, "2026-04-01", "2026-08-19", { qMult: 1.02 }),
  C("vrs26_gads_pmax_blr", "Bengaluru", "pmax", 0.068, "2026-04-08", "2026-08-19", { qMult: 1.04 }),
  C("vrs26_gads_display_remarketing_natl", null, "display", 0.072, "2026-03-20", "2026-08-19", { qMult: 0.66 }),
  C("vrs26_gads_yt_instream_natl", null, "youtube", 0.088, "2026-04-15", "2026-08-19", { qMult: 0.58 }),
  C("vrs26_gads_yt_shorts_natl", null, "youtube", 0.056, "2026-05-20", "2026-08-19", { qMult: 0.62 }),
  C("vrs26_gads_search_competitor_natl", null, "search_generic", 0.048, "2026-05-01", "2026-08-19", { qMult: 0.84 }),
  C("vrs26_gads_discovery_feed_natl", null, "discovery", 0.054, "2026-06-01", "2026-08-19", { qMult: 0.74 }),
  C("vrs26_gads_search_corp_hyd", "Hyderabad", "search_generic", 0.038, "2026-05-10", "2026-08-19", { qMult: 1.06 }),
];

// --- LinkedIn --------------------------------------------------------------
// Two short bursts rather than a continuous buy, which is how B2B money on a
// consumer event actually gets spent.
export const LINKEDIN_CAMPAIGNS = [
  C("vrs26_li_corp_challenge_natl", null, "corporate", 0.28, "2026-04-06", "2026-05-08"),
  C("vrs26_li_sponsored_brand_natl", null, "brand", 0.18, "2026-04-06", "2026-05-08"),
  C("vrs26_li_inmail_hr_leads_natl", null, "leadgen", 0.16, "2026-06-15", "2026-07-17"),
  C("vrs26_li_conv_teamreg_mum", "Mumbai", "conversion", 0.14, "2026-06-15", "2026-07-17"),
  C("vrs26_li_conv_teamreg_blr", "Bengaluru", "conversion", 0.12, "2026-06-15", "2026-07-17"),
  C("vrs26_li_doc_ad_wellness_natl", null, "leadgen", 0.12, "2026-06-22", "2026-07-17"),
];

export const LINKEDIN_AUDIENCES = [
  "hr_decision_makers",
  "corporate_wellness",
  "fitness_enthusiasts",
  "running_clubs",
  "senior_management",
];

// --- Print -----------------------------------------------------------------
export const PUBLICATIONS = [
  { name: "Metro Morning Herald", city: "Mumbai", rate: 165000, reach: 890000 },
  { name: "The Urban Chronicle", city: "Delhi NCR", rate: 154000, reach: 820000 },
  { name: "Deccan Daily Express", city: "Hyderabad", rate: 92000, reach: 540000 },
  { name: "Bay City Times", city: "Chennai", rate: 82000, reach: 470000 },
  { name: "Capital Post", city: "Delhi NCR", rate: 108000, reach: 610000 },
  { name: "Peninsula Weekly", city: "Bengaluru", rate: 98000, reach: 505000 },
  { name: "Sportsline Monthly", city: "Mumbai", rate: 64000, reach: 210000 },
  { name: "City Pulse Tabloid", city: "Pune", rate: 54000, reach: 295000 },
];

// weighted: an event buys a lot of small strips and the odd full page, not the
// other way round
export const PRINT_SLOTS = [
  { name: "Strip Ad", w: 0.40, size: 0.22 },
  { name: "Quarter Page", w: 0.25, size: 0.30 },
  { name: "Half Page", w: 0.20, size: 0.55 },
  { name: "Full Page", w: 0.12, size: 1.0 },
  { name: "Jacket", w: 0.03, size: 1.45 },
];

// --- utm_source universe ---------------------------------------------------
export const SOURCES = [
  { name: "facebook", channel: "meta", w: 0.36 },
  { name: "instagram", channel: "meta", w: 0.55 },
  { name: "audience_network", channel: "meta", w: 0.09 },
  { name: "google_search", channel: "google", w: 0.52 },
  { name: "google_pmax", channel: "google", w: 0.24 },
  { name: "google_display", channel: "google", w: 0.1 },
  { name: "youtube", channel: "google", w: 0.14 },
  { name: "linkedin", channel: "linkedin", w: 1.0 },
  { name: "print_qr", channel: "print", w: 1.0 },
  { name: "organic_search", channel: "organic", w: 0.54 },
  { name: "direct", channel: "organic", w: 0.34 },
  { name: "reddit", channel: "organic", w: 0.06 },
  { name: "quora", channel: "organic", w: 0.06 },
  { name: "email_newsletter", channel: "email", w: 0.62 },
  { name: "email_lifecycle", channel: "email", w: 0.26 },
  { name: "email_transactional", channel: "email", w: 0.12 },
  { name: "referral_runclub", channel: "referral", w: 0.3 },
  { name: "referral_blog", channel: "referral", w: 0.24 },
  { name: "referral_partner_gym", channel: "referral", w: 0.28 },
  { name: "whatsapp_share", channel: "referral", w: 0.18 },
  { name: "affiliate_dealhub", channel: "affiliate", w: 0.34 },
  { name: "affiliate_couponkart", channel: "affiliate", w: 0.28 },
  { name: "affiliate_fitrewards", channel: "affiliate", w: 0.22 },
  { name: "influencer_pacerpro", channel: "affiliate", w: 0.16 },
];

export const EMAIL_CAMPAIGNS = [
  C("vrs26_email_launch_announce", null, "lifecycle", 0.12, "2026-03-01", "2026-03-14"),
  C("vrs26_email_earlybird_w1", null, "lifecycle", 0.1, "2026-03-15", "2026-04-05"),
  C("vrs26_email_earlybird_w2", null, "lifecycle", 0.09, "2026-04-06", "2026-04-27"),
  C("vrs26_email_trainingplan_drip", null, "nurture", 0.14, "2026-04-01", "2026-08-19"),
  C("vrs26_email_abandon_recovery", null, "lifecycle", 0.11, "2026-04-10", "2026-08-19"),
  C("vrs26_email_corp_outreach", null, "b2b", 0.07, "2026-04-15", "2026-07-20"),
  C("vrs26_email_pricerise_warning", null, "urgency", 0.08, "2026-05-10", "2026-05-25"),
  C("vrs26_email_relay_teams", null, "nurture", 0.06, "2026-05-20", "2026-07-31"),
  C("vrs26_email_expo_invite", null, "logistics", 0.05, "2026-07-15", "2026-08-19"),
  C("vrs26_email_lastcall_72h", null, "urgency", 0.1, "2026-08-05", "2026-08-19"),
  C("vrs26_email_bibcollection", null, "logistics", 0.04, "2026-08-10", "2026-08-19"),
  C("vrs26_email_winback_lapsed", null, "winback", 0.04, "2026-06-01", "2026-07-31"),
];

// --- injected data-quality incidents ---------------------------------------
// Every one of these is something the Data Quality and Analysis tabs are built to
// surface. Documented here so the demo can be honest about what it planted.
export const INCIDENTS = {
  // lead events stopped firing on Google traffic for three days
  leadOutage: { from: "2026-05-18", to: "2026-05-20", channel: "google", leadMult: 0.34 },
  // a crawler inflated organic landings in one city with almost no conversion
  botSpike: { from: "2026-06-25", to: "2026-07-02", channel: "organic", city: "Hyderabad", landMult: 2.3 },
  // spend restated upward after the fact on the last three days, as ad platforms do
  spendRestate: { days: 3, mult: 0.94 },
};
