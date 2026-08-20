import type { Unit } from "./types";

export const EVENT_NAME = process.env.EVENT_NAME || "Velocity Run Series 2026";
export const EVENT_DATE = process.env.EVENT_DATE || "2026-08-23";
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

/** The four paid channels. Everything else is earned or owned. */
export const PAID_CHANNELS = ["meta", "google", "linkedin", "print"];

export const CHANNEL_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  linkedin: "LinkedIn",
  print: "Print",
  organic: "Organic",
  email: "Email",
  referral: "Referral",
  affiliate: "Affiliate",
  all: "All",
};

/** levels whose `entity` is "<parent> | <city>" and therefore carry a city */
export const CITY_LEVELS = [
  "channel_city",
  "source_city",
  "meta_campaign_city",
  "google_campaign_city",
  "linkedin_campaign_city",
  "print_campaign_city",
  "product_city",
];

export const MET = [
  "landed",
  "lead_submitted",
  "pay_now_attempt",
  "conversions",
  "gtv",
  "spend",
] as const;

export interface ViewDef {
  key: string;
  label: string;
  icon: string;
  hint: string;
}

/**
 * Twelve tabs, in the order a reader should meet them: what happened, then where the
 * money went channel by channel, then how to read it, then what happens next.
 * No auth in this project, so every tab is always present.
 */
export const VIEWS: ViewDef[] = [
  { key: "overall", label: "Overall", icon: "dashboard", hint: "Blended funnel, channel mix, daily trend" },
  { key: "meta", label: "Meta Ads", icon: "megaphone", hint: "Campaign → ad set → creative" },
  { key: "google", label: "Google Ads", icon: "search", hint: "Campaign type → campaign → city" },
  { key: "linkedin", label: "LinkedIn Ads", icon: "briefcase", hint: "Audience → campaign, B2B corporate buy" },
  { key: "print", label: "Print Ads", icon: "newspaper", hint: "Publication, slot and negotiated rate" },
  { key: "marketing", label: "Marketing Mix", icon: "radio", hint: "Every channel side by side" },
  { key: "city", label: "City wise", icon: "map", hint: "Six cities, funnel and efficiency" },
  { key: "product", label: "Ticket Mix", icon: "ticket", hint: "Which bib sells, at what price" },
  { key: "analysis", label: "Analysis", icon: "activity", hint: "Movers, flags, funnel diagnostics" },
  { key: "forecast", label: "Forecast", icon: "trending", hint: "Ridge + Fourier projection to race day" },
  { key: "ml", label: "ML Lab", icon: "brain", hint: "Propensity model, response curves, optimiser" },
  { key: "quality", label: "Data Quality", icon: "shield", hint: "Reconciliation and tracking faults" },
  { key: "chatbot", label: "AI Analyst", icon: "message", hint: "Ask the dataset a question" },
];

export const METRICS: Record<string, { col: string; unit: Unit }> = {
  Landed: { col: "landed", unit: "count" },
  Leads: { col: "lead_submitted", unit: "count" },
  "Pay Initiated": { col: "pay_now_attempt", unit: "count" },
  Registrations: { col: "conversions", unit: "count" },
  "GTV ₹": { col: "gtv", unit: "rupee" },
  "Spend ₹": { col: "spend", unit: "rupee" },
  "Landed→Lead %": { col: "L2L", unit: "pct" },
  "Lead→Pay %": { col: "L2P", unit: "pct" },
  "Pay→Reg %": { col: "P2C", unit: "pct" },
  "Landed→Reg %": { col: "L2C", unit: "pct" },
  ROAS: { col: "ROAS", unit: "ratio" },
  "CAC ₹": { col: "CPA", unit: "rupee" },
};

export const UNIT_TITLE: Record<Unit, string> = {
  count: "Volume",
  rupee: "₹ Value",
  pct: "Funnel %",
  ratio: "Efficiency",
};

// ============================== themes ==============================
export interface Theme {
  key: string;
  label: string;
  icon: string;
  PAGE: string;
  SURFACE: string;
  SURFACE2: string;
  INK: string;
  INK2: string;
  MUTED: string;
  GRID: string;
  AXIS: string;
  BORDER: string;
  BORDER2: string;
  SHADOW: string;
  HOVER: string;
  ACCENT: string;
  ACCENT2: string;
  GLOW: string;
  GOOD: string;
  CRIT: string;
  WARN: string;
  CAT: string[];
  FUNNEL: string[];
}

