// Synthetic demonstration fixtures. Everything here is invented: the state,
// the districts, the groups, and every issuing body are fictional on purpose
// (invariant 7 — nothing fabricated may look real). No real tender,
// department, reference number, or officer is imitated. Every record is
// written with is_synthetic = true where the table carries the flag.

import { renderProfileForEmbedding } from "../lib/profiles/renderForEmbedding";

export const SEED_STATE = "Samridhi Pradesh (fictional)";

export const DISTRICTS = [
  "Chandanpur",
  "Ektanagar",
  "Phulbari",
  "Sitamani",
] as const;

// Deterministic UUIDs are what make seeding idempotent: the same logical
// record always gets the same id, so a second run conflicts and inserts
// nothing. Block = entity family, index = position within it.
export function seedId(block: number, index: number): string {
  const b = block.toString(16).padStart(4, "0");
  const i = index.toString(16).padStart(12, "0");
  return `5eed0000-${b}-4000-8000-${i}`;
}

export const FEDERATION_ID = seedId(0xf, 1);
export const SEED_SOCIAL_WORKER_ID = seedId(0xa, 1);
export const SEED_BOOKKEEPER_ID = seedId(0xa, 2);

export type Discipline = "regular" | "irregular" | "poor_thrift_with_deliveries";

export interface GroupDef {
  index: number; // 1-based, stable
  name: string;
  village: string;
  district: (typeof DISTRICTS)[number];
  formedOn: string;
  discipline: Discipline;
  skills: string[];
  product: string;
  unitsPerMonth: number;
  minLeadTimeDays: number;
  equipment: string[];
}

// Twelve groups, four districts, formation dates spread across eight years so
// maturity genuinely varies. Capacities are deliberately uneven so the hard
// filters eliminate real candidates instead of passing everything through.
export const GROUPS: GroupDef[] = [
  { index: 1, name: "Asha Tailoring Mahila Samiti", village: "Baniya Tola", district: "Chandanpur", formedOn: "2018-03-01", discipline: "regular", skills: ["tailoring", "stitching"], product: "school uniforms", unitsPerMonth: 2500, minLeadTimeDays: 15, equipment: ["sewing machines"] },
  { index: 2, name: "Kiran Uniform Stitchers", village: "Rani Khera", district: "Ektanagar", formedOn: "2020-06-01", discipline: "regular", skills: ["tailoring"], product: "school uniforms", unitsPerMonth: 800, minLeadTimeDays: 20, equipment: ["sewing machines"] },
  { index: 3, name: "Bunkar Two-Loom Collective", village: "Tant Ghar", district: "Phulbari", formedOn: "2019-02-01", discipline: "irregular", skills: ["handloom weaving"], product: "handloom cotton fabric", unitsPerMonth: 300, minLeadTimeDays: 30, equipment: ["two looms"] },
  { index: 4, name: "Phulbari Pickles Collective", village: "Aam Bagh", district: "Phulbari", formedOn: "2021-04-01", discipline: "regular", skills: ["pickling", "food processing"], product: "mango pickles", unitsPerMonth: 1200, minLeadTimeDays: 7, equipment: ["steel vats"] },
  { index: 5, name: "Sitamani Preserves Group", village: "Mitha Pur", district: "Sitamani", formedOn: "2024-02-01", discipline: "irregular", skills: ["food processing"], product: "fruit preserves", unitsPerMonth: 350, minLeadTimeDays: 10, equipment: ["bottling unit"] },
  { index: 6, name: "Coir Shakti Samooh", village: "Naral Danga", district: "Ektanagar", formedOn: "2019-11-01", discipline: "regular", skills: ["coir work"], product: "coir doormats", unitsPerMonth: 900, minLeadTimeDays: 21, equipment: ["coir spinner"] },
  { index: 7, name: "Kagaz Mahila Udyog", village: "Lekhan Pura", district: "Phulbari", formedOn: "2020-10-01", discipline: "regular", skills: ["paper work", "packaging"], product: "paper bags", unitsPerMonth: 15000, minLeadTimeDays: 10, equipment: ["creasing machine"] },
  // The multivariate case: poor thrift regularity, but two completed
  // deliveries and clean loan repayment — the readiness scorer must show
  // more than a savings threshold.
  { index: 8, name: "Ektanagar Catering Sangha", village: "Chowk Bazar", district: "Ektanagar", formedOn: "2018-09-01", discipline: "poor_thrift_with_deliveries", skills: ["cooking", "catering"], product: "cooked meals catering", unitsPerMonth: 4000, minLeadTimeDays: 5, equipment: ["community kitchen"] },
  { index: 9, name: "Chandanpur Handloom Weavers", village: "Resham Gali", district: "Chandanpur", formedOn: "2019-08-01", discipline: "regular", skills: ["handloom weaving", "dyeing"], product: "handloom cotton fabric", unitsPerMonth: 2000, minLeadTimeDays: 25, equipment: ["eight looms"] },
  { index: 10, name: "Sabun Swabhiman Samiti", village: "Saaf Nagar", district: "Sitamani", formedOn: "2023-05-01", discipline: "irregular", skills: ["soap making"], product: "washing soap bars", unitsPerMonth: 5000, minLeadTimeDays: 12, equipment: ["soap moulds"] },
  { index: 11, name: "Bans Kala Bamboo Craft", village: "Bans Tola", district: "Sitamani", formedOn: "2025-07-01", discipline: "irregular", skills: ["bamboo craft"], product: "bamboo baskets", unitsPerMonth: 600, minLeadTimeDays: 30, equipment: ["hand tools"] },
  { index: 12, name: "Nirmal Detergent Mandal", village: "Dhulai Ghat", district: "Ektanagar", formedOn: "2022-08-01", discipline: "regular", skills: ["detergent making"], product: "detergent powder", unitsPerMonth: 2000, minLeadTimeDays: 14, equipment: ["mixing drums"] },
];

