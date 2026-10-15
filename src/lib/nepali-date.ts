import NepaliDateLib, { dateConfigMap as configMap } from "nepali-date-converter";

/*
 * Bikram Sambat (BS) ⇄ Gregorian (AD) dates. AD dates are plain "YYYY-MM-DD" strings, like the
 * rest of the app, so there's no timezone shifting: the converter only ever sees calendar dates.
 * BS months are 0-indexed (0 = Baisakh). Supported range: BS 2000–2090.
 */

type NepaliDateInstance = { getBS(): { year: number; month: number; date: number; day: number }; toJsDate(): Date };
type NepaliDateCtor = { new (date: Date): NepaliDateInstance; new (year: number, month: number, date: number): NepaliDateInstance };
const NepaliDate = ((NepaliDateLib as unknown as { default?: NepaliDateCtor }).default ?? NepaliDateLib) as unknown as NepaliDateCtor;
const dateConfig = configMap as unknown as Record<number, Record<string, number>>;

export const BS_MONTHS = ["बैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कार्तिक", "मंसिर", "पुष", "माघ", "फागुन", "चैत"] as const;
export const BS_MONTHS_EN = ["Baisakh", "Jestha", "Asar", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"] as const;
/** Sunday first, as on Nepali wall calendars. */
export const BS_WEEKDAYS = ["आइत", "सोम", "मंगल", "बुध", "बिही", "शुक्र", "शनि"] as const;

export type BsDate = { year: number; month: number; date: number };

const DIGITS = "०१२३४५६७८९";
/** 2083 → "२०८३" */
export const devanagari = (n: number | string) => String(n).replace(/[0-9]/g, (d) => DIGITS[Number(d)]!);

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-10-16" → { year: 2083, month: 5, date: 30 }, or null outside the supported range. */
export function adToBs(isoDate: string): BsDate | null {
  const [y, m, d] = isoDate.split("-").map(Number);
  try {
    const { year, month, date } = new NepaliDate(new Date(y!, m! - 1, d!)).getBS();
    return { year, month, date };
  } catch {
    return null;
  }
}

/** BS date → "YYYY-MM-DD" (AD). */
export function bsToAd(year: number, month: number, date: number): string {
  const d = new NepaliDate(year, month, date).toJsDate();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function daysInBsMonth(year: number, month: number) {
  return Object.values(dateConfig[year] ?? {})[month] ?? 30;
}

/** The month after (+1) or before (−1) a BS month. */
export function shiftBsMonth(year: number, month: number, by: 1 | -1) {
  const m = month + by;
  return m < 0 ? { year: year - 1, month: 11 } : m > 11 ? { year: year + 1, month: 0 } : { year, month: m };
}

/** "2026-10-16" → "30 Ashwin 2083" (empty outside the supported range). */
export function bsLabel(isoDate: string) {
  const bs = adToBs(isoDate);
  return bs ? `${bs.date} ${BS_MONTHS_EN[bs.month]} ${bs.year}` : "";
}