/** Teal/indigo, deliberately nothing like a newspaper palette. */
export const THEMES: Record<string, Theme> = {
  midnight: {
    key: "midnight",
    label: "Midnight",
    icon: "moon",
    PAGE: "#0a0f14",
    SURFACE: "#121a22",
    SURFACE2: "#18222c",
    INK: "#eef4f8",
    INK2: "#a8b8c6",
    MUTED: "#6c7f8f",
    GRID: "#1d2831",
    AXIS: "#2a3742",
    BORDER: "rgba(255,255,255,0.08)",
    BORDER2: "rgba(255,255,255,0.16)",
    SHADOW: "0 14px 34px rgba(0,0,0,.5)",
    HOVER: "rgba(255,255,255,.05)",
    ACCENT: "#19c8a8",
    ACCENT2: "#0e9b83",
    GLOW: "rgba(25,200,168,.3)",
    GOOD: "#2fd08a",
    CRIT: "#ff6b6b",
    WARN: "#f7b955",
    CAT: ["#19c8a8", "#5b8cf5", "#f7b955", "#e8698f", "#9b7bf0", "#54c9e8", "#7fd15a", "#f2874f"],
    FUNNEL: ["#a5ece0", "#5ed9c2", "#19c8a8", "#0b7a67"],
  },
  daylight: {
    key: "daylight",
    label: "Daylight",
    icon: "sun",
    PAGE: "#f4f7f9",
    SURFACE: "#ffffff",
    SURFACE2: "#f8fafc",
    INK: "#0d1620",
    INK2: "#42556a",
    MUTED: "#8798a8",
    GRID: "#e8edf2",
    AXIS: "#cfd8e0",
    BORDER: "rgba(13,22,32,0.1)",
    BORDER2: "rgba(13,22,32,0.18)",
    SHADOW: "0 12px 28px rgba(13,22,32,.09)",
    HOVER: "rgba(13,22,32,.035)",
    ACCENT: "#0d9488",
    ACCENT2: "#0b6f66",
    GLOW: "rgba(13,148,136,.16)",
    GOOD: "#08875a",
    CRIT: "#d1344b",
    WARN: "#b4690e",
    CAT: ["#0d9488", "#3560d8", "#c07708", "#c9457a", "#6d4fd0", "#1a8fb0", "#4f9c2a", "#d1631f"],
    FUNNEL: ["#b8e6e0", "#68c9bd", "#0d9488", "#075e56"],
  },
  slate: {
    key: "slate",
    label: "Slate",
    icon: "layers",
    PAGE: "#1b1f27",
    SURFACE: "#242a34",
    SURFACE2: "#2c333f",
    INK: "#f0f2f6",
    INK2: "#aeb6c4",
    MUTED: "#79839a",
    GRID: "#2f3745",
    AXIS: "#3d4757",
    BORDER: "rgba(255,255,255,0.09)",
    BORDER2: "rgba(255,255,255,0.18)",
    SHADOW: "0 14px 32px rgba(0,0,0,.42)",
    HOVER: "rgba(255,255,255,.05)",
    ACCENT: "#7c9cf5",
    ACCENT2: "#5476dc",
    GLOW: "rgba(124,156,245,.28)",
    GOOD: "#4fd18b",
    CRIT: "#f4707f",
    WARN: "#f0b64c",
    CAT: ["#7c9cf5", "#4fd18b", "#f0b64c", "#f4707f", "#b18cf2", "#4fc4dd", "#93d857", "#f28a55"],
    FUNNEL: ["#c8d6fb", "#9fb6f8", "#7c9cf5", "#4a68c4"],
  },
};

export const THEME_ORDER = ["midnight", "daylight", "slate"];

export const CITY_ORDER = ["Mumbai", "Delhi NCR", "Bengaluru", "Hyderabad", "Pune", "Chennai"];

export function cityColor(theme: Theme, city: string): string {
  const i = CITY_ORDER.indexOf(city);
  return i < 0 ? theme.MUTED : theme.CAT[i % theme.CAT.length];
}

export function channelColor(theme: Theme, channel: string): string {
  const order = ["meta", "google", "linkedin", "print", "organic", "email", "referral", "affiliate"];
  const i = order.indexOf(channel.toLowerCase());
  return i < 0 ? theme.MUTED : theme.CAT[i % theme.CAT.length];
}