export function groupId(index: number): string {
  return seedId(1, index);
}

export function profileText(group: GroupDef): string {
  // Canonical rendering shared with the profile-save path.
  return renderProfileForEmbedding({
    skills: group.skills,
    capacity: [
      {
        product: group.product,
        unitsPerMonth: group.unitsPerMonth,
        minLeadTimeDays: group.minLeadTimeDays,
      },
    ],
    equipment: group.equipment,
  });
}

export interface OpportunityDef {
  index: number; // 1-based, stable
  title: string;
  what: string;
  qtyAmount: number;
  qtyUnit: string;
  quality: string | null;
  // Open opportunities get a deadline relative to the seed run; historical
  // (delivered) ones a fixed past date.
  deadlineDaysFromNow?: number;
  pastDeadline?: string;
  eligibility: string[];
  payment: string;
  penalties: string | null;
  sizeClass: "small" | "medium" | "large";
  // When set, the seed also writes a completed match (+ verification +
  // group decision) for this group index — delivery track record.
  completedBy?: number;
}

const ELIGIBILITY = [
  "Registered women's self-help groups of Samridhi Pradesh (fictional)",
  "Valid group bank account",
];
const PAYMENT_STANDARD = "50% on delivery, 50% within 45 days of inspection";
const PENALTY_STANDARD = "1% deduction per week of delay, capped at 6%";

// Twenty synthetic opportunities. Issuing bodies are deliberately absurd so
// nobody mistakes them for a real department. Product wording reuses the
// exact capacity product terms so the token matcher behaves predictably.
export const OPPORTUNITIES: OpportunityDef[] = [
  { index: 1, title: "[SYNTHETIC] School uniforms, small lot — Office of Make-Believe Education, Samridhi (fictional)", what: "400 school uniforms for primary classes", qtyAmount: 400, qtyUnit: "uniforms", quality: "Cotton blend stitched to the sample approved by the fictional board", deadlineDaysFromNow: 120, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "small" },
  { index: 2, title: "[SYNTHETIC] School uniforms, district lot — Imaginary District Welfare Council (fictional)", what: "1800 school uniforms for upper primary classes", qtyAmount: 1800, qtyUnit: "uniforms", quality: "Colour-fast cotton per the fictional council sample", deadlineDaysFromNow: 150, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "large" },
  { index: 3, title: "[SYNTHETIC] School uniforms, urgent reorder — Storybook Schools Trust (fictional)", what: "600 school uniforms as an urgent reorder", qtyAmount: 600, qtyUnit: "uniforms", quality: null, deadlineDaysFromNow: 17, eligibility: ELIGIBILITY, payment: "100% within 30 days of delivery", penalties: PENALTY_STANDARD, sizeClass: "medium" },
  { index: 4, title: "[SYNTHETIC] Hostel catering, annual — Moonstone Hostel Trust (fictional)", what: "3000 cooked meals catering per month for a training hostel", qtyAmount: 3000, qtyUnit: "meals", quality: "Menu per the fictional trust's nutrition chart", deadlineDaysFromNow: 60, eligibility: ELIGIBILITY, payment: "Monthly, within 15 days of invoice", penalties: null, sizeClass: "medium" },
  { index: 5, title: "[SYNTHETIC] Event catering — Guild of Invented Festivities (fictional)", what: "1200 cooked meals catering for a three-day event", qtyAmount: 1200, qtyUnit: "meals", quality: null, deadlineDaysFromNow: 30, eligibility: ELIGIBILITY, payment: "100% on completion of the event", penalties: null, sizeClass: "small" },
  { index: 6, title: "[SYNTHETIC] Institutional catering, large — Castle-in-the-Air Academy (fictional)", what: "5000 cooked meals catering per month for residential students", qtyAmount: 5000, qtyUnit: "meals", quality: "Menu per the fictional academy's kitchen manual", deadlineDaysFromNow: 45, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "large" },
  { index: 7, title: "[SYNTHETIC] Paper bags, office stationery lot — Bureau of Fictitious Supplies (fictional)", what: "10000 paper bags for office stationery packaging", qtyAmount: 10000, qtyUnit: "bags", quality: "120 GSM recycled paper", deadlineDaysFromNow: 40, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "medium" },
  { index: 8, title: "[SYNTHETIC] Paper bags, small lot — Pretend Fair Committee (fictional)", what: "3000 paper bags for a trade fair", qtyAmount: 3000, qtyUnit: "bags", quality: null, deadlineDaysFromNow: 25, eligibility: ELIGIBILITY, payment: "100% on delivery", penalties: null, sizeClass: "small" },
  { index: 9, title: "[SYNTHETIC] Hostel linen fabric — Moonstone Hostel Trust (fictional)", what: "1500 metres of handloom cotton fabric for hostel linen", qtyAmount: 1500, qtyUnit: "metres", quality: "Plain weave, pre-shrunk", deadlineDaysFromNow: 75, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "medium" },
  { index: 10, title: "[SYNTHETIC] Guest-house linen, small lot — Invented Circuit House (fictional)", what: "250 metres of handloom cotton fabric for guest-house linen", qtyAmount: 250, qtyUnit: "metres", quality: null, deadlineDaysFromNow: 35, eligibility: ELIGIBILITY, payment: "100% within 30 days of delivery", penalties: null, sizeClass: "small" },
  { index: 11, title: "[SYNTHETIC] Mango pickles, canteen supply — Department of Imaginary Canteens (fictional)", what: "800 jars of mango pickles for staff canteens", qtyAmount: 800, qtyUnit: "jars", quality: "FSSAI-style labelling per the fictional canteen rulebook", deadlineDaysFromNow: 30, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: null, sizeClass: "medium" },
  { index: 12, title: "[SYNTHETIC] Fruit preserves, breakfast scheme — Storybook Schools Trust (fictional)", what: "300 jars of fruit preserves for a school breakfast scheme", qtyAmount: 300, qtyUnit: "jars", quality: null, deadlineDaysFromNow: 40, eligibility: ELIGIBILITY, payment: "100% on delivery", penalties: null, sizeClass: "small" },
  { index: 13, title: "[SYNTHETIC] Coir doormats — Bureau of Fictitious Supplies (fictional)", what: "700 coir doormats for government rest houses", qtyAmount: 700, qtyUnit: "doormats", quality: "Double-stitched edges", deadlineDaysFromNow: 50, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "medium" },
  { index: 14, title: "[SYNTHETIC] Washing soap for hostels — Moonstone Hostel Trust (fictional)", what: "4000 washing soap bars for hostel use", qtyAmount: 4000, qtyUnit: "bars", quality: "Minimum 70% total fatty matter", deadlineDaysFromNow: 45, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: null, sizeClass: "medium" },
  { index: 15, title: "[SYNTHETIC] Detergent powder — Imaginary District Welfare Council (fictional)", what: "1500 kilograms of detergent powder for institutional laundry", qtyAmount: 1500, qtyUnit: "kilograms", quality: null, deadlineDaysFromNow: 40, eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "medium" },
  { index: 16, title: "[SYNTHETIC] Bamboo baskets — Guild of Invented Festivities (fictional)", what: "500 bamboo baskets for festival distribution", qtyAmount: 500, qtyUnit: "baskets", quality: "Food-safe lacquer", deadlineDaysFromNow: 90, eligibility: ELIGIBILITY, payment: "100% on delivery", penalties: null, sizeClass: "medium" },
  // Historical, already delivered — these back the delivery track records.
  { index: 17, title: "[SYNTHETIC, DELIVERED] Mid-day catering pilot — Castle-in-the-Air Academy (fictional)", what: "2000 cooked meals catering for a pilot term", qtyAmount: 2000, qtyUnit: "meals", quality: null, pastDeadline: "2025-09-30", eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: null, sizeClass: "medium", completedBy: 8 },
  { index: 18, title: "[SYNTHETIC, DELIVERED] Exam-week catering — Office of Make-Believe Education (fictional)", what: "1500 cooked meals catering for exam-week centres", qtyAmount: 1500, qtyUnit: "meals", quality: null, pastDeadline: "2026-02-28", eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: null, sizeClass: "medium", completedBy: 8 },
  { index: 19, title: "[SYNTHETIC, DELIVERED] School uniforms, last season — Imaginary District Welfare Council (fictional)", what: "900 school uniforms delivered last season", qtyAmount: 900, qtyUnit: "uniforms", quality: null, pastDeadline: "2025-12-31", eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: PENALTY_STANDARD, sizeClass: "medium", completedBy: 1 },
  { index: 20, title: "[SYNTHETIC, DELIVERED] Hostel linen fabric, prior lot — Moonstone Hostel Trust (fictional)", what: "800 metres of handloom cotton fabric delivered previously", qtyAmount: 800, qtyUnit: "metres", quality: null, pastDeadline: "2026-01-31", eligibility: ELIGIBILITY, payment: PAYMENT_STANDARD, penalties: null, sizeClass: "medium", completedBy: 9 },
];

export function opportunityId(index: number): string {
  return seedId(3, index);
}
