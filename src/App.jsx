import React, { useState, useMemo, useEffect } from "react";
import {
  LayoutDashboard, Users, CalendarCheck, GraduationCap, Wallet, Briefcase,
  Search, Plus, X, ChevronRight, ChevronDown, CheckCircle2, XCircle, Clock3,
  TrendingUp, TrendingDown, Phone, Mail, School, ArrowLeft, Pencil, Trash2,
  BadgeCheck, AlertTriangle, LogOut, Settings2, ImagePlus, MapPin, Compass,
  ClipboardList, Lock, Sliders, Printer, Eye, Download, Award, CalendarDays, Bell, Send, UserRound,
  UserCheck, LogIn, DoorOpen, CalendarRange, Wand2, RefreshCw, BookOpen, ExternalLink,
  Contact, Library, BookPlus, Undo2
} from "lucide-react";

/* ---------------------------------------------------------------------- *
 *  SCHOOL CONFIG — curriculum structure that doesn't change per record.
 *  Students, staff, grades, attendance, payments, fee amounts, classes,
 *  subjects, and school profile info all live in Supabase now (see
 *  fetchSchoolData below) instead of being seeded here, so nothing resets
 *  when you sign in, and classes/subjects can be added from the app.
 * ---------------------------------------------------------------------- */
const DEFAULT_TERM = "Term 1"; // fallback only — the real current term is set in School Settings
const TERMS = ["Term 1", "Term 2", "Term 3"];
const EXAM_YEARS = (() => {
  const y = new Date().getFullYear();
  return [y - 1, y, y + 1].map(String);
})();
const GRADING_SYSTEMS = ["KJSEA-8Level", "KPSEA-4Level"];
// Used only as a fallback for the first render, before the real lists load
// from Supabase (see `classes`/`subjects` state in App).
const FALLBACK_CLASSES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
const FALLBACK_SUBJECTS = ["Mathematics", "English", "Kiswahili", "Science & Technology", "Social Studies", "Creative Arts", "Religious Education"];

// Roles that carry "full access" capability inside the tabs they can each
// reach (students, staff, dashboard, attendance/grades for every class,
// timetable, events, exams, communication). Admin is an independent
// superuser that reaches every tab; Head Teacher / Deputy Head Teacher
// have the same in-tab capability but no longer see Fees, HR/Payroll, or
// School Setup (see FINANCE_HR_ROLES and isSuperAdminRole below). A Class
// Teacher is restricted to just attendance + grades for the one class
// named in their `class_teacher_of` field — enforced here in the UI and
// also at the database level via RLS.
const ADMIN_ROLES = ["Admin", "Head Teacher", "Deputy Head Teacher"];
const isAdminRole = (role) => ADMIN_ROLES.includes(role);
// Fees collection + HR/Payroll — the Clerk's job, plus Admin.
const FINANCE_HR_ROLES = ["Admin", "Clerk"];
const isFinanceHRRole = (role) => FINANCE_HR_ROLES.includes(role);
// School Setup is Admin-only now.
const isSuperAdminRole = (role) => role === "Admin";
const isFrontOfficeRole = (role) => ["Admin", "Receptionist"].includes(role);
const isLibraryRole = (role) => ["Admin", "Librarian"].includes(role);
// Every role a staff member can be assigned in the "Staff" area.
const STAFF_ROLES = ["Admin", "Head Teacher", "Deputy Head Teacher", "Class Teacher", "Subject Teacher", "Clerk", "Receptionist", "Librarian", "Subordinate Staff"];
const TEACHING_ROLES = ["Head Teacher", "Deputy Head Teacher", "Class Teacher", "Subject Teacher"];
const SUBORDINATE_DESIGNATIONS = ["Cook", "Groundsman", "Other"];

const money = (n) => `KSh ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const gradeLetter = (score) => (score >= 80 ? "EE" : score >= 50 ? "ME" : score >= 30 ? "AE" : "BE");
const gradeLabel = (letter) => ({ EE: "Exceeding Expectation", ME: "Meeting Expectation", AE: "Approaching Expectation", BE: "Below Expectation" }[letter]);
const gradeColor = (letter) => ({ EE: "#2f6f4a", ME: "#2f6f9e", AE: "#a1702c", BE: "#a1442c" }[letter]);
const initials = (name) => name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

/* ---------------------------------------------------------------------- *
 *  SUPABASE AUTH — real accounts, backed by Supabase's hosted Postgres +
 *  Auth. These calls go straight to Supabase's REST API with fetch, so no
 *  supabase-js bundle is needed. The anon/publishable key below is meant
 *  to be public — it can only do what the row-level-security policies on
 *  the `staff_profiles` table allow (see the migration that created it).
 * ---------------------------------------------------------------------- */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://nravzlpapxolmzgjqwws.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_Kh5GWC2h_Ga0qe5RmA3LKw_4CWL6BIW";

async function supabaseSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Invalid email or password.");
  return data; // { access_token, refresh_token, user, ... }
}

async function supabaseRefreshSession(refreshToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Session expired.");
  return data;
}

// Wraps localStorage so a stay-signed-in feature can exist without ever
// throwing. Claude's own in-chat artifact preview runs in a sandboxed
// frame where storage access can be blocked — there it just quietly does
// nothing and you sign in fresh each time. Once this file is hosted for
// real (e.g. on Netlify, which is how this app is meant to run), it's a
// normal webpage with normal storage, and sessions persist properly.
const SESSION_KEY = "brightfuture_session";
const sessionStore = {
  save(refreshToken) {
    try { window.localStorage.setItem(SESSION_KEY, JSON.stringify({ refreshToken })); } catch (e) { /* sandboxed preview — ignore */ }
  },
  read() {
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw).refreshToken : null;
    } catch (e) { return null; }
  },
  clear() {
    try { window.localStorage.removeItem(SESSION_KEY); } catch (e) { /* sandboxed preview — ignore */ }
  },
};

// Sends a password-reset email via Supabase Auth. The link inside it
// redirects back to wherever this app is currently running (Netlify, or
// this Claude preview) with a one-time recovery token in the URL.
async function supabaseRequestPasswordReset(email, redirectTo) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error_description || data.msg || data.message || "Couldn't send reset email.");
  }
  return true;
}

// Sets a new password using the one-time access token from a recovery link.
async function supabaseUpdatePassword(accessToken, newPassword) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || data.message || "Couldn't update password.");
  return data;
}

async function fetchStaffProfile(accessToken, userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/staff_profiles?id=eq.${userId}&select=*`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (!res.ok || !data.length) throw new Error("Signed in, but no staff profile was found for this account.");
  const s = data[0];
  return {
    id: s.id, name: s.name, role: s.role, subjects: s.subjects ? s.subjects.split(";") : [],
    classTeacherOf: s.class_teacher_of, phone: s.phone, email: s.email, photoUrl: s.photo_url,
    designation: s.designation,
  };
}

/* ---------------------------------------------------------------------- *
 *  SUPABASE DATA — generic REST helper plus the load/shape logic for
 *  every table. Nothing about students, grades, attendance, payments, or
 *  fees is seeded in this file anymore; it's all read from and written
 *  straight to Postgres, so it survives reloads and sign-outs.
 * ---------------------------------------------------------------------- */
async function pgFetch(path, token, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

async function fetchSchoolData(token) {
  const [students, grades, attendance, payments, feeRows] = await Promise.all([
    pgFetch("students?select=*&order=id", token),
    pgFetch("grades?select=*", token),
    pgFetch("attendance?select=*", token),
    pgFetch("payments?select=*&order=id", token),
    pgFetch("fee_structure?select=*", token),
  ]);
  return {
    students: students.map((s) => ({
      id: s.id, admissionNo: s.admission_no, name: s.name, gender: s.gender, class: s.class,
      guardian: s.guardian, relationship: s.relationship, phone: s.phone, enrolled: s.enrolled, status: s.status,
      photoUrl: s.photo_url,
    })),
    grades: grades.map((g) => ({ studentId: g.student_id, subject: g.subject, term: g.term, score: g.score })),
    attendance: attendance.map((a) => ({ date: a.date, studentId: a.student_id, status: a.status })),
    payments: payments.map((p) => ({ id: p.id, studentId: p.student_id, amount: Number(p.amount), date: p.date, method: p.method, account: p.account || "School Fees" })),
    // feeStructure stays flat ({ class: amount }) and School-Fees-only, so
    // every existing due/balance calculation elsewhere keeps working
    // unchanged. The optional accounts (Food/Exams/Transport) get their own
    // per-class amounts in otherFeeStructure ({ account: { class: amount } }).
    feeStructure: Object.fromEntries(feeRows.filter((f) => (f.account || "School Fees") === "School Fees").map((f) => [f.class, Number(f.amount)])),
    otherFeeStructure: (() => {
      const byAccount = {};
      feeRows.forEach((f) => {
        const acct = f.account || "School Fees";
        if (acct === "School Fees") return;
        (byAccount[acct] = byAccount[acct] || {})[f.class] = Number(f.amount);
      });
      return byAccount;
    })(),
  };
}

async function fetchStaffDirectory(token) {
  const rows = await pgFetch("staff_profiles?select=*&order=id", token);
  return rows.map((s) => ({
    id: s.id, name: s.name, role: s.role, subjects: s.subjects ? s.subjects.split(";") : [],
    classTeacherOf: s.class_teacher_of, phone: s.phone, email: s.email, photoUrl: s.photo_url,
    designation: s.designation,
  }));
}

async function fetchClasses(token) {
  const rows = await pgFetch("classes?select=*&order=sort_order", token);
  return rows.map((r) => r.name);
}

async function fetchSubjects(token) {
  const rows = await pgFetch("subjects?select=*&order=sort_order", token);
  return rows.map((r) => r.name);
}

async function fetchSchoolSettings(token) {
  const rows = await pgFetch("school_settings?id=eq.1&select=*", token);
  const r = rows[0] || {};
  return {
    name: r.name || "Brightfuture Primary School", logoUrl: r.logo_url || "", address: r.address || "",
    motto: r.motto || "", vision: r.vision || "", email: r.email || "", contact: r.contact || "", location: r.location || "",
    termClosingDate: r.term_closing_date || "", nextTermOpeningDate: r.next_term_opening_date || "",
    arrivalCutoff: (r.arrival_cutoff || "07:20:00").slice(0, 5), departureCutoff: (r.departure_cutoff || "17:00:00").slice(0, 5),
    currentTerm: r.current_term || DEFAULT_TERM,
  };
}

/* ---------------------------------------------------------------------- *
 *  TIMETABLE — teaching assignments (who teaches what, to which class,
 *  how many periods a week), the shared day/period grid, and the
 *  generated entries themselves.
 * ---------------------------------------------------------------------- */
async function fetchTimetableAssignments(token) {
  const rows = await pgFetch("class_subject_teachers?select=*&order=class", token);
  return rows.map((r) => ({ id: r.id, class: r.class, subject: r.subject, teacherId: r.teacher_id, periodsPerWeek: r.periods_per_week }));
}

async function fetchTimetableSettings(token) {
  const rows = await pgFetch("timetable_settings?id=eq.1&select=*", token);
  const r = rows[0] || {};
  return {
    days: r.days && r.days.length ? r.days : ["Mon", "Tue", "Wed", "Thu", "Fri"],
    periodsPerDay: r.periods_per_day || 8,
    periodStartTime: r.period_start_time || "08:00",
    periodDurationMinutes: r.period_duration_minutes || 35,
    breaks: r.breaks || [],
  };
}

async function fetchTimetableEntries(token) {
  const rows = await pgFetch("timetable_entries?select=*", token);
  return rows.map((r) => ({ id: r.id, class: r.class, day: r.day, period: r.period, subject: r.subject, teacherId: r.teacher_id }));
}

/* ---------------------------------------------------------------------- *
 *  PAYROLL — per-staff pay details, editable statutory rates, and the
 *  history of generated payslips (each a frozen snapshot, so a later rate
 *  change never rewrites an already-issued payslip).
 * ---------------------------------------------------------------------- */
async function fetchStaffPayroll(token) {
  const rows = await pgFetch("staff_payroll?select=*", token);
  return rows.map((r) => ({
    staffId: r.staff_id, basicSalary: Number(r.basic_salary) || 0, houseAllowance: Number(r.house_allowance) || 0,
    transportAllowance: Number(r.transport_allowance) || 0, otherAllowance: Number(r.other_allowance) || 0,
    otherAllowanceLabel: r.other_allowance_label || "Other Allowance", kraPin: r.kra_pin || "", nssfNo: r.nssf_no || "",
    shifNo: r.shif_no || "", bankName: r.bank_name || "", bankAccount: r.bank_account || "",
  }));
}

async function fetchPayrollSettings(token) {
  const rows = await pgFetch("payroll_settings?id=eq.1&select=*", token);
  const r = rows[0] || {};
  return {
    payeBands: r.paye_bands || [
      { upTo: 24000, rate: 0.10 }, { upTo: 32333, rate: 0.25 }, { upTo: 500000, rate: 0.30 },
      { upTo: 800000, rate: 0.325 }, { upTo: null, rate: 0.35 },
    ],
    personalRelief: Number(r.personal_relief) || 2400,
    nssfTier1Limit: Number(r.nssf_tier1_limit) || 8000,
    nssfTier2Limit: Number(r.nssf_tier2_limit) || 72000,
    nssfRate: Number(r.nssf_rate) || 0.06,
    shifRate: Number(r.shif_rate) || 0.0275,
    shifMinimum: Number(r.shif_minimum) || 300,
    housingLevyRate: Number(r.housing_levy_rate) || 0.015,
  };
}

async function fetchPayslips(token) {
  const rows = await pgFetch("payslips?select=*&order=year.desc,month.desc,staff_name.asc", token);
  return rows.map((r) => ({
    id: r.id, staffId: r.staff_id, staffName: r.staff_name, month: r.month, year: r.year,
    basicSalary: Number(r.basic_salary) || 0, houseAllowance: Number(r.house_allowance) || 0,
    transportAllowance: Number(r.transport_allowance) || 0, otherAllowance: Number(r.other_allowance) || 0,
    otherAllowanceLabel: r.other_allowance_label || "", grossPay: Number(r.gross_pay) || 0, paye: Number(r.paye) || 0,
    nssf: Number(r.nssf) || 0, shif: Number(r.shif) || 0, housingLevy: Number(r.housing_levy) || 0,
    otherDeduction: Number(r.other_deduction) || 0, otherDeductionLabel: r.other_deduction_label || "",
    netPay: Number(r.net_pay) || 0, employerNssf: Number(r.employer_nssf) || 0, employerHousingLevy: Number(r.employer_housing_levy) || 0,
    createdAt: r.created_at,
  }));
}

/* ---------------------------------------------------------------------- *
 *  PAYMENT ACCOUNTS & EXPENDITURE — School Fees (compulsory) plus Food,
 *  Exams, and Transport (optional) are the four accounts students can pay
 *  into; expenditure records track which of those four accounts money was
 *  actually spent from, so each account's running balance (collected minus
 *  spent) can be shown.
 * ---------------------------------------------------------------------- */
const PAYMENT_ACCOUNTS = ["School Fees", "Food", "Exams", "Transport"];
const COMPULSORY_ACCOUNTS = ["School Fees"];

async function fetchExpenditures(token) {
  const rows = await pgFetch("expenditures?select=*&order=date.desc", token);
  return rows.map((r) => ({ id: r.id, account: r.account, amount: Number(r.amount) || 0, date: r.date, description: r.description, recordedBy: r.recorded_by, createdAt: r.created_at }));
}

async function fetchSmsMessages(token) {
  const rows = await pgFetch("sms_messages?select=*&order=created_at.desc", token);
  return rows.map((r) => ({
    id: r.id, message: r.message, audienceLabel: r.audience_label, recipientCount: r.recipient_count,
    costEstimate: r.cost_estimate, status: r.status, error: r.error, sentBy: r.sent_by, createdAt: r.created_at,
  }));
}

/* ---------------------------------------------------------------------- *
 *  FRONT OFFICE — Receptionist logs visitors (name, reason, date,
 *  comments). Admin can see it too.
 * ---------------------------------------------------------------------- */
async function fetchVisitors(token) {
  const rows = await pgFetch("visitors?select=*&order=visit_date.desc,created_at.desc", token);
  return rows.map((r) => ({ id: r.id, name: r.visitor_name, reason: r.reason, date: r.visit_date, comments: r.comments || "", recordedBy: r.recorded_by, createdAt: r.created_at }));
}
async function addVisitorRow(token, visitor, recordedBy) {
  const [row] = await pgFetch("visitors", token, {
    method: "POST",
    body: { visitor_name: visitor.name, reason: visitor.reason, visit_date: visitor.date, comments: visitor.comments || null, recorded_by: recordedBy },
  });
  return { id: row.id, name: row.visitor_name, reason: row.reason, date: row.visit_date, comments: row.comments || "", recordedBy: row.recorded_by, createdAt: row.created_at };
}

/* ---------------------------------------------------------------------- *
 *  LIBRARY — Librarian adds/tracks books and their issue/return status.
 *  Admin can see it too.
 * ---------------------------------------------------------------------- */
async function fetchLibraryBooks(token) {
  const rows = await pgFetch("library_books?select=*&order=title", token);
  return rows.map((r) => ({ id: r.id, title: r.title, author: r.author || "", isbn: r.isbn || "", category: r.category || "", totalCopies: r.total_copies, availableCopies: r.available_copies, addedBy: r.added_by, createdAt: r.created_at }));
}
async function addLibraryBookRow(token, book, addedBy) {
  const [row] = await pgFetch("library_books", token, {
    method: "POST",
    body: { title: book.title, author: book.author || null, isbn: book.isbn || null, category: book.category || null, total_copies: book.totalCopies, available_copies: book.totalCopies, added_by: addedBy },
  });
  return { id: row.id, title: row.title, author: row.author || "", isbn: row.isbn || "", category: row.category || "", totalCopies: row.total_copies, availableCopies: row.available_copies, addedBy: row.added_by, createdAt: row.created_at };
}
async function deleteLibraryBookRow(token, id) {
  await pgFetch(`library_books?id=eq.${id}`, token, { method: "DELETE", prefer: "return=minimal" });
}
async function updateLibraryBookCopiesRow(token, id, availableCopies) {
  await pgFetch(`library_books?id=eq.${id}`, token, { method: "PATCH", body: { available_copies: availableCopies }, prefer: "return=minimal" });
}
async function fetchBookIssues(token) {
  const rows = await pgFetch("book_issues?select=*&order=issued_date.desc", token);
  return rows.map((r) => ({ id: r.id, bookId: r.book_id, borrowerName: r.borrower_name, borrowerClass: r.borrower_class || "", issuedDate: r.issued_date, dueDate: r.due_date, returnedDate: r.returned_date, status: r.status, issuedBy: r.issued_by }));
}
async function issueBookRow(token, issue, issuedBy) {
  const [row] = await pgFetch("book_issues", token, {
    method: "POST",
    body: { book_id: issue.bookId, borrower_name: issue.borrowerName, borrower_class: issue.borrowerClass || null, issued_date: issue.issuedDate, due_date: issue.dueDate || null, status: "Issued", issued_by: issuedBy },
  });
  return { id: row.id, bookId: row.book_id, borrowerName: row.borrower_name, borrowerClass: row.borrower_class || "", issuedDate: row.issued_date, dueDate: row.due_date, returnedDate: row.returned_date, status: row.status, issuedBy: row.issued_by };
}
async function returnBookRow(token, id, returnedDate) {
  await pgFetch(`book_issues?id=eq.${id}`, token, { method: "PATCH", body: { status: "Returned", returned_date: returnedDate }, prefer: "return=minimal" });
}

// Pure — computes one payslip's figures from a staff member's pay details
// and the current statutory rates. Kept separate from any I/O so it's easy
// to preview before actually saving a payslip.
function computePayslip(pay, settings) {
  const gross = pay.basicSalary + pay.houseAllowance + pay.transportAllowance + pay.otherAllowance;

  // NSSF — Tier I on pay up to the lower limit, Tier II on the slice
  // between the lower and upper limits.
  const tier1 = Math.min(gross, settings.nssfTier1Limit) * settings.nssfRate;
  const tier2 = gross > settings.nssfTier1Limit
    ? (Math.min(gross, settings.nssfTier2Limit) - settings.nssfTier1Limit) * settings.nssfRate
    : 0;
  const nssf = tier1 + tier2;

  const shif = Math.max(gross * settings.shifRate, settings.shifMinimum);
  const housingLevy = gross * settings.housingLevyRate;

  // NSSF and the Housing Levy are both applied before PAYE.
  const taxablePay = Math.max(gross - nssf - housingLevy, 0);
  let paye = 0;
  let lower = 0;
  let remaining = taxablePay;
  for (const band of settings.payeBands) {
    const upTo = band.upTo == null ? Infinity : band.upTo;
    const width = upTo - lower;
    const amountInBand = Math.min(Math.max(remaining, 0), width);
    paye += amountInBand * band.rate;
    remaining -= amountInBand;
    lower = upTo;
    if (remaining <= 0) break;
  }
  paye = Math.max(paye - settings.personalRelief, 0);

  const totalStatutory = nssf + shif + housingLevy + paye;
  return {
    gross, nssf, shif, housingLevy, paye, totalStatutory,
    employerNssf: nssf, employerHousingLevy: housingLevy, // matched 1:1 under current rules
  };
}

// A subject counts as "PPI" (Pastoral Programme Instruction) if it's named
// exactly that, or mentions "pastoral" — lets the admin spell it out fully
// or abbreviate without the rule silently missing it.
function isPPISubject(subject) {
  const s = (subject || "").trim().toLowerCase();
  return s === "ppi" || s.includes("pastoral");
}
// Covers "Math", "Maths", "Mathematics".
function isMathSubject(subject) {
  return /^math/i.test((subject || "").trim());
}
// PG, PP1, PP2 (Playgroup / Pre-Primary), however the admin spelled the
// class name — with or without a space/dash ("PP 1", "PP-1", "PP1").
function isEarlyYearsClass(className) {
  const normalized = (className || "").replace(/[\s-]/g, "").toUpperCase();
  return normalized === "PG" || normalized === "PP1" || normalized === "PP2";
}
// Finds which break is lunch (by label, falling back to the last break of
// the day if none is explicitly named "lunch") and returns the period
// number it comes after — i.e. periods 1..this are "before lunch".
function findLunchBoundary(settings) {
  const breaks = settings.breaks || [];
  if (!breaks.length) return null;
  const lunch = breaks.find((b) => /lunch/i.test(b.label || "")) || breaks[breaks.length - 1];
  return Number(lunch.afterPeriod) || null;
}
// Reorders a (already-shuffled) list of candidate slots so every morning
// slot is tried before any afternoon one, while keeping the random order
// within each half. Used so that when a class doesn't have quite enough
// periods to fill the whole week, mornings stay fully packed and the empty
// ones land in the afternoon instead.
function prioritizeMorning(slots, lunchBoundary) {
  if (!lunchBoundary) return slots;
  const morning = slots.filter(([, p]) => p <= lunchBoundary);
  const afternoon = slots.filter(([, p]) => p > lunchBoundary);
  return [...morning, ...afternoon];
}

// Builds a clash-free weekly timetable from a list of teaching assignments
// ({ class, subject, teacherId, periodsPerWeek }) and a { days, periodsPerDay }
// grid. Pure function — no I/O, no React — so it's easy to reason about and
// re-run. Two constraints are enforced as hard rules: a class can't have two
// subjects in the same slot, and a teacher can't be in two classes at once.
// A softer rule — don't repeat a subject twice in one day for the same class
// — is tried first and relaxed only if a request can't otherwise be placed.
// Requests are interleaved round-by-round per class (one period of every
// subject before any subject gets its second) so a subject's periods spread
// across the week instead of clumping together, and slot order is shuffled
// per request so re-generating can find a different, possibly better, fit.
// Two school-specific rules run before the general round-robin: PPI is
// pinned to period 1 every Friday (using up one of that class's weekly PPI
// periods), and Mathematics is only ever placed in a period before lunch.
// A third rule caps entire classes: PG, PP1, and PP2 never have anything
// scheduled after lunch at all. For every other class, available slots are
// also filled morning-first, so mornings stay fully packed and if a class
// doesn't have quite enough weekly periods to fill the whole day, the
// leftover free periods land in the afternoon instead.
function computeTimetable(assignments, settings) {
  const days = settings.days && settings.days.length ? settings.days : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const periodsPerDay = settings.periodsPerDay || 8;

  const byClass = {};
  assignments.forEach((a) => {
    if (!a.teacherId || !a.periodsPerWeek) return;
    (byClass[a.class] = byClass[a.class] || []).push({ ...a });
  });

  const classGrid = {};        // classGrid[class][day][period] -> { subject, teacherId }
  const teacherGrid = {};      // teacherGrid[teacherId][day][period] -> class
  const classSubjectDay = {};  // classSubjectDay[class][day] -> Set(subject)
  Object.keys(byClass).forEach((cls) => {
    classGrid[cls] = {};
    classSubjectDay[cls] = {};
    days.forEach((d) => { classGrid[cls][d] = {}; classSubjectDay[cls][d] = new Set(); });
  });

  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const allSlots = [];
  days.forEach((d) => { for (let p = 1; p <= periodsPerDay; p++) allSlots.push([d, p]); });

  const unscheduled = [];
  const assign = (cls, d, p, subject, teacherId) => {
    classGrid[cls][d][p] = { subject, teacherId };
    (teacherGrid[teacherId] = teacherGrid[teacherId] || {});
    (teacherGrid[teacherId][d] = teacherGrid[teacherId][d] || {});
    teacherGrid[teacherId][d][p] = cls;
    classSubjectDay[cls][d].add(subject);
  };
  // maxPeriod optionally caps which periods are even considered (used to
  // keep Mathematics before lunch) — unlike the "same subject same day"
  // rule, this one is a hard rule and is never relaxed in the second pass.
  // Candidates are also reordered so morning slots get first refusal —
  // see prioritizeMorning — so mornings stay fully packed and any leftover
  // free periods land in the afternoon instead.
  const placeRequest = (cls, subject, teacherId, maxPeriod) => {
    let candidates = allSlots;
    if (maxPeriod) candidates = allSlots.filter(([, p]) => p <= maxPeriod);
    if (candidates.length === 0) { unscheduled.push({ class: cls, subject, teacherId, reason: "no period available before lunch" }); return; }
    const slotOrder = prioritizeMorning(shuffle(candidates), lunchBoundary);
    for (const [d, p] of slotOrder) {
      if (classGrid[cls][d][p]) continue;
      if (teacherGrid[teacherId]?.[d]?.[p]) continue;
      if (classSubjectDay[cls][d].has(subject)) continue;
      assign(cls, d, p, subject, teacherId);
      return;
    }
    for (const [d, p] of slotOrder) {
      if (classGrid[cls][d][p]) continue;
      if (teacherGrid[teacherId]?.[d]?.[p]) continue;
      assign(cls, d, p, subject, teacherId);
      return;
    }
    unscheduled.push({ class: cls, subject, teacherId });
  };

  // Rule 1 — PPI is always period 1 on Friday, for every class that has a
  // PPI assignment. Placed first so it claims that slot before anything
  // else can; consumes one of the class's weekly PPI periods.
  const fridayName = days.find((d) => /^fri/i.test(d));
  if (fridayName) {
    Object.keys(byClass).forEach((cls) => {
      const ppiRow = byClass[cls].find((r) => isPPISubject(r.subject));
      if (!ppiRow) return;
      const slotFree = !classGrid[cls][fridayName][1] && !teacherGrid[ppiRow.teacherId]?.[fridayName]?.[1];
      if (slotFree) {
        assign(cls, fridayName, 1, ppiRow.subject, ppiRow.teacherId);
        ppiRow.periodsPerWeek -= 1;
      } else {
        unscheduled.push({ class: cls, subject: ppiRow.subject, teacherId: ppiRow.teacherId, reason: "Friday period 1 already taken (likely a teacher clash with another class's PPI)" });
      }
    });
  }

  // Rule 2 — Mathematics only ever goes in a period before lunch, and PG /
  // PP1 / PP2 never have anything at all after lunch.
  const lunchBoundary = findLunchBoundary(settings);

  shuffle(Object.keys(byClass)).forEach((cls) => {
    const rows = byClass[cls].filter((r) => r.periodsPerWeek > 0);
    if (rows.length === 0) return;
    const maxRounds = Math.max(...rows.map((r) => r.periodsPerWeek));
    for (let round = 0; round < maxRounds; round++) {
      shuffle(rows).forEach((r) => {
        if (round < r.periodsPerWeek) {
          const maxPeriod = isEarlyYearsClass(cls) ? lunchBoundary : (isMathSubject(r.subject) ? lunchBoundary : null);
          placeRequest(cls, r.subject, r.teacherId, maxPeriod);
        }
      });
    }
  });

  const entries = [];
  Object.keys(byClass).forEach((cls) => {
    days.forEach((d) => {
      for (let p = 1; p <= periodsPerDay; p++) {
        const cell = classGrid[cls][d][p];
        if (cell) entries.push({ class: cls, day: d, period: p, subject: cell.subject, teacherId: cell.teacherId });
      }
    });
  });

  return { entries, unscheduled };
}

const TIMETABLE_DAY_NAMES = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };

// Turns the grid shape (start time, period length, break list) into an
// ordered list of rows for one day: alternating periods and breaks, each
// carrying its own clock time. Shared by the per-class grid (which adds a
// day dimension around it) and the master grid (which repeats it per day).
function buildScheduleRows(settings) {
  const periodsPerDay = settings.periodsPerDay || 8;
  const duration = Number(settings.periodDurationMinutes) || 35;
  const breaks = settings.breaks || [];
  const toMinutes = (hhmm) => {
    const [h, m] = (hhmm || "08:00").split(":").map(Number);
    return h * 60 + m;
  };
  const toHHMM = (mins) => {
    const wrapped = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(wrapped / 60);
    const m = wrapped % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  let cursor = toMinutes(settings.periodStartTime);
  const rows = [];
  for (let p = 1; p <= periodsPerDay; p++) {
    const start = cursor;
    const end = cursor + duration;
    rows.push({ kind: "period", period: p, start: toHHMM(start), end: toHHMM(end) });
    cursor = end;
    const brk = breaks.find((b) => Number(b.afterPeriod) === p);
    if (brk) {
      const bStart = cursor;
      const bEnd = cursor + (Number(brk.minutes) || 0);
      rows.push({ kind: "break", label: brk.label || "Break", start: toHHMM(bStart), end: toHHMM(bEnd) });
      cursor = bEnd;
    }
  }
  return rows;
}

// Turns "John Mwangi" into "J. Mwangi" so it fits in a crowded master-grid
// cell alongside a dozen other classes' columns.
function teacherShort(name) {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

async function fetchPublicSchoolName() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_school_name`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) throw new Error("Could not load school name");
  const data = await res.json();
  return typeof data === "string" ? data : (data?.name || "Brightfuture Primary School");
}

/* ---------------------------------------------------------------------- *
 *  STAFF ATTENDANCE (HR) — arrival/departure are recorded by calling the
 *  clock_arrival()/clock_departure() database functions, which stamp the
 *  time using the database's own clock (never a value sent from this
 *  browser), so nobody can back-date or fake an arrival/departure time.
 * ---------------------------------------------------------------------- */
async function rpcCall(token, fnName) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || data.error || "Request failed.");
  return data;
}

function mapAttendanceRow(r) {
  return {
    id: r.id, staffId: r.staff_id, date: r.date, arrivalTime: r.arrival_time, departureTime: r.departure_time,
    lateArrival: !!r.late_arrival, earlyDeparture: !!r.early_departure, lateReason: r.late_reason || "", earlyReason: r.early_reason || "",
  };
}

async function fetchOwnTodayAttendance(token, staffId) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await pgFetch(`staff_attendance?staff_id=eq.${staffId}&date=eq.${today}&select=*`, token);
  return rows[0] ? mapAttendanceRow(rows[0]) : null;
}

async function fetchAttendanceForDate(token, date) {
  const rows = await pgFetch(`staff_attendance?date=eq.${date}&select=*`, token);
  return rows.map(mapAttendanceRow);
}

async function patchAttendanceReason(token, id, field, reason) {
  await pgFetch(`staff_attendance?id=eq.${id}`, token, {
    method: "PATCH", body: { [field]: reason }, prefer: "return=minimal",
  });
}

// Uploads a photo (school logo, or a student/staff photo) to the public
// `school-photos` storage bucket and returns its public URL. `folder`
// keeps things tidy — e.g. "students", "staff", "school".
async function uploadPhoto(token, file, folder) {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
  const path = `${folder}/${Date.now()}-${safeName}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/school-photos/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Photo upload failed.");
  }
  return `${SUPABASE_URL}/storage/v1/object/public/school-photos/${path}`;
}

/* ---------------------------------------------------------------------- *
 *  EXAMS — exam names, the two CBC grading systems (editable), which
 *  system each class uses, and marks entered per student/subject/exam.
 * ---------------------------------------------------------------------- */
async function fetchExams(token) {
  const rows = await pgFetch("exams?select=*&order=created_at", token);
  return rows.map((r) => r.name);
}
async function addExamName(token, name) {
  await pgFetch("exams", token, { method: "POST", body: { name }, prefer: "return=minimal" });
}

async function fetchEvents(token) {
  const rows = await pgFetch("events?select=*&order=from_date", token);
  return rows.map((r) => ({ id: r.id, from: r.from_date, to: r.to_date, name: r.event_name, location: r.location || "", description: r.description || "", type: r.event_type || "General" }));
}
async function addEventRow(token, event) {
  const [row] = await pgFetch("events", token, { method: "POST", body: { from_date: event.from, to_date: event.to, event_name: event.name, location: event.location || null, description: event.description || null, event_type: event.type || "General" }, prefer: "return=representation" });
  return { id: row.id, from: row.from_date, to: row.to_date, name: row.event_name, location: row.location || "", description: row.description || "", type: row.event_type || "General" };
}
async function deleteEventRow(token, id) {
  await pgFetch(`events?id=eq.${id}`, token, { method: "DELETE", prefer: "return=minimal" });
}
async function fetchNotifications(token, user) {
  if (!user?.id) throw new Error("No signed-in user was available for notifications.");
  const rows = await pgFetch("notifications?select=*&order=created_at.desc&limit=100", token);
  const ids = rows.map((r) => r.id);
  let reads = [];
  if (ids.length) {
    const inList = ids.join(",");
    reads = await pgFetch(`notification_reads?user_id=eq.${encodeURIComponent(user.id)}&notification_id=in.(${inList})&select=notification_id`, token);
  }
  const readSet = new Set(reads.map((r) => r.notification_id));
  return rows.map((r) => ({
    id: r.id, title: r.title, message: r.message, audience: r.audience,
    recipientId: r.recipient_id, createdAt: r.created_at, senderName: r.sender_name || "",
    read: readSet.has(r.id),
  }));
}
async function createNotification(token, { title, message, recipientId, senderName }) {
  const [row] = await pgFetch("notifications", token, {
    method: "POST",
    body: { title, message, audience: recipientId ? "individual" : "all_teachers", recipient_id: recipientId || null, sender_name: senderName || null },
    prefer: "return=representation",
  });
  return row;
}
async function markNotificationRead(token, notificationId, userId) {
  await pgFetch("notification_reads?on_conflict=notification_id,user_id", token, {
    method: "POST", body: { notification_id: notificationId, user_id: userId },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}
async function deleteNotificationRow(token, id) {
  await pgFetch(`notifications?id=eq.${id}`, token, { method: "DELETE", prefer: "return=minimal" });
}

async function deleteExamName(token, name) {
  await pgFetch(`exams?name=eq.${encodeURIComponent(name)}`, token, { method: "DELETE", prefer: "return=minimal" });
  await pgFetch(`marks?exam_name=eq.${encodeURIComponent(name)}`, token, { method: "DELETE", prefer: "return=minimal" });
}

async function fetchGradingLevels(token) {
  const rows = await pgFetch("grading_levels?select=*&order=system,sort_order", token);
  return rows.map((r) => ({
    id: r.id, system: r.system, level: r.level, band: r.band,
    from: Number(r.from_score), to: Number(r.to_score), points: Number(r.points), sortOrder: r.sort_order,
  }));
}
async function updateGradingLevel(token, id, patch) {
  await pgFetch(`grading_levels?id=eq.${id}`, token, {
    method: "PATCH", body: { from_score: patch.from, to_score: patch.to, points: patch.points }, prefer: "return=minimal",
  });
}

async function fetchClassGradingAssignment(token) {
  const rows = await pgFetch("class_grading_assignment?select=*", token);
  return Object.fromEntries(rows.map((r) => [r.class, r.system]));
}
async function assignClassGrading(token, cls, system) {
  await pgFetch("class_grading_assignment?on_conflict=class", token, {
    method: "POST", body: { class: cls, system }, prefer: "resolution=merge-duplicates,return=minimal",
  });
}

// Marks for one subject-sitting (used by the Enter Marks screen): every
// student in the class, with whatever's already saved for that subject.
async function fetchMarksFor(token, { studentClass, subject, term, year, examName }) {
  const q = `marks?class=eq.${encodeURIComponent(studentClass)}&subject=eq.${encodeURIComponent(subject)}&term=eq.${encodeURIComponent(term)}&year=eq.${encodeURIComponent(year)}&exam_name=eq.${encodeURIComponent(examName)}&select=*`;
  const rows = await pgFetch(q, token);
  return rows.map((r) => ({ studentId: r.student_id, score: r.score, outOf: Number(r.out_of), comment: r.comment || "" }));
}
async function saveMarkRow(token, row) {
  await pgFetch("marks?on_conflict=student_id,subject,term,year,exam_name", token, {
    method: "POST",
    body: {
      student_id: row.studentId, class: row.studentClass, subject: row.subject, term: row.term, year: row.year,
      exam_name: row.examName, score: row.score, out_of: row.outOf, comment: row.comment || null,
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

// Every subject's marks for a whole class sitting — used for Analyse and
// for the individual student Report (filtered further client-side there).
async function fetchClassMarksForExam(token, { studentClass, term, year, examName }) {
  const q = `marks?class=eq.${encodeURIComponent(studentClass)}&term=eq.${encodeURIComponent(term)}&year=eq.${encodeURIComponent(year)}&exam_name=eq.${encodeURIComponent(examName)}&select=*`;
  const rows = await pgFetch(q, token);
  return rows.map((r) => ({
    studentId: r.student_id, subject: r.subject, score: r.score == null ? null : Number(r.score),
    outOf: Number(r.out_of), comment: r.comment || "",
  }));
}

// Every mark ever recorded for one student — used to build the "performance
// over time" trend chart on their report card, across every exam sitting
// they've had (not just the one currently being reported on).
async function fetchStudentMarksHistory(token, studentId) {
  const rows = await pgFetch(`marks?student_id=eq.${studentId}&select=*&order=created_at`, token);
  return rows.map((r) => ({
    subject: r.subject, term: r.term, year: r.year, examName: r.exam_name,
    score: r.score == null ? null : Number(r.score), outOf: Number(r.out_of),
  }));
}

async function fetchReportRemarks(token, { studentId, term, year, examName }) {
  const q = `report_remarks?student_id=eq.${studentId}&term=eq.${encodeURIComponent(term)}&year=eq.${encodeURIComponent(year)}&exam_name=eq.${encodeURIComponent(examName)}&select=*`;
  const rows = await pgFetch(q, token);
  const r = rows[0];
  return r ? { classTeacherComment: r.class_teacher_comment || "", hoiComment: r.hoi_comment || "" } : { classTeacherComment: "", hoiComment: "" };
}
async function saveReportRemarks(token, { studentId, studentClass, term, year, examName, classTeacherComment, hoiComment }) {
  await pgFetch("report_remarks?on_conflict=student_id,term,year,exam_name", token, {
    method: "POST",
    body: { student_id: studentId, class: studentClass, term, year, exam_name: examName, class_teacher_comment: classTeacherComment || null, hoi_comment: hoiComment || null },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
}

/* ---------------------------------------------------------------------- *
 *  THEME
 * ---------------------------------------------------------------------- */
const BG = "#F2EFE6";
const INK = "#1E2333";
const PANEL = "#FFFFFF";
const RAIL = "#152A4A";
const RAIL_SOFT = "#20395E";
const ACCENT = "#C1502E";
const LINE = "#E3DED0";
const DISPLAY_FONT = "'Fraunces', 'Georgia', serif";
const BODY_FONT = "'Inter', system-ui, sans-serif";
const MONO_FONT = "'IBM Plex Mono', 'Courier New', monospace";

const GLOBAL_CSS = `
/* Collapsible navigation drawer */
/* Dashboard refresh */
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.spin { animation: spin 0.8s linear infinite; }
.dashboard-overview-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:14px; margin-bottom:18px; }
.dashboard-info-card { border-radius:14px; padding:16px; border:1px solid rgba(0,0,0,.07); min-height:108px; }
.dashboard-events-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin-bottom:18px; }
.dashboard-event-card { border-radius:14px; padding:15px; border:1px solid rgba(0,0,0,.07); min-height:92px; }
.dashboard-table-card { border-radius:14px; overflow:hidden; border:1px solid rgba(0,0,0,.07); background:${PANEL}; }
@media(max-width:900px){ .dashboard-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr));} .dashboard-events-grid{grid-template-columns:1fr;} }
@media(max-width:520px){ .dashboard-overview-grid{gap:9px;} .dashboard-info-card{padding:12px;min-height:94px;} }
.sidebar-drawer { transition: transform .22s ease; }
.sidebar-menu-button { position: fixed; top: 12px; left: 12px; z-index: 1003; }
.sidebar-backdrop { display:none; }
@media (max-width: 900px) {
  .sidebar-drawer { position: fixed !important; left: 0 !important; top: 0 !important; bottom: 0 !important; z-index: 1002 !important; transform: translateX(-105%); box-shadow: 8px 0 24px rgba(0,0,0,.16); }
  .sidebar-drawer.open { transform: translateX(0); }
  .sidebar-backdrop.open { display:block; position:fixed; inset:0; z-index:1001; background:rgba(0,0,0,.28); }
}
@media (min-width: 901px) {
  .sidebar-drawer { position: fixed !important; left: 0 !important; top: 0 !important; bottom: 0 !important; z-index: 1002 !important; transform: translateX(-105%); box-shadow: 8px 0 24px rgba(0,0,0,.16); }
  .sidebar-drawer.open { transform: translateX(0); }
  .sidebar-backdrop.open { display:block; position:fixed; inset:0; z-index:1001; background:rgba(0,0,0,.18); }
}

@import url('https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
* { box-sizing: border-box; }
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-thumb { background: #d8d2bd; border-radius: 8px; }
button { font-family: inherit; }
.focus-ring:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
`;

/* ---------------------------------------------------------------------- *
 *  ROOT
 * ---------------------------------------------------------------------- */
export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [students, setStudents] = useState([]);
  const [grades, setGrades] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [payments, setPayments] = useState([]);
  const [feeStructure, setFeeStructure] = useState({});
  const [otherFeeStructure, setOtherFeeStructure] = useState({});
  const [expenditures, setExpenditures] = useState([]);
  const [smsMessages, setSmsMessages] = useState([]);
  const [staff, setStaff] = useState([]);
  const [classes, setClasses] = useState(FALLBACK_CLASSES);
  const [subjects, setSubjects] = useState(FALLBACK_SUBJECTS);
  const [schoolSettings, setSchoolSettings] = useState(null);
  const [exams, setExams] = useState([]);
  const [events, setEvents] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [myAttendanceToday, setMyAttendanceToday] = useState(null);
  const [gradingLevels, setGradingLevels] = useState([]);
  const [classGradingAssignment, setClassGradingAssignment] = useState({});
  const [timetableAssignments, setTimetableAssignments] = useState([]);
  const [timetableSettings, setTimetableSettings] = useState({ days: ["Mon", "Tue", "Wed", "Thu", "Fri"], periodsPerDay: 8, periodStartTime: "08:00", periodDurationMinutes: 35, breaks: [] });
  const [timetableEntries, setTimetableEntries] = useState([]);
  const [staffPayroll, setStaffPayroll] = useState([]);
  const [payrollSettings, setPayrollSettings] = useState({
    payeBands: [{ upTo: 24000, rate: 0.10 }, { upTo: 32333, rate: 0.25 }, { upTo: 500000, rate: 0.30 }, { upTo: 800000, rate: 0.325 }, { upTo: null, rate: 0.35 }],
    personalRelief: 2400, nssfTier1Limit: 8000, nssfTier2Limit: 72000, nssfRate: 0.06, shifRate: 0.0275, shifMinimum: 300, housingLevyRate: 0.015,
  });
  const [payslips, setPayslips] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [bookIssues, setBookIssues] = useState([]);
  const [view, setView] = useState("dashboard");
  const [attendanceLanding, setAttendanceLanding] = useState("students");
  const [toast, setToast] = useState(null);
  const [authedUser, setAuthedUser] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [restoringSession, setRestoringSession] = useState(true);
  const [recoveryToken, setRecoveryToken] = useState(null);

  // If this page was opened from a password-reset email, Supabase appends
  // #access_token=...&type=recovery to the URL. Catch that before anything
  // else loads so we can show the "set a new password" screen.
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes("type=recovery")) {
      const params = new URLSearchParams(hash.slice(1));
      const token = params.get("access_token");
      if (token) setRecoveryToken(token);
    }
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    window.clearTimeout(showToast._t);
    showToast._t = window.setTimeout(() => setToast(null), 2600);
  };

  const loadData = async (token, user) => {
    setDataLoading(true);
    setDataError("");
    try {
      const [school, staffRows, classNames, subjectNames, settings, examNames, eventRows, levels, classGrading, notificationRows, myAttendance, ttAssignments, ttSettings, ttEntries, staffPay, payrollCfg, payslipRows, expenditureRows, smsMessageRows, visitorRows, libraryBookRows, bookIssueRows] = await Promise.all([
        fetchSchoolData(token), fetchStaffDirectory(token), fetchClasses(token), fetchSubjects(token), fetchSchoolSettings(token),
        fetchExams(token), fetchEvents(token), fetchGradingLevels(token), fetchClassGradingAssignment(token), fetchNotifications(token, user),
        fetchOwnTodayAttendance(token, user.id),
        fetchTimetableAssignments(token), fetchTimetableSettings(token), fetchTimetableEntries(token),
        fetchStaffPayroll(token).catch(() => []), fetchPayrollSettings(token).catch(() => payrollSettings), fetchPayslips(token).catch(() => []),
        fetchExpenditures(token).catch(() => []),
        fetchSmsMessages(token).catch(() => []),
        fetchVisitors(token).catch(() => []),
        fetchLibraryBooks(token).catch(() => []),
        fetchBookIssues(token).catch(() => []),
      ]);
      setStudents(school.students);
      setGrades(school.grades);
      setAttendance(school.attendance);
      setPayments(school.payments);
      setFeeStructure(school.feeStructure);
      setOtherFeeStructure(school.otherFeeStructure);
      setExpenditures(expenditureRows);
      setSmsMessages(smsMessageRows);
      setVisitors(visitorRows);
      setLibraryBooks(libraryBookRows);
      setBookIssues(bookIssueRows);
      setStaff(staffRows);
      setClasses(classNames.length ? classNames : FALLBACK_CLASSES);
      setSubjects(subjectNames.length ? subjectNames : FALLBACK_SUBJECTS);
      setSchoolSettings(settings);
      setExams(examNames);
      setEvents(eventRows);
      setNotifications(notificationRows);
      setMyAttendanceToday(myAttendance);
      setGradingLevels(levels);
      setClassGradingAssignment(classGrading);
      setTimetableAssignments(ttAssignments);
      setTimetableSettings(ttSettings);
      setTimetableEntries(ttEntries);
      setStaffPayroll(staffPay);
      setPayrollSettings(payrollCfg);
      setPayslips(payslipRows);
    } catch (err) {
      setDataError(err.message || "Could not load school data from the database.");
    } finally {
      setDataLoading(false);
    }
  };

  // A Class Teacher doesn't have a Dashboard/Students/Fees/Staff/Setup tab,
  // so send them straight to Attendance instead of a view they can't see.
  const landingViewFor = (role) => {
    if (role === "Subordinate Staff") return "notifications";
    return "dashboard"; // everyone else now has a role-appropriate dashboard
  };

  const handleLogin = (profile) => {
    setAuthedUser(profile);
    setView(landingViewFor(profile.role));
    sessionStore.save(profile.refreshToken);
    loadData(profile.accessToken, profile);
  };

  // Try to resume a session on first load, so refreshing the page doesn't
  // sign you out. Silently does nothing if there's no saved session, or if
  // it's expired/invalid — you'll just land on the login screen as usual.
  useEffect(() => {
    let cancelled = false;
    const savedRefreshToken = sessionStore.read();
    if (!savedRefreshToken) { setRestoringSession(false); return; }
    (async () => {
      try {
        const auth = await supabaseRefreshSession(savedRefreshToken);
        const profile = await fetchStaffProfile(auth.access_token, auth.user.id);
        if (cancelled) return;
        const fullProfile = { ...profile, accessToken: auth.access_token, refreshToken: auth.refresh_token };
        setAuthedUser(fullProfile);
        setView(landingViewFor(fullProfile.role));
        sessionStore.save(auth.refresh_token);
        loadData(auth.access_token, fullProfile);
      } catch (err) {
        sessionStore.clear();
      } finally {
        if (!cancelled) setRestoringSession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Last 5 weekdays ending today, merged with whatever dates already have
  // attendance recorded — so today is always markable and history stays visible.
  const schoolDays = useMemo(() => {
    const fromData = attendance.map((a) => a.date);
    const recent = [];
    let d = new Date();
    while (recent.length < 5) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) recent.unshift(d.toISOString().slice(0, 10));
      d.setDate(d.getDate() - 1);
    }
    return Array.from(new Set([...fromData, ...recent])).sort();
  }, [attendance]);

  const addStudent = async (student) => {
    const [row] = await pgFetch("students", authedUser.accessToken, {
      method: "POST",
      body: {
        admission_no: student.admissionNo, name: student.name, gender: student.gender, class: student.class,
        guardian: student.guardian, relationship: student.relationship, phone: student.phone,
        enrolled: student.enrolled, status: student.status, photo_url: student.photoUrl || null,
      },
    });
    setStudents((prev) => [...prev, {
      id: row.id, admissionNo: row.admission_no, name: row.name, gender: row.gender, class: row.class,
      guardian: row.guardian, relationship: row.relationship, phone: row.phone, enrolled: row.enrolled, status: row.status,
      photoUrl: row.photo_url,
    }]);
  };

  // Removes a student and everything tied to their record (grades,
  // attendance, payments, exam marks) — there's no FK cascade set up on
  // this database, so each table is cleared explicitly, in an order that
  // won't leave orphaned rows if one request fails partway through.
  const deleteStudent = async (studentId) => {
    const token = authedUser.accessToken;
    await pgFetch(`marks?student_id=eq.${studentId}`, token, { method: "DELETE", prefer: "return=minimal" });
    await pgFetch(`grades?student_id=eq.${studentId}`, token, { method: "DELETE", prefer: "return=minimal" });
    await pgFetch(`attendance?student_id=eq.${studentId}`, token, { method: "DELETE", prefer: "return=minimal" });
    await pgFetch(`payments?student_id=eq.${studentId}`, token, { method: "DELETE", prefer: "return=minimal" });
    await pgFetch(`students?id=eq.${studentId}`, token, { method: "DELETE", prefer: "return=minimal" });
    setStudents((prev) => prev.filter((s) => s.id !== studentId));
    setGrades((prev) => prev.filter((g) => g.studentId !== studentId));
    setAttendance((prev) => prev.filter((a) => a.studentId !== studentId));
    setPayments((prev) => prev.filter((p) => p.studentId !== studentId));
  };

  const updateStudent = async (studentId, patch) => {
    await pgFetch(`students?id=eq.${studentId}`, authedUser.accessToken, {
      method: "PATCH",
      body: {
        name: patch.name, gender: patch.gender, class: patch.class,
        guardian: patch.guardian, relationship: patch.relationship, phone: patch.phone,
        status: patch.status, photo_url: patch.photoUrl || null,
      },
      prefer: "return=minimal",
    });
    setStudents((prev) => prev.map((s) => (s.id === studentId ? { ...s, ...patch } : s)));
  };
  // Moves every student currently in `fromClass` into `toClass` in one go —
  // the end-of-year promotion workflow, rather than editing each student
  // individually.
  const promoteClassStudents = async (fromClass, toClass) => {
    await pgFetch(`students?class=eq.${encodeURIComponent(fromClass)}`, authedUser.accessToken, {
      method: "PATCH",
      body: { class: toClass },
      prefer: "return=minimal",
    });
    setStudents((prev) => prev.map((s) => (s.class === fromClass ? { ...s, class: toClass } : s)));
  };

  // Adding a staff member here only adds them to the roster shown in the
  // app — it does NOT create a real login. A new teacher's account (with a
  // real password) has to be provisioned the same way the first 8 were:
  // a migration against Supabase Auth, since creating auth users safely
  // needs a privileged key this public frontend intentionally never holds.
  // Their photo is uploaded to storage right away so it's ready to attach
  // once their real profile row exists.
  const addStaff = (member) => {
    setStaff((prev) => [...prev, { ...member, id: Math.max(0, ...prev.map((s) => s.id)) + 1 }]);
  };

  const addClass = async (name, fee) => {
    const sortOrder = classes.length + 1;
    await pgFetch("classes", authedUser.accessToken, { method: "POST", body: { name, sort_order: sortOrder } });
    await pgFetch("fee_structure?on_conflict=class,account", authedUser.accessToken, {
      method: "POST",
      body: { class: name, account: "School Fees", amount: Number(fee) || 0 },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    setClasses((prev) => [...prev, name]);
    setFeeStructure((prev) => ({ ...prev, [name]: Number(fee) || 0 }));
  };
  const removeClass = async (name) => {
    await pgFetch(`classes?name=eq.${encodeURIComponent(name)}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setClasses((prev) => prev.filter((c) => c !== name));
  };
  // account defaults to "School Fees" so every existing call site (which
  // only ever set the compulsory fee) keeps working unchanged.
  const setClassFee = async (name, fee, account = "School Fees") => {
    await pgFetch("fee_structure?on_conflict=class,account", authedUser.accessToken, {
      method: "POST",
      body: { class: name, account, amount: Number(fee) || 0 },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    if (account === "School Fees") {
      setFeeStructure((prev) => ({ ...prev, [name]: Number(fee) || 0 }));
    } else {
      setOtherFeeStructure((prev) => ({ ...prev, [account]: { ...(prev[account] || {}), [name]: Number(fee) || 0 } }));
    }
  };

  const addTimetableAssignment = async (a) => {
    const [row] = await pgFetch("class_subject_teachers?on_conflict=class,subject", authedUser.accessToken, {
      method: "POST",
      body: { class: a.class, subject: a.subject, teacher_id: a.teacherId, periods_per_week: a.periodsPerWeek },
      prefer: "resolution=merge-duplicates,return=representation",
    });
    setTimetableAssignments((prev) => {
      const others = prev.filter((x) => !(x.class === a.class && x.subject === a.subject));
      return [...others, { id: row.id, class: row.class, subject: row.subject, teacherId: row.teacher_id, periodsPerWeek: row.periods_per_week }];
    });
  };
  const removeTimetableAssignment = async (id) => {
    await pgFetch(`class_subject_teachers?id=eq.${id}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setTimetableAssignments((prev) => prev.filter((a) => a.id !== id));
  };
  const updateTimetableSettings = async (patch) => {
    await pgFetch("timetable_settings?id=eq.1", authedUser.accessToken, {
      method: "PATCH",
      body: {
        days: patch.days, periods_per_day: patch.periodsPerDay,
        period_start_time: patch.periodStartTime, period_duration_minutes: patch.periodDurationMinutes,
        breaks: patch.breaks,
      },
      prefer: "return=minimal",
    });
    setTimetableSettings(patch);
  };
  // Wipes and fully re-inserts the generated grid, rather than diffing —
  // simplest way to guarantee what's stored exactly matches what the
  // algorithm computed. Returns how many periods were placed and which
  // requests (if any) couldn't fit, so the caller can tell the admin.
  const generateTimetable = async () => {
    const token = authedUser.accessToken;
    const { entries, unscheduled } = computeTimetable(timetableAssignments, timetableSettings);
    await pgFetch("timetable_entries?id=not.is.null", token, { method: "DELETE", prefer: "return=minimal" });
    if (entries.length) {
      await pgFetch("timetable_entries", token, {
        method: "POST",
        body: entries.map((e) => ({ class: e.class, day: e.day, period: e.period, subject: e.subject, teacher_id: e.teacherId })),
        prefer: "return=minimal",
      });
    }
    const fresh = await fetchTimetableEntries(token);
    setTimetableEntries(fresh);
    return { count: entries.length, unscheduled };
  };
  const clearTimetable = async () => {
    await pgFetch("timetable_entries?id=not.is.null", authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setTimetableEntries([]);
  };
  // Manual single-cell override — used to tweak the auto-generated grid.
  // An empty subject clears the slot; otherwise it upserts on the
  // (class, day, period) unique constraint.
  const setTimetableCell = async (cls, day, period, subject, teacherId) => {
    const token = authedUser.accessToken;
    if (!subject) {
      await pgFetch(`timetable_entries?class=eq.${encodeURIComponent(cls)}&day=eq.${encodeURIComponent(day)}&period=eq.${period}`, token, { method: "DELETE", prefer: "return=minimal" });
      setTimetableEntries((prev) => prev.filter((e) => !(e.class === cls && e.day === day && e.period === period)));
      return;
    }
    await pgFetch("timetable_entries?on_conflict=class,day,period", token, {
      method: "POST",
      body: { class: cls, day, period, subject, teacher_id: teacherId || null },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    setTimetableEntries((prev) => {
      const others = prev.filter((e) => !(e.class === cls && e.day === day && e.period === period));
      return [...others, { id: `${cls}-${day}-${period}`, class: cls, day, period, subject, teacherId: teacherId || null }];
    });
  };

  // Upserts one staff member's pay details (basic salary, allowances,
  // statutory numbers, bank details).
  const saveStaffPayroll = async (staffId, patch) => {
    await pgFetch("staff_payroll?on_conflict=staff_id", authedUser.accessToken, {
      method: "POST",
      body: {
        staff_id: staffId, basic_salary: patch.basicSalary, house_allowance: patch.houseAllowance,
        transport_allowance: patch.transportAllowance, other_allowance: patch.otherAllowance,
        other_allowance_label: patch.otherAllowanceLabel, kra_pin: patch.kraPin, nssf_no: patch.nssfNo,
        shif_no: patch.shifNo, bank_name: patch.bankName, bank_account: patch.bankAccount,
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
    setStaffPayroll((prev) => {
      const others = prev.filter((p) => p.staffId !== staffId);
      return [...others, { staffId, ...patch }];
    });
  };
  const updatePayrollSettings = async (patch) => {
    await pgFetch("payroll_settings?id=eq.1", authedUser.accessToken, {
      method: "PATCH",
      body: {
        paye_bands: patch.payeBands, personal_relief: patch.personalRelief, nssf_tier1_limit: patch.nssfTier1Limit,
        nssf_tier2_limit: patch.nssfTier2Limit, nssf_rate: patch.nssfRate, shif_rate: patch.shifRate,
        shif_minimum: patch.shifMinimum, housing_levy_rate: patch.housingLevyRate,
      },
      prefer: "return=minimal",
    });
    setPayrollSettings(patch);
  };
  // Freezes a computed payslip into a permanent record for one staff member,
  // for one month — a snapshot, so it's unaffected by later rate changes.
  const generatePayslip = async (staffMember, pay, month, year, otherDeduction = 0, otherDeductionLabel = "") => {
    const calc = computePayslip(pay, payrollSettings);
    const netPay = calc.gross - calc.totalStatutory - otherDeduction;
    const [row] = await pgFetch("payslips?on_conflict=staff_id,month,year", authedUser.accessToken, {
      method: "POST",
      body: {
        staff_id: staffMember.id, staff_name: staffMember.name, month, year,
        basic_salary: pay.basicSalary, house_allowance: pay.houseAllowance, transport_allowance: pay.transportAllowance,
        other_allowance: pay.otherAllowance, other_allowance_label: pay.otherAllowanceLabel,
        gross_pay: calc.gross, paye: calc.paye, nssf: calc.nssf, shif: calc.shif, housing_levy: calc.housingLevy,
        other_deduction: otherDeduction, other_deduction_label: otherDeductionLabel, net_pay: netPay,
        employer_nssf: calc.employerNssf, employer_housing_levy: calc.employerHousingLevy,
      },
      prefer: "resolution=merge-duplicates,return=representation",
    });
    const slip = {
      id: row.id, staffId: row.staff_id, staffName: row.staff_name, month: row.month, year: row.year,
      basicSalary: Number(row.basic_salary), houseAllowance: Number(row.house_allowance), transportAllowance: Number(row.transport_allowance),
      otherAllowance: Number(row.other_allowance), otherAllowanceLabel: row.other_allowance_label, grossPay: Number(row.gross_pay),
      paye: Number(row.paye), nssf: Number(row.nssf), shif: Number(row.shif), housingLevy: Number(row.housing_levy),
      otherDeduction: Number(row.other_deduction), otherDeductionLabel: row.other_deduction_label, netPay: Number(row.net_pay),
      employerNssf: Number(row.employer_nssf), employerHousingLevy: Number(row.employer_housing_levy), createdAt: row.created_at,
    };
    setPayslips((prev) => [slip, ...prev.filter((p) => !(p.staffId === slip.staffId && p.month === month && p.year === year))]);
    return slip;
  };
  const deletePayslip = async (id) => {
    await pgFetch(`payslips?id=eq.${id}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setPayslips((prev) => prev.filter((p) => p.id !== id));
  };

  const addExam = async (name, eventDetails = {}) => {
    await addExamName(authedUser.accessToken, name);
    setExams((prev) => [...prev, name]);
    if (eventDetails.from && eventDetails.to) {
      const ev = await addEventRow(authedUser.accessToken, { ...eventDetails, name, type: "Exam" });
      setEvents((prev) => [...prev, ev].sort((a, b) => a.from.localeCompare(b.from)));
    }
  };
  const deleteExam = async (name) => {
    await deleteExamName(authedUser.accessToken, name);
    setExams((prev) => prev.filter((e) => e !== name));
    setEvents((prev) => prev.filter((e) => !(e.type === "Exam" && e.name === name)));
  };
  const addEvent = async (event) => {
    const ev = await addEventRow(authedUser.accessToken, event);
    setEvents((prev) => [...prev, ev].sort((a, b) => a.from.localeCompare(b.from)));
  };
  const deleteEvent = async (id) => {
    await deleteEventRow(authedUser.accessToken, id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
  };

  const saveGradingLevel = async (id, patch) => {
    await updateGradingLevel(authedUser.accessToken, id, patch);
    setGradingLevels((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const setClassGrading = async (cls, system) => {
    await assignClassGrading(authedUser.accessToken, cls, system);
    setClassGradingAssignment((prev) => ({ ...prev, [cls]: system }));
  };

  const addSubject = async (name) => {
    const sortOrder = subjects.length + 1;
    await pgFetch("subjects", authedUser.accessToken, { method: "POST", body: { name, sort_order: sortOrder } });
    setSubjects((prev) => [...prev, name]);
  };
  const removeSubject = async (name) => {
    await pgFetch(`subjects?name=eq.${encodeURIComponent(name)}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setSubjects((prev) => prev.filter((s) => s !== name));
  };

  const updateSchoolSettings = async (patch) => {
    await pgFetch("school_settings?id=eq.1", authedUser.accessToken, {
      method: "PATCH",
      body: {
        name: patch.name, logo_url: patch.logoUrl || null, address: patch.address, motto: patch.motto,
        vision: patch.vision, email: patch.email, contact: patch.contact, location: patch.location,
        term_closing_date: patch.termClosingDate || null, next_term_opening_date: patch.nextTermOpeningDate || null,
        arrival_cutoff: patch.arrivalCutoff ? `${patch.arrivalCutoff}:00` : "07:20:00",
        departure_cutoff: patch.departureCutoff ? `${patch.departureCutoff}:00` : "17:00:00",
        current_term: patch.currentTerm || DEFAULT_TERM,
      },
      prefer: "return=minimal",
    });
    setSchoolSettings(patch);
  };

  const markAttendance = async (date, studentId, status) => {
    setAttendance((prev) => {
      const exists = prev.find((a) => a.date === date && a.studentId === studentId);
      if (exists) return prev.map((a) => (a.date === date && a.studentId === studentId ? { ...a, status } : a));
      return [...prev, { date, studentId, status }];
    });
    try {
      await pgFetch("attendance?on_conflict=date,student_id", authedUser.accessToken, {
        method: "POST",
        body: { date, student_id: studentId, status },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    } catch (err) {
      showToast(`Couldn't save attendance: ${err.message}`);
    }
  };

  // Updates the on-screen grade immediately (every keystroke); does not
  // write to the database. saveGrade below does that, on blur.
  const setGrade = (studentId, subject, score) => {
    setGrades((prev) => {
      const exists = prev.find((g) => g.studentId === studentId && g.subject === subject);
      if (exists) return prev.map((g) => (g.studentId === studentId && g.subject === subject ? { ...g, score } : g));
      return [...prev, { studentId, subject, term: schoolSettings?.currentTerm || DEFAULT_TERM, score }];
    });
  };
  const saveGrade = async (studentId, subject, score) => {
    try {
      await pgFetch("grades?on_conflict=student_id,subject,term", authedUser.accessToken, {
        method: "POST",
        body: { student_id: studentId, subject, term: schoolSettings?.currentTerm || DEFAULT_TERM, score },
        prefer: "resolution=merge-duplicates,return=minimal",
      });
    } catch (err) {
      showToast(`Couldn't save grade: ${err.message}`);
    }
  };

  const recordPayment = async (payment) => {
    const [row] = await pgFetch("payments", authedUser.accessToken, {
      method: "POST",
      body: { student_id: payment.studentId, amount: payment.amount, date: payment.date, method: payment.method, account: payment.account || "School Fees" },
    });
    setPayments((prev) => [...prev, { id: row.id, studentId: row.student_id, amount: Number(row.amount), date: row.date, method: row.method, account: row.account || "School Fees" }]);
  };
  const deletePayment = async (id) => {
    await pgFetch(`payments?id=eq.${id}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setPayments((prev) => prev.filter((p) => p.id !== id));
  };
  const recordExpenditure = async (expenditure) => {
    const [row] = await pgFetch("expenditures", authedUser.accessToken, {
      method: "POST",
      body: { account: expenditure.account, amount: expenditure.amount, date: expenditure.date, description: expenditure.description, recorded_by: authedUser.id },
    });
    setExpenditures((prev) => [{ id: row.id, account: row.account, amount: Number(row.amount), date: row.date, description: row.description, recordedBy: row.recorded_by, createdAt: row.created_at }, ...prev]);
  };
  const deleteExpenditure = async (id) => {
    await pgFetch(`expenditures?id=eq.${id}`, authedUser.accessToken, { method: "DELETE", prefer: "return=minimal" });
    setExpenditures((prev) => prev.filter((e) => e.id !== id));
  };

  // Front Office — visitor log
  const addVisitor = async (visitor) => {
    const row = await addVisitorRow(authedUser.accessToken, visitor, authedUser.id);
    setVisitors((prev) => [row, ...prev]);
  };

  // Library — books + issue/return
  const addLibraryBook = async (book) => {
    const row = await addLibraryBookRow(authedUser.accessToken, book, authedUser.id);
    setLibraryBooks((prev) => [...prev, row].sort((a, b) => a.title.localeCompare(b.title)));
  };
  const deleteLibraryBook = async (id) => {
    await deleteLibraryBookRow(authedUser.accessToken, id);
    setLibraryBooks((prev) => prev.filter((b) => b.id !== id));
  };
  const issueBook = async (issue) => {
    const book = libraryBooks.find((b) => b.id === issue.bookId);
    if (!book || book.availableCopies < 1) throw new Error("No available copies to issue.");
    const row = await issueBookRow(authedUser.accessToken, issue, authedUser.id);
    await updateLibraryBookCopiesRow(authedUser.accessToken, book.id, book.availableCopies - 1);
    setBookIssues((prev) => [row, ...prev]);
    setLibraryBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, availableCopies: b.availableCopies - 1 } : b)));
  };
  const returnBook = async (issueId) => {
    const issue = bookIssues.find((i) => i.id === issueId);
    if (!issue) return;
    const returnedDate = new Date().toISOString().slice(0, 10);
    await returnBookRow(authedUser.accessToken, issueId, returnedDate);
    const book = libraryBooks.find((b) => b.id === issue.bookId);
    if (book) {
      await updateLibraryBookCopiesRow(authedUser.accessToken, book.id, Math.min(book.totalCopies, book.availableCopies + 1));
      setLibraryBooks((prev) => prev.map((b) => (b.id === book.id ? { ...b, availableCopies: Math.min(b.totalCopies, b.availableCopies + 1) } : b)));
    }
    setBookIssues((prev) => prev.map((i) => (i.id === issueId ? { ...i, status: "Returned", returnedDate } : i)));
  };

  // Calls /api/send-sms, which holds the Africa's Talking credentials
  // server-side. Returns { recipientCount, costEstimate } on success — the
  // caller is expected to log the result via recordSmsMessage afterwards.
  const sendBulkSms = async (message, recipients) => {
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authedUser.accessToken}` },
      body: JSON.stringify({ message, recipients }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  };
  // Sends a different message to each recipient — e.g. each student's own
  // exam results — as opposed to sendBulkSms, which sends one message to many.
  const sendBatchSms = async (items) => {
    const res = await fetch("/api/send-sms", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authedUser.accessToken}` },
      body: JSON.stringify({ batch: items }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  };
  const recordSmsMessage = async (entry) => {
    const [row] = await pgFetch("sms_messages", authedUser.accessToken, {
      method: "POST",
      body: {
        message: entry.message, audience_label: entry.audienceLabel, recipient_count: entry.recipientCount,
        cost_estimate: entry.costEstimate || null, status: entry.status || "sent", error: entry.error || null,
        sent_by: authedUser.id,
      },
    });
    setSmsMessages((prev) => [{ id: row.id, message: row.message, audienceLabel: row.audience_label, recipientCount: row.recipient_count, costEstimate: row.cost_estimate, status: row.status, error: row.error, sentBy: row.sent_by, createdAt: row.created_at }, ...prev]);
  };

  const sendNotification = async ({ title, message, recipientId }) => {
    const row = await createNotification(authedUser.accessToken, { title, message, recipientId, senderName: authedUser.name });
    const fresh = await fetchNotifications(authedUser.accessToken, authedUser);
    setNotifications(fresh);
    showToast(recipientId ? "Notification sent" : "Notification sent to all teachers");
    return row;
  };
  const readNotification = async (id) => {
    await markNotificationRead(authedUser.accessToken, id, authedUser.id);
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
  };
  const deleteNotification = async (id) => {
    await deleteNotificationRow(authedUser.accessToken, id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Both of these call the /api/manage-teacher serverless function, which
  // holds the Supabase service-role key server-side and re-checks the
  // caller is a Head Teacher/Deputy before doing anything — see that
  // file's comments for why this can't be done directly from here.
  const callManageTeacher = async (payload) => {
    const res = await fetch("/api/manage-teacher", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authedUser.accessToken}` },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data;
  };

  // Calls /api/generate-lesson-plan, which holds the Anthropic API key
  // server-side. Returns the parsed lesson plan object on success.
  const generateLessonPlan = async (input) => {
    const res = await fetch("/api/generate-lesson-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${authedUser.accessToken}` },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed.");
    return data.plan;
  };

  const createTeacherLogin = async (member) => {
    const result = await callManageTeacher({
      action: "create", name: member.name, email: member.email, password: member.password,
      role: member.role, subjects: (member.subjects || []).join(";"), classTeacherOf: member.classTeacherOf,
      phone: member.phone, photoUrl: member.photoUrl, designation: member.designation,
    });
    const newStaffMember = {
      id: result.id, name: member.name, role: member.role, subjects: member.subjects || [],
      classTeacherOf: member.classTeacherOf || null, phone: member.phone || "", email: member.email, photoUrl: member.photoUrl || "",
      designation: member.designation || null,
    };
    setStaff((prev) => [...prev, newStaffMember]);
    return newStaffMember;
  };

  const updateTeacherLogin = async ({ teacherId, email, password }) => {
    await callManageTeacher({ action: "update_credentials", teacherId, email, password });
    if (email) setStaff((prev) => prev.map((s) => (s.id === teacherId ? { ...s, email } : s)));
  };

  const deleteStaffMember = async (teacherId) => {
    await callManageTeacher({ action: "delete", teacherId });
    setStaff((prev) => prev.filter((s) => s.id !== teacherId));
  };

  const updateStaffDetails = async (teacherId, patch) => {
    await pgFetch(`staff_profiles?id=eq.${teacherId}`, authedUser.accessToken, {
      method: "PATCH",
      body: {
        name: patch.name, role: patch.role, subjects: (patch.subjects || []).join(";"),
        class_teacher_of: patch.classTeacherOf || null, phone: patch.phone, photo_url: patch.photoUrl || null,
        designation: patch.role === "Subordinate Staff" ? (patch.designation || null) : null,
      },
      prefer: "return=minimal",
    });
    setStaff((prev) => prev.map((s) => (s.id === teacherId ? { ...s, ...patch } : s)));
  };

  // Arrival/departure times come straight back from the database (see
  // clock_arrival()/clock_departure() in the migration) — the browser
  // never sends a timestamp of its own, so there's nothing here to fake.
  const clockArrival = async () => {
    const row = await rpcCall(authedUser.accessToken, "clock_arrival");
    const mapped = mapAttendanceRow(row);
    setMyAttendanceToday(mapped);
    showToast(mapped.lateArrival ? "Arrival recorded — marked as late" : "Arrival recorded");
    return mapped;
  };
  const clockDeparture = async () => {
    const row = await rpcCall(authedUser.accessToken, "clock_departure");
    const mapped = mapAttendanceRow(row);
    setMyAttendanceToday(mapped);
    showToast(mapped.earlyDeparture ? "Departure recorded — marked as early" : "Departure recorded");
    return mapped;
  };

  const fetchStaffAttendanceForDate = (date) => fetchAttendanceForDate(authedUser.accessToken, date);
  const saveAttendanceReason = async (id, field, reason) => {
    await patchAttendanceReason(authedUser.accessToken, id, field, reason);
  };

  const isAdmin = isAdminRole(authedUser?.role);
  const canFinanceHR = isFinanceHRRole(authedUser?.role);
  const isSuperAdmin = isSuperAdminRole(authedUser?.role);
  const canFrontOffice = isFrontOfficeRole(authedUser?.role);
  const canLibrary = isLibraryRole(authedUser?.role);
  const ctx = {
    students, staff, grades, attendance, payments, feeStructure, otherFeeStructure, expenditures,
    recordExpenditure, deleteExpenditure, schoolDays,
    smsMessages, sendBulkSms, sendBatchSms, recordSmsMessage,
    classes, subjects, schoolSettings, authedUser, isAdmin, setView,
    attendanceLanding,
    goToStaffAttendance: () => { setAttendanceLanding("staff"); setView("attendance"); },
    exams, events, notifications, gradingLevels, classGradingAssignment, myAttendanceToday,
    timetableAssignments, timetableSettings, timetableEntries,
    addTimetableAssignment, removeTimetableAssignment, updateTimetableSettings, generateTimetable, clearTimetable, setTimetableCell,
    staffPayroll, payrollSettings, payslips, saveStaffPayroll, updatePayrollSettings, generatePayslip, deletePayslip,
    generateLessonPlan,
    visitors, addVisitor,
    libraryBooks, bookIssues, addLibraryBook, deleteLibraryBook, issueBook, returnBook,
    addStudent, deleteStudent, updateStudent, promoteClassStudents, addStaff, markAttendance, setGrade, saveGrade, recordPayment, showToast,
    addClass, removeClass, addSubject, removeSubject, updateSchoolSettings, setClassFee,
    addExam, deleteExam, addEvent, deleteEvent, deletePayment, saveGradingLevel, setClassGrading, sendNotification, readNotification, deleteNotification,
    createTeacherLogin, updateTeacherLogin, deleteStaffMember, updateStaffDetails,
    clockArrival, clockDeparture, fetchStaffAttendanceForDate, saveAttendanceReason,
    uploadPhoto: (file, folder) => uploadPhoto(authedUser.accessToken, file, folder),
    fetchMarksFor: (args) => fetchMarksFor(authedUser.accessToken, args),
    saveMarkRow: (row) => saveMarkRow(authedUser.accessToken, row),
    fetchClassMarksForExam: (args) => fetchClassMarksForExam(authedUser.accessToken, args),
    fetchStudentMarksHistory: (studentId) => fetchStudentMarksHistory(authedUser.accessToken, studentId),
    fetchReportRemarks: (args) => fetchReportRemarks(authedUser.accessToken, args),
    saveReportRemarks: (args) => saveReportRemarks(authedUser.accessToken, args),
  };

  if (recoveryToken) {
    return (
      <div style={{ background: BG, minHeight: "100vh", color: INK, fontFamily: BODY_FONT }}>
        <style>{GLOBAL_CSS}</style>
        <ResetPasswordScreen
          accessToken={recoveryToken}
          onDone={() => {
            setRecoveryToken(null);
            window.history.replaceState(null, "", window.location.pathname);
          }}
        />
      </div>
    );
  }

  if (!authedUser) {
    return (
      <div style={{ background: BG, minHeight: "100vh", color: INK, fontFamily: BODY_FONT }}>
        <style>{GLOBAL_CSS}</style>
        {restoringSession ? (
          <div className="flex items-center justify-center" style={{ minHeight: "100vh", color: "#8a8474", fontSize: 13.5 }}>
            Signing you in…
          </div>
        ) : (
          <LoginScreen onLogin={handleLogin} />
        )}
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: "100vh", color: INK, fontFamily: BODY_FONT }}>
      <style>{GLOBAL_CSS}</style>
      <div className="flex min-h-screen">
        <button type="button" aria-label="Open menu" className="sidebar-menu-button focus-ring" onClick={() => setMenuOpen(true)} style={{ width: 42, height: 42, borderRadius: 10, border: `1px solid ${LINE}`, background: PANEL, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>☰</button>
        <div className={`sidebar-backdrop ${menuOpen ? "open" : ""}`} onClick={() => setMenuOpen(false)} />
        <Sidebar view={view} setView={(v) => { setView(v); setMenuOpen(false); }} role={authedUser.role} menuOpen={menuOpen} />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar authedUser={authedUser} schoolSettings={schoolSettings} classCount={classes.length} myAttendanceToday={myAttendanceToday} clockArrival={clockArrival} clockDeparture={clockDeparture} onLogout={() => {
            fetch(`${SUPABASE_URL}/auth/v1/logout`, {
              method: "POST",
              headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${authedUser.accessToken}` },
            }).catch(() => {});
            sessionStore.clear();
            setAuthedUser(null);
          }} />
          <main className="flex-1 min-w-0">
            {authedUser && ["Class Teacher", "Subject Teacher"].includes(authedUser.role) && (() => {
              const unread = notifications.filter((n) => !n.read).length;
              return unread > 0 ? (
                <button onClick={() => setView("notifications")} className="focus-ring" style={{ width:"calc(100% - 28px)", margin:"14px 14px 0", padding:"12px 14px", borderRadius:12, border:"1px solid #E9CFC4", background:"#FFF4EE", color:"#7E351F", display:"flex", alignItems:"center", gap:10, cursor:"pointer", textAlign:"left" }}>
                  <span style={{width:34,height:34,borderRadius:10,background:"#F7D9CC",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Bell size={17}/></span>
                  <span style={{fontSize:13,fontWeight:700}}>You have {unread} unread notice{unread === 1 ? "" : "s"}</span>
                  <ChevronRight size={16} style={{marginLeft:"auto"}}/>
                </button>
              ) : null;
            })()}
            {dataLoading && (
              <div className="flex items-center justify-center" style={{ padding: 60, color: "#8a8474", fontSize: 13.5 }}>
                Loading school data…
              </div>
            )}
            {!dataLoading && dataError && (
              <div className="flex flex-col items-center justify-center" style={{ padding: 60, color: "#a1442c", fontSize: 13.5, textAlign: "center", gap: 10 }}>
                <AlertTriangle size={20} />
                <span>{dataError}</span>
                <button onClick={() => loadData(authedUser.accessToken)} className="focus-ring" style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Retry</button>
              </div>
            )}
            {!dataLoading && !dataError && (
              <>
                {view === "dashboard" && isAdmin && <Dashboard {...ctx} />}
                {view === "dashboard" && ["Class Teacher", "Subject Teacher"].includes(authedUser?.role) && <TeacherDashboard {...ctx} />}
                {view === "dashboard" && authedUser?.role === "Clerk" && <ClerkDashboard {...ctx} />}
                {view === "dashboard" && authedUser?.role === "Receptionist" && <ReceptionistDashboard {...ctx} />}
                {view === "dashboard" && authedUser?.role === "Librarian" && <LibrarianDashboard {...ctx} />}
                {view === "students" && isAdmin && <StudentsView {...ctx} />}
                {view === "attendance" && <AttendanceView {...ctx} />}
                {view === "grades" && <GradesView {...ctx} />}
                {view === "fees" && canFinanceHR && <FeesView {...ctx} />}
                {view === "staff" && isAdmin && <StaffView {...ctx} />}
                {view === "hr" && canFinanceHR && <HRView {...ctx} />}
                {view === "exams" && <ExamsView {...ctx} />}
                {view === "timetable" && <TimetableView {...ctx} />}
                {view === "notifications" && <NotificationsView {...ctx} />}
                {view === "resources" && <ResourcesView {...ctx} />}
                {view === "communication" && isAdmin && <CommunicationView {...ctx} />}
                {view === "events" && <EventsView {...ctx} />}
                {view === "setup" && isSuperAdmin && <SchoolSetupView {...ctx} />}
                {view === "frontoffice" && canFrontOffice && <FrontOfficeView {...ctx} />}
                {view === "library" && canLibrary && <LibraryView {...ctx} />}
              </>
            )}
          </main>
        </div>
      </div>
      {toast && <Toast message={toast} />}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  LOGIN SCREEN — real authentication via Supabase Auth. Credentials are
 *  checked server-side against Supabase's hashed password store; nothing
 *  about "who's allowed in" lives in this file.
 * ---------------------------------------------------------------------- */
function LoginScreen({ onLogin }) {
  const [schoolName, setSchoolName] = useState("Brightfuture Primary School");
  const [mode, setMode] = useState("signin"); // signin | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPublicSchoolName().then((name) => {
      if (!cancelled && name?.trim()) setSchoolName(name.trim());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const auth = await supabaseSignIn(email.trim(), password);
      const profile = await fetchStaffProfile(auth.access_token, auth.user.id);
      onLogin({ ...profile, accessToken: auth.access_token, refreshToken: auth.refresh_token });
    } catch (err) {
      const msg = err.message || "";
      if (/invalid login credentials/i.test(msg)) {
        setError("Incorrect email or password. Double-check them, or reset your password below.");
      } else {
        setError(msg || "Something went wrong signing in.");
      }
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const redirectTo = window.location.origin + window.location.pathname;
      await supabaseRequestPasswordReset(email.trim(), redirectTo);
      setResetSent(true);
    } catch (err) {
      setError(err.message || "Couldn't send the reset email.");
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (next) => {
    setMode(next);
    setError("");
    setResetSent(false);
  };

  return (
    <div className="flex items-center justify-center" style={{ minHeight: "100vh", padding: 20 }}>
      <div style={{ width: 380, maxWidth: "100%" }}>
        <div className="flex flex-col items-center mb-6">
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <School size={26} color="#fff" />
          </div>
          <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 600, textAlign: "center" }}>{schoolName}</h1>
          <p style={{ fontSize: 12.5, color: "#7A7568", marginTop: 2 }}>
            {mode === "signin" ? "Sign in to the school management system" : "Reset your password"}
          </p>
        </div>

        {mode === "signin" ? (
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 28 }}>
            <Field label="Staff email">
              <input
                value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }}
                placeholder="firstname.lastname@brightfuture.sch.ke"
                className="focus-ring" style={inputStyle} autoFocus
              />
            </Field>
            <div style={{ marginTop: 14 }}>
              <Field label="Password">
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }} placeholder="••••••••"
                  className="focus-ring" style={inputStyle}
                />
              </Field>
            </div>
            {error && (
              <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10, lineHeight: 1.4 }}>
                <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
              </div>
            )}
            <button type="button" onClick={submit} disabled={loading} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.75 : 1 }}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
            <button
              type="button"
              onClick={() => switchMode("reset")}
              className="focus-ring"
              style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: "#8a8474", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
            >
              Forgot your password?
            </button>
          </div>
        ) : (
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 28 }}>
            {resetSent ? (
              <div className="flex flex-col items-center text-center gap-2" style={{ padding: "8px 0" }}>
                <CheckCircle2 size={22} color="#2f6f4a" />
                <p style={{ fontSize: 13, lineHeight: 1.5 }}>
                  If <strong>{email.trim()}</strong> has an account, a reset link is on its way. Open it on this device to set a new password.
                </p>
              </div>
            ) : (
              <>
                <Field label="Staff email">
                  <input
                    value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submitReset(e); }}
                    placeholder="firstname.lastname@brightfuture.sch.ke"
                    className="focus-ring" style={inputStyle} autoFocus
                  />
                </Field>
                {error && (
                  <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10, lineHeight: 1.4 }}>
                    <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
                  </div>
                )}
                <button type="button" onClick={submitReset} disabled={loading} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 9, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.75 : 1 }}>
                  {loading ? "Sending…" : "Send Reset Link"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="focus-ring"
              style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: "#8a8474", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}
            >
              Back to sign in
            </button>
          </div>
        )}

        <p style={{ marginTop: 14, fontSize: 11.5, color: "#8a8474", textAlign: "center" }}>
          Real accounts, checked against Supabase Auth — not a local demo.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  RESET PASSWORD SCREEN — shown when the app is opened from the link in
 *  a password-reset email (Supabase redirects here with a one-time token
 *  in the URL fragment; see the useEffect in App that reads it).
 * ---------------------------------------------------------------------- */
function ResetPasswordScreen({ accessToken, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    try {
      await supabaseUpdatePassword(accessToken, password);
      setDone(true);
    } catch (err) {
      setError(err.message || "Couldn't update your password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center" style={{ minHeight: "100vh", padding: 20 }}>
      <div style={{ width: 380, maxWidth: "100%" }}>
        <div className="flex flex-col items-center mb-6">
          <div style={{ width: 52, height: 52, borderRadius: 14, background: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
            <School size={26} color="#fff" />
          </div>
          <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 600, textAlign: "center" }}>Set a new password</h1>
        </div>

        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 16, padding: 28 }}>
          {done ? (
            <div className="flex flex-col items-center text-center gap-3">
              <CheckCircle2 size={22} color="#2f6f4a" />
              <p style={{ fontSize: 13 }}>Your password has been updated.</p>
              <button onClick={onDone} className="focus-ring" style={{ padding: "10px 18px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Continue to sign in
              </button>
            </div>
          ) : (
            <div>
              <Field label="New password">
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }} className="focus-ring" style={inputStyle} autoFocus />
              </Field>
              <div style={{ marginTop: 14 }}>
                <Field label="Confirm new password">
                  <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(e); }} className="focus-ring" style={inputStyle} />
                </Field>
              </div>
              {error && (
                <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10, lineHeight: 1.4 }}>
                  <AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}
                </div>
              )}
              <button type="button" onClick={submit} disabled={loading} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "11px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13.5, cursor: loading ? "wait" : "pointer", opacity: loading ? 0.75 : 1 }}>
                {loading ? "Saving…" : "Save New Password"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  SIDEBAR / TOPBAR / TOAST
 * ---------------------------------------------------------------------- */
function Sidebar({ view, setView, role, menuOpen }) {
  const allItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: [...ADMIN_ROLES, "Class Teacher", "Subject Teacher", "Clerk", "Receptionist", "Librarian"] },
    { id: "students", label: "Students", icon: Users, roles: ADMIN_ROLES },
    { id: "attendance", label: "Attendance", icon: CalendarCheck, roles: [...ADMIN_ROLES, "Class Teacher"] },
    { id: "grades", label: "Grades", icon: GraduationCap, roles: [...ADMIN_ROLES, "Class Teacher"] },
    { id: "fees", label: "Finance", icon: Wallet, roles: FINANCE_HR_ROLES },
    { id: "staff", label: "Staff", icon: Briefcase, roles: ADMIN_ROLES },
    { id: "hr", label: "HR", icon: UserCheck, roles: FINANCE_HR_ROLES },
    { id: "exams", label: "Exams", icon: ClipboardList, roles: [...ADMIN_ROLES, "Class Teacher", "Subject Teacher"] },
    { id: "timetable", label: "Timetable", icon: CalendarRange, roles: [...ADMIN_ROLES, "Class Teacher", "Subject Teacher"] },
    { id: "notifications", label: "Notifications", icon: Bell, roles: [...ADMIN_ROLES, "Class Teacher", "Subject Teacher", "Clerk", "Receptionist", "Librarian", "Subordinate Staff"] },
    { id: "resources", label: "Resources", icon: BookOpen, roles: [...ADMIN_ROLES, "Class Teacher", "Subject Teacher"] },
    { id: "communication", label: "Communication", icon: Send, roles: ADMIN_ROLES },
    { id: "events", label: "Events", icon: CalendarDays, roles: [...ADMIN_ROLES, "Class Teacher"] },
    { id: "frontoffice", label: "Front Office", icon: Contact, roles: ["Admin", "Receptionist"] },
    { id: "library", label: "Library", icon: Library, roles: ["Admin", "Librarian"] },
    { id: "setup", label: "School Setup", icon: Settings2, roles: ["Admin"] },
  ];
  const items = allItems.filter((it) => it.roles.includes(role));
  return (
    <aside style={{ background: RAIL, width: 88, overflowY: "auto", WebkitOverflowScrolling: "touch" }} className={`sidebar-drawer ${menuOpen ? "open" : ""} flex flex-col items-center py-5 shrink-0`}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: ACCENT }} className="flex items-center justify-center mb-8">
        <School size={20} color="#fff" />
      </div>
      <nav className="flex flex-col gap-2 w-full items-center">
        {items.map((it) => {
          const Icon = it.icon;
          const active = view === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setView(it.id)}
              className="focus-ring"
              style={{
                width: 68, padding: "10px 4px", borderRadius: 12, border: "none",
                background: active ? RAIL_SOFT : "transparent",
                color: active ? "#F2B79A" : "#9FB0CB",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", gap: 4, transition: "background .15s",
              }}
            >
              <Icon size={19} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 10.5, letterSpacing: 0.2 }}>{it.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar({ authedUser, onLogout, schoolSettings, classCount, myAttendanceToday, clockArrival, clockDeparture }) {
  const [busy, setBusy] = useState(false);

  const handleClock = async (fn) => {
    setBusy(true);
    try { await fn(); } catch (err) { window.alert(err.message || "Couldn't record attendance."); }
    finally { setBusy(false); }
  };

  let clockBtn = null;
  if (!myAttendanceToday || !myAttendanceToday.arrivalTime) {
    clockBtn = (
      <button onClick={() => handleClock(clockArrival)} disabled={busy} className="focus-ring flex items-center gap-1.5" style={{ marginTop: 4, padding: "5px 12px", borderRadius: 999, border: "none", background: "#E3DED0", color: INK, fontSize: 11.5, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
        <LogIn size={12} /> {busy ? "…" : "Arrive"}
      </button>
    );
  } else if (!myAttendanceToday.departureTime) {
    clockBtn = (
      <button onClick={() => handleClock(clockDeparture)} disabled={busy} className="focus-ring flex items-center gap-1.5" style={{ marginTop: 4, padding: "5px 12px", borderRadius: 999, border: "none", background: "#2f6f4a", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: busy ? "wait" : "pointer" }}>
        <DoorOpen size={12} /> {busy ? "…" : "Depart"}
      </button>
    );
  } else {
    clockBtn = (
      <button disabled className="flex items-center gap-1.5" style={{ marginTop: 4, padding: "5px 12px", borderRadius: 999, border: "none", background: "#D8D2BD", color: "#8a8474", fontSize: 11.5, fontWeight: 700, cursor: "not-allowed" }}>
        <CheckCircle2 size={12} /> Departed
      </button>
    );
  }

  return (
    <header style={{ borderBottom: `1px solid ${LINE}`, background: BG, position: "relative", minHeight: 92 }} className="flex items-center justify-between px-7 py-3 shrink-0">
      <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", width: "min(62%, 680px)" }}>
        {schoolSettings?.logoUrl && (
          <img src={schoolSettings.logoUrl} alt="School logo" style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover", border: `1px solid ${LINE}`, marginBottom: 5 }} />
        )}
        <h1 style={{ fontFamily: DISPLAY_FONT, fontSize: 22, fontWeight: 600, letterSpacing: -0.2, margin: 0 }}>{schoolSettings?.name || "Brightfuture Primary School"}</h1>
        <p style={{ fontSize: 11.5, color: "#7A7568", margin: "2px 0 0" }}>{[schoolSettings?.address, schoolSettings?.email, schoolSettings?.contact].filter(Boolean).join(" · ")}</p>
        <p style={{ fontSize: 10.5, color: "#9a9484", margin: "2px 0 0" }}>{schoolSettings?.currentTerm || DEFAULT_TERM} · {classCount} classes · School Management System</p>
      </div>
      <div style={{ marginLeft: "auto" }} className="flex items-center gap-3">
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.1 }}>{authedUser.name}</div>
          <div style={{ fontSize: 10.5, color: "#8a8474" }}>{authedUser.role}</div>
          {clockBtn}
        </div>
        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: RAIL }}>
          {initials(authedUser.name)}
        </div>
        <button onClick={onLogout} className="focus-ring" title="Sign out" style={{ background: "none", border: `1px solid ${LINE}`, borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#8a8474" }}>
          <LogOut size={14} />
        </button>
      </div>
    </header>
  );
}

function Toast({ message }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
      background: RAIL, color: "#fff", padding: "10px 18px", borderRadius: 10,
      fontSize: 13.5, display: "flex", alignItems: "center", gap: 8, zIndex: 50,
      boxShadow: "0 10px 30px rgba(0,0,0,.25)",
    }}>
      <CheckCircle2 size={16} color={ACCENT} />
      {message}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone, sub }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: "14px 16px" }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.3 }}>{label}</span>
        <Icon size={14} color={tone || "#b5ae99"} />
      </div>
      <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 600, color: tone || INK }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#9a9484", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  DASHBOARD
 * ---------------------------------------------------------------------- */
function Dashboard({ students, staff, attendance, grades, payments, feeStructure, schoolDays, classes, schoolSettings, events, notifications, setView, goToStaffAttendance }) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showArrivalReminder = nowMinutes >= 8 * 60;
  const showDepartureReminder = nowMinutes >= 17 * 60 + 30;
  const latestDay = schoolDays[schoolDays.length - 1];
  const todayRecs = attendance.filter((a) => a.date === latestDay);
  const presentToday = todayRecs.filter((a) => a.status !== "Absent").length;
  const attendanceRate = todayRecs.length ? Math.round((presentToday / todayRecs.length) * 100) : 0;
  const totalDue = students.reduce((s, st) => s + (feeStructure[st.class] || 0), 0);
  const totalPaid = payments.filter((p) => p.account === "School Fees").reduce((s, p) => s + p.amount, 0);
  const outstanding = totalDue - totalPaid;
  const upcoming = (events || []).filter((e) => e.to >= new Date().toISOString().slice(0,10)).slice(0,6);

  const classRows = classes.map((c) => {
    const roster = students.filter((s) => s.class === c);
    const recs = attendance.filter((a) => a.date === latestDay && roster.some((s) => s.id === a.studentId));
    const present = recs.filter((a) => a.status !== "Absent").length;
    const rate = recs.length ? Math.round((present / recs.length) * 100) : 0;
    const due = roster.length * (feeStructure[c] || 0);
    const paid = payments.filter((p) => p.account === "School Fees" && roster.some((s) => s.id === p.studentId)).reduce((sum, p) => sum + p.amount, 0);
    return { class: c, count: roster.length, rate, due, paid };
  });

  const cards = [
    { label:"Students enrolled", value:students.length, sub:`${classes.length} classes`, icon:Users, bg:"#EAF3FF", tone:"#245B91" },
    { label:"Staff members", value:staff.length, sub:"Teaching & support", icon:Briefcase, bg:"#EEF8F0", tone:"#2F6F4A" },
    { label:"Attendance today", value:`${attendanceRate}%`, sub:`As of ${latestDay || "today"}`, icon:CalendarCheck, bg:"#FFF5E7", tone:attendanceRate < 85 ? "#A1442C" : "#A1702C" },
    { label:"Fees outstanding", value:money(outstanding), sub:`of ${money(totalDue)} due`, icon:Wallet, bg:"#F8ECF0", tone:outstanding > 0 ? "#A1442C" : "#2F6F4A" },
  ];

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1180 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Overview</h2>
        <p style={{ fontSize: 12.5, color: "#7A7568" }}>A quick view of the school's key information and activity.</p>
      </div>

      {(showArrivalReminder || showDepartureReminder) && (
        <div className="flex items-center gap-3" style={{ background: "#FFF5E7", border: "1px solid #F0DDB8", borderRadius: 10, padding: "12px 16px", marginBottom: 16 }}>
          <AlertTriangle size={16} color="#A1702C" />
          <span style={{ fontSize: 13, color: "#6b5730" }}>
            {showDepartureReminder ? "Please confirm today's staff departure times." : "Please confirm today's staff arrival times."}
          </span>
          <button onClick={goToStaffAttendance} className="focus-ring" style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "none", background: "#A1702C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            Review Attendance
          </button>
        </div>
      )}

      <div className="dashboard-overview-grid">
        {cards.map(({label,value,sub,icon:Icon,bg,tone}) => (
          <div key={label} className="dashboard-info-card" style={{ background:bg }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, textTransform:"uppercase", letterSpacing:.35 }}>{label}</span>
              <span style={{ width:34, height:34, borderRadius:10, background:"rgba(255,255,255,.72)", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon size={17} color={tone}/></span>
            </div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 700, color: INK }}>{value}</div>
            <div style={{ fontSize: 11, color:"#6b6656", marginTop:3 }}>{sub}</div>
          </div>
        ))}
      </div>

      {notifications?.length > 0 && (
        <div className="dashboard-section" style={{ background:"#FFF7EA", marginBottom:14 }}>
          <div className="flex items-center justify-between" style={{ marginBottom:10 }}>
            <div><div style={{fontSize:11,fontWeight:700,color:"#A1702C",textTransform:"uppercase"}}>Recent Notifications</div><div style={{fontSize:11,color:"#6b6656",marginTop:2}}>Notices sent to teachers</div></div>
            <Bell size={18} color="#A1702C"/>
          </div>
          {notifications.slice(0,4).map((n) => (
            <div key={n.id} style={{background:"rgba(255,255,255,.75)",borderRadius:10,padding:"10px 12px",marginBottom:7}}>
              <div className="flex items-start justify-between gap-3"><b style={{fontSize:13}}>{n.title}</b><span style={{fontSize:10,color:"#8a8474"}}>{new Date(n.createdAt).toLocaleDateString("en-GB")}</span></div>
              <div style={{fontSize:11.5,color:"#6b6656",marginTop:4}}>{n.message}</div>
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-events-grid">
        <div className="dashboard-section" style={{ background:"#EEF5FF" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div><div style={{ fontSize:11, fontWeight:700, color:"#245B91", textTransform:"uppercase" }}>Upcoming Events</div><div style={{fontSize:11,color:"#6b6656",marginTop:2}}>What is coming up next</div></div>
            <CalendarDays size={18} color="#245B91" />
          </div>
          {upcoming.length ? upcoming.map((e) => (
            <div key={e.id} className="dashboard-event-card" style={{ background:"rgba(255,255,255,.72)", marginBottom:8 }}>
              <div className="flex items-start justify-between gap-3"><div><b style={{fontSize:13}}>{e.name}</b>{e.location ? <div style={{fontSize:11,color:"#6b6656",marginTop:2}}>{e.location}</div> : null}</div><span style={{fontSize:10,fontWeight:700,color:e.type === "Exam" ? ACCENT : "#245B91",background:"#fff",padding:"4px 7px",borderRadius:999}}>{e.type}</span></div>
              <div style={{fontSize:11,color:"#7A7568",marginTop:8}}>{e.from}{e.to && e.to !== e.from ? ` to ${e.to}` : ""}</div>
            </div>
          )) : <div style={{fontSize:12,color:"#7A7568",padding:"12px 0"}}>No upcoming events.</div>}
        </div>

        <div className="dashboard-section" style={{ background:"#F6F0FF" }}>
          <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
            <div><div style={{ fontSize:11, fontWeight:700, color:"#6B4FA1", textTransform:"uppercase" }}>School Snapshot</div><div style={{fontSize:11,color:"#6b6656",marginTop:2}}>Important figures at a glance</div></div>
            <Award size={18} color="#6B4FA1" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div style={{background:"rgba(255,255,255,.72)",borderRadius:10,padding:12}}><div style={{fontSize:10,color:"#7A7568"}}>Classes</div><b style={{fontSize:18,fontFamily:MONO_FONT}}>{classes.length}</b></div>
            <div style={{background:"rgba(255,255,255,.72)",borderRadius:10,padding:12}}><div style={{fontSize:10,color:"#7A7568"}}>Present today</div><b style={{fontSize:18,fontFamily:MONO_FONT}}>{presentToday}</b></div>
            <div style={{background:"rgba(255,255,255,.72)",borderRadius:10,padding:12}}><div style={{fontSize:10,color:"#7A7568"}}>Fees paid</div><b style={{fontSize:15,fontFamily:MONO_FONT}}>{money(totalPaid)}</b></div>
            <div style={{background:"rgba(255,255,255,.72)",borderRadius:10,padding:12}}><div style={{fontSize:10,color:"#7A7568"}}>Learners absent</div><b style={{fontSize:18,fontFamily:MONO_FONT}}>{Math.max(0, todayRecs.filter(a=>a.status === "Absent").length)}</b></div>
          </div>
        </div>
      </div>

      <div className="dashboard-table-card">
        <div style={{ padding:"14px 16px", borderBottom:`1px solid ${LINE}`, background:"#FAF9F5" }}><div style={{fontWeight:700,fontSize:13}}>Class Overview</div><div style={{fontSize:11,color:"#7A7568",marginTop:2}}>Attendance and fee status by class</div></div>
        <div style={{ overflowX:"auto" }}>
          <div style={{ minWidth:650 }}>
            <div style={{ display:"grid",gridTemplateColumns:"1.3fr .8fr 1fr 1fr 1fr",padding:"10px 16px",fontSize:10.5,fontWeight:700,color:"#8a8474",textTransform:"uppercase",letterSpacing:.4,borderBottom:`1px solid ${LINE}` }}><span>Class</span><span>Students</span><span>Attendance</span><span>Fees Due</span><span>Fees Paid</span></div>
            {classRows.map((r) => <div key={r.class} style={{display:"grid",gridTemplateColumns:"1.3fr .8fr 1fr 1fr 1fr",padding:"11px 16px",fontSize:13,borderBottom:`1px solid ${LINE}`,alignItems:"center"}}><span style={{fontWeight:600}}>{r.class}</span><span style={{fontFamily:MONO_FONT,color:"#6b6656"}}>{r.count}</span><span style={{fontFamily:MONO_FONT,color:r.rate<85?"#a1442c":"#2f6f4a",fontWeight:600}}>{r.rate}%</span><span style={{fontFamily:MONO_FONT,color:"#6b6656"}}>{money(r.due)}</span><span style={{fontFamily:MONO_FONT}}>{money(r.paid)}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  TEACHER DASHBOARD — landing page for Class Teacher / Subject Teacher.
 *  Scoped to their own class where they have one; shows roster size,
 *  today's attendance rate, upcoming events, and a short pending-activity
 *  checklist (mark today's attendance, enter marks for the latest exam).
 * ---------------------------------------------------------------------- */
function TeacherDashboard({ authedUser, students, attendance, classes, events, exams, schoolDays, fetchClassMarksForExam, setView, showToast }) {
  const myClass = authedUser?.classTeacherOf || null;
  const roster = myClass ? students.filter((s) => s.class === myClass) : [];
  const today = schoolDays?.[schoolDays.length - 1] || new Date().toISOString().slice(0, 10);
  const todaysRecs = myClass ? attendance.filter((a) => a.date === today && roster.some((s) => s.id === a.studentId)) : [];
  const presentToday = todaysRecs.filter((a) => a.status !== "Absent").length;
  const attendanceRate = todaysRecs.length ? Math.round((presentToday / todaysRecs.length) * 100) : null;
  const attendanceMarkedToday = todaysRecs.length > 0;

  const todayStr = new Date().toISOString().slice(0, 10);
  const upcoming = (events || []).filter((e) => e.to >= todayStr).slice(0, 5);

  const latestExam = exams && exams.length ? exams[exams.length - 1] : null;
  const [examStatus, setExamStatus] = useState("checking"); // checking | pending | done | none

  useEffect(() => {
    let cancelled = false;
    async function check() {
      if (!latestExam) { setExamStatus("none"); return; }
      setExamStatus("checking");
      try {
        if (myClass) {
          const rows = await fetchClassMarksForExam({ studentClass: myClass, term: TERMS[1], year: EXAM_YEARS[1], examName: latestExam });
          if (!cancelled) setExamStatus(rows.length > 0 ? "done" : "pending");
        } else {
          const results = await Promise.all(
            (classes || []).map((c) => fetchClassMarksForExam({ studentClass: c, term: TERMS[1], year: EXAM_YEARS[1], examName: latestExam }).catch(() => []))
          );
          const mySubjects = authedUser?.subjects || [];
          const anyMine = results.flat().some((r) => mySubjects.includes(r.subject));
          if (!cancelled) setExamStatus(anyMine ? "done" : "pending");
        }
      } catch {
        if (!cancelled) setExamStatus("pending");
      }
    }
    check();
    return () => { cancelled = true; };
  }, [latestExam, myClass, (classes || []).join(",")]);

  const pending = [];
  if (myClass && !attendanceMarkedToday) pending.push({ label: `Mark today's attendance for ${myClass}`, view: "attendance" });
  if (latestExam && examStatus === "pending") pending.push({ label: `Enter marks for ${latestExam}`, view: "exams" });

  const cards = [
    myClass
      ? { label: "My class", value: myClass, sub: `${roster.length} student${roster.length === 1 ? "" : "s"}`, icon: Users, bg: "#EAF3FF", tone: "#245B91" }
      : { label: "Subjects taught", value: (authedUser?.subjects || []).length, sub: (authedUser?.subjects || []).join(", ") || "None set", icon: BookOpen, bg: "#EAF3FF", tone: "#245B91" },
    {
      label: myClass ? "Attendance today" : "Attendance",
      value: attendanceRate == null ? "—" : `${attendanceRate}%`,
      sub: myClass ? (attendanceMarkedToday ? `As of ${today}` : "Not marked yet") : "Marked by class teachers",
      icon: CalendarCheck, bg: "#FFF5E7", tone: attendanceRate != null && attendanceRate < 85 ? "#A1442C" : "#A1702C",
    },
  ];

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1000 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Welcome, {authedUser?.name?.split(" ")[0] || "there"}</h2>
        <p style={{ fontSize: 12.5, color: "#7A7568" }}>Your class at a glance.</p>
      </div>

      <div className="dashboard-overview-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        {cards.map(({ label, value, sub, icon: Icon, bg, tone }) => (
          <div key={label} className="dashboard-info-card" style={{ background: bg }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: 0.35 }}>{label}</span>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={tone} /></span>
            </div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 700, color: INK }}>{value}</div>
            <div style={{ fontSize: 11, color: "#6b6656", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-section" style={{ background: "#FFF7EA", marginTop: 14, marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#A1702C", textTransform: "uppercase" }}>Pending Activities</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Things that still need your attention</div></div>
          <AlertTriangle size={18} color="#A1702C" />
        </div>
        {examStatus === "checking" && pending.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#7A7568", padding: "6px 0" }}>Checking…</div>
        ) : pending.length === 0 ? (
          <div style={{ fontSize: 12.5, color: "#2F6F4A", padding: "6px 0" }}>You're all caught up — nothing pending right now.</div>
        ) : (
          pending.map((p) => (
            <div key={p.label} className="flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.75)", borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>
              <button onClick={() => setView(p.view)} className="focus-ring" style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#A1702C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Do it now</button>
            </div>
          ))
        )}
      </div>

      <div className="dashboard-section" style={{ background: "#EEF5FF" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#245B91", textTransform: "uppercase" }}>Upcoming Events</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>What is coming up next</div></div>
          <CalendarDays size={18} color="#245B91" />
        </div>
        {upcoming.length ? upcoming.map((e) => (
          <div key={e.id} className="dashboard-event-card" style={{ background: "rgba(255,255,255,.72)", marginBottom: 8 }}>
            <div className="flex items-start justify-between gap-3"><div><b style={{ fontSize: 13 }}>{e.name}</b>{e.location ? <div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>{e.location}</div> : null}</div><span style={{ fontSize: 10, fontWeight: 700, color: e.type === "Exam" ? ACCENT : "#245B91", background: "#fff", padding: "4px 7px", borderRadius: 999 }}>{e.type}</span></div>
            <div style={{ fontSize: 11, color: "#7A7568", marginTop: 8 }}>{e.from}{e.to && e.to !== e.from ? ` to ${e.to}` : ""}</div>
          </div>
        )) : <div style={{ fontSize: 12, color: "#7A7568", padding: "12px 0" }}>No upcoming events.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  CLERK DASHBOARD — fees collection + HR/payroll at a glance
 * ---------------------------------------------------------------------- */
function ClerkDashboard({ students, feeStructure, payments, staff, staffPayroll, payslips, setView }) {
  const totalDue = students.reduce((s, st) => s + (feeStructure[st.class] || 0), 0);
  const schoolFeesPayments = payments.filter((p) => p.account === "School Fees");
  const totalPaid = schoolFeesPayments.reduce((s, p) => s + p.amount, 0);
  const outstanding = totalDue - totalPaid;
  const recentPayments = [...payments].sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, 5);

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const eligibleStaff = staff.filter((s) => staffPayroll.some((p) => p.staffId === s.id && p.basicSalary > 0));
  const generatedThisMonth = eligibleStaff.filter((s) => payslips.some((p) => p.staffId === s.id && p.month === month && p.year === year));
  const payrollPending = eligibleStaff.length - generatedThisMonth.length;
  const monthLabel = now.toLocaleString("en-GB", { month: "long" });

  const cards = [
    { label: "Fees collected", value: money(totalPaid), sub: `of ${money(totalDue)} due`, icon: Wallet, bg: "#EEF8F0", tone: "#2F6F4A" },
    { label: "Fees outstanding", value: money(outstanding), sub: outstanding > 0 ? "Follow up with guardians" : "All caught up", icon: AlertTriangle, bg: "#F8ECF0", tone: outstanding > 0 ? "#A1442C" : "#2F6F4A" },
    { label: "Payroll this month", value: `${generatedThisMonth.length}/${eligibleStaff.length}`, sub: `Payslips generated for ${monthLabel}`, icon: UserCheck, bg: "#EAF3FF", tone: payrollPending > 0 ? "#A1702C" : "#2F6F4A" },
  ];

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Finance & HR Overview</h2>
        <p style={{ fontSize: 12.5, color: "#7A7568" }}>Fees collection and payroll at a glance.</p>
      </div>

      <div className="dashboard-overview-grid">
        {cards.map(({ label, value, sub, icon: Icon, bg, tone }) => (
          <div key={label} className="dashboard-info-card" style={{ background: bg }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: 0.35 }}>{label}</span>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={tone} /></span>
            </div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 700, color: INK }}>{value}</div>
            <div style={{ fontSize: 11, color: "#6b6656", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-section" style={{ background: "#FFF7EA", marginTop: 14, marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#A1702C", textTransform: "uppercase" }}>Pending Activities</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Things that still need your attention</div></div>
          <AlertTriangle size={18} color="#A1702C" />
        </div>
        {payrollPending > 0 ? (
          <div className="flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.75)", borderRadius: 10, padding: "10px 12px" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Run payroll for {payrollPending} staff member{payrollPending === 1 ? "" : "s"} — {monthLabel}</span>
            <button onClick={() => setView("hr")} className="focus-ring" style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#A1702C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Do it now</button>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: "#2F6F4A", padding: "6px 0" }}>You're all caught up — nothing pending right now.</div>
        )}
      </div>

      <div className="dashboard-section" style={{ background: "#EEF8F0" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#2F6F4A", textTransform: "uppercase" }}>Recent Payments</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Latest fee payments recorded</div></div>
          <Wallet size={18} color="#2F6F4A" />
        </div>
        {recentPayments.length ? recentPayments.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.72)", borderRadius: 10, padding: "9px 12px", marginBottom: 7 }}>
            <div><b style={{ fontSize: 13 }}>{money(p.amount)}</b><span style={{ fontSize: 11, color: "#6b6656", marginLeft: 8 }}>{p.account}</span></div>
            <span style={{ fontSize: 11, fontFamily: MONO_FONT, color: "#7A7568" }}>{p.date}</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "#7A7568", padding: "12px 0" }}>No payments recorded yet.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  LIBRARIAN DASHBOARD — catalogue size, issued/overdue at a glance
 * ---------------------------------------------------------------------- */
function LibrarianDashboard({ libraryBooks, bookIssues, setView }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const totalCopies = libraryBooks.reduce((s, b) => s + b.totalCopies, 0);
  const outstanding = bookIssues.filter((i) => i.status !== "Returned");
  const overdue = outstanding.filter((i) => i.dueDate && i.dueDate < todayStr);
  const bookTitle = (id) => libraryBooks.find((b) => b.id === id)?.title || "—";

  const cards = [
    { label: "Books in catalogue", value: libraryBooks.length, sub: `${totalCopies} total copies`, icon: Library, bg: "#EAF3FF", tone: "#245B91" },
    { label: "Currently issued", value: outstanding.length, sub: "Not yet returned", icon: BookOpen, bg: "#F6F0FF", tone: "#6B4FA1" },
    { label: "Overdue", value: overdue.length, sub: overdue.length ? "Needs follow-up" : "All on time", icon: AlertTriangle, bg: "#F8ECF0", tone: overdue.length ? "#A1442C" : "#2F6F4A" },
  ];

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1040 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Library Overview</h2>
        <p style={{ fontSize: 12.5, color: "#7A7568" }}>Catalogue, issues, and returns at a glance.</p>
      </div>

      <div className="dashboard-overview-grid">
        {cards.map(({ label, value, sub, icon: Icon, bg, tone }) => (
          <div key={label} className="dashboard-info-card" style={{ background: bg }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: 0.35 }}>{label}</span>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={tone} /></span>
            </div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 700, color: INK }}>{value}</div>
            <div style={{ fontSize: 11, color: "#6b6656", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-section" style={{ background: "#FFF7EA", marginTop: 14, marginBottom: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#A1702C", textTransform: "uppercase" }}>Pending Activities</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Books that need following up</div></div>
          <AlertTriangle size={18} color="#A1702C" />
        </div>
        {overdue.length ? overdue.slice(0, 6).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.75)", borderRadius: 10, padding: "10px 12px", marginBottom: 7 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{bookTitle(i.bookId)} — {i.borrowerName}, due {i.dueDate}</span>
            <button onClick={() => setView("library")} className="focus-ring" style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#A1702C", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>Review</button>
          </div>
        )) : <div style={{ fontSize: 12.5, color: "#2F6F4A", padding: "6px 0" }}>No overdue books — nothing pending right now.</div>}
      </div>

      <div className="dashboard-section" style={{ background: "#F6F0FF" }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#6B4FA1", textTransform: "uppercase" }}>Currently Issued</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Books out on loan</div></div>
          <BookOpen size={18} color="#6B4FA1" />
        </div>
        {outstanding.length ? outstanding.slice(0, 6).map((i) => (
          <div key={i.id} className="flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,.72)", borderRadius: 10, padding: "9px 12px", marginBottom: 7 }}>
            <div><b style={{ fontSize: 13 }}>{bookTitle(i.bookId)}</b><span style={{ fontSize: 11, color: "#6b6656", marginLeft: 8 }}>{i.borrowerName}</span></div>
            <span style={{ fontSize: 11, fontFamily: MONO_FONT, color: "#7A7568" }}>due {i.dueDate || "—"}</span>
          </div>
        )) : <div style={{ fontSize: 12, color: "#7A7568", padding: "12px 0" }}>Nothing out on loan right now.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  RECEPTIONIST DASHBOARD — today's visitor traffic at a glance
 * ---------------------------------------------------------------------- */
function ReceptionistDashboard({ visitors, setView }) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const todaysVisitors = visitors.filter((v) => v.date === todayStr);
  const recent = [...visitors].slice(0, 6);

  const cards = [
    { label: "Visitors today", value: todaysVisitors.length, sub: todayStr, icon: Contact, bg: "#EAF3FF", tone: "#245B91" },
    { label: "Total logged", value: visitors.length, sub: "All time", icon: Users, bg: "#EEF8F0", tone: "#2F6F4A" },
  ];

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1000 }}>
      <div className="flex items-start justify-between" style={{ marginBottom: 18 }}>
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 21, fontWeight: 600, marginBottom: 3 }}>Front Office Overview</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>Today's visitor traffic at a glance.</p>
        </div>
        <button onClick={() => setView("frontoffice")} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>Log a Visitor</button>
      </div>

      <div className="dashboard-overview-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
        {cards.map(({ label, value, sub, icon: Icon, bg, tone }) => (
          <div key={label} className="dashboard-info-card" style={{ background: bg }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: tone, textTransform: "uppercase", letterSpacing: 0.35 }}>{label}</span>
              <span style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(255,255,255,.72)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={17} color={tone} /></span>
            </div>
            <div style={{ fontFamily: MONO_FONT, fontSize: 22, fontWeight: 700, color: INK }}>{value}</div>
            <div style={{ fontSize: 11, color: "#6b6656", marginTop: 3 }}>{sub}</div>
          </div>
        ))}
      </div>

      <div className="dashboard-section" style={{ background: "#EEF5FF", marginTop: 14 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div><div style={{ fontSize: 11, fontWeight: 700, color: "#245B91", textTransform: "uppercase" }}>Recent Visitors</div><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>Latest entries in the log</div></div>
          <Contact size={18} color="#245B91" />
        </div>
        {recent.length ? recent.map((v) => (
          <div key={v.id} className="dashboard-event-card" style={{ background: "rgba(255,255,255,.72)", marginBottom: 8 }}>
            <div className="flex items-start justify-between gap-3"><div><b style={{ fontSize: 13 }}>{v.name}</b><div style={{ fontSize: 11, color: "#6b6656", marginTop: 2 }}>{v.reason}</div></div><span style={{ fontSize: 10, fontWeight: 700, color: "#245B91", background: "#fff", padding: "4px 7px", borderRadius: 999 }}>{v.date}</span></div>
            {v.comments ? <div style={{ fontSize: 11, color: "#7A7568", marginTop: 8 }}>{v.comments}</div> : null}
          </div>
        )) : <div style={{ fontSize: 12, color: "#7A7568", padding: "12px 0" }}>No visitors logged yet.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  STUDENTS
 * ---------------------------------------------------------------------- */
function StudentsView(ctx) {
  const { students, addStudent, showToast, classes, isAdmin, promoteClassStudents } = ctx;
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("All");
  const [selectedId, setSelectedId] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  // Re-looked-up from the live `students` array (rather than storing the
  // clicked row itself) so the profile modal reflects an edit immediately,
  // without needing to be closed and reopened.
  const selected = selectedId != null ? students.find((s) => s.id === selectedId) : null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((s) => {
      if (classFilter !== "All" && s.class !== classFilter) return false;
      if (!q) return true;
      return s.name.toLowerCase().includes(q) || s.admissionNo.toLowerCase().includes(q);
    });
  }, [students, query, classFilter]);

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1180 }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600 }}>Students</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>{students.length} enrolled across {classes.length} classes</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button onClick={() => setPromoteOpen(true)} className="focus-ring flex items-center gap-2" style={{ background: PANEL, color: "#5b5747", border: `1px solid ${LINE}`, borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <TrendingUp size={15} /> Promote Class
          </button>
          )}
          <button onClick={() => setAddOpen(true)} className="focus-ring flex items-center gap-2" style={{ background: RAIL, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <Plus size={15} /> Add Student
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} color="#9a9484" style={{ position: "absolute", left: 11, top: 10 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or admission no…" className="focus-ring" style={{ width: "100%", padding: "8px 10px 8px 32px", borderRadius: 9, border: `1px solid ${LINE}`, background: PANEL, fontSize: 13 }} />
        </div>
        <div className="flex gap-1.5 overflow-x-auto">
          {["All", ...classes].map((c) => (
            <button key={c} onClick={() => setClassFilter(c)} className="focus-ring" style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${classFilter === c ? "transparent" : LINE}`, background: classFilter === c ? RAIL : PANEL, color: classFilter === c ? "#fff" : "#5b5747", cursor: "pointer" }}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr 1fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Student</span><span>Class</span><span>Gender</span><span>Guardian</span><span>Status</span>
        </div>
        <div style={{ maxHeight: 520, overflowY: "auto" }}>
          {filtered.map((s) => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} className="focus-ring" style={{ width: "100%", textAlign: "left", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.4fr 1fr", padding: "10px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center", background: "none", border: "none", cursor: "pointer" }}>
              <div className="flex items-center gap-2.5">
                {s.photoUrl ? (
                  <img src={s.photoUrl} alt={s.name} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: RAIL, flexShrink: 0 }}>{initials(s.name)}</div>
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 10.5, color: "#a39c86", fontFamily: MONO_FONT }}>{s.admissionNo}</div>
                </div>
              </div>
              <span style={{ color: "#6b6656" }}>{s.class}</span>
              <span style={{ color: "#6b6656" }}>{s.gender === "M" ? "Male" : "Female"}</span>
              <span style={{ color: "#6b6656" }}>{s.guardian}</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2f6f4a" }}>{s.status}</span>
            </button>
          ))}
          {filtered.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No students match.</div>}
        </div>
      </div>

      {selected && <StudentProfile student={selected} onClose={() => setSelectedId(null)} {...ctx} />}
      {addOpen && <AddStudentModal classes={classes} uploadPhoto={ctx.uploadPhoto} onClose={() => setAddOpen(false)} onAdd={async (s) => {
        try {
          await addStudent(s);
          showToast(`${s.name} added to ${s.class}`);
          setAddOpen(false);
        } catch (err) {
          showToast(err.message || "Couldn't add student");
        }
      }} />}
      {promoteOpen && (
        <PromoteClassModal
          students={students} classes={classes}
          onClose={() => setPromoteOpen(false)}
          onPromote={async (fromClass, toClass) => {
            try {
              await promoteClassStudents(fromClass, toClass);
              showToast(`Promoted everyone in ${fromClass} to ${toClass}`);
              setPromoteOpen(false);
            } catch (err) {
              showToast(err.message || "Couldn't promote class");
            }
          }}
        />
      )}
    </div>
  );
}

// Bulk-moves every student in one class into another — the end-of-year
// promotion workflow (Grade 3 → Grade 4 for everyone at once), rather than
// editing each student's class individually.
function PromoteClassModal({ students, classes, onClose, onPromote }) {
  const [fromClass, setFromClass] = useState(classes[0] || "");
  const [toClass, setToClass] = useState(classes[1] || classes[0] || "");
  const [promoting, setPromoting] = useState(false);
  const affected = students.filter((s) => s.class === fromClass).length;

  const submit = async () => {
    if (!fromClass || !toClass) return;
    if (fromClass === toClass) return;
    if (affected === 0) return;
    if (!window.confirm(`Move all ${affected} student${affected === 1 ? "" : "s"} from ${fromClass} to ${toClass}? This can't be undone automatically.`)) return;
    setPromoting(true);
    try {
      await onPromote(fromClass, toClass);
    } finally {
      setPromoting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 380, padding: 24 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Promote Class</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="From class"><select value={fromClass} onChange={(e) => setFromClass(e.target.value)} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="To class"><select value={toClass} onChange={(e) => setToClass(e.target.value)} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <p style={{ fontSize: 12.5, color: "#7A7568", marginTop: 14 }}>
          {fromClass === toClass ? "Pick two different classes." : `This moves all ${affected} student${affected === 1 ? "" : "s"} currently in ${fromClass} into ${toClass}.`}
        </p>
        <button type="button" onClick={submit} disabled={promoting || fromClass === toClass || affected === 0} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: promoting ? "wait" : "pointer", opacity: fromClass === toClass || affected === 0 ? 0.5 : 1 }}>
          {promoting ? "Promoting…" : `Promote ${affected} Student${affected === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}

function StudentProfile({ student, onClose, grades, attendance, payments, recordPayment, deletePayment, showToast, feeStructure, otherFeeStructure, schoolDays, subjects, deleteStudent, updateStudent, classes, uploadPhoto }) {
  const [tab, setTab] = useState("overview");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const myGrades = grades.filter((g) => g.studentId === student.id);
  const avg = myGrades.length ? Math.round(myGrades.reduce((s, g) => s + g.score, 0) / myGrades.length) : 0;
  const myAttendance = attendance.filter((a) => a.studentId === student.id);
  const present = myAttendance.filter((a) => a.status !== "Absent").length;
  const rate = myAttendance.length ? Math.round((present / myAttendance.length) * 100) : 0;
  const myPayments = payments.filter((p) => p.studentId === student.id);
  const due = feeStructure[student.class] || 0;
  const paid = myPayments.filter((p) => p.account === "School Fees").reduce((s, p) => s + p.amount, 0);
  const balance = due - paid;

  const confirmedDelete = async () => {
    setDeleting(true);
    try {
      await deleteStudent(student.id);
      showToast(`${student.name} was removed`);
      onClose();
    } catch (err) {
      showToast(err.message || "Couldn't delete student");
      setDeleting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 520, maxHeight: "84vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: `1px solid ${LINE}` }}>
          <div className="flex items-center gap-3">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.name} style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
            ) : (
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, color: RAIL }}>{initials(student.name)}</div>
            )}
            <div>
              <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>{student.name}</h3>
              <p style={{ fontSize: 11.5, color: "#9a9484" }}>{student.admissionNo} · {student.class}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 11.5, color: "#a1442c" }}>Delete {student.name}?</span>
                <button onClick={confirmedDelete} disabled={deleting} className="focus-ring" style={{ padding: "5px 10px", borderRadius: 7, border: "none", background: "#a1442c", color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: deleting ? "wait" : "pointer" }}>{deleting ? "Deleting…" : "Confirm"}</button>
                <button onClick={() => setConfirmDelete(false)} className="focus-ring" style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: "none", fontSize: 11.5, cursor: "pointer" }}>Cancel</button>
              </>
            ) : (
              <>
                <button onClick={() => setEditOpen(true)} className="focus-ring flex items-center gap-1" title="Edit student details" style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: BG, color: "#5b5747", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  <Pencil size={12} /> Edit
                </button>
                <button onClick={() => setConfirmDelete(true)} className="focus-ring flex items-center gap-1" title="Delete student" style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid #F0CFC4`, background: "#FBEDE7", color: "#a1442c", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
                  <Trash2 size={12} /> Delete
                </button>
              </>
            )}
            <button onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
          </div>
        </div>

        <div className="flex gap-1 px-6 pt-3" style={{ borderBottom: `1px solid ${LINE}` }}>
          {["overview", "grades", "attendance", "payments"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className="focus-ring" style={{ padding: "8px 12px", background: "none", border: "none", borderBottom: tab === t ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 12.5, fontWeight: 600, color: tab === t ? INK : "#9a9484", cursor: "pointer", textTransform: "capitalize" }}>{t}</button>
          ))}
        </div>

        <div className="px-6 py-5" style={{ overflowY: "auto" }}>
          {tab === "overview" && (
            <div className="flex flex-col gap-3">
              <InfoRow icon={Phone} label="Guardian" value={`${student.guardian} (${student.relationship}) · ${student.phone}`} />
              <InfoRow icon={CalendarCheck} label="Enrolled" value={student.enrolled} />
              <div className="grid grid-cols-3 gap-2 mt-2">
                <MiniStat label="Avg score" value={`${avg}%`} />
                <MiniStat label="Attendance" value={`${rate}%`} />
                <MiniStat label="Fee balance" value={money(balance)} tone={balance > 0 ? "#a1442c" : "#2f6f4a"} />
              </div>
            </div>
          )}
          {tab === "grades" && (
            <div className="flex flex-col gap-1.5">
              {subjects.map((subj) => {
                const g = myGrades.find((x) => x.subject === subj);
                const score = g ? g.score : null;
                return (
                  <div key={subj} className="flex items-center justify-between" style={{ padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                    <span>{subj}</span>
                    {score != null ? (
                      <span className="flex items-center gap-2">
                        <span style={{ fontFamily: MONO_FONT }}>{score}%</span>
                        <span title={gradeLabel(gradeLetter(score))} style={{ fontSize: 10.5, fontWeight: 700, color: gradeColor(gradeLetter(score)), border: `1px solid ${gradeColor(gradeLetter(score))}`, borderRadius: 6, padding: "1px 6px" }}>{gradeLetter(score)}</span>
                      </span>
                    ) : <span style={{ color: "#c4bda7", fontSize: 12 }}>Not graded</span>}
                  </div>
                );
              })}
              <div className="flex items-center justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${LINE}`, fontSize: 13, fontWeight: 700 }}>
                <span>Overall average</span><span style={{ fontFamily: MONO_FONT }}>{avg}%</span>
              </div>
            </div>
          )}
          {tab === "attendance" && (
            <div className="flex flex-col gap-1.5">
              {schoolDays.slice().reverse().map((day) => {
                const rec = myAttendance.find((a) => a.date === day);
                return (
                  <div key={day} className="flex items-center justify-between" style={{ padding: "7px 0", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
                    <span style={{ fontFamily: MONO_FONT, color: "#6b6656" }}>{day}</span>
                    <AttendanceBadge status={rec ? rec.status : "—"} />
                  </div>
                );
              })}
            </div>
          )}
          {tab === "payments" && (
            <PaymentsTab student={student} due={due} paid={paid} balance={balance} payments={myPayments} otherFeeStructure={otherFeeStructure} recordPayment={recordPayment} deletePayment={deletePayment} showToast={showToast} />
          )}
        </div>
      </div>
      {editOpen && (
        <EditStudentModal
          student={student} classes={classes} uploadPhoto={uploadPhoto}
          onClose={() => setEditOpen(false)}
          onSave={async (patch) => {
            try {
              await updateStudent(student.id, patch);
              showToast(`${patch.name}'s details updated`);
              setEditOpen(false);
            } catch (err) {
              showToast(err.message || "Couldn't update student");
            }
          }}
        />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon size={14} color="#9a9484" style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase" }}>{label}</div>
        <div style={{ fontSize: 13 }}>{value}</div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  return (
    <div style={{ background: BG, borderRadius: 9, padding: "10px 12px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#a39c86", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: MONO_FONT, fontSize: 16, fontWeight: 600, color: tone || INK }}>{value}</div>
    </div>
  );
}

function AttendanceBadge({ status }) {
  const map = {
    Present: { color: "#2f6f4a", icon: CheckCircle2 },
    Late: { color: "#a1702c", icon: Clock3 },
    Absent: { color: "#a1442c", icon: XCircle },
    "—": { color: "#c4bda7", icon: Clock3 },
  };
  const m = map[status] || map["—"];
  const Icon = m.icon;
  return <span className="flex items-center gap-1.5" style={{ color: m.color, fontSize: 12.5, fontWeight: 600 }}><Icon size={13} />{status}</span>;
}

function PaymentsTab({ student, due, paid, balance, payments, otherFeeStructure, recordPayment, deletePayment, showToast }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("M-Pesa");
  const [account, setAccount] = useState("School Fees");

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    try {
      await recordPayment({ studentId: student.id, amount: amt, date: new Date().toISOString().slice(0, 10), method, account });
      showToast(`Recorded ${money(amt)} (${account}) for ${student.name}`);
      setAmount("");
    } catch (err) {
      showToast(err.message || "Couldn't record payment");
    }
  };

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {PAYMENT_ACCOUNTS.map((acct) => {
          const isCompulsory = COMPULSORY_ACCOUNTS.includes(acct);
          const acctDue = isCompulsory ? due : (otherFeeStructure[acct]?.[student.class] || 0);
          const acctPaid = payments.filter((p) => p.account === acct).reduce((s, p) => s + p.amount, 0);
          const acctBalance = acctDue - acctPaid;
          return (
            <div key={acct} style={{ border: `1px solid ${LINE}`, borderRadius: 10, padding: "8px 10px" }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 2 }}>
                <span style={{ fontSize: 11.5, fontWeight: 700 }}>{acct}</span>
                {!isCompulsory && <span style={{ fontSize: 9.5, color: "#a39c86", textTransform: "uppercase" }}>Optional</span>}
              </div>
              {acctDue > 0 ? (
                <div className="flex items-center justify-between" style={{ fontSize: 12 }}>
                  <span style={{ color: "#2f6f4a", fontFamily: MONO_FONT }}>{money(acctPaid)} paid</span>
                  <span style={{ fontFamily: MONO_FONT, fontWeight: 700, color: acctBalance > 0 ? "#a1442c" : "#2f6f4a" }}>{money(acctBalance)} bal.</span>
                </div>
              ) : (
                <span style={{ fontSize: 12, fontFamily: MONO_FONT, color: "#2f6f4a" }}>{money(acctPaid)} paid</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mb-4">
        <select value={account} onChange={(e) => setAccount(e.target.value)} className="focus-ring" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 13 }}>
          {PAYMENT_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
        </select>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (KSh)" className="focus-ring" style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 13, fontFamily: MONO_FONT }} />
        <select value={method} onChange={(e) => setMethod(e.target.value)} className="focus-ring" style={{ padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 13 }}>
          <option>M-Pesa</option><option>Cash</option><option>Bank</option>
        </select>
        <button type="button" onClick={submit} className="focus-ring" style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }}>Record</button>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 6 }}>Payment history</div>
      <div className="flex flex-col gap-1.5">
        {payments.length === 0 && <p style={{ fontSize: 12.5, color: "#c4bda7" }}>No payments recorded yet.</p>}
        {payments.slice().reverse().map((p) => (
          <div key={p.id} className="flex items-center justify-between" style={{ fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${LINE}` }}>
            <span style={{ color: "#6b6656" }}>{p.date} · {p.account || "School Fees"} · {p.method}</span>
            <div className="flex items-center gap-2"><span style={{ fontFamily: MONO_FONT, fontWeight: 600 }}>{money(p.amount)}</span><button onClick={() => deletePayment(p.id)} className="focus-ring" title="Delete payment" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer" }}><Trash2 size={13} /></button></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddStudentModal({ onClose, onAdd, classes, uploadPhoto }) {
  const [form, setForm] = useState({ name: "", gender: "M", class: classes[0], guardian: "", relationship: "Mother", phone: "" });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.guardian.trim()) return;
    setError("");
    setUploading(true);
    try {
      let photoUrl = "";
      if (photoFile) photoUrl = await uploadPhoto(photoFile, "students");
      onAdd({
        ...form,
        photoUrl,
        admissionNo: `BF${1000 + Math.floor(Math.random() * 9000)}`,
        enrolled: new Date().toISOString().slice(0, 10),
        status: "Active",
      });
    } catch (err) {
      setError(err.message || "Couldn't upload photo.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 420, padding: 24 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Add Student</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <PhotoField label="Student photo" preview={photoPreview} onChange={onPhotoChange} />
          <Field label="Full name"><input required value={form.name} onChange={set("name")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="Gender"><select value={form.gender} onChange={set("gender")} className="focus-ring" style={inputStyle}><option value="M">Male</option><option value="F">Female</option></select></Field>
            <Field label="Class"><select value={form.class} onChange={set("class")} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Guardian name"><input required value={form.guardian} onChange={set("guardian")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="Relationship"><select value={form.relationship} onChange={set("relationship")} className="focus-ring" style={inputStyle}><option>Mother</option><option>Father</option><option>Guardian</option></select></Field>
            <Field label="Phone"><input value={form.phone} onChange={set("phone")} placeholder="07…" className="focus-ring" style={inputStyle} /></Field>
          </div>
        </div>
        {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
        <button type="button" onClick={submit} disabled={uploading} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.7 : 1 }}>{uploading ? "Adding…" : "Add Student"}</button>
      </div>
    </div>
  );
}

function EditStudentModal({ student, onClose, onSave, classes, uploadPhoto }) {
  const [form, setForm] = useState({
    name: student.name, gender: student.gender, class: student.class,
    guardian: student.guardian, relationship: student.relationship, phone: student.phone || "",
    status: student.status, photoUrl: student.photoUrl || "",
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(student.photoUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.guardian.trim()) return;
    setError("");
    setSaving(true);
    try {
      let photoUrl = form.photoUrl;
      if (photoFile) photoUrl = await uploadPhoto(photoFile, "students");
      await onSave({ ...form, photoUrl });
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 420, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Edit details — {student.name}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <PhotoField label="Student photo" preview={photoPreview} onChange={onPhotoChange} />
          <Field label="Full name"><input required value={form.name} onChange={set("name")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="Gender"><select value={form.gender} onChange={set("gender")} className="focus-ring" style={inputStyle}><option value="M">Male</option><option value="F">Female</option></select></Field>
            <Field label="Class"><select value={form.class} onChange={set("class")} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Guardian name"><input required value={form.guardian} onChange={set("guardian")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="Relationship"><select value={form.relationship} onChange={set("relationship")} className="focus-ring" style={inputStyle}><option>Mother</option><option>Father</option><option>Guardian</option></select></Field>
            <Field label="Phone"><input value={form.phone} onChange={set("phone")} placeholder="07…" className="focus-ring" style={inputStyle} /></Field>
          </div>
          <Field label="Status"><select value={form.status} onChange={set("status")} className="focus-ring" style={inputStyle}><option>Active</option><option>Inactive</option><option>Transferred</option><option>Graduated</option></select></Field>
        </div>
        {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
        <button type="button" onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

// Small reusable photo picker: shows a circular preview (or a placeholder
// icon) plus a button to choose a file. Used for student photos, staff
// photos, and the school logo.
function PhotoField({ label, preview, onChange, round = true }) {
  return (
    <div>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", display: "block", marginBottom: 6 }}>{label}</span>
      <div className="flex items-center gap-3">
        <div style={{ width: 52, height: 52, borderRadius: round ? "50%" : 10, background: "#EFE9D8", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 }}>
          {preview ? <img src={preview} alt="Preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <ImagePlus size={18} color="#b5ae99" />}
        </div>
        <label className="focus-ring" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 12, fontWeight: 600, color: "#5b5747", cursor: "pointer", background: PANEL }}>
          {preview ? "Change photo" : "Upload photo"}
          <input type="file" accept="image/*" onChange={onChange} style={{ display: "none" }} />
        </label>
      </div>
    </div>
  );
}

const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${LINE}`, fontSize: 13 };
function Field({ label, children }) {
  return (
    <label className="flex-1" style={{ display: "block" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", display: "block", marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

/* ---------------------------------------------------------------------- *
 *  ATTENDANCE
 * ---------------------------------------------------------------------- */
function AttendanceView({ students, attendance, markAttendance, showToast, schoolDays, classes, authedUser, isAdmin, staff, fetchStaffAttendanceForDate, saveAttendanceReason, sendNotification, schoolSettings, attendanceLanding }) {
  // A Class Teacher only ever sees/marks their own class; the picker is
  // locked to it instead of hidden, so it's clear which class this is.
  const lockedClass = !isAdmin ? authedUser.classTeacherOf : null;
  const [subTab, setSubTab] = useState(isAdmin && attendanceLanding === "staff" ? "staff" : "students");
  const [cls, setCls] = useState(lockedClass || classes[0]);
  const [date, setDate] = useState(schoolDays[schoolDays.length - 1]);
  const roster = students.filter((s) => s.class === cls);

  if (!isAdmin && !lockedClass) {
    return (
      <div className="px-7 py-6">
        <p style={{ fontSize: 13, color: "#a1442c" }}>Your account isn't assigned as a class teacher for any class yet — ask the Head Teacher to set this on your staff profile.</p>
      </div>
    );
  }

  const statusFor = (studentId) => {
    const rec = attendance.find((a) => a.date === date && a.studentId === studentId);
    return rec ? rec.status : "Present";
  };

  const present = roster.filter((s) => statusFor(s.id) !== "Absent").length;
  const rate = roster.length ? Math.round((present / roster.length) * 100) : 0;

  // Admin / Head Teacher / Deputy can also confirm teacher (staff)
  // attendance from a second sub-tab here, instead of hunting for it
  // under HR — HR is Finance/Payroll-only now.
  return (
    <div className="px-7 py-6" style={{ maxWidth: 900 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Attendance</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: isAdmin ? 12 : 20 }}>{subTab === "staff" ? "Confirm teacher attendance and reasons for lateness." : lockedClass ? `Mark daily attendance for ${lockedClass}.` : "Mark daily attendance by class."}</p>

      {isAdmin && (
        <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${LINE}` }}>
          <button onClick={() => setSubTab("students")} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: subTab === "students" ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: subTab === "students" ? INK : "#9a9484", cursor: "pointer" }}>Students</button>
          <button onClick={() => setSubTab("staff")} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: subTab === "staff" ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: subTab === "staff" ? INK : "#9a9484", cursor: "pointer" }}>Staff</button>
        </div>
      )}

      {subTab === "staff" && isAdmin ? (
        <StaffAttendanceTab staff={staff} fetchStaffAttendanceForDate={fetchStaffAttendanceForDate} saveAttendanceReason={saveAttendanceReason} sendNotification={sendNotification} showToast={showToast} arrivalCutoff={schoolSettings?.arrivalCutoff} departureCutoff={schoolSettings?.departureCutoff} />
      ) : (
      <>
      <div className="flex items-center gap-3 mb-4">
        {lockedClass ? (
          <span style={{ ...inputStyle, width: 160, display: "inline-flex", alignItems: "center", background: "#EFE9D8", fontWeight: 600 }}>{lockedClass}</span>
        ) : (
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 160 }}>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        <select value={date} onChange={(e) => setDate(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 160, fontFamily: MONO_FONT }}>
          {schoolDays.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: rate < 85 ? "#a1442c" : "#2f6f4a" }}>{present}/{roster.length} present · {rate}%</span>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        {roster.map((s) => {
          const status = statusFor(s.id);
          return (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${LINE}` }}>
              <div className="flex items-center gap-2.5">
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: RAIL }}>{initials(s.name)}</div>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
              </div>
              <div className="flex gap-1.5">
                {["Present", "Late", "Absent"].map((opt) => (
                  <button
                    key={opt}
                    onClick={() => markAttendance(date, s.id, opt)}
                    className="focus-ring"
                    style={{
                      padding: "5px 11px", borderRadius: 999, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                      border: `1px solid ${status === opt ? "transparent" : LINE}`,
                      background: status === opt ? { Present: "#2f6f4a", Late: "#a1702c", Absent: "#a1442c" }[opt] : "transparent",
                      color: status === opt ? "#fff" : "#8a8474",
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <button
        onClick={() => showToast(`Attendance saved for ${cls} on ${date}`)}
        className="focus-ring"
        style={{ marginTop: 14, padding: "10px 18px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
      >
        Save Attendance
      </button>
      </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  GRADES
 * ---------------------------------------------------------------------- */
function GradesView({ students, classes, exams, fetchClassMarksForExam, classGradingAssignment, gradingLevels, schoolSettings, staff, authedUser, isAdmin, showToast }) {
  const lockedClass = !isAdmin ? authedUser.classTeacherOf : null;
  const [cls, setCls] = useState(lockedClass || classes[0] || "");
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);

  const latestExam = exams && exams.length ? exams[exams.length - 1] : null;
  const term = schoolSettings?.currentTerm || DEFAULT_TERM;
  const year = String(new Date().getFullYear());
  const roster = students.filter((s) => s.class === cls);

  if (!isAdmin && !lockedClass) {
    return (
      <div className="px-7 py-6">
        <p style={{ fontSize: 13, color: "#a1442c" }}>Your account isn't assigned as a class teacher for any class yet — ask the Head Teacher to set this on your staff profile.</p>
      </div>
    );
  }

  useEffect(() => {
    let cancelled = false;
    if (!cls || !latestExam) { setAnalysis(null); return; }
    setLoading(true);
    fetchClassMarksForExam({ studentClass: cls, term, year, examName: latestExam })
      .then((rows) => { if (!cancelled) setAnalysis(computeAnalysis(rows, students.filter((s) => s.class === cls))); })
      .catch((err) => { if (!cancelled) showToast(err.message || "Couldn't load grades"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cls, latestExam, term, year]);

  return (
    <div className="px-7 py-6" style={{ maxWidth: 980 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Grades</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 14 }}>
        {latestExam ? <>Results from the latest exam — <b>{latestExam}</b> ({term}, {year}).</> : "No exam has been set up yet."}
      </p>

      {!lockedClass && (
        <div className="flex items-center gap-3 mb-4">
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 180 }}>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      )}

      {!latestExam ? (
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, fontSize: 13, color: "#7A7568" }}>
          No exam has been unlocked yet — ask the Head Teacher to set one up under Exams &gt; Set Up, then enter marks there.
        </div>
      ) : loading ? (
        <div style={{ fontSize: 13, color: "#7A7568", padding: "20px 0" }}>Loading…</div>
      ) : !analysis || analysis.perStudent.length === 0 ? (
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, fontSize: 13, color: "#7A7568" }}>
          Marks haven't been entered yet for {latestExam}{lockedClass ? ` (${lockedClass})` : ""} — enter them under Exams &gt; Enter Marks.
        </div>
      ) : (
        <MarkListAnalysis
          analysis={analysis} cls={cls} term={term} year={year} examName={latestExam}
          schoolSettings={schoolSettings} staff={staff}
          system={classGradingAssignment[cls] || GRADING_SYSTEMS[0]} gradingLevels={gradingLevels}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  FEES
 * ---------------------------------------------------------------------- */
function FeesView(ctx) {
  const [tab, setTab] = useState("fees");
  const tabs = ["fees", "other", "accounts", "expenditure"];
  const labels = { fees: "School Fees", other: "Other Payments", accounts: "Accounts", expenditure: "Expenditure" };
  return (
    <div className="px-7 py-6" style={{ maxWidth: 1080 }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600 }}>Finance</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>{ctx.schoolSettings?.currentTerm || DEFAULT_TERM} billing, payments, and expenditure.</p>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className="focus-ring" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${tab === t ? "transparent" : LINE}`, background: tab === t ? RAIL : PANEL, color: tab === t ? "#fff" : "#5b5747", cursor: "pointer" }}>{labels[t]}</button>
          ))}
        </div>
      </div>
      {tab === "fees" && <SchoolFeesTab {...ctx} />}
      {tab === "other" && <OtherPaymentsTab {...ctx} />}
      {tab === "accounts" && <AccountsOverviewTab {...ctx} />}
      {tab === "expenditure" && <ExpenditureTab {...ctx} />}
    </div>
  );
}

// The compulsory account — unchanged in spirit from the original Fees page,
// just narrowed to account === "School Fees" now that payments carry an
// account of their own.
// Printable fee status — every class (or just the one currently filtered)
// split into who's cleared and who still owes, grouped with a page break
// between classes so each can be handed out or filed separately.
function buildFeeStatusHtml({ rows, schoolSettings }) {
  const byClass = {};
  rows.forEach((r) => { (byClass[r.student.class] = byClass[r.student.class] || []).push(r); });
  const classNames = Object.keys(byClass);

  const classSection = (cls, list, isFirst) => {
    const outstanding = list.filter((r) => r.balance > 0).sort((a, b) => b.balance - a.balance);
    const cleared = list.filter((r) => r.balance <= 0).sort((a, b) => a.student.name.localeCompare(b.student.name));
    return `
      <div style="${isFirst ? "" : "page-break-before:always;"}">
        <h2 style="font-size:16px;margin:${isFirst ? "0 0 4px" : "24px 0 4px"};">${cls}</h2>
        <p style="font-size:11px;color:#777;margin:0 0 12px;">${outstanding.length} outstanding · ${cleared.length} cleared</p>

        <h3 style="font-size:12.5px;color:#a1442c;margin-bottom:6px;">Outstanding (${outstanding.length})</h3>
        ${outstanding.length ? `
          <table style="font-size:11.5px;margin-bottom:16px;">
            <tr><th style="text-align:left;">Student</th><th style="text-align:right;">Due</th><th style="text-align:right;">Paid</th><th style="text-align:right;">Balance</th></tr>
            ${outstanding.map((r) => `<tr><td>${r.student.name}</td><td style="text-align:right;">${money(r.due)}</td><td style="text-align:right;">${money(r.paid)}</td><td style="text-align:right;"><b>${money(r.balance)}</b></td></tr>`).join("")}
          </table>
        ` : `<p style="font-size:11.5px;color:#777;margin-bottom:16px;">None — everyone in this class has cleared.</p>`}

        <h3 style="font-size:12.5px;color:#2f6f4a;margin-bottom:6px;">Cleared (${cleared.length})</h3>
        ${cleared.length ? `
          <table style="font-size:11.5px;">
            <tr><th style="text-align:left;">Student</th><th style="text-align:right;">Paid</th></tr>
            ${cleared.map((r) => `<tr><td>${r.student.name}</td><td style="text-align:right;">${money(r.paid)}</td></tr>`).join("")}
          </table>
        ` : `<p style="font-size:11.5px;color:#777;">None yet.</p>`}
      </div>
    `;
  };

  return `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div><div class="meta" style="margin:0;">School Fees Status — ${schoolSettings?.currentTerm || DEFAULT_TERM}</div></div>
    </div>
    ${classNames.map((cls, i) => classSection(cls, byClass[cls], i === 0)).join("")}
  `;
}

function SchoolFeesTab({ students, payments, recordPayment, deletePayment, showToast, feeStructure, classes, schoolSettings }) {
  const [cls, setCls] = useState("All");
  const [modalStudent, setModalStudent] = useState(null);
  const roster = students.filter((s) => cls === "All" || s.class === cls);

  const rows = roster.map((s) => {
    const due = feeStructure[s.class] || 0;
    const paid = payments.filter((p) => p.studentId === s.id && p.account === "School Fees").reduce((sum, p) => sum + p.amount, 0);
    return { student: s, due, paid, balance: due - paid };
  });

  const totalDue = rows.reduce((s, r) => s + r.due, 0);
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 mb-5" style={{ maxWidth: 640 }}>
        <StatCard label="Total due" value={money(totalDue)} icon={Wallet} />
        <StatCard label="Collected" value={money(totalPaid)} icon={TrendingUp} tone="#2f6f4a" />
        <StatCard label="Outstanding" value={money(totalDue - totalPaid)} icon={TrendingDown} tone={totalDue - totalPaid > 0 ? "#a1442c" : "#2f6f4a"} />
      </div>

      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex gap-1.5">
          {["All", ...classes].map((c) => (
            <button key={c} onClick={() => setCls(c)} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${cls === c ? "transparent" : LINE}`, background: cls === c ? RAIL : PANEL, color: cls === c ? "#fff" : "#5b5747", cursor: "pointer" }}>{c}</button>
          ))}
        </div>
        <button
          onClick={() => printDocument(`Fee Status — ${cls === "All" ? "All Classes" : cls}`, buildFeeStatusHtml({ rows, schoolSettings }))}
          className="focus-ring flex items-center gap-1.5"
          style={{ padding: "8px 14px", borderRadius: 9, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}
        >
          <Download size={13} /> Download PDF
        </button>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Student</span><span>Due</span><span>Paid</span><span>Balance</span><span></span>
        </div>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {rows.map((r) => (
            <div key={r.student.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.student.name}</div>
                <div style={{ fontSize: 10.5, color: "#a39c86" }}>{r.student.class}</div>
              </div>
              <span style={{ fontFamily: MONO_FONT, color: "#6b6656" }}>{money(r.due)}</span>
              <span style={{ fontFamily: MONO_FONT, color: "#2f6f4a" }}>{money(r.paid)}</span>
              <span style={{ fontFamily: MONO_FONT, fontWeight: 600, color: r.balance > 0 ? "#a1442c" : "#2f6f4a" }}>{money(r.balance)}</span>
              <button onClick={() => setModalStudent(r.student)} className="focus-ring" style={{ justifySelf: "start", padding: "5px 12px", borderRadius: 7, border: "none", background: ACCENT, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Pay</button>
            </div>
          ))}
        </div>
      </div>

      {modalStudent && (
        <PayModal
          student={modalStudent}
          account="School Fees"
          due={feeStructure[modalStudent.class] || 0}
          paid={payments.filter((p) => p.studentId === modalStudent.id && p.account === "School Fees").reduce((s, p) => s + p.amount, 0)}
          onClose={() => setModalStudent(null)}
          onSubmit={async (payment) => {
            try {
              await recordPayment(payment);
              showToast(`Recorded ${money(payment.amount)} for ${modalStudent.name}`);
              setModalStudent(null);
            } catch (err) {
              showToast(err.message || "Couldn't record payment");
            }
          }}
        />
      )}
    </div>
  );
}

// The three optional accounts (Food, Exams, Transport) — same billing-table
// shape as School Fees, but switchable between accounts, and a class
// without a set amount just shows what's been paid with no due/balance nag.
function OtherPaymentsTab({ students, payments, recordPayment, deletePayment, showToast, otherFeeStructure, classes }) {
  const OPTIONAL_ACCOUNTS = PAYMENT_ACCOUNTS.filter((a) => !COMPULSORY_ACCOUNTS.includes(a));
  const [account, setAccount] = useState(OPTIONAL_ACCOUNTS[0]);
  const [cls, setCls] = useState("All");
  const [modalStudent, setModalStudent] = useState(null);
  const roster = students.filter((s) => cls === "All" || s.class === cls);
  const dueFor = (s) => otherFeeStructure[account]?.[s.class] || 0;

  const rows = roster.map((s) => {
    const due = dueFor(s);
    const paid = payments.filter((p) => p.studentId === s.id && p.account === account).reduce((sum, p) => sum + p.amount, 0);
    return { student: s, due, paid, balance: due - paid };
  });
  const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
  const hasDueSet = rows.some((r) => r.due > 0);

  return (
    <div>
      <div className="flex gap-1.5 mb-4">
        {OPTIONAL_ACCOUNTS.map((a) => (
          <button key={a} onClick={() => setAccount(a)} className="focus-ring" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${account === a ? "transparent" : LINE}`, background: account === a ? RAIL : PANEL, color: account === a ? "#fff" : "#5b5747", cursor: "pointer" }}>{a}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5" style={{ maxWidth: 440 }}>
        <StatCard label={`${account} collected`} value={money(totalPaid)} icon={TrendingUp} tone="#2f6f4a" />
        {hasDueSet && <StatCard label="Outstanding" value={money(rows.reduce((s, r) => s + Math.max(r.balance, 0), 0))} icon={TrendingDown} tone="#a1442c" />}
      </div>

      <div className="flex gap-1.5 mb-4">
        {["All", ...classes].map((c) => (
          <button key={c} onClick={() => setCls(c)} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${cls === c ? "transparent" : LINE}`, background: cls === c ? RAIL : PANEL, color: cls === c ? "#fff" : "#5b5747", cursor: "pointer" }}>{c}</button>
        ))}
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Student</span><span>Due</span><span>Paid</span><span>Balance</span><span></span>
        </div>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {rows.map((r) => (
            <div key={r.student.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.student.name}</div>
                <div style={{ fontSize: 10.5, color: "#a39c86" }}>{r.student.class}</div>
              </div>
              <span style={{ fontFamily: MONO_FONT, color: "#6b6656" }}>{r.due > 0 ? money(r.due) : "—"}</span>
              <span style={{ fontFamily: MONO_FONT, color: "#2f6f4a" }}>{money(r.paid)}</span>
              <span style={{ fontFamily: MONO_FONT, fontWeight: 600, color: r.due > 0 ? (r.balance > 0 ? "#a1442c" : "#2f6f4a") : "#a39c86" }}>{r.due > 0 ? money(r.balance) : "—"}</span>
              <button onClick={() => setModalStudent(r.student)} className="focus-ring" style={{ justifySelf: "start", padding: "5px 12px", borderRadius: 7, border: "none", background: ACCENT, color: "#fff", fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>Pay</button>
            </div>
          ))}
        </div>
      </div>

      {modalStudent && (
        <PayModal
          student={modalStudent}
          account={account}
          due={dueFor(modalStudent)}
          paid={payments.filter((p) => p.studentId === modalStudent.id && p.account === account).reduce((s, p) => s + p.amount, 0)}
          onClose={() => setModalStudent(null)}
          onSubmit={async (payment) => {
            try {
              await recordPayment(payment);
              showToast(`Recorded ${money(payment.amount)} (${account}) for ${modalStudent.name}`);
              setModalStudent(null);
            } catch (err) {
              showToast(err.message || "Couldn't record payment");
            }
          }}
        />
      )}
    </div>
  );
}

// A running ledger per account: what's come in (payments), what's gone out
// (expenditure), and the balance — the school-wide view, not per-student.
function AccountsOverviewTab({ payments, expenditures }) {
  return (
    <div className="grid grid-cols-2 gap-4" style={{ maxWidth: 760 }}>
      {PAYMENT_ACCOUNTS.map((acct) => {
        const collected = payments.filter((p) => p.account === acct).reduce((s, p) => s + p.amount, 0);
        const spent = expenditures.filter((e) => e.account === acct).reduce((s, e) => s + e.amount, 0);
        const balance = collected - spent;
        const isCompulsory = COMPULSORY_ACCOUNTS.includes(acct);
        return (
          <div key={acct} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18 }}>
            <div className="flex items-center justify-between mb-3">
              <span style={{ fontWeight: 700, fontSize: 14.5 }}>{acct}</span>
              <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.3, color: isCompulsory ? ACCENT : "#a39c86" }}>{isCompulsory ? "Compulsory" : "Optional"}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between" style={{ fontSize: 13 }}><span style={{ color: "#7A7568" }}>Collected</span><span style={{ fontFamily: MONO_FONT, color: "#2f6f4a" }}>{money(collected)}</span></div>
              <div className="flex items-center justify-between" style={{ fontSize: 13 }}><span style={{ color: "#7A7568" }}>Spent</span><span style={{ fontFamily: MONO_FONT, color: "#a1442c" }}>{money(spent)}</span></div>
              <div className="flex items-center justify-between pt-1.5" style={{ fontSize: 14, fontWeight: 700, borderTop: `1px solid ${LINE}`, marginTop: 2 }}><span>Balance</span><span style={{ fontFamily: MONO_FONT, color: balance >= 0 ? "#2f6f4a" : "#a1442c" }}>{money(balance)}</span></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Recording an expense and choosing which account it's drawn from —
// what makes the accounts above show a real balance instead of just totals.
function ExpenditureTab({ expenditures, recordExpenditure, deleteExpenditure, showToast }) {
  const [form, setForm] = useState({ account: PAYMENT_ACCOUNTS[0], amount: "", date: new Date().toISOString().slice(0, 10), description: "" });
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("All");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    const amt = Number(form.amount);
    if (!amt || amt <= 0 || !form.description.trim()) { showToast("Amount and description are required"); return; }
    setSaving(true);
    try {
      await recordExpenditure({ ...form, amount: amt });
      showToast(`Recorded ${money(amt)} expenditure from ${form.account}`);
      setForm((f) => ({ ...f, amount: "", description: "" }));
    } catch (err) {
      showToast(err.message || "Couldn't record expenditure");
    } finally {
      setSaving(false);
    }
  };

  const filtered = filter === "All" ? expenditures : expenditures.filter((e) => e.account === filter);
  const totalSpent = filtered.reduce((s, e) => s + e.amount, 0);

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Record an expense</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Account"><select value={form.account} onChange={set("account")} className="focus-ring" style={{ ...inputStyle, width: 150 }}>{PAYMENT_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}</select></Field>
          <Field label="Amount (KSh)"><input type="number" min={1} value={form.amount} onChange={set("amount")} className="focus-ring" style={{ ...inputStyle, width: 130 }} /></Field>
          <Field label="Date"><input type="date" value={form.date} onChange={set("date")} className="focus-ring" style={{ ...inputStyle, width: 150 }} /></Field>
          <Field label="Description"><input value={form.description} onChange={set("description")} placeholder="What was this for?" className="focus-ring" style={{ ...inputStyle, width: 220 }} /></Field>
          <button onClick={submit} disabled={saving} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Record"}</button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1.5">
          {["All", ...PAYMENT_ACCOUNTS].map((a) => (
            <button key={a} onClick={() => setFilter(a)} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${filter === a ? "transparent" : LINE}`, background: filter === a ? RAIL : PANEL, color: filter === a ? "#fff" : "#5b5747", cursor: "pointer" }}>{a}</button>
          ))}
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "#a1442c" }}>Total: {money(totalSpent)}</span>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 2fr 1fr 0.5fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Date</span><span>Account</span><span>Description</span><span>Amount</span><span></span>
        </div>
        {filtered.map((e) => (
          <div key={e.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 2fr 1fr 0.5fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
            <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{e.date}</span>
            <span>{e.account}</span>
            <span style={{ color: "#6b6656" }}>{e.description}</span>
            <span style={{ fontFamily: MONO_FONT, fontWeight: 700, color: "#a1442c" }}>{money(e.amount)}</span>
            <button onClick={() => { if (window.confirm("Delete this expenditure record?")) deleteExpenditure(e.id); }} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer", justifySelf: "end" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No expenditure recorded yet.</div>}
      </div>
    </div>
  );
}

function PayModal({ student, account = "School Fees", due, paid, onClose, onSubmit }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("M-Pesa");
  const balance = due - paid;
  const submit = (e) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    onSubmit({ studentId: student.id, amount: amt, date: new Date().toISOString().slice(0, 10), method, account });
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 360, padding: 24 }}>
        <div className="flex items-center justify-between mb-1">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Record Payment{account !== "School Fees" ? ` — ${account}` : ""}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <p style={{ fontSize: 12.5, color: "#9a9484", marginBottom: 14 }}>{student.name} · {due > 0 ? `Balance ${money(balance)}` : `${money(paid)} paid so far`}</p>
        <Field label="Amount (KSh)"><input required type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus className="focus-ring" style={{ ...inputStyle, fontFamily: MONO_FONT }} /></Field>
        <div style={{ marginTop: 12 }}>
          <Field label="Method"><select value={method} onChange={(e) => setMethod(e.target.value)} className="focus-ring" style={inputStyle}><option>M-Pesa</option><option>Cash</option><option>Bank</option></select></Field>
        </div>
        <button type="button" onClick={submit} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Record Payment</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  STAFF
 * ---------------------------------------------------------------------- */
function StaffView({ staff, addStaff, createTeacherLogin, updateTeacherLogin, deleteStaffMember, updateStaffDetails, showToast, classes, subjects, uploadPhoto }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editLoginFor, setEditLoginFor] = useState(null);
  const [editDetailsFor, setEditDetailsFor] = useState(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const doDelete = async (member) => {
    setDeleting(true);
    try {
      await deleteStaffMember(member.id);
      showToast(`${member.name} removed`);
      setConfirmDeleteFor(null);
    } catch (err) {
      showToast(err.message || "Couldn't delete staff member");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1000 }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600 }}>Staff</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>{staff.length} members</p>
        </div>
        <button onClick={() => setAddOpen(true)} className="focus-ring flex items-center gap-2" style={{ background: RAIL, color: "#fff", border: "none", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={15} /> Add Staff
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {staff.map((s) => (
          <div key={s.id} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                {s.photoUrl ? (
                  <img src={s.photoUrl} alt={s.name} style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: RAIL }}>{initials(s.name)}</div>
                )}
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13.5 }}>{s.name}</div>
                  <div className="flex items-center gap-1" style={{ fontSize: 11, color: ACCENT, fontWeight: 700 }}><BadgeCheck size={12} />{s.role}{s.designation ? ` — ${s.designation}` : ""}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setEditDetailsFor(s)} className="focus-ring" title="Edit details" style={{ padding: 5, borderRadius: 7, border: "none", background: "none", color: "#8a8474", cursor: "pointer" }}><Pencil size={13} /></button>
                <button onClick={() => setConfirmDeleteFor(s)} className="focus-ring" title="Delete staff" style={{ padding: 5, borderRadius: 7, border: "none", background: "none", color: "#a1442c", cursor: "pointer" }}><Trash2 size={13} /></button>
              </div>
            </div>
            {s.classTeacherOf && <div style={{ fontSize: 12, color: "#6b6656", marginBottom: 4 }}>Class teacher — {s.classTeacherOf}</div>}
            <div style={{ fontSize: 12, color: "#6b6656", marginBottom: 8 }}>{s.subjects.join(", ")}</div>
            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "#9a9484" }}><Phone size={11} />{s.phone}</div>
            <div className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "#9a9484" }}><Mail size={11} />{s.email}</div>
            <button onClick={() => setEditLoginFor(s)} className="focus-ring flex items-center gap-1.5" style={{ marginTop: 10, padding: "6px 11px", borderRadius: 8, border: `1px solid ${LINE}`, background: BG, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>
              <Lock size={12} /> Edit login
            </button>
          </div>
        ))}
      </div>
      {addOpen && (
        <AddStaffModal
          classes={classes} subjects={subjects} uploadPhoto={uploadPhoto}
          onClose={() => setAddOpen(false)}
          onAdd={async (m) => {
            try {
              await createTeacherLogin(m);
              showToast(`${m.name} added with a working login`);
              setAddOpen(false);
            } catch (err) {
              showToast(err.message || "Couldn't create login");
            }
          }}
        />
      )}
      {editDetailsFor && (
        <EditStaffDetailsModal
          member={editDetailsFor} classes={classes} subjects={subjects} uploadPhoto={uploadPhoto}
          onClose={() => setEditDetailsFor(null)}
          onSave={async (patch) => {
            try {
              await updateStaffDetails(editDetailsFor.id, patch);
              showToast(`${patch.name}'s details updated`);
              setEditDetailsFor(null);
            } catch (err) {
              showToast(err.message || "Couldn't update details");
            }
          }}
        />
      )}
      {confirmDeleteFor && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={() => setConfirmDeleteFor(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 340, padding: 24 }}>
            <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Delete {confirmDeleteFor.name}?</h3>
            <p style={{ fontSize: 12.5, color: "#6b6656", marginBottom: 18 }}>This removes their profile, login, and attendance records. This can't be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDeleteFor(null)} className="focus-ring" style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => doDelete(confirmDeleteFor)} disabled={deleting} className="focus-ring" style={{ flex: 1, padding: "9px 0", borderRadius: 8, border: "none", background: "#a1442c", color: "#fff", fontSize: 13, fontWeight: 700, cursor: deleting ? "wait" : "pointer" }}>{deleting ? "Deleting…" : "Delete"}</button>
            </div>
          </div>
        </div>
      )}

      {editLoginFor && (
        <EditLoginModal
          member={editLoginFor}
          onClose={() => setEditLoginFor(null)}
          onSave={async ({ email, password }) => {
            try {
              await updateTeacherLogin({ teacherId: editLoginFor.id, email, password });
              showToast(`${editLoginFor.name}'s login updated`);
              setEditLoginFor(null);
            } catch (err) {
              showToast(err.message || "Couldn't update login");
            }
          }}
        />
      )}
    </div>
  );
}

function EditLoginModal({ member, onClose, onSave }) {
  const [email, setEmail] = useState(member.email || "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (password && password !== confirm) { setError("New passwords don't match."); return; }
    if (password && password.length < 8) { setError("New password must be at least 8 characters."); return; }
    setSaving(true);
    try {
      await onSave({ email: email.trim(), password: password.trim() || undefined });
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 380, padding: 24 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Edit login — {member.name}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="focus-ring" style={inputStyle} /></Field>
          <Field label="New password (leave blank to keep current)"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className="focus-ring" style={inputStyle} /></Field>
          {password && <Field label="Confirm new password"><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="focus-ring" style={inputStyle} /></Field>}
        </div>
        {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
        <button type="button" onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function EditStaffDetailsModal({ member, classes, subjects, uploadPhoto, onClose, onSave }) {
  const [form, setForm] = useState({
    name: member.name, role: member.role, subjects: member.subjects?.length ? member.subjects : [subjects[0]],
    classTeacherOf: member.classTeacherOf || classes[0], phone: member.phone || "", photoUrl: member.photoUrl || "",
    designation: member.designation || SUBORDINATE_DESIGNATIONS[0],
  });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(member.photoUrl || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError("");
    setSaving(true);
    try {
      let photoUrl = form.photoUrl;
      if (photoFile) photoUrl = await uploadPhoto(photoFile, "staff");
      await onSave({ ...form, photoUrl, classTeacherOf: form.role === "Class Teacher" ? form.classTeacherOf : null, designation: form.role === "Subordinate Staff" ? form.designation : null });
    } catch (err) {
      setError(err.message || "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 400, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Edit details — {member.name}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <PhotoField label="Staff photo" preview={photoPreview} onChange={onPhotoChange} />
          <Field label="Full name"><input required value={form.name} onChange={set("name")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Role"><select value={form.role} onChange={set("role")} className="focus-ring" style={inputStyle}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          {form.role === "Class Teacher" && (
            <Field label="Class teacher of"><select value={form.classTeacherOf || classes[0]} onChange={set("classTeacherOf")} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          )}
          {form.role === "Subordinate Staff" && (
            <Field label="Designation"><select value={form.designation} onChange={set("designation")} className="focus-ring" style={inputStyle}>{SUBORDINATE_DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          )}
          {TEACHING_ROLES.includes(form.role) && (
            <Field label="Primary subject"><select value={form.subjects[0]} onChange={(e) => setForm((f) => ({ ...f, subjects: [e.target.value] }))} className="focus-ring" style={inputStyle}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></Field>
          )}
          <Field label="Phone"><input value={form.phone} onChange={set("phone")} placeholder="07…" className="focus-ring" style={inputStyle} /></Field>
        </div>
        {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
        <button type="button" onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
      </div>
    </div>
  );
}

function AddStaffModal({ onClose, onAdd, classes, subjects, uploadPhoto }) {
  const [form, setForm] = useState({ name: "", role: "Subject Teacher", subjects: [subjects[0]], classTeacherOf: classes[0], phone: "", email: "", password: "", designation: SUBORDINATE_DESIGNATIONS[0] });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onPhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) { setError("Name, email, and password are required."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (form.password !== confirmPassword) { setError("Passwords don't match."); return; }
    setError("");
    setUploading(true);
    try {
      let photoUrl = "";
      if (photoFile) photoUrl = await uploadPhoto(photoFile, "staff");
      await onAdd({ ...form, photoUrl, classTeacherOf: form.role === "Class Teacher" ? form.classTeacherOf : null, designation: form.role === "Subordinate Staff" ? form.designation : null });
    } catch (err) {
      setError(err.message || "Couldn't add staff.");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 400, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Add Staff</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <PhotoField label="Staff photo" preview={photoPreview} onChange={onPhotoChange} />
          <Field label="Full name"><input required value={form.name} onChange={set("name")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Role"><select value={form.role} onChange={set("role")} className="focus-ring" style={inputStyle}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
          {form.role === "Class Teacher" && (
            <Field label="Class teacher of"><select value={form.classTeacherOf || classes[0]} onChange={set("classTeacherOf")} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          )}
          {form.role === "Subordinate Staff" && (
            <Field label="Designation"><select value={form.designation} onChange={set("designation")} className="focus-ring" style={inputStyle}>{SUBORDINATE_DESIGNATIONS.map((d) => <option key={d}>{d}</option>)}</select></Field>
          )}
          {TEACHING_ROLES.includes(form.role) && (
            <Field label="Primary subject"><select value={form.subjects[0]} onChange={(e) => setForm((f) => ({ ...f, subjects: [e.target.value] }))} className="focus-ring" style={inputStyle}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></Field>
          )}
          <div className="flex gap-3">
            <Field label="Phone"><input value={form.phone} onChange={set("phone")} placeholder="07…" className="focus-ring" style={inputStyle} /></Field>
            <Field label="Email"><input type="email" required value={form.email} onChange={set("email")} className="focus-ring" style={inputStyle} /></Field>
          </div>
          <div className="flex gap-3">
            <Field label="Password"><input type="password" required value={form.password} onChange={set("password")} placeholder="••••••••" className="focus-ring" style={inputStyle} /></Field>
            <Field label="Confirm password"><input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="focus-ring" style={inputStyle} /></Field>
          </div>
        </div>
        {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
        <button type="button" onClick={submit} disabled={uploading} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: uploading ? "wait" : "pointer", opacity: uploading ? 0.7 : 1 }}>{uploading ? "Creating…" : "Add Staff & Create Login"}</button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  TIMETABLE — admins define which teacher takes which subject in which
 *  class and how many periods a week it gets, set the day/period grid
 *  shape, then auto-generate a clash-free schedule (a teacher is never
 *  double-booked). Every role can view it; only admins can edit.
 * ---------------------------------------------------------------------- */
function TimetableView(ctx) {
  const { isAdmin, classes } = ctx;
  const [tab, setTab] = useState("grid");
  const tabs = isAdmin ? ["grid", "master", "assignments", "settings"] : ["grid", "master"];
  const labels = { grid: "Grid", master: "Master Grid", assignments: "Assignments", settings: "Settings" };
  return (
    <div className="px-7 py-6" style={{ maxWidth: 1180 }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600 }}>Timetable</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>{isAdmin ? "Auto-generated weekly schedule, built from teacher assignments" : "Your weekly schedule"}</p>
        </div>
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className="focus-ring" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${tab === t ? "transparent" : LINE}`, background: tab === t ? RAIL : PANEL, color: tab === t ? "#fff" : "#5b5747", cursor: "pointer" }}>{labels[t]}</button>
          ))}
        </div>
      </div>
      {tab === "grid" && <TimetableGrid {...ctx} />}
      {tab === "master" && <MasterTimetableGrid {...ctx} />}
      {isAdmin && tab === "assignments" && <TimetableAssignments {...ctx} />}
      {isAdmin && tab === "settings" && <TimetableSettingsTab {...ctx} />}
    </div>
  );
}

// Printable single timetable — one class's week, or one teacher's week.
// `cellFor(day, period)` returns { primary, secondary } or null; `primary`
// is the subject, `secondary` is whichever detail matters for that view
// (the teacher's name for a class grid, the class name for a teacher grid).
function buildSingleGridHtml({ title, days, scheduleRows, cellFor, schoolSettings }) {
  return `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div><div class="meta" style="margin:0;">${title}</div></div>
    </div>
    <table style="font-size:11px;">
      <thead>
        <tr>
          <th>Time</th>
          ${days.map((d) => `<th>${TIMETABLE_DAY_NAMES[d] || d}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${scheduleRows.map((row) => row.kind === "break"
          ? `<tr><td>${row.start}–${row.end}</td><td colspan="${days.length}" style="text-align:center;font-style:italic;background:#FFF8ED;">${row.label}</td></tr>`
          : `<tr>
              <td>P${row.period}<br/><span style="font-weight:400;">${row.start}–${row.end}</span></td>
              ${days.map((d) => {
                const cell = cellFor(d, row.period);
                return `<td style="text-align:center;">${cell ? `<b>${cell.primary}</b><br/><span style="font-size:9px;color:#888;">${cell.secondary || ""}</span>` : "—"}</td>`;
              }).join("")}
            </tr>`
        ).join("")}
      </tbody>
    </table>
  `;
}

function TimetableGrid({ isAdmin, authedUser, classes, staff, timetableSettings, timetableEntries, timetableAssignments, generateTimetable, clearTimetable, setTimetableCell, showToast, schoolSettings }) {
  const teacherName = (id) => staff.find((s) => s.id === id)?.name || "—";
  const isClassTeacherLocked = authedUser.role === "Class Teacher";
  const isSubjectTeacher = authedUser.role === "Subject Teacher";
  const myClass = isClassTeacherLocked ? (staff.find((s) => s.id === authedUser.id)?.classTeacherOf) : null;

  const [viewMode, setViewMode] = useState(isSubjectTeacher ? "teacher" : "class");
  const [selectedClass, setSelectedClass] = useState(() => myClass || classes[0]);
  const [selectedTeacherId, setSelectedTeacherId] = useState(() => (isSubjectTeacher ? authedUser.id : (staff[0]?.id || "")));
  const [generating, setGenerating] = useState(false);
  const [editCell, setEditCell] = useState(null);
  const { days } = timetableSettings;
  const scheduleRows = buildScheduleRows(timetableSettings);
  const activeTeacherId = isSubjectTeacher ? authedUser.id : selectedTeacherId;

  const cellFor = (day, period) => {
    if (viewMode === "teacher") return timetableEntries.find((e) => e.day === day && e.period === period && e.teacherId === activeTeacherId);
    return timetableEntries.find((e) => e.class === selectedClass && e.day === day && e.period === period);
  };
  const canEditCells = isAdmin && viewMode === "class";

  const runGenerate = async () => {
    if (timetableAssignments.length === 0) {
      showToast("Add teaching assignments first");
      return;
    }
    setGenerating(true);
    try {
      const { count, unscheduled } = await generateTimetable();
      if (unscheduled.length) {
        const withReason = unscheduled.find((u) => u.reason);
        showToast(`Generated ${count} periods — ${unscheduled.length} couldn't be placed${withReason ? ` (e.g. ${withReason.class}: ${withReason.reason})` : ""}`);
      } else {
        showToast(`Generated ${count} periods with no clashes`);
      }
    } catch (err) {
      showToast(err.message || "Couldn't generate timetable");
    } finally {
      setGenerating(false);
    }
  };

  const printTitle = viewMode === "teacher" ? `${teacherName(activeTeacherId)} — Timetable` : `${selectedClass} — Timetable`;
  const downloadPdf = () => {
    const html = buildSingleGridHtml({
      title: printTitle, days, scheduleRows, schoolSettings,
      cellFor: (d, p) => {
        const cell = cellFor(d, p);
        if (!cell) return null;
        return viewMode === "teacher" ? { primary: cell.subject, secondary: cell.class } : { primary: cell.subject, secondary: teacherName(cell.teacherId) };
      },
    });
    printDocument(printTitle, html);
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {(isAdmin || isSubjectTeacher) && (
          <div className="flex gap-1.5">
            <button onClick={() => setViewMode("class")} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${viewMode === "class" ? "transparent" : LINE}`, background: viewMode === "class" ? RAIL : PANEL, color: viewMode === "class" ? "#fff" : "#5b5747", cursor: "pointer" }}>By Class</button>
            <button onClick={() => setViewMode("teacher")} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${viewMode === "teacher" ? "transparent" : LINE}`, background: viewMode === "teacher" ? RAIL : PANEL, color: viewMode === "teacher" ? "#fff" : "#5b5747", cursor: "pointer" }}>By Teacher</button>
          </div>
        )}

        {viewMode === "class" && !isClassTeacherLocked && (
          <div className="flex gap-1.5 overflow-x-auto">
            {classes.map((c) => (
              <button key={c} onClick={() => setSelectedClass(c)} className="focus-ring" style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${selectedClass === c ? "transparent" : LINE}`, background: selectedClass === c ? RAIL : PANEL, color: selectedClass === c ? "#fff" : "#5b5747", cursor: "pointer" }}>{c}</button>
            ))}
          </div>
        )}
        {viewMode === "class" && isClassTeacherLocked && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5b5747" }}>{selectedClass}</span>
        )}

        {viewMode === "teacher" && !isSubjectTeacher && (
          <select value={selectedTeacherId} onChange={(e) => setSelectedTeacherId(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 200 }}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        {viewMode === "teacher" && isSubjectTeacher && (
          <span style={{ fontSize: 12.5, fontWeight: 700, color: "#5b5747" }}>My Periods</span>
        )}

        <div className="flex gap-2" style={{ marginLeft: "auto" }}>
          <button onClick={downloadPdf} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
            <Download size={13} /> Download PDF
          </button>
          {isAdmin && viewMode === "class" && (
            <>
              {timetableEntries.length > 0 && (
                <button onClick={() => { if (window.confirm("Clear the entire generated timetable?")) clearTimetable(); }} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 14px", borderRadius: 9, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
                  <Trash2 size={13} /> Clear
                </button>
              )}
              <button onClick={runGenerate} disabled={generating} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 14px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: generating ? "wait" : "pointer", opacity: generating ? 0.7 : 1 }}>
                {generating ? <RefreshCw size={13} className="spin" /> : <Wand2 size={13} />} {generating ? "Generating…" : timetableEntries.length ? "Re-generate" : "Generate Timetable"}
              </button>
            </>
          )}
        </div>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#8a8474", borderBottom: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>Time</th>
              {days.map((d) => (
                <th key={d} style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: "#8a8474", borderBottom: `1px solid ${LINE}`, minWidth: 120 }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scheduleRows.map((row) => row.kind === "break" ? (
              <tr key={`break-${row.label}-${row.start}`}>
                <td style={{ padding: "8px 12px", fontFamily: MONO_FONT, fontSize: 11, color: "#9a9484", borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap" }}>{row.start}–{row.end}</td>
                <td colSpan={days.length} style={{ padding: "6px 12px", textAlign: "center", fontStyle: "italic", fontSize: 11.5, color: "#a1702c", background: "#FFF8ED", borderBottom: `1px solid ${LINE}` }}>{row.label}</td>
              </tr>
            ) : (
              <tr key={`p-${row.period}`}>
                <td style={{ padding: "10px 12px", borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ fontFamily: MONO_FONT, fontWeight: 700, color: "#6b6656" }}>P{row.period}</div>
                  <div style={{ fontSize: 10, color: "#a39c86", whiteSpace: "nowrap" }}>{row.start}–{row.end}</div>
                </td>
                {days.map((d) => {
                  const cell = cellFor(d, row.period);
                  return (
                    <td
                      key={d}
                      onClick={() => { if (canEditCells) setEditCell({ day: d, period: row.period, subject: cell?.subject || "", teacherId: cell?.teacherId || "" }); }}
                      style={{ padding: "9px 12px", borderBottom: `1px solid ${LINE}`, textAlign: "center", cursor: canEditCells ? "pointer" : "default", background: cell ? "#FBF6E9" : "transparent" }}
                    >
                      {cell ? (
                        <div>
                          <div style={{ fontWeight: 700 }}>{cell.subject}</div>
                          <div style={{ fontSize: 10.5, color: "#9a9484" }}>{viewMode === "teacher" ? cell.class : teacherName(cell.teacherId)}</div>
                        </div>
                      ) : <span style={{ color: "#d8d2bd" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {timetableEntries.length === 0 && (
          <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>
            {isAdmin ? "No timetable generated yet — add assignments, then click Generate." : "No timetable has been generated yet."}
          </div>
        )}
      </div>

      {editCell && (
        <TimetableCellModal
          cell={editCell} selectedClass={selectedClass} staff={staff} timetableAssignments={timetableAssignments}
          onClose={() => setEditCell(null)}
          onSave={async (subject, teacherId) => {
            try {
              await setTimetableCell(selectedClass, editCell.day, editCell.period, subject, teacherId);
              setEditCell(null);
            } catch (err) {
              showToast(err.message || "Couldn't update that period");
            }
          }}
        />
      )}
    </div>
  );
}

// Turns "Christian Religious Education" into "CRE", "Mathematics" into
// "Math" — enough to fit a class name-abbreviated-subject grid without a
// legend lookup being strictly necessary, though one is still shown.
function subjectAbbr(subject) {
  if (!subject) return "";
  const words = subject.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) return words.map((w) => w[0].toUpperCase()).join("");
  return subject.length <= 4 ? subject : subject.slice(0, 4);
}

// Every abbreviation actually in use, mapped back to its full subject name,
// for a small "Key:" line under the grid.
function buildSubjectLegend(entries) {
  const seen = new Map();
  entries.forEach((e) => {
    if (e.subject && !seen.has(subjectAbbr(e.subject))) seen.set(subjectAbbr(e.subject), e.subject);
  });
  return Array.from(seen.entries()).map(([abbr, full]) => ({ abbr, full })).sort((a, b) => a.abbr.localeCompare(b.abbr));
}

// Builds the printable HTML for every day, one table per page, classes
// down the left and period times across the top — handed to the shared
// printDocument() helper (same window.print()-based PDF export used by
// mark lists and report cards elsewhere in the app).
function buildMasterTimetableHtml({ days, scheduleRows, classes, staff, timetableEntries, schoolSettings, legend }) {
  const cellFor = (cls, day, period) => timetableEntries.find((e) => e.class === cls && e.day === day && e.period === period);
  const dayTable = (day, isFirst) => `
    <div style="${isFirst ? "" : "page-break-before:always;"}">
      <h2 style="font-size:16px;margin:${isFirst ? "0 0 10px" : "24px 0 10px"};">${TIMETABLE_DAY_NAMES[day] || day}</h2>
      <table style="font-size:11px;">
        <thead>
          <tr>
            <th>Class</th>
            ${scheduleRows.map((row) => row.kind === "break"
              ? `<th style="background:#FFF8ED;">${row.label}<br/><span style="font-weight:400;">${row.start}–${row.end}</span></th>`
              : `<th>P${row.period}<br/><span style="font-weight:400;">${row.start}–${row.end}</span></th>`
            ).join("")}
          </tr>
        </thead>
        <tbody>
          ${classes.map((cls, ci) => `
            <tr>
              <td><b>${cls}</b></td>
              ${scheduleRows.map((row) => {
                if (row.kind === "break") {
                  return ci === 0 ? `<td rowspan="${classes.length}" style="background:#FFF8ED;text-align:center;font-style:italic;">${row.label}</td>` : "";
                }
                const cell = cellFor(cls, day, row.period);
                return `<td style="text-align:center;">${cell ? `${subjectAbbr(cell.subject)}<br/><span style="font-size:9px;color:#888;">${teacherShort(staff.find((s) => s.id === cell.teacherId)?.name)}</span>` : "—"}</td>`;
              }).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
  return `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div><div class="meta" style="margin:0;">Master Timetable</div></div>
    </div>
    ${days.map((d, i) => dayTable(d, i === 0)).join("")}
    ${legend.length ? `<div style="margin-top:16px;font-size:11px;color:#555;"><b>Key:</b> ${legend.map((l) => `${l.abbr} = ${l.full}`).join(" &middot; ")}</div>` : ""}
  `;
}

// The all-classes-at-once "staffroom poster" view: period times across the
// top, classes down the left, one day at a time on screen (a day selector
// keeps each table a manageable size — helpful on a phone, where a table
// twelve classes wide would need heavy horizontal scrolling). The PDF
// export always includes every day, one per page.
function MasterTimetableGrid({ classes, staff, timetableSettings, timetableEntries, schoolSettings }) {
  const { days } = timetableSettings;
  const scheduleRows = buildScheduleRows(timetableSettings);
  const [selectedDay, setSelectedDay] = useState(days[0]);
  const cellFor = (cls, day, period) => timetableEntries.find((e) => e.class === cls && e.day === day && e.period === period);
  const legend = useMemo(() => buildSubjectLegend(timetableEntries), [timetableEntries]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1.5 overflow-x-auto">
          {days.map((d) => (
            <button key={d} onClick={() => setSelectedDay(d)} className="focus-ring" style={{ flexShrink: 0, padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${selectedDay === d ? "transparent" : LINE}`, background: selectedDay === d ? RAIL : PANEL, color: selectedDay === d ? "#fff" : "#5b5747", cursor: "pointer" }}>{TIMETABLE_DAY_NAMES[d] || d}</button>
          ))}
        </div>
        <button
          onClick={() => printDocument("Master Timetable", buildMasterTimetableHtml({ days, scheduleRows, classes, staff, timetableEntries, schoolSettings, legend }))}
          className="focus-ring flex items-center gap-1.5"
          style={{ marginLeft: "auto", padding: "9px 14px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
        >
          <Download size={13} /> Download PDF (all days)
        </button>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11.5 }}>
          <thead>
            <tr>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10.5, fontWeight: 700, color: "#8a8474", borderBottom: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, position: "sticky", left: 0, background: PANEL, zIndex: 1 }}>Class</th>
              {scheduleRows.map((row) => row.kind === "break" ? (
                <th key={`b-${row.start}`} style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: "#a1702c", borderBottom: `1px solid ${LINE}`, background: "#FFF8ED", minWidth: 76 }}>
                  {row.label}<br /><span style={{ fontWeight: 400, fontSize: 9.5 }}>{row.start}–{row.end}</span>
                </th>
              ) : (
                <th key={`p-${row.period}`} style={{ padding: "8px 10px", fontSize: 10.5, fontWeight: 700, color: "#8a8474", borderBottom: `1px solid ${LINE}`, minWidth: 76 }}>
                  P{row.period}<br /><span style={{ fontWeight: 400, fontSize: 9.5, color: "#a39c86" }}>{row.start}–{row.end}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map((cls, ci) => (
              <tr key={cls}>
                <td style={{ padding: "8px 12px", fontWeight: 700, borderRight: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, whiteSpace: "nowrap", position: "sticky", left: 0, background: PANEL }}>{cls}</td>
                {scheduleRows.map((row) => {
                  if (row.kind === "break") {
                    if (ci !== 0) return null;
                    return <td key={`b-${row.start}`} rowSpan={classes.length} style={{ padding: "6px 8px", textAlign: "center", fontStyle: "italic", fontSize: 10.5, color: "#a1702c", background: "#FFF8ED", borderBottom: `1px solid ${LINE}` }}>{row.label}</td>;
                  }
                  const cell = cellFor(cls, selectedDay, row.period);
                  return (
                    <td key={`p-${row.period}`} title={cell ? `${cell.subject} — ${staff.find((s) => s.id === cell.teacherId)?.name || ""}` : ""} style={{ padding: "7px 6px", borderBottom: `1px solid ${LINE}`, textAlign: "center", background: cell ? "#FBF6E9" : "transparent" }}>
                      {cell ? (
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 11 }}>{subjectAbbr(cell.subject)}</div>
                          <div style={{ fontSize: 9, color: "#9a9484" }}>{teacherShort(staff.find((s) => s.id === cell.teacherId)?.name)}</div>
                        </div>
                      ) : <span style={{ color: "#d8d2bd" }}>—</span>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {timetableEntries.length === 0 && (
          <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No timetable generated yet.</div>
        )}
      </div>

      {legend.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: "#7A7568", lineHeight: 1.6 }}>
          <b style={{ color: "#5b5747" }}>Key: </b>
          {legend.map((l) => `${l.abbr} = ${l.full}`).join("  ·  ")}
        </div>
      )}
    </div>
  );
}

function TimetableCellModal({ cell, selectedClass, staff, timetableAssignments, onClose, onSave }) {
  const classSubjects = timetableAssignments.filter((a) => a.class === selectedClass);
  const [subject, setSubject] = useState(cell.subject || "");
  const [teacherId, setTeacherId] = useState(cell.teacherId || "");
  const [saving, setSaving] = useState(false);

  const onSubjectChange = (e) => {
    const s = e.target.value;
    setSubject(s);
    const match = classSubjects.find((a) => a.subject === s);
    if (match) setTeacherId(match.teacherId);
  };

  const submit = async () => {
    setSaving(true);
    try { await onSave(subject || null, subject ? teacherId : null); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 40 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 360, padding: 24 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 16, fontWeight: 600 }}>{selectedClass} · {cell.day}, Period {cell.period}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Subject">
            <select value={subject} onChange={onSubjectChange} className="focus-ring" style={inputStyle}>
              <option value="">— Free period —</option>
              {classSubjects.map((a) => <option key={a.subject} value={a.subject}>{a.subject}</option>)}
            </select>
          </Field>
          {subject && (
            <Field label="Teacher">
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="focus-ring" style={inputStyle}>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
        </div>
        <button type="button" onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save"}</button>
        <p style={{ fontSize: 11, color: "#a39c86", marginTop: 10 }}>This overrides just this one period. It won't be touched by future auto-generates unless you re-generate the whole timetable.</p>
      </div>
    </div>
  );
}

function TimetableAssignments({ classes, subjects, staff, timetableAssignments, addTimetableAssignment, removeTimetableAssignment, showToast }) {
  const [form, setForm] = useState({ class: classes[0], subject: subjects[0], teacherId: staff[0]?.id || "", periodsPerWeek: 5 });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.teacherId) { showToast("Choose a teacher"); return; }
    setSaving(true);
    try {
      await addTimetableAssignment({ ...form, periodsPerWeek: Number(form.periodsPerWeek) || 1 });
      showToast(`${form.subject} in ${form.class} assigned`);
    } catch (err) {
      showToast(err.message || "Couldn't save assignment");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Add / update an assignment</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Class"><select value={form.class} onChange={set("class")} className="focus-ring" style={{ ...inputStyle, width: 140 }}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Subject"><select value={form.subject} onChange={set("subject")} className="focus-ring" style={{ ...inputStyle, width: 170 }}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Teacher"><select value={form.teacherId} onChange={set("teacherId")} className="focus-ring" style={{ ...inputStyle, width: 170 }}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Periods / week"><input type="number" min={1} max={20} value={form.periodsPerWeek} onChange={set("periodsPerWeek")} className="focus-ring" style={{ ...inputStyle, width: 100 }} /></Field>
          <button onClick={submit} disabled={saving} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save"}</button>
        </div>
        <p style={{ fontSize: 11, color: "#a39c86", marginTop: 10 }}>One row per class + subject. Saving again for the same class and subject updates the teacher or periods/week.</p>
        <p style={{ fontSize: 11, color: "#a39c86", marginTop: 4 }}>A few rules apply automatically when generating: a subject named "PPI" (or containing "Pastoral") is always placed first period on Friday for that class, any subject starting with "Math" is always kept before the lunch break, PG/PP1/PP2 never have anything scheduled after lunch at all, and for every other class, mornings are filled before afternoons — so if there aren't quite enough weekly periods to fill the whole day, the gaps land after lunch instead of before.</p>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.6fr 1fr 0.6fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Class</span><span>Subject</span><span>Teacher</span><span>Periods/wk</span><span></span>
        </div>
        {classes.flatMap((c) => timetableAssignments.filter((a) => a.class === c)).map((a) => (
          <div key={a.id} style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.6fr 1fr 0.6fr", padding: "10px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
            <span>{a.class}</span>
            <span>{a.subject}</span>
            <span>{staff.find((s) => s.id === a.teacherId)?.name || "—"}</span>
            <span style={{ fontFamily: MONO_FONT }}>{a.periodsPerWeek}</span>
            <button onClick={() => removeTimetableAssignment(a.id)} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer", justifySelf: "end" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {timetableAssignments.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No assignments yet.</div>}
      </div>
    </div>
  );
}

function TimetableSettingsTab({ timetableSettings, updateTimetableSettings, showToast }) {
  const ALL_DAYS = [["Mon", "Monday"], ["Tue", "Tuesday"], ["Wed", "Wednesday"], ["Thu", "Thursday"], ["Fri", "Friday"], ["Sat", "Saturday"]];
  const [form, setForm] = useState({
    days: timetableSettings.days, periodsPerDay: timetableSettings.periodsPerDay,
    periodStartTime: timetableSettings.periodStartTime || "08:00",
    periodDurationMinutes: timetableSettings.periodDurationMinutes || 35,
    breaks: timetableSettings.breaks || [],
  });
  const [saving, setSaving] = useState(false);
  const [newBreak, setNewBreak] = useState({ afterPeriod: 2, minutes: 20, label: "Short Break" });

  const toggleDay = (d) => {
    setForm((f) => ({ ...f, days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d] }));
  };
  const addBreak = () => {
    const afterPeriod = Number(newBreak.afterPeriod);
    const minutes = Number(newBreak.minutes);
    if (!afterPeriod || afterPeriod < 1) { showToast("Pick a valid period to break after"); return; }
    setForm((f) => {
      // Only one break can start after a given period — replace rather than
      // stack, since a duplicate afterPeriod would otherwise sit in the
      // array but never actually show (the schedule only takes the first
      // match per period).
      const others = f.breaks.filter((b) => Number(b.afterPeriod) !== afterPeriod);
      return { ...f, breaks: [...others, { ...newBreak, afterPeriod, minutes }].sort((a, b) => a.afterPeriod - b.afterPeriod) };
    });
    // Move the field on to the next period so adding another break
    // right away targets a different slot instead of colliding again.
    setNewBreak((b) => ({ ...b, afterPeriod: Math.min(afterPeriod + 1, Number(form.periodsPerDay) || afterPeriod + 1) }));
  };
  const removeBreak = (idx) => {
    setForm((f) => ({ ...f, breaks: f.breaks.filter((_, i) => i !== idx) }));
  };

  const submit = async () => {
    if (form.days.length === 0) { showToast("Pick at least one school day"); return; }
    setSaving(true);
    try {
      await updateTimetableSettings({ ...form, periodsPerDay: Number(form.periodsPerDay) || 1, periodDurationMinutes: Number(form.periodDurationMinutes) || 1 });
      showToast("Timetable settings saved — re-generate to apply");
    } catch (err) {
      showToast(err.message || "Couldn't save settings");
    } finally {
      setSaving(false);
    }
  };

  const preview = buildScheduleRows({ ...form, periodsPerDay: Number(form.periodsPerDay) || 1, periodDurationMinutes: Number(form.periodDurationMinutes) || 1 });

  return (
    <div className="flex gap-5 flex-wrap items-start">
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, width: 440 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 14 }}>Weekly grid shape</h3>
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", display: "block", marginBottom: 8 }}>School days</span>
          <div className="flex gap-1.5 flex-wrap">
            {ALL_DAYS.map(([code, full]) => (
              <button key={code} onClick={() => toggleDay(code)} className="focus-ring" title={full} style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${form.days.includes(code) ? "transparent" : LINE}`, background: form.days.includes(code) ? RAIL : PANEL, color: form.days.includes(code) ? "#fff" : "#5b5747", cursor: "pointer" }}>{code}</button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mb-3">
          <Field label="Periods per day"><input type="number" min={1} max={12} value={form.periodsPerDay} onChange={(e) => setForm((f) => ({ ...f, periodsPerDay: e.target.value }))} className="focus-ring" style={inputStyle} /></Field>
          <Field label="First period starts"><input type="time" value={form.periodStartTime} onChange={(e) => setForm((f) => ({ ...f, periodStartTime: e.target.value }))} className="focus-ring" style={inputStyle} /></Field>
        </div>
        <Field label="Minutes per period"><input type="number" min={5} max={120} value={form.periodDurationMinutes} onChange={(e) => setForm((f) => ({ ...f, periodDurationMinutes: e.target.value }))} className="focus-ring" style={inputStyle} /></Field>

        <div style={{ marginTop: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", display: "block", marginBottom: 8 }}>Breaks</span>
          {form.breaks.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-3">
              {form.breaks.map((b, i) => (
                <div key={i} className="flex items-center justify-between" style={{ padding: "6px 10px", borderRadius: 8, background: BG, fontSize: 12 }}>
                  <span>{b.label} — after period {b.afterPeriod}, {b.minutes} min</span>
                  <button onClick={() => removeBreak(i)} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer" }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 flex-wrap">
            <Field label="After period"><input type="number" min={1} max={form.periodsPerDay} value={newBreak.afterPeriod} onChange={(e) => setNewBreak((b) => ({ ...b, afterPeriod: e.target.value }))} className="focus-ring" style={{ ...inputStyle, width: 80 }} /></Field>
            <Field label="Minutes"><input type="number" min={5} max={90} value={newBreak.minutes} onChange={(e) => setNewBreak((b) => ({ ...b, minutes: e.target.value }))} className="focus-ring" style={{ ...inputStyle, width: 80 }} /></Field>
            <Field label="Label"><input value={newBreak.label} onChange={(e) => setNewBreak((b) => ({ ...b, label: e.target.value }))} className="focus-ring" style={{ ...inputStyle, width: 130 }} /></Field>
            <button onClick={addBreak} className="focus-ring flex items-center gap-1" style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Plus size={13} /> Add</button>
          </div>
        </div>

        <button onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save Settings"}</button>
        <p style={{ fontSize: 11, color: "#a39c86", marginTop: 10 }}>Changing this doesn't move existing periods — re-generate afterwards so the grid matches.</p>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, minWidth: 220 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Preview</h3>
        <div className="flex flex-col gap-1">
          {preview.map((row, i) => row.kind === "break" ? (
            <div key={i} style={{ fontSize: 11.5, fontStyle: "italic", color: "#a1702c", padding: "3px 0" }}>{row.start}–{row.end} · {row.label}</div>
          ) : (
            <div key={i} style={{ fontSize: 12, color: "#5b5747", padding: "3px 0", fontFamily: MONO_FONT }}>P{row.period} · {row.start}–{row.end}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  SCHOOL SETUP — Head Teacher / Deputy Head Teacher only. General school
 *  profile (name, logo, address, motto, vision, email, contact, location),
 *  plus managing the list of classes and subjects used everywhere else.
 * ---------------------------------------------------------------------- */
const PAYROLL_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function fmtKES(n) {
  return `KES ${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ---------------------------------------------------------------------- *
 *  PAYROLL — Head Teacher / Deputy Head Teacher only. Set each staff
 *  member's pay, generate a month's payslips (a frozen snapshot per
 *  person), and print/download a typical Kenyan payslip — basic pay,
 *  allowances, PAYE, NSSF, SHIF, and the Affordable Housing Levy.
 * ---------------------------------------------------------------------- */
function PayrollView(ctx) {
  const [tab, setTab] = useState("pay");
  const tabs = ["pay", "run", "payslips", "settings"];
  const labels = { pay: "Staff Pay", run: "Run Payroll", payslips: "Payslips", settings: "Settings" };
  return (
    <div>
      <div className="flex gap-1 mb-4">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className="focus-ring" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${tab === t ? "transparent" : LINE}`, background: tab === t ? RAIL : PANEL, color: tab === t ? "#fff" : "#5b5747", cursor: "pointer" }}>{labels[t]}</button>
        ))}
      </div>
      {tab === "pay" && <StaffPayTab {...ctx} />}
      {tab === "run" && <RunPayrollTab {...ctx} />}
      {tab === "payslips" && <PayslipsTab {...ctx} />}
      {tab === "settings" && <PayrollSettingsTab {...ctx} />}
      <p style={{ fontSize: 11, color: "#a39c86", marginTop: 18 }}>Statutory rates (PAYE, NSSF, SHIF, Housing Levy) change from time to time — double-check current rates in Settings against KRA/NSSF/SHIF before relying on generated payslips.</p>
    </div>
  );
}

function StaffPayTab({ staff, staffPayroll, saveStaffPayroll, showToast }) {
  const [editing, setEditing] = useState(null);
  const payFor = (id) => staffPayroll.find((p) => p.staffId === id);

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr 1fr 1fr 1fr 0.6fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
        <span>Name</span><span>Role</span><span>Basic</span><span>Allowances</span><span>Gross</span><span></span>
      </div>
      {staff.map((s) => {
        const pay = payFor(s.id);
        const gross = pay ? pay.basicSalary + pay.houseAllowance + pay.transportAllowance + pay.otherAllowance : 0;
        return (
          <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1.2fr 1fr 1fr 1fr 0.6fr", padding: "10px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
            <span>{s.name}</span>
            <span style={{ fontSize: 12, color: "#7A7568" }}>{s.role}</span>
            <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{pay ? fmtKES(pay.basicSalary) : "—"}</span>
            <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{pay ? fmtKES(pay.houseAllowance + pay.transportAllowance + pay.otherAllowance) : "—"}</span>
            <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontWeight: 700 }}>{pay ? fmtKES(gross) : "—"}</span>
            <button onClick={() => setEditing(s)} className="focus-ring" style={{ background: "none", border: "none", color: "#5b5747", cursor: "pointer", justifySelf: "end" }}><Pencil size={14} /></button>
          </div>
        );
      })}
      {editing && (
        <StaffPayModal
          staffMember={editing} pay={payFor(editing.id)} onClose={() => setEditing(null)}
          onSave={async (patch) => {
            try { await saveStaffPayroll(editing.id, patch); showToast(`${editing.name}'s pay details saved`); setEditing(null); }
            catch (err) { showToast(err.message || "Couldn't save pay details"); }
          }}
        />
      )}
    </div>
  );
}

function StaffPayModal({ staffMember, pay, onClose, onSave }) {
  const [form, setForm] = useState({
    basicSalary: pay?.basicSalary || 0, houseAllowance: pay?.houseAllowance || 0, transportAllowance: pay?.transportAllowance || 0,
    otherAllowance: pay?.otherAllowance || 0, otherAllowanceLabel: pay?.otherAllowanceLabel || "Other Allowance",
    kraPin: pay?.kraPin || "", nssfNo: pay?.nssfNo || "", shifNo: pay?.shifNo || "", bankName: pay?.bankName || "", bankAccount: pay?.bankAccount || "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }));

  const submit = async () => {
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 440, padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>Pay details — {staffMember.name}</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>
        <div className="flex flex-col gap-3">
          <Field label="Basic Salary (KES)"><input type="number" min={0} value={form.basicSalary} onChange={setNum("basicSalary")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="House Allowance"><input type="number" min={0} value={form.houseAllowance} onChange={setNum("houseAllowance")} className="focus-ring" style={inputStyle} /></Field>
            <Field label="Transport Allowance"><input type="number" min={0} value={form.transportAllowance} onChange={setNum("transportAllowance")} className="focus-ring" style={inputStyle} /></Field>
          </div>
          <div className="flex gap-3">
            <Field label="Other Allowance"><input type="number" min={0} value={form.otherAllowance} onChange={setNum("otherAllowance")} className="focus-ring" style={inputStyle} /></Field>
            <Field label="Label"><input value={form.otherAllowanceLabel} onChange={set("otherAllowanceLabel")} className="focus-ring" style={inputStyle} /></Field>
          </div>
          <div style={{ height: 1, background: LINE, margin: "4px 0" }} />
          <div className="flex gap-3">
            <Field label="KRA PIN"><input value={form.kraPin} onChange={set("kraPin")} className="focus-ring" style={inputStyle} /></Field>
            <Field label="NSSF No."><input value={form.nssfNo} onChange={set("nssfNo")} className="focus-ring" style={inputStyle} /></Field>
          </div>
          <Field label="SHIF No."><input value={form.shifNo} onChange={set("shifNo")} className="focus-ring" style={inputStyle} /></Field>
          <div className="flex gap-3">
            <Field label="Bank Name"><input value={form.bankName} onChange={set("bankName")} className="focus-ring" style={inputStyle} /></Field>
            <Field label="Account No."><input value={form.bankAccount} onChange={set("bankAccount")} className="focus-ring" style={inputStyle} /></Field>
          </div>
        </div>
        <button type="button" onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save"}</button>
      </div>
    </div>
  );
}

function RunPayrollTab({ staff, staffPayroll, payrollSettings, payslips, generatePayslip, showToast, schoolSettings }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [generating, setGenerating] = useState(false);

  const eligible = staff.filter((s) => staffPayroll.some((p) => p.staffId === s.id && p.basicSalary > 0));
  const alreadyGenerated = (staffId) => payslips.some((p) => p.staffId === staffId && p.month === month && p.year === year);

  const runOne = async (s) => {
    const pay = staffPayroll.find((p) => p.staffId === s.id);
    const slip = await generatePayslip(s, pay, month, year);
    return slip;
  };

  const runAll = async () => {
    if (eligible.length === 0) { showToast("Set basic salary for at least one staff member first (Staff Pay tab)"); return; }
    setGenerating(true);
    try {
      let count = 0;
      for (const s of eligible) { await runOne(s); count++; }
      showToast(`Generated ${count} payslip${count === 1 ? "" : "s"} for ${PAYROLL_MONTHS[month - 1]} ${year}`);
    } catch (err) {
      showToast(err.message || "Couldn't generate payroll");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="flex items-end gap-3 mb-4 flex-wrap">
        <Field label="Month"><select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="focus-ring" style={{ ...inputStyle, width: 150 }}>{PAYROLL_MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        <Field label="Year"><input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || now.getFullYear())} className="focus-ring" style={{ ...inputStyle, width: 100 }} /></Field>
        <button onClick={runAll} disabled={generating} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: generating ? "wait" : "pointer" }}>
          {generating ? "Generating…" : `Generate All (${eligible.length})`}
        </button>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Name</span><span>Gross</span><span>Status</span><span></span>
        </div>
        {eligible.map((s) => {
          const pay = staffPayroll.find((p) => p.staffId === s.id);
          const calc = computePayslip(pay, payrollSettings);
          const done = alreadyGenerated(s.id);
          const existingSlip = payslips.find((p) => p.staffId === s.id && p.month === month && p.year === year);
          return (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr 1fr 1fr", padding: "10px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
              <span>{s.name}</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{fmtKES(calc.gross)}</span>
              <span style={{ fontSize: 11.5, fontWeight: 700, color: done ? "#2f7a4d" : "#a39c86" }}>{done ? "Generated" : "Not yet"}</span>
              <div className="flex gap-2 justify-end">
                {done ? (
                  <button onClick={() => printDocument(`${s.name} Payslip`, buildPayslipHtml({ staff: s, pay, slip: existingSlip, schoolSettings }))} className="focus-ring flex items-center gap-1" style={{ padding: "6px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: BG, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}><Download size={12} /> PDF</button>
                ) : (
                  <button onClick={async () => { try { await runOne(s); showToast(`${s.name}'s payslip generated`); } catch (err) { showToast(err.message || "Couldn't generate"); } }} className="focus-ring" style={{ padding: "6px 10px", borderRadius: 7, border: "none", background: RAIL, color: "#fff", fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Generate</button>
                )}
              </div>
            </div>
          );
        })}
        {eligible.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No staff have a basic salary set yet — add one in Staff Pay.</div>}
      </div>
    </div>
  );
}

function PayslipsTab({ payslips, staff, staffPayroll, schoolSettings, deletePayslip, showToast }) {
  const [staffFilter, setStaffFilter] = useState("All");
  const filtered = staffFilter === "All" ? payslips : payslips.filter((p) => p.staffId === staffFilter);

  return (
    <div>
      <div className="mb-4">
        <Field label="Filter by staff">
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 220 }}>
            <option value="All">All staff</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.8fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Name</span><span>Period</span><span>Gross</span><span>Net Pay</span><span></span>
        </div>
        {filtered.map((p) => {
          const staffMember = staff.find((s) => s.id === p.staffId) || { name: p.staffName, id: p.staffId };
          return (
            <div key={p.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr 0.8fr", padding: "10px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
              <span>{p.staffName}</span>
              <span style={{ fontSize: 12 }}>{PAYROLL_MONTHS[p.month - 1]} {p.year}</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{fmtKES(p.grossPay)}</span>
              <span style={{ fontFamily: MONO_FONT, fontSize: 12, fontWeight: 700 }}>{fmtKES(p.netPay)}</span>
              <div className="flex gap-2 justify-end">
                <button onClick={() => printDocument(`${p.staffName} Payslip`, buildPayslipHtml({ staff: staffMember, pay: staffPayroll.find((pr) => pr.staffId === p.staffId), slip: p, schoolSettings }))} className="focus-ring" style={{ background: "none", border: "none", color: "#5b5747", cursor: "pointer" }} title="Download PDF"><Download size={14} /></button>
                <button onClick={() => { if (window.confirm(`Delete ${p.staffName}'s ${PAYROLL_MONTHS[p.month - 1]} ${p.year} payslip?`)) deletePayslip(p.id); }} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer" }} title="Delete"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No payslips generated yet.</div>}
      </div>
    </div>
  );
}

function PayrollSettingsTab({ payrollSettings, updatePayrollSettings, showToast }) {
  const [form, setForm] = useState(payrollSettings);
  const [saving, setSaving] = useState(false);
  const setBand = (i, key) => (e) => {
    const bands = form.payeBands.map((b, idx) => idx === i ? { ...b, [key]: key === "upTo" ? (e.target.value === "" ? null : Number(e.target.value)) : Number(e.target.value) } : b);
    setForm((f) => ({ ...f, payeBands: bands }));
  };
  const setNum = (k) => (e) => setForm((f) => ({ ...f, [k]: Number(e.target.value) || 0 }));

  const submit = async () => {
    setSaving(true);
    try { await updatePayrollSettings(form); showToast("Payroll settings saved"); }
    catch (err) { showToast(err.message || "Couldn't save settings"); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex gap-5 flex-wrap items-start">
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, width: 420 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>PAYE bands (monthly, on taxable pay)</h3>
        <div className="flex flex-col gap-2 mb-3">
          {form.payeBands.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <span style={{ fontSize: 12, color: "#7A7568", width: 60 }}>Band {i + 1}</span>
              <input type="number" placeholder="Up to" value={b.upTo ?? ""} onChange={setBand(i, "upTo")} className="focus-ring" style={{ ...inputStyle, width: 110 }} disabled={i === form.payeBands.length - 1} />
              <span style={{ fontSize: 12 }}>@</span>
              <input type="number" step="0.001" value={b.rate} onChange={setBand(i, "rate")} className="focus-ring" style={{ ...inputStyle, width: 80 }} />
              <span style={{ fontSize: 12 }}>rate</span>
            </div>
          ))}
        </div>
        <Field label="Personal Relief (KES/month)"><input type="number" value={form.personalRelief} onChange={setNum("personalRelief")} className="focus-ring" style={inputStyle} /></Field>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, width: 380 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>NSSF</h3>
        <div className="flex gap-3 mb-3">
          <Field label="Tier I limit"><input type="number" value={form.nssfTier1Limit} onChange={setNum("nssfTier1Limit")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Tier II limit"><input type="number" value={form.nssfTier2Limit} onChange={setNum("nssfTier2Limit")} className="focus-ring" style={inputStyle} /></Field>
        </div>
        <Field label="Rate (each side)"><input type="number" step="0.001" value={form.nssfRate} onChange={setNum("nssfRate")} className="focus-ring" style={inputStyle} /></Field>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "18px 0 12px" }}>SHIF</h3>
        <div className="flex gap-3">
          <Field label="Rate"><input type="number" step="0.0001" value={form.shifRate} onChange={setNum("shifRate")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Minimum (KES)"><input type="number" value={form.shifMinimum} onChange={setNum("shifMinimum")} className="focus-ring" style={inputStyle} /></Field>
        </div>

        <h3 style={{ fontSize: 13.5, fontWeight: 700, margin: "18px 0 12px" }}>Housing Levy</h3>
        <Field label="Rate (each side)"><input type="number" step="0.001" value={form.housingLevyRate} onChange={setNum("housingLevyRate")} className="focus-ring" style={inputStyle} /></Field>

        <button onClick={submit} disabled={saving} className="focus-ring" style={{ width: "100%", marginTop: 18, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save Settings"}</button>
      </div>
    </div>
  );
}

// Typical Kenyan payslip layout: employee + statutory numbers, earnings,
// deductions, net pay, and employer contributions shown for information.
// Handed to the shared printDocument() helper (window.print()-based PDF,
// same mechanism used for report cards and mark lists elsewhere). `pay` is
// the staff member's current pay-details row — used only for identity/bank
// numbers (KRA PIN, NSSF/SHIF no., bank details), which aren't expected to
// change month to month, unlike the frozen figures in `slip`.
function buildPayslipHtml({ staff, pay, slip, schoolSettings }) {
  return `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div><div class="meta" style="margin:0;">Payslip — ${PAYROLL_MONTHS[slip.month - 1]} ${slip.year}</div></div>
    </div>
    <table style="margin-bottom:12px;font-size:12px;">
      <tr><td style="width:50%;"><b>Employee:</b> ${slip.staffName}</td><td><b>Position:</b> ${staff?.role || ""}</td></tr>
      <tr><td><b>KRA PIN:</b> ${pay?.kraPin || "—"}</td><td><b>NSSF No.:</b> ${pay?.nssfNo || "—"}</td></tr>
      <tr><td><b>SHIF No.:</b> ${pay?.shifNo || "—"}</td><td><b>Bank:</b> ${pay?.bankName || "—"} ${pay?.bankAccount ? `(Acc. ${pay.bankAccount})` : ""}</td></tr>
    </table>
    <div style="display:flex;gap:24px;font-size:12px;margin-bottom:16px;">
      <div style="flex:1;">
        <table>
          <tr><th colspan="2" style="text-align:left;background:#f3f0e6;">Earnings</th></tr>
          <tr><td>Basic Salary</td><td style="text-align:right;">${fmtKES(slip.basicSalary)}</td></tr>
          <tr><td>House Allowance</td><td style="text-align:right;">${fmtKES(slip.houseAllowance)}</td></tr>
          <tr><td>Transport Allowance</td><td style="text-align:right;">${fmtKES(slip.transportAllowance)}</td></tr>
          <tr><td>${slip.otherAllowanceLabel || "Other Allowance"}</td><td style="text-align:right;">${fmtKES(slip.otherAllowance)}</td></tr>
          <tr><td><b>Gross Pay</b></td><td style="text-align:right;"><b>${fmtKES(slip.grossPay)}</b></td></tr>
        </table>
      </div>
      <div style="flex:1;">
        <table>
          <tr><th colspan="2" style="text-align:left;background:#f3f0e6;">Deductions</th></tr>
          <tr><td>PAYE</td><td style="text-align:right;">${fmtKES(slip.paye)}</td></tr>
          <tr><td>NSSF</td><td style="text-align:right;">${fmtKES(slip.nssf)}</td></tr>
          <tr><td>SHIF</td><td style="text-align:right;">${fmtKES(slip.shif)}</td></tr>
          <tr><td>Housing Levy</td><td style="text-align:right;">${fmtKES(slip.housingLevy)}</td></tr>
          ${slip.otherDeduction ? `<tr><td>${slip.otherDeductionLabel || "Other Deduction"}</td><td style="text-align:right;">${fmtKES(slip.otherDeduction)}</td></tr>` : ""}
          <tr><td><b>Total Deductions</b></td><td style="text-align:right;"><b>${fmtKES(slip.paye + slip.nssf + slip.shif + slip.housingLevy + (slip.otherDeduction || 0))}</b></td></tr>
        </table>
      </div>
    </div>
    <table style="margin-bottom:16px;">
      <tr><td style="background:#152A4A;color:#fff;font-size:14px;"><b>NET PAY</b></td><td style="background:#152A4A;color:#fff;text-align:right;font-size:14px;"><b>${fmtKES(slip.netPay)}</b></td></tr>
    </table>
    <div style="font-size:10.5px;color:#777;">
      <b>Employer Contributions (informational, not deducted from net pay):</b> NSSF ${fmtKES(slip.employerNssf)} &middot; Housing Levy ${fmtKES(slip.employerHousingLevy)}
    </div>
    <div style="font-size:10.5px;color:#777;margin-top:6px;">Generated ${new Date(slip.createdAt || Date.now()).toLocaleDateString()}</div>
  `;
}

function EventsView({ events, addEvent, deleteEvent, isAdmin, showToast }) {
  const [form, setForm] = useState({ from: new Date().toISOString().slice(0,10), to: new Date().toISOString().slice(0,10), name: "", location: "", description: "" });
  const [busy, setBusy] = useState(false);
  const upcoming = (events || []).filter((e) => e.to >= new Date().toISOString().slice(0,10));
  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.from || !form.to) return;
    if (form.to < form.from) { showToast("To date cannot be before From date"); return; }
    setBusy(true);
    try { await addEvent(form); setForm({ from: form.from, to: form.to, name: "", location: "", description: "" }); showToast("Event added"); }
    catch (err) { showToast(err.message || "Couldn't add event"); }
    finally { setBusy(false); }
  };
  return <div className="px-7 py-6" style={{ maxWidth: 1000 }}>
    <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Events</h2>
    <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>School calendar and upcoming activities.</p>
    {isAdmin && <form onSubmit={save} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
      <div className="grid grid-cols-2 gap-3"><Field label="From"><input type="date" value={form.from} onChange={e=>setForm({...form,from:e.target.value})} style={inputStyle} /></Field><Field label="To"><input type="date" value={form.to} onChange={e=>setForm({...form,to:e.target.value})} style={inputStyle} /></Field><Field label="Event name"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Parents Meeting" style={inputStyle} /></Field><Field label="Location"><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="e.g. School Hall" style={inputStyle} /></Field><Field label="Description (optional)"><input value={form.description} onChange={e=>setForm({...form,description:e.target.value})} style={inputStyle} /></Field></div>
      <button disabled={busy} type="submit" className="focus-ring" style={{ marginTop: 12, padding: "9px 18px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700 }}>{busy ? "Saving…" : "Add Event"}</button>
    </form>}
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
      {(events || []).map(e => <div key={e.id} className="flex items-center justify-between" style={{ padding: "11px 16px", borderBottom: `1px solid ${LINE}` }}><div><b>{e.name}</b> <span style={{fontSize:11,color:"#8a8474"}}>{e.type === "Exam" ? "· Exam" : ""}</span><div style={{fontSize:11.5,color:"#6b6656"}}>{e.from}{e.to !== e.from ? ` to ${e.to}` : ""}{e.location ? ` · ${e.location}` : ""}</div>{e.description && <div style={{fontSize:11,color:"#8a8474"}}>{e.description}</div>}</div>{isAdmin && <button onClick={()=>{if(window.confirm(`Delete event ${e.name}?`)) deleteEvent(e.id)}} className="focus-ring" style={{background:"none",border:"none",color:"#a1442c",cursor:"pointer"}}><Trash2 size={14}/></button>}</div>)}
      {!(events || []).length && <div style={{padding:18,fontSize:12.5,color:"#a39c86"}}>No events added yet.</div>}
    </div>
  </div>;
}

function SchoolSetupView({ schoolSettings, updateSchoolSettings, classes, subjects, addClass, removeClass, addSubject, removeSubject, uploadPhoto, showToast, feeStructure, otherFeeStructure, setClassFee }) {
  const [tab, setTab] = useState("general");
  return (
    <div className="px-7 py-6" style={{ maxWidth: 720 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>School Setup</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>School profile, classes, and subjects — visible to everyone, editable by the Head Teacher.</p>

      <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${LINE}` }}>
        {[["general", "General"], ["classes", "Classes"], ["subjects", "Subjects"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === id ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: tab === id ? INK : "#9a9484", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {tab === "general" && <GeneralSetupTab schoolSettings={schoolSettings} updateSchoolSettings={updateSchoolSettings} uploadPhoto={uploadPhoto} showToast={showToast} />}
      {tab === "classes" && <ClassesSetupTab classes={classes} feeStructure={feeStructure} otherFeeStructure={otherFeeStructure} addClass={addClass} removeClass={removeClass} setClassFee={setClassFee} showToast={showToast} />}
      {tab === "subjects" && <ListSetupTab title="Subjects" items={subjects} onAdd={addSubject} onRemove={removeSubject} placeholder="e.g. Agriculture" showToast={showToast} />}
    </div>
  );
}

// Classes need a fee amount alongside the name (unlike Subjects, which is a
// plain list), so this isn't just another ListSetupTab.
function ClassesSetupTab({ classes, feeStructure, otherFeeStructure, addClass, removeClass, setClassFee, showToast }) {
  const [name, setName] = useState("");
  const [fee, setFee] = useState("");
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState("School Fees");
  const [editingFee, setEditingFee] = useState(null);
  const [editValue, setEditValue] = useState("");

  const dueFor = (c, acct) => (acct === "School Fees" ? feeStructure[c] : otherFeeStructure[acct]?.[c]) || 0;

  const submit = async (e) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    if (classes.includes(clean)) { showToast(`${clean} is already in the list`); return; }
    setBusy(true);
    try {
      await addClass(clean, fee);
      setName(""); setFee("");
    } catch (err) {
      showToast(err.message || "Couldn't add class");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c) => {
    try { await removeClass(c); } catch (err) { showToast(err.message || `Couldn't remove ${c}`); }
  };

  const startEditFee = (c) => { setEditingFee(c); setEditValue(String(dueFor(c, account))); };
  const saveFee = async (c) => {
    try {
      await setClassFee(c, editValue, account);
      showToast(`${c} ${account.toLowerCase()} amount updated`);
      setEditingFee(null);
    } catch (err) {
      showToast(err.message || "Couldn't update amount");
    }
  };

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
      <div className="flex gap-2 mb-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Grade 7" className="focus-ring" style={{ flex: 2, ...inputStyle }} />
        <input type="number" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Term fee (KSh)" className="focus-ring" style={{ flex: 1, ...inputStyle, fontFamily: MONO_FONT }} />
        <button type="button" onClick={submit} disabled={busy} className="focus-ring flex items-center gap-1.5" style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: busy ? "wait" : "pointer" }}><Plus size={14} /> Add</button>
      </div>
      <p style={{ fontSize: 11, color: "#a39c86", marginBottom: 12 }}>New classes start with a School Fees amount above. Set Food/Exams/Transport amounts (optional) per class below.</p>

      <div className="flex gap-1.5 mb-3">
        {PAYMENT_ACCOUNTS.map((a) => (
          <button key={a} onClick={() => { setAccount(a); setEditingFee(null); }} className="focus-ring" style={{ padding: "6px 12px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, border: `1px solid ${account === a ? "transparent" : LINE}`, background: account === a ? RAIL : PANEL, color: account === a ? "#fff" : "#5b5747", cursor: "pointer" }}>{a}</button>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        {classes.map((c) => (
          <div key={c} className="flex items-center justify-between" style={{ padding: "8px 10px", borderRadius: 8, background: BG, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{c}</span>
            <div className="flex items-center gap-2">
              {editingFee === c ? (
                <>
                  <input type="number" min={0} value={editValue} onChange={(e) => setEditValue(e.target.value)} autoFocus className="focus-ring" style={{ width: 90, padding: "4px 8px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 12, fontFamily: MONO_FONT }} />
                  <button onClick={() => saveFee(c)} className="focus-ring" style={{ fontSize: 11.5, fontWeight: 700, color: "#2f6f4a", background: "none", border: "none", cursor: "pointer" }}>Save</button>
                  <button onClick={() => setEditingFee(null)} className="focus-ring" style={{ fontSize: 11.5, color: "#9a9484", background: "none", border: "none", cursor: "pointer" }}>Cancel</button>
                </>
              ) : (
                <button onClick={() => startEditFee(c)} className="focus-ring" style={{ fontFamily: MONO_FONT, fontSize: 12.5, color: "#6b6656", background: "none", border: "none", cursor: "pointer", textDecoration: "underline dotted" }}>
                  {dueFor(c, account) > 0 ? `${money(dueFor(c, account))}/term` : "Not set"}
                </button>
              )}
              {account === "School Fees" && <button onClick={() => remove(c)} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#a1442c" }}><Trash2 size={14} /></button>}
            </div>
          </div>
        ))}
        {classes.length === 0 && <p style={{ fontSize: 12.5, color: "#c4bda7" }}>None added yet.</p>}
      </div>
    </div>
  );
}

function GeneralSetupTab({ schoolSettings, updateSchoolSettings, uploadPhoto, showToast }) {
  const [form, setForm] = useState(schoolSettings || {});
  const [logoPreview, setLogoPreview] = useState(schoolSettings?.logoUrl || "");
  const [logoFile, setLogoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const onLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      let logoUrl = form.logoUrl || "";
      if (logoFile) logoUrl = await uploadPhoto(logoFile, "school");
      await updateSchoolSettings({ ...form, logoUrl });
      showToast("School details updated");
    } catch (err) {
      setError(err.message || "Couldn't save school details.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
      <div className="flex flex-col gap-3">
        <PhotoField label="School logo" preview={logoPreview} onChange={onLogoChange} round={false} />
        <Field label="School name"><input value={form.name || ""} onChange={set("name")} className="focus-ring" style={inputStyle} /></Field>
        <Field label="Motto"><input value={form.motto || ""} onChange={set("motto")} className="focus-ring" style={inputStyle} placeholder="e.g. Knowledge, Character, Service" /></Field>
        <Field label="Vision"><textarea value={form.vision || ""} onChange={set("vision")} className="focus-ring" style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} /></Field>
        <div className="flex gap-3">
          <Field label="Email"><input type="email" value={form.email || ""} onChange={set("email")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Contact phone"><input value={form.contact || ""} onChange={set("contact")} className="focus-ring" style={inputStyle} placeholder="07…" /></Field>
        </div>
        <Field label="Address"><input value={form.address || ""} onChange={set("address")} className="focus-ring" style={inputStyle} placeholder="P.O. Box …" /></Field>
        <Field label="Location"><input value={form.location || ""} onChange={set("location")} className="focus-ring" style={inputStyle} placeholder="e.g. Kiambu Road, Nairobi" /></Field>
        <Field label="Current term"><select value={form.currentTerm || DEFAULT_TERM} onChange={set("currentTerm")} className="focus-ring" style={inputStyle}>{TERMS.map((t) => <option key={t} value={t}>{t}</option>)}</select></Field>
        <div className="flex gap-3">
          <Field label="Term closing date"><input type="date" value={form.termClosingDate || ""} onChange={set("termClosingDate")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Next term opening date"><input type="date" value={form.nextTermOpeningDate || ""} onChange={set("nextTermOpeningDate")} className="focus-ring" style={inputStyle} /></Field>
        </div>
        <div className="flex gap-3">
          <Field label="Official arrival time"><input type="time" value={form.arrivalCutoff || "07:20"} onChange={set("arrivalCutoff")} className="focus-ring" style={inputStyle} /></Field>
          <Field label="Official departure time"><input type="time" value={form.departureCutoff || "17:00"} onChange={set("departureCutoff")} className="focus-ring" style={inputStyle} /></Field>
        </div>
      </div>
      {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12, marginTop: 10 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
      <button type="button" onClick={save} disabled={saving} className="focus-ring" style={{ marginTop: 18, padding: "10px 20px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
    </div>
  );
}

// Shared list editor for Classes and Subjects — add a new one, or remove
// an existing one (removing doesn't touch existing student/staff records
// that already reference it, only the picker lists used going forward).
function ListSetupTab({ title, items, onAdd, onRemove, placeholder, showToast }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const name = value.trim();
    if (!name) return;
    if (items.includes(name)) { showToast(`${name} is already in the list`); return; }
    setBusy(true);
    try {
      await onAdd(name);
      setValue("");
    } catch (err) {
      showToast(err.message || `Couldn't add ${title.toLowerCase()}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name) => {
    try {
      await onRemove(name);
    } catch (err) {
      showToast(err.message || `Couldn't remove ${name}`);
    }
  };

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
      <div className="flex gap-2 mb-4">
        <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="focus-ring" style={{ flex: 1, ...inputStyle }} />
        <button type="button" onClick={submit} disabled={busy} className="focus-ring flex items-center gap-1.5" style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: busy ? "wait" : "pointer" }}><Plus size={14} /> Add</button>
      </div>
      <div className="flex flex-col gap-1.5">
        {items.map((name) => (
          <div key={name} className="flex items-center justify-between" style={{ padding: "8px 10px", borderRadius: 8, background: BG, fontSize: 13 }}>
            <span style={{ fontWeight: 600 }}>{name}</span>
            <button onClick={() => remove(name)} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#a1442c" }}><Trash2 size={14} /></button>
          </div>
        ))}
        {items.length === 0 && <p style={{ fontSize: 12.5, color: "#c4bda7" }}>None added yet.</p>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  EXAMS — Setup (unlock exams + assessment levels), Enter Marks, Report.
 *  Head Teacher / Deputy Head Teacher only.
 * ---------------------------------------------------------------------- */
function LevelBadge({ band, children }) {
  return (
    <span style={{ background: gradeColor(band), color: "#fff", borderRadius: 999, padding: "3px 12px", fontSize: 12.5, fontWeight: 700, display: "inline-block", minWidth: 28, textAlign: "center" }}>
      {children}
    </span>
  );
}

// Shared analysis: given every mark row for one class/term/year/exam
// sitting, rank students by average subject percentage, compute subject
// means, class mean, and top-3 breakdowns. Used by both the mark list
// (Analyse) and the individual Report, so numbers always match.
function computeAnalysis(markRows, roster) {
  const bySubjectAll = {};
  const perStudent = roster.map((s) => {
    const rows = markRows.filter((m) => m.studentId === s.id);
    const bySubject = {};
    let total = 0;
    let percentageCount = 0;
    rows.forEach((r) => {
      if (r.score == null) return;
      const score = Number(r.score) || 0;
      const outOf = Number(r.outOf) || 0;
      const pct = outOf ? Math.round((score / outOf) * 100) : 0;
      bySubject[r.subject] = { score: Math.round(score), outOf: Math.round(outOf), pct, comment: r.comment };
      total += pct;
      percentageCount += 1;
      bySubjectAll[r.subject] = bySubjectAll[r.subject] || [];
      bySubjectAll[r.subject].push(pct);
    });
    // Total Marks is the sum of all subject percentages.
    // Meanscore is the average of those subject percentages.
    const meanscore = percentageCount ? Math.round((total / percentageCount) * 100) / 100 : null;
    return { student: s, bySubject, total, meanscore };
  }).filter((r) => r.total != null);

  // Rank by total percentage points.
  perStudent.sort((a, b) => b.total - a.total);
  let pos = 0, lastTotal = null;
  perStudent.forEach((r, i) => {
    if (r.total !== lastTotal) { pos = i + 1; lastTotal = r.total; }
    r.position = pos;
  });

  // Subject means are arithmetic averages of the subject percentages.
  const subjectMeans = Object.fromEntries(
    Object.entries(bySubjectAll).map(([subj, arr]) => [subj, Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) / 100])
  );

  // Per-subject rank (position within the class, for that one subject) —
  // used on the individual report card's "Rank" column.
  Object.keys(bySubjectAll).forEach((subj) => {
    const ranked = perStudent
      .filter((r) => r.bySubject[subj] != null)
      .sort((a, b) => b.bySubject[subj].pct - a.bySubject[subj].pct);
    let p = 0, last = null;
    ranked.forEach((r, i) => {
      const pct = r.bySubject[subj].pct;
      if (pct !== last) { p = i + 1; last = pct; }
      r.bySubject[subj].rank = p;
      r.bySubject[subj].outOfCount = ranked.length;
    });
  });

  // Class mean is the average of learners' meanscores (equivalent to the
  // average of their total percentage sums divided by subject count).
  const classMean = perStudent.length ? Math.round((perStudent.reduce((sum, r) => sum + r.total, 0) / perStudent.length) * 100) / 100 : 0;
  const classMeanPercent = classMean;
  const top3 = perStudent.slice(0, 3);
  const top3Boys = perStudent.filter((r) => r.student.gender === "M").slice(0, 3);
  const top3Girls = perStudent.filter((r) => r.student.gender === "F").slice(0, 3);
  return { perStudent, subjectMeans, classMean, classMeanPercent, top3, top3Boys, top3Girls };
}

function gradeForPercent(pct, system, gradingLevels) {
  const levels = gradingLevels.filter((l) => l.system === system);
  return levels.find((l) => pct >= l.from && pct <= l.to) || null;
}

function printDocument(title, bodyHtml) {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`
    <html><head><title>${title}</title>
    <style>
      body { font-family: Georgia, serif; padding: 32px; color: #1E2333; }
      table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 13px; }
      th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
      th { background: #f2efe6; }
      .header { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
      .header img { width: 48px; height: 48px; object-fit: cover; border-radius: 8px; }
      .school-name { font-size: 20px; font-weight: 700; }
      .meta { font-size: 13px; color: #555; margin-bottom: 16px; }
      .summary { margin-top: 18px; font-size: 13px; }
      .summary b { display: block; margin-top: 8px; }
    </style></head>
    <body>${bodyHtml}</body></html>
  `);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function NotificationsView({ notifications, staff, isAdmin, authedUser, sendNotification, readNotification, deleteNotification, showToast }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [recipient, setRecipient] = useState("all");
  const [sending, setSending] = useState(false);

  const teachers = (staff || []).filter((s) => ["Class Teacher", "Subject Teacher"].includes(s.role));
  const unread = (notifications || []).filter((n) => !n.read);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) { showToast("Enter a title and message"); return; }
    setSending(true);
    try {
      await sendNotification({ title: title.trim(), message: message.trim(), recipientId: recipient === "all" ? null : recipient });
      setTitle(""); setMessage(""); setRecipient("all");
    } catch (err) { showToast(err.message || "Couldn't send notification"); }
    finally { setSending(false); }
  };

  const visible = (notifications || []).filter((n) => n.audience === "all_teachers" || n.recipientId === authedUser.id || isAdmin);

  return (
    <div className="px-7 py-6" style={{maxWidth:1000}}>
      <div className="flex items-start justify-between gap-4" style={{marginBottom:18}}>
        <div><h2 style={{fontFamily:DISPLAY_FONT,fontSize:20,fontWeight:600,marginBottom:4}}>Notifications</h2><p style={{fontSize:12.5,color:"#7A7568"}}>Important notices and messages for the teaching team.</p></div>
        <div style={{background: unread.length ? "#FFF0E8" : "#EEF8F0", color: unread.length ? "#A1442C" : "#2F6F4A", borderRadius:10, padding:"8px 11px", fontSize:11.5, fontWeight:700}}>{unread.length} unread</div>
      </div>

      {isAdmin && (
        <form onSubmit={submit} className="dashboard-section" style={{background:"#EEF5FF",marginBottom:16}}>
          <div className="flex items-center gap-2" style={{marginBottom:12}}><Send size={17} color="#245B91"/><b style={{fontSize:13,color:"#245B91"}}>Send a notification</b></div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Send to"><select value={recipient} onChange={(e)=>setRecipient(e.target.value)} className="focus-ring" style={inputStyle}><option value="all">All teachers</option>{teachers.map(t=><option key={t.id} value={t.id}>{t.name} — {t.role}</option>)}</select></Field>
            <Field label="Title"><input value={title} onChange={(e)=>setTitle(e.target.value)} placeholder="e.g. Staff meeting" className="focus-ring" style={inputStyle}/></Field>
          </div>
          <div style={{marginTop:12}}><Field label="Message"><textarea value={message} onChange={(e)=>setMessage(e.target.value)} placeholder="Write the notice here…" className="focus-ring" style={{...inputStyle,minHeight:90,resize:"vertical"}}/></Field></div>
          <button type="submit" disabled={sending} className="focus-ring flex items-center gap-2" style={{marginTop:12,padding:"9px 16px",borderRadius:9,border:"none",background:RAIL,color:"#fff",fontSize:12.5,fontWeight:700,cursor:sending?"wait":"pointer"}}><Send size={14}/>{sending?"Sending…":"Send Notification"}</button>
        </form>
      )}

      <div className="dashboard-section" style={{background:PANEL}}>
        <div style={{fontSize:11,fontWeight:700,color:"#8a8474",textTransform:"uppercase",marginBottom:10}}>Inbox</div>
        {visible.length === 0 ? <div style={{fontSize:12.5,color:"#7A7568",padding:"18px 0"}}>No notifications yet.</div> : visible.map((n)=>(
          <div key={n.id} onClick={()=>{if(!n.read) readNotification(n.id)}} style={{padding:"13px 0",borderBottom:`1px solid ${LINE}`,cursor:n.read?"default":"pointer"}}>
            <div className="flex items-start gap-3">
              <div style={{width:36,height:36,borderRadius:10,background:n.read?"#F2EFE6":"#FFF0E8",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Bell size={16} color={n.read?"#8a8474":"#A1442C"}/></div>
              <div style={{flex:1,minWidth:0}}><div className="flex items-start justify-between gap-3"><b style={{fontSize:13,color:INK}}>{n.title}</b><div className="flex items-center gap-2">{!n.read && <span style={{fontSize:9.5,fontWeight:700,color:"#A1442C",background:"#FBE3D8",padding:"3px 6px",borderRadius:999}}>UNREAD</span>}{isAdmin && <button onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }} className="focus-ring" title="Delete notification" style={{background:"none",border:"none",color:"#a1442c",cursor:"pointer",padding:2}}><Trash2 size={13} /></button>}</div></div><div style={{fontSize:12,color:"#6b6656",lineHeight:1.5,marginTop:4,whiteSpace:"pre-wrap"}}>{n.message}</div><div style={{fontSize:10.5,color:"#9a9484",marginTop:5}}>{n.senderName ? `From ${n.senderName} · ` : ""}{new Date(n.createdAt).toLocaleString("en-GB")}</div></div>
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize:10.5,color:"#9a9484",marginTop:9}}>Tap an unread notice to mark it as read.</p>
    </div>
  );
}

// Kept as plain data so adding another external link later is a one-line change.
const EXTERNAL_RESOURCES = [
  {
    title: "Lesson Plan Generator (Mwalimu App)",
    description: "A free external alternative — enter your learning area, strand, and sub-strand on their site.",
    url: "https://mwalimuapp.com/lesson-plan/",
    provider: "Mwalimu App",
  },
];

/* ---------------------------------------------------------------------- *
 *  COMMUNICATION — bulk SMS to guardians via Africa's Talking. Head
 *  Teacher / Deputy Head Teacher only, since it costs real money per
 *  message sent. Every send is logged (message, audience, recipient
 *  count, cost) so there's a record of what went out and to whom.
 * ---------------------------------------------------------------------- */
function CommunicationView(ctx) {
  const [tab, setTab] = useState("compose");
  return (
    <div className="px-7 py-6" style={{ maxWidth: 780 }}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600 }}>Communication</h2>
          <p style={{ fontSize: 12.5, color: "#7A7568" }}>Send SMS to guardians via Africa's Talking.</p>
        </div>
        <div className="flex gap-1">
          {["compose", "results", "history"].map((t) => (
            <button key={t} onClick={() => setTab(t)} className="focus-ring" style={{ padding: "7px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, textTransform: "capitalize", border: `1px solid ${tab === t ? "transparent" : LINE}`, background: tab === t ? RAIL : PANEL, color: tab === t ? "#fff" : "#5b5747", cursor: "pointer" }}>{t === "results" ? "Exam Results" : t}</button>
          ))}
        </div>
      </div>
      {tab === "compose" && <ComposeSmsTab {...ctx} />}
      {tab === "results" && <ExamResultsSmsTab {...ctx} />}
      {tab === "history" && <SmsHistoryTab {...ctx} />}
    </div>
  );
}

function ComposeSmsTab({ students, classes, staff, otherFeeStructure, feeStructure, payments, sendBulkSms, recordSmsMessage, showToast }) {
  const [audienceType, setAudienceType] = useState("all");
  const [cls, setCls] = useState(classes[0] || "");
  const [account, setAccount] = useState("School Fees");
  const [studentQuery, setStudentQuery] = useState("");
  const [studentId, setStudentId] = useState(null);
  const [teacherId, setTeacherId] = useState(staff[0]?.id || "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const dueFor = (s, acct) => (acct === "School Fees" ? feeStructure[s.class] : otherFeeStructure[acct]?.[s.class]) || 0;
  const balanceFor = (s, acct) => {
    const due = dueFor(s, acct);
    const paid = payments.filter((p) => p.studentId === s.id && p.account === acct).reduce((sum, p) => sum + p.amount, 0);
    return due - paid;
  };

  // Both students and staff have a `.phone` field, so both audience
  // families reduce to the same { name, phone } shape below.
  let recipients = [];
  let audienceLabel = "";
  if (audienceType === "all") {
    recipients = students;
    audienceLabel = "All Guardians";
  } else if (audienceType === "class") {
    recipients = students.filter((s) => s.class === cls);
    audienceLabel = cls;
  } else if (audienceType === "balance") {
    recipients = students.filter((s) => balanceFor(s, account) > 0);
    audienceLabel = `${account} balance due`;
  } else if (audienceType === "individual") {
    const found = students.find((s) => s.id === studentId);
    recipients = found ? [found] : [];
    audienceLabel = found ? found.name : "";
  } else if (audienceType === "all_teachers") {
    recipients = staff;
    audienceLabel = "All Teachers";
  } else if (audienceType === "individual_teacher") {
    const found = staff.find((s) => s.id === teacherId);
    recipients = found ? [found] : [];
    audienceLabel = found ? found.name : "";
  }
  const phones = Array.from(new Set(recipients.map((s) => s.phone).filter(Boolean)));
  const missingPhoneCount = recipients.length - recipients.filter((s) => s.phone).length;
  const recipientNoun = audienceType.includes("teacher") ? "teacher" : "guardian";

  const segments = message.length === 0 ? 0 : Math.ceil(message.length / (message.length > 160 ? 153 : 160));
  const matchingStudents = studentQuery.trim()
    ? students.filter((s) => s.name.toLowerCase().includes(studentQuery.trim().toLowerCase())).slice(0, 8)
    : [];

  const send = async () => {
    if (!message.trim()) { showToast("Write a message first"); return; }
    if (phones.length === 0) { showToast(`No ${recipientNoun} phone numbers found for this audience`); return; }
    if (!window.confirm(`Send this SMS to ${phones.length} ${recipientNoun}${phones.length === 1 ? "" : "s"} (${audienceLabel})? This will incur a cost on your Africa's Talking account.`)) return;
    setSending(true);
    try {
      const result = await sendBulkSms(message, phones);
      await recordSmsMessage({ message, audienceLabel, recipientCount: result.recipientCount, costEstimate: result.costEstimate, status: "sent" });
      showToast(`Sent to ${result.recipientCount} ${recipientNoun}${result.recipientCount === 1 ? "" : "s"}${result.costEstimate ? ` (est. ${result.costEstimate})` : ""}`);
      setMessage("");
    } catch (err) {
      await recordSmsMessage({ message, audienceLabel, recipientCount: 0, status: "failed", error: err.message }).catch(() => {});
      showToast(err.message || "Couldn't send SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, padding: 18, marginBottom: 16, borderRadius: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8474", display: "block", marginBottom: 8 }}>Audience</span>
        <div className="flex gap-1.5 flex-wrap mb-3">
          {[["all", "All Guardians"], ["class", "By Class"], ["balance", "By Fee Balance"], ["individual", "Individual Student"], ["all_teachers", "All Teachers"], ["individual_teacher", "Individual Teacher"]].map(([id, label]) => (
            <button key={id} onClick={() => setAudienceType(id)} className="focus-ring" style={{ padding: "7px 12px", borderRadius: 999, fontSize: 12, fontWeight: 600, border: `1px solid ${audienceType === id ? "transparent" : LINE}`, background: audienceType === id ? RAIL : PANEL, color: audienceType === id ? "#fff" : "#5b5747", cursor: "pointer" }}>{label}</button>
          ))}
        </div>

        {audienceType === "class" && (
          <select value={cls} onChange={(e) => setCls(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 200, marginBottom: 6 }}>
            {classes.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
        {audienceType === "balance" && (
          <select value={account} onChange={(e) => setAccount(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 200, marginBottom: 6 }}>
            {PAYMENT_ACCOUNTS.map((a) => <option key={a}>{a}</option>)}
          </select>
        )}
        {audienceType === "individual" && (
          <div style={{ position: "relative", marginBottom: 6 }}>
            <input value={studentId ? recipients[0]?.name || "" : studentQuery} onChange={(e) => { setStudentQuery(e.target.value); setStudentId(null); }} placeholder="Search student name…" className="focus-ring" style={{ ...inputStyle, width: 260 }} />
            {matchingStudents.length > 0 && !studentId && (
              <div style={{ position: "absolute", top: "100%", left: 0, width: 260, background: PANEL, border: `1px solid ${LINE}`, borderRadius: 8, marginTop: 4, zIndex: 5, maxHeight: 200, overflowY: "auto" }}>
                {matchingStudents.map((s) => (
                  <button key={s.id} onClick={() => { setStudentId(s.id); setStudentQuery(""); }} className="focus-ring" style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 13 }}>
                    {s.name} <span style={{ color: "#a39c86", fontSize: 11 }}>· {s.class}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {audienceType === "individual_teacher" && (
          <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 220, marginBottom: 6 }}>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}

        <p style={{ fontSize: 12, color: "#7A7568" }}>
          {phones.length} {recipientNoun} phone number{phones.length === 1 ? "" : "s"} will receive this
          {missingPhoneCount > 0 ? ` (${missingPhoneCount} ${audienceType.includes("teacher") ? "staff member" : "student"}${missingPhoneCount === 1 ? "" : "s"} in this group ${missingPhoneCount === 1 ? "has" : "have"} no phone on file)` : ""}.
        </p>
      </div>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18 }}>
        <textarea
          value={message} onChange={(e) => setMessage(e.target.value)} rows={5}
          placeholder="Type your message to guardians…"
          className="focus-ring" style={{ ...inputStyle, resize: "vertical", width: "100%" }}
        />
        <div className="flex items-center justify-between" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 11, color: "#a39c86" }}>{message.length} characters {segments > 0 ? `· ${segments} SMS segment${segments === 1 ? "" : "s"} per recipient` : ""}</span>
          <button onClick={send} disabled={sending} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: sending ? "wait" : "pointer", opacity: sending ? 0.7 : 1 }}>
            <Send size={13} /> {sending ? "Sending…" : `Send to ${phones.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Builds and sends each student's own exam results to their guardian — one
// personalized message per student (via sendBatchSms), not one blast to all.
function ExamResultsSmsTab({ students, classes, exams, schoolSettings, fetchClassMarksForExam, sendBatchSms, recordSmsMessage, showToast }) {
  const [term, setTerm] = useState(TERMS[1]);
  const [year, setYear] = useState(EXAM_YEARS[1]);
  const [examName, setExamName] = useState(exams[0] || "");
  const [cls, setCls] = useState(classes[0] || "");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState(null); // null = not loaded yet
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!examName || !cls) { showToast("Pick a class and an exam first"); return; }
    setLoading(true);
    setRows(null);
    try {
      const marks = await fetchClassMarksForExam({ studentClass: cls, term, year, examName });
      const roster = students.filter((s) => s.class === cls);
      const built = roster.map((s) => {
        const myMarks = marks.filter((m) => m.studentId === s.id && m.score != null);
        if (myMarks.length === 0) return null;
        const totalScore = myMarks.reduce((sum, m) => sum + m.score, 0);
        const totalOutOf = myMarks.reduce((sum, m) => sum + m.outOf, 0);
        const average = totalOutOf > 0 ? Math.round((totalScore / totalOutOf) * 100) : 0;
        const breakdown = myMarks.map((m) => `${m.subject} ${m.score}/${m.outOf}`).join(", ");
        const message = `Dear Guardian, ${s.name}'s results for ${examName} (${term} ${year}), ${cls}: ${breakdown}. Average: ${average}%. - ${schoolSettings?.name || "Brightfuture Primary School"}`;
        return { student: s, average, message };
      }).filter(Boolean);
      setRows(built);
      if (built.length === 0) showToast("No marks recorded yet for this class and exam");
    } catch (err) {
      showToast(err.message || "Couldn't load marks");
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    const withPhone = rows.filter((r) => r.student.phone);
    if (withPhone.length === 0) { showToast("No guardian phone numbers found for this class"); return; }
    if (!window.confirm(`Send ${withPhone.length} personalized result message${withPhone.length === 1 ? "" : "s"} for ${cls} — ${examName}? This will incur a cost on your Africa's Talking account.`)) return;
    setSending(true);
    try {
      const result = await sendBatchSms(withPhone.map((r) => ({ to: r.student.phone, message: r.message })));
      await recordSmsMessage({ message: `[Personalized exam results] ${examName}`, audienceLabel: `${cls} — ${examName} results`, recipientCount: result.recipientCount, costEstimate: result.costEstimate, status: "sent" });
      showToast(`Sent to ${result.recipientCount} guardian${result.recipientCount === 1 ? "" : "s"}${result.failedCount ? ` (${result.failedCount} failed)` : ""}${result.costEstimate ? ` — est. ${result.costEstimate}` : ""}`);
      setRows(null);
    } catch (err) {
      await recordSmsMessage({ message: `[Personalized exam results] ${examName}`, audienceLabel: `${cls} — ${examName} results`, recipientCount: 0, status: "failed", error: err.message }).catch(() => {});
      showToast(err.message || "Couldn't send results");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 16 }}>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Class"><select value={cls} onChange={(e) => { setCls(e.target.value); setRows(null); }} className="focus-ring" style={{ ...inputStyle, width: 150 }}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Exam"><select value={examName} onChange={(e) => { setExamName(e.target.value); setRows(null); }} className="focus-ring" style={{ ...inputStyle, width: 180 }}>{exams.map((e) => <option key={e}>{e}</option>)}</select></Field>
          <Field label="Term"><select value={term} onChange={(e) => { setTerm(e.target.value); setRows(null); }} className="focus-ring" style={{ ...inputStyle, width: 110 }}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Year"><select value={year} onChange={(e) => { setYear(e.target.value); setRows(null); }} className="focus-ring" style={{ ...inputStyle, width: 100 }}>{EXAM_YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
          <button onClick={load} disabled={loading} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: loading ? "wait" : "pointer" }}>{loading ? "Loading…" : "Load Results"}</button>
        </div>
      </div>

      {rows && rows.length > 0 && (
        <>
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 3fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
              <span>Student</span><span>Avg</span><span>Message preview</span>
            </div>
            <div style={{ maxHeight: 380, overflowY: "auto" }}>
              {rows.map((r) => (
                <div key={r.student.id} style={{ display: "grid", gridTemplateColumns: "1.5fr 0.7fr 3fr", padding: "8px 16px", fontSize: 12.5, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
                  <span>{r.student.name}{!r.student.phone && <span style={{ color: "#a1442c", fontSize: 10.5 }}> (no phone)</span>}</span>
                  <span style={{ fontFamily: MONO_FONT, fontWeight: 700 }}>{r.average}%</span>
                  <span style={{ color: "#7A7568", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.message}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={send} disabled={sending} className="focus-ring flex items-center gap-1.5" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: sending ? "wait" : "pointer" }}>
            <Send size={13} /> {sending ? "Sending…" : `Send ${rows.filter((r) => r.student.phone).length} Results`}
          </button>
        </>
      )}
    </div>
  );
}

function SmsHistoryTab({ smsMessages, staff }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 3fr 0.8fr 1fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
        <span>Date</span><span>Audience</span><span>Message</span><span>Sent</span><span>Cost</span>
      </div>
      {smsMessages.map((m) => (
        <div key={m.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr 3fr 0.8fr 1fr", padding: "9px 16px", fontSize: 12.5, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11.5 }}>{new Date(m.createdAt).toLocaleDateString()}</span>
          <span>{m.audienceLabel}</span>
          <span style={{ color: "#6b6656", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.message}</span>
          <span style={{ fontWeight: 700, color: m.status === "sent" ? "#2f6f4a" : "#a1442c" }}>{m.status === "sent" ? `${m.recipientCount}` : "Failed"}</span>
          <span style={{ fontFamily: MONO_FONT, fontSize: 11.5, color: "#7A7568" }}>{m.costEstimate || "—"}</span>
        </div>
      ))}
      {smsMessages.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No messages sent yet.</div>}
    </div>
  );
}

function ResourcesView(ctx) {
  const [showGenerator, setShowGenerator] = useState(false);
  return (
    <div className="px-7 py-6" style={{ maxWidth: 780 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Resources</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 18 }}>Tools for teachers.</p>

      <div className="flex flex-col gap-3">
        <button
          onClick={() => setShowGenerator(true)}
          className="focus-ring"
          style={{ display: "flex", alignItems: "flex-start", gap: 14, textAlign: "left", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, cursor: "pointer" }}
        >
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "#FBF6E9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <BookOpen size={18} color={ACCENT} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: INK, fontWeight: 700, fontSize: 14.5 }}>AI Lesson Plan Generator</div>
            <p style={{ fontSize: 12.5, color: "#7A7568", margin: "4px 0 6px" }}>Built into Brightfuture — enter your grade, learning area, strand, and sub-strand, and get a KICD-format lesson plan you can download as a PDF.</p>
            <span style={{ fontSize: 11, color: "#a39c86" }}>Generated by AI — review before use in class</span>
          </div>
        </button>

        {EXTERNAL_RESOURCES.map((r) => (
          <a
            key={r.title} href={r.url} target="_blank" rel="noopener noreferrer"
            className="focus-ring"
            style={{ display: "flex", alignItems: "flex-start", gap: 14, textDecoration: "none", background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18 }}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "#FBF6E9", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <BookOpen size={18} color={ACCENT} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="flex items-center gap-1.5" style={{ color: INK, fontWeight: 700, fontSize: 14.5 }}>
                {r.title} <ExternalLink size={13} color="#a39c86" />
              </div>
              <p style={{ fontSize: 12.5, color: "#7A7568", margin: "4px 0 6px" }}>{r.description}</p>
              <span style={{ fontSize: 11, color: "#a39c86" }}>via {r.provider}</span>
            </div>
          </a>
        ))}
      </div>

      {showGenerator && <LessonPlanGeneratorModal {...ctx} onClose={() => setShowGenerator(false)} />}
    </div>
  );
}

function LessonPlanGeneratorModal({ classes, subjects, schoolSettings, authedUser, generateLessonPlan, showToast, onClose }) {
  const [form, setForm] = useState({ grade: classes[0] || "", learningArea: subjects[0] || "", strand: "", subStrand: "", duration: "35 minutes", roll: "", specialInstructions: "" });
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [plan, setPlan] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.strand.trim() || !form.subStrand.trim()) { setError("Strand and sub-strand are required."); return; }
    setError("");
    setGenerating(true);
    setPlan(null);
    try {
      const result = await generateLessonPlan(form);
      setPlan(result);
    } catch (err) {
      setError(err.message || "Couldn't generate the lesson plan.");
    } finally {
      setGenerating(false);
    }
  };

  const downloadPdf = () => {
    printDocument(`${form.subStrand} Lesson Plan`, buildLessonPlanHtml({ input: form, plan, schoolSettings, teacherName: authedUser?.name }));
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(20,24,20,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: PANEL, borderRadius: 16, width: 560, maxWidth: "100%", padding: 24, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 17, fontWeight: 600 }}>AI Lesson Plan Generator</h3>
          <button type="button" onClick={onClose} className="focus-ring" style={{ background: "none", border: "none", cursor: "pointer", color: "#9a9484" }}><X size={18} /></button>
        </div>

        {!plan && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3">
              <Field label="Grade/Class"><select value={form.grade} onChange={set("grade")} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select></Field>
              <Field label="Learning Area"><select value={form.learningArea} onChange={set("learningArea")} className="focus-ring" style={inputStyle}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></Field>
            </div>
            <Field label="Strand"><input value={form.strand} onChange={set("strand")} placeholder="e.g. Numbers" className="focus-ring" style={inputStyle} /></Field>
            <Field label="Sub-strand"><input value={form.subStrand} onChange={set("subStrand")} placeholder="e.g. Addition of Whole Numbers" className="focus-ring" style={inputStyle} /></Field>
            <div className="flex gap-3">
              <Field label="Duration"><input value={form.duration} onChange={set("duration")} className="focus-ring" style={inputStyle} /></Field>
              <Field label="Roll (optional)"><input type="number" min={0} value={form.roll} onChange={set("roll")} className="focus-ring" style={inputStyle} /></Field>
            </div>
            <Field label="Special instructions (optional)"><textarea value={form.specialInstructions} onChange={set("specialInstructions")} rows={2} className="focus-ring" style={{ ...inputStyle, resize: "vertical" }} placeholder="Resources available, learner needs, constraints…" /></Field>
            {error && <div className="flex items-start gap-1.5" style={{ color: "#a1442c", fontSize: 12 }}><AlertTriangle size={13} style={{ marginTop: 1, flexShrink: 0 }} /> {error}</div>}
            <button type="button" onClick={submit} disabled={generating} className="focus-ring" style={{ width: "100%", marginTop: 6, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: generating ? "wait" : "pointer", opacity: generating ? 0.7 : 1 }}>
              {generating ? "Generating…" : "Generate Lesson Plan"}
            </button>
          </div>
        )}

        {plan && (
          <div>
            <div style={{ fontSize: 12, color: "#7A7568", marginBottom: 14 }}>
              <b>{form.grade}</b> · {form.learningArea} · {form.strand} — {form.subStrand}
            </div>
            <LessonPlanSection title="Specific Learning Outcomes" items={plan.specificLearningOutcomes} />
            <LessonPlanSection title="Key Inquiry Question(s)" items={plan.keyInquiryQuestions} />
            <LessonPlanSection title="Core Competencies" items={plan.coreCompetencies} inline />
            <LessonPlanSection title="Values" items={plan.values} inline />
            <div style={{ marginBottom: 14 }}>
              <h4 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Organization of Learning</h4>
              <p style={{ fontSize: 12.5, marginBottom: 6 }}><b>Introduction:</b> {plan.organizationOfLearning?.introduction}</p>
              <ol style={{ paddingLeft: 18, fontSize: 12.5, marginBottom: 6 }}>{(plan.organizationOfLearning?.lessonDevelopment || []).map((s, i) => <li key={i} style={{ marginBottom: 2 }}>{s}</li>)}</ol>
              <p style={{ fontSize: 12.5 }}><b>Conclusion:</b> {plan.organizationOfLearning?.conclusion}</p>
            </div>
            <LessonPlanSection title="Resources" items={plan.resources} inline />
            <LessonPlanSection title="Assessment Methods" items={plan.assessmentMethods} inline />
            {plan.extendedActivities && <LessonPlanSection title="Extended Activities" items={[plan.extendedActivities]} />}
            <p style={{ fontSize: 11, color: "#a39c86", margin: "14px 0" }}>AI-generated draft — please review for accuracy before using it in class.</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setPlan(null)} className="focus-ring" style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: `1px solid ${LINE}`, background: BG, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Start Over</button>
              <button type="button" onClick={downloadPdf} className="focus-ring flex items-center justify-center gap-1.5" style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}><Download size={13} /> Download PDF</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LessonPlanSection({ title, items, inline }) {
  if (!items || items.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <h4 style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>{title}</h4>
      {inline ? (
        <p style={{ fontSize: 12.5 }}>{items.join(", ")}</p>
      ) : (
        <ul style={{ paddingLeft: 18, fontSize: 12.5 }}>{items.map((it, i) => <li key={i} style={{ marginBottom: 2 }}>{it}</li>)}</ul>
      )}
    </div>
  );
}

// Printable KICD-style lesson plan — handed to the shared printDocument()
// helper (window.print()-based PDF, same mechanism used elsewhere in the app).
function buildLessonPlanHtml({ input, plan, schoolSettings, teacherName }) {
  const list = (items) => `<ul>${(items || []).map((i) => `<li>${i}</li>`).join("")}</ul>`;
  return `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div><div class="meta" style="margin:0;">Lesson Plan</div></div>
    </div>
    <table style="margin-bottom:14px;font-size:12px;">
      <tr><td style="width:50%;"><b>Teacher:</b> ${teacherName || ""}</td><td><b>Class:</b> ${input.grade}</td></tr>
      <tr><td><b>Learning Area:</b> ${input.learningArea}</td><td><b>Duration:</b> ${input.duration || "35 minutes"}</td></tr>
      <tr><td><b>Strand:</b> ${input.strand}</td><td><b>Sub-strand:</b> ${input.subStrand}</td></tr>
      <tr><td><b>Roll:</b> ${input.roll || "—"}</td><td><b>Date:</b> ${new Date().toLocaleDateString()}</td></tr>
    </table>
    <h3 style="font-size:13px;">Specific Learning Outcomes</h3>
    ${list(plan.specificLearningOutcomes)}
    <h3 style="font-size:13px;">Key Inquiry Question(s)</h3>
    ${list(plan.keyInquiryQuestions)}
    <h3 style="font-size:13px;">Core Competencies</h3>
    <p>${(plan.coreCompetencies || []).join(", ")}</p>
    <h3 style="font-size:13px;">Values</h3>
    <p>${(plan.values || []).join(", ")}</p>
    <h3 style="font-size:13px;">Organization of Learning</h3>
    <p><b>Introduction:</b> ${plan.organizationOfLearning?.introduction || ""}</p>
    <p><b>Lesson Development:</b></p>
    <ol>${(plan.organizationOfLearning?.lessonDevelopment || []).map((s) => `<li>${s}</li>`).join("")}</ol>
    <p><b>Conclusion:</b> ${plan.organizationOfLearning?.conclusion || ""}</p>
    <h3 style="font-size:13px;">Resources</h3>
    <p>${(plan.resources || []).join(", ")}</p>
    <h3 style="font-size:13px;">Assessment Methods</h3>
    <p>${(plan.assessmentMethods || []).join(", ")}</p>
    ${plan.extendedActivities ? `<h3 style="font-size:13px;">Extended Activities</h3><p>${plan.extendedActivities}</p>` : ""}
    <div style="font-size:10.5px;color:#777;margin-top:16px;">AI-generated draft — please review before use in class.</div>
  `;
}

function ExamsView(ctx) {
  const [tab, setTab] = useState(ctx.isAdmin ? "setup" : "enter");
  return (
    <div className="px-7 py-6" style={{ maxWidth: 980 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Exams</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>Set up exams and grading, enter marks, then analyse and generate reports.</p>

      <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${LINE}` }}>
        {(ctx.isAdmin ? [["setup", "Set Up"], ["enter", "Enter Marks"], ["report", "Report"]] : [["enter", "Enter Marks"], ["report", "Report"]]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === id ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: tab === id ? INK : "#9a9484", cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {tab === "setup" && <ExamsSetupTab {...ctx} />}
      {tab === "enter" && <EnterMarksTab {...ctx} />}
      {tab === "report" && <ReportTab {...ctx} />}
    </div>
  );
}

function ExamsSetupTab({ exams, addExam, deleteExam, gradingLevels, saveGradingLevel, classes, classGradingAssignment, setClassGrading, showToast }) {
  const [panel, setPanel] = useState(null); // null | "unlock" | "levels"
  return (
    <div>
      <div className="flex gap-3 mb-5">
        <button onClick={() => setPanel(panel === "unlock" ? null : "unlock")} className="focus-ring flex items-center gap-2" style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${panel === "unlock" ? "transparent" : LINE}`, background: panel === "unlock" ? RAIL : PANEL, color: panel === "unlock" ? "#fff" : INK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Lock size={15} /> Unlock Exam
        </button>
        <button onClick={() => setPanel(panel === "levels" ? null : "levels")} className="focus-ring flex items-center gap-2" style={{ padding: "10px 16px", borderRadius: 10, border: `1px solid ${panel === "levels" ? "transparent" : LINE}`, background: panel === "levels" ? RAIL : PANEL, color: panel === "levels" ? "#fff" : INK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Sliders size={15} /> Assessment Levels
        </button>
      </div>

      {panel === "unlock" && <UnlockExamPanel exams={exams} addExam={addExam} deleteExam={deleteExam} showToast={showToast} />}
      {panel === "levels" && (
        <AssessmentLevelsPanel
          gradingLevels={gradingLevels} saveGradingLevel={saveGradingLevel}
          classes={classes} classGradingAssignment={classGradingAssignment} setClassGrading={setClassGrading}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function UnlockExamPanel({ exams, addExam, deleteExam, showToast }) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0,10));
  const [to, setTo] = useState(new Date().toISOString().slice(0,10));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const clean = name.trim();
    if (!clean) return;
    if (exams.includes(clean)) { showToast(`${clean} already exists`); return; }
    setBusy(true);
    try {
      await addExam(clean, { from, to, location: "", description: "Exam", type: "Exam" });
      setName("");
      showToast(`${clean} unlocked`);
    } catch (err) {
      showToast(err.message || "Couldn't save exam");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, maxWidth: 480 }}>
      <Field label="Exam name">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder="e.g. Mid Term Exam" className="focus-ring" style={inputStyle} />
      </Field>
      <div className="grid grid-cols-2 gap-3" style={{ marginTop: 12 }}>
        <Field label="From"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="focus-ring" style={inputStyle} /></Field>
        <Field label="To"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="focus-ring" style={inputStyle} /></Field>
      </div>
      <button type="button" onClick={save} disabled={busy} className="focus-ring" style={{ marginTop: 12, padding: "9px 18px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13, cursor: busy ? "wait" : "pointer" }}>
        {busy ? "Saving…" : "Save"}
      </button>

      <div style={{ marginTop: 20, fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase" }}>Unlocked exams</div>
      <div className="flex flex-col gap-1.5 mt-2">
        {exams.length === 0 && <p style={{ fontSize: 12.5, color: "#c4bda7" }}>None yet.</p>}
        {exams.map((e) => (
          <div key={e} className="flex items-center justify-between" style={{ padding: "7px 10px", borderRadius: 7, background: BG, fontSize: 13, fontWeight: 600 }}><span>{e}</span><button onClick={() => { if (window.confirm(`Delete exam ${e}? This will also delete its marks.`)) deleteExam(e); }} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer" }} title="Delete exam"><Trash2 size={14} /></button></div>
        ))}
      </div>
    </div>
  );
}

function AssessmentLevelsPanel({ gradingLevels, saveGradingLevel, classes, classGradingAssignment, setClassGrading, showToast }) {
  const [system, setSystem] = useState(GRADING_SYSTEMS[0]);
  const [edits, setEdits] = useState({}); // { levelId: { from, to, points } }
  const levels = gradingLevels.filter((l) => l.system === system).sort((a, b) => a.sortOrder - b.sortOrder);

  const val = (l, field) => (edits[l.id]?.[field] ?? l[field]);
  const setVal = (l, field, v) => setEdits((prev) => ({ ...prev, [l.id]: { from: val(l, "from"), to: val(l, "to"), points: val(l, "points"), ...prev[l.id], [field]: v } }));

  const saveLevel = async (l) => {
    const patch = { from: Number(val(l, "from")), to: Number(val(l, "to")), points: Number(val(l, "points")) };
    try {
      await saveGradingLevel(l.id, patch);
      showToast(`${l.level} updated`);
    } catch (err) {
      showToast(err.message || "Couldn't save level");
    }
  };

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, maxWidth: 640 }}>
      <p style={{ fontSize: 13.5, fontWeight: 700 }}>Edit Grading systems</p>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 14 }}>Configure level ranges for selected grading system.</p>

      <Field label="Grading system">
        <select value={system} onChange={(e) => setSystem(e.target.value)} className="focus-ring" style={{ ...inputStyle, maxWidth: 260 }}>
          {GRADING_SYSTEMS.map((s) => <option key={s}>{s}</option>)}
        </select>
      </Field>

      <div style={{ marginTop: 16, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: "left", fontSize: 11, color: "#8a8474", textTransform: "uppercase" }}>
              <th style={{ padding: "6px 8px" }}>Level</th>
              <th style={{ padding: "6px 8px" }}>From</th>
              <th style={{ padding: "6px 8px" }}>To</th>
              <th style={{ padding: "6px 8px" }}>Points</th>
              <th style={{ padding: "6px 8px" }}></th>
            </tr>
          </thead>
          <tbody>
            {levels.map((l) => (
              <tr key={l.id} style={{ borderTop: `1px solid ${LINE}` }}>
                <td style={{ padding: "8px" }}><LevelBadge band={l.band}>{l.level}</LevelBadge></td>
                <td style={{ padding: "8px" }}><input type="number" value={val(l, "from")} onChange={(e) => setVal(l, "from", e.target.value)} className="focus-ring" style={{ width: 64, padding: "5px 7px", borderRadius: 6, border: `1px solid ${LINE}`, fontFamily: MONO_FONT, fontSize: 12.5 }} /></td>
                <td style={{ padding: "8px" }}><input type="number" value={val(l, "to")} onChange={(e) => setVal(l, "to", e.target.value)} className="focus-ring" style={{ width: 64, padding: "5px 7px", borderRadius: 6, border: `1px solid ${LINE}`, fontFamily: MONO_FONT, fontSize: 12.5 }} /></td>
                <td style={{ padding: "8px" }}><input type="number" value={val(l, "points")} onChange={(e) => setVal(l, "points", e.target.value)} className="focus-ring" style={{ width: 56, padding: "5px 7px", borderRadius: 6, border: `1px solid ${LINE}`, fontFamily: MONO_FONT, fontSize: 12.5 }} /></td>
                <td style={{ padding: "8px" }}><button onClick={() => saveLevel(l)} className="focus-ring" style={{ fontSize: 11.5, fontWeight: 700, color: "#2f6f4a", background: "none", border: "none", cursor: "pointer" }}>Save</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 22, borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 8 }}>Assign grading system to classes</div>
        <div className="flex flex-col gap-1.5">
          {classes.map((c) => (
            <div key={c} className="flex items-center justify-between" style={{ padding: "7px 10px", borderRadius: 7, background: BG }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{c}</span>
              <select
                value={classGradingAssignment[c] || GRADING_SYSTEMS[0]}
                onChange={async (e) => {
                  try { await setClassGrading(c, e.target.value); } catch (err) { showToast(err.message || "Couldn't assign grading system"); }
                }}
                className="focus-ring" style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 12.5 }}
              >
                {GRADING_SYSTEMS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EnterMarksTab({ students, classes, subjects, exams, fetchMarksFor, saveMarkRow, fetchClassMarksForExam, classGradingAssignment, gradingLevels, schoolSettings, staff, authedUser, isAdmin, showToast }) {
  const lockedClass = !isAdmin ? authedUser?.classTeacherOf : null;
  const [cls, setCls] = useState(lockedClass || classes[0] || "");
  const [subject, setSubject] = useState(subjects[0] || "");
  const [term, setTerm] = useState(TERMS[1]);
  const [year, setYear] = useState(EXAM_YEARS[1]);
  const [examName, setExamName] = useState(exams[0] || "");
  const [outOf, setOutOf] = useState(100);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState({}); // studentId -> { score, comment }
  const [saving, setSaving] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [analysing, setAnalysing] = useState(false);

  const roster = students.filter((s) => s.class === cls);
  const ready = cls && subject && term && year && examName;

  const load = async () => {
    if (!ready) return;
    setLoading(true);
    setAnalysis(null);
    try {
      const existing = await fetchMarksFor({ studentClass: cls, subject, term, year, examName });
      const map = {};
      roster.forEach((s) => {
        const found = existing.find((e) => e.studentId === s.id);
        map[s.id] = { score: found ? Math.round(Number(found.score)) : "", comment: found ? found.comment : "" };
      });
      if (existing[0]) setOutOf(existing[0].outOf);
      setRows(map);
      setLoaded(true);
    } catch (err) {
      showToast(err.message || "Couldn't load marks");
    } finally {
      setLoading(false);
    }
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const s of roster) {
        const r = rows[s.id];
        if (!r || r.score === "" || r.score == null) continue;
        await saveMarkRow({ studentId: s.id, studentClass: cls, subject, term, year, examName, score: Math.round(Number(r.score)), outOf: Math.round(Number(outOf)), comment: r.comment });
      }
      showToast("Marks saved");
    } catch (err) {
      showToast(err.message || "Couldn't save marks");
    } finally {
      setSaving(false);
    }
  };

  const analyse = async () => {
    setAnalysing(true);
    try {
      const markRows = await fetchClassMarksForExam({ studentClass: cls, term, year, examName });
      setAnalysis(computeAnalysis(markRows, roster));
    } catch (err) {
      showToast(err.message || "Couldn't analyse");
    } finally {
      setAnalysing(false);
    }
  };

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Class">{lockedClass ? <div style={{ ...inputStyle, background: "#EFE9D8", fontWeight: 600 }}>{lockedClass}</div> : <select value={cls} onChange={(e) => { setCls(e.target.value); setLoaded(false); }} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label="Subject"><select value={subject} onChange={(e) => { setSubject(e.target.value); setLoaded(false); }} className="focus-ring" style={inputStyle}>{subjects.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="Term"><select value={term} onChange={(e) => { setTerm(e.target.value); setLoaded(false); }} className="focus-ring" style={inputStyle}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Year"><select value={year} onChange={(e) => { setYear(e.target.value); setLoaded(false); }} className="focus-ring" style={inputStyle}>{EXAM_YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
          <Field label="Exam name">
            {exams.length === 0 ? <p style={{ fontSize: 12, color: "#a1442c" }}>Unlock an exam first, in Set Up.</p> : (
              <select value={examName} onChange={(e) => { setExamName(e.target.value); setLoaded(false); }} className="focus-ring" style={inputStyle}>{exams.map((e) => <option key={e}>{e}</option>)}</select>
            )}
          </Field>
          <Field label="Marks out of"><input type="number" min={1} value={outOf} onChange={(e) => setOutOf(e.target.value)} className="focus-ring" style={{ ...inputStyle, fontFamily: MONO_FONT }} /></Field>
        </div>
        <button onClick={load} disabled={!ready || loading} className="focus-ring" style={{ marginTop: 14, padding: "9px 18px", borderRadius: 8, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: !ready ? "not-allowed" : loading ? "wait" : "pointer", opacity: !ready ? 0.5 : 1 }}>
          {loading ? "Loading…" : "Load Students"}
        </button>
      </div>

      {loaded && (
        <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", borderBottom: `1px solid ${LINE}` }}>
            <span>Student</span><span>Score</span><span>Comment (optional)</span>
          </div>
          {roster.map((s) => (
            <div key={s.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr", padding: "8px 16px", alignItems: "center", borderBottom: `1px solid ${LINE}`, fontSize: 13 }}>
              <span style={{ fontWeight: 600 }}>{s.name}</span>
              <input
                type="number" step={1} min={0} max={outOf} value={rows[s.id]?.score ?? ""}
                onChange={(e) => setRows((prev) => ({ ...prev, [s.id]: { ...prev[s.id], score: e.target.value === "" ? "" : Math.round(Number(e.target.value)) } }))}
                className="focus-ring" style={{ width: 72, padding: "5px 8px", borderRadius: 7, border: `1px solid ${LINE}`, fontFamily: MONO_FONT, fontSize: 12.5 }}
              />
              <input
                value={rows[s.id]?.comment ?? ""}
                onChange={(e) => setRows((prev) => ({ ...prev, [s.id]: { ...prev[s.id], comment: e.target.value } }))}
                placeholder="e.g. Good effort" className="focus-ring" style={{ padding: "5px 8px", borderRadius: 7, border: `1px solid ${LINE}`, fontSize: 12.5 }}
              />
            </div>
          ))}
        </div>
      )}

      {loaded && (
        <div className="flex gap-2 mb-6">
          <button onClick={saveAll} disabled={saving} className="focus-ring" style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Save Marks"}</button>
          <button onClick={analyse} disabled={analysing} className="focus-ring" style={{ padding: "9px 18px", borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, color: INK, fontWeight: 700, fontSize: 13, cursor: analysing ? "wait" : "pointer" }}>{analysing ? "Analysing…" : "Analyse"}</button>
        </div>
      )}

      {analysis && (
        <MarkListAnalysis
          analysis={analysis} cls={cls} term={term} year={year} examName={examName}
          schoolSettings={schoolSettings} staff={staff}
          system={classGradingAssignment[cls] || GRADING_SYSTEMS[0]} gradingLevels={gradingLevels}
        />
      )}
    </div>
  );
}

function MarkListAnalysis({ analysis, cls, term, year, examName, schoolSettings, staff, system, gradingLevels }) {
  const [showList, setShowList] = useState(false);
  const classTeacher = staff.find((s) => s.classTeacherOf === cls);
  const subjects = Object.keys(analysis.subjectMeans);

  const buildHtml = () => `
    <div class="header">
      ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" />` : ""}
      <div><div class="school-name">${schoolSettings?.name || "Brightfuture Primary School"}</div></div>
    </div>
    <div class="meta" style="text-align:center;font-weight:700;color:#222;">${examName} · ${cls} · ${term} · ${year}</div>
    <table>
      <thead><tr><th>Pos</th><th>Name</th>${subjects.map((s) => `<th>${s} %</th>`).join("")}<th>Total Marks (Sum)</th>${system ? "<th>Level</th>" : ""}</tr></thead>
      <tbody>
        ${analysis.perStudent.map((r) => {
          const level = gradeForPercent(r.total, system, gradingLevels);
          return `<tr><td>${r.position}</td><td>${r.student.name}</td>${subjects.map((s) => `<td>${r.bySubject[s] ? r.bySubject[s].pct + "%" : "—"}</td>`).join("")}<td>${Math.round(Number(r.total))}</td>${system ? `<td>${level ? level.level : "—"}</td>` : ""}</tr>`;
        }).join("")}
        <tr><td></td><td><b>Meanscore</b></td>${subjects.map((s) => `<td><b>${analysis.subjectMeans[s] == null ? "—" : Number(analysis.subjectMeans[s]).toFixed(2)}</b></td>`).join("")}<td><b>${Math.round(Number(analysis.classMean))}</b></td>${system ? "<td></td>" : ""}</tr>
      </tbody>
    </table>
    <div class="summary">
      <div>Class mean score: <b style="display:inline">${Number(analysis.classMean).toFixed(2)}</b></div>
      <b>Top 3 overall</b>
      ${analysis.top3.map((r, i) => `<div>${i + 1}. ${r.student.name} — ${Math.round(Number(r.total))}</div>`).join("")}
      <b>Top 3 boys</b>
      ${analysis.top3Boys.map((r, i) => `<div>${i + 1}. ${r.student.name} — ${Math.round(Number(r.total))}</div>`).join("") || "<div>—</div>"}
      <b>Top 3 girls</b>
      ${analysis.top3Girls.map((r, i) => `<div>${i + 1}. ${r.student.name} — ${Math.round(Number(r.total))}</div>`).join("") || "<div>—</div>"}
      <div style="margin-top:20px;">Compiled by: ${classTeacher ? classTeacher.name : "________________________"} (Class Teacher)</div>
      <div style="margin-top:24px;">Signed: ___________________________</div>
    </div>
  `;

  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
      <div className="flex items-center justify-between mb-3">
        <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 16, fontWeight: 600 }}>Mark List — {cls}, {examName}</h3>
        <div className="flex gap-2">
          <button onClick={() => setShowList((v) => !v)} className="focus-ring flex items-center gap-1.5" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Eye size={13} /> {showList ? "Hide" : "View"} Mark List</button>
          <button onClick={() => printDocument(`${cls} Mark List`, buildHtml())} className="focus-ring flex items-center gap-1.5" style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: RAIL, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Download size={13} /> Download PDF</button>
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "#6b6656", marginBottom: 10 }}>Class mean score: <b>{Number(analysis.classMean).toFixed(2)}</b> · {analysis.perStudent.length} students ranked</p>

      {showList && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: `1px solid ${LINE}`, fontSize: 11, color: "#8a8474", textTransform: "uppercase" }}>
                <th style={{ padding: "6px 8px" }}>Pos</th><th style={{ padding: "6px 8px" }}>Name</th>
                {subjects.map((s) => <th key={s} style={{ padding: "6px 8px" }}>{s}</th>)}
                <th style={{ padding: "6px 8px" }}>Total Marks (Sum)</th>
              </tr>
            </thead>
            <tbody>
              {analysis.perStudent.map((r) => (
                <tr key={r.student.id} style={{ borderBottom: `1px solid ${LINE}` }}>
                  <td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{r.position}</td>
                  <td style={{ padding: "6px 8px", fontWeight: 600 }}>{r.student.name}</td>
                  {subjects.map((s) => <td key={s} style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{r.bySubject[s] ? `${Math.round(Number(r.bySubject[s].pct))}%` : "—"}</td>)}
                  <td style={{ padding: "6px 8px", fontFamily: MONO_FONT, fontWeight: 700 }}>{Math.round(Number(r.total))}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${LINE}`, fontWeight: 700 }}><td></td><td style={{ padding: "6px 8px" }}><b>Meanscore</b></td>{subjects.map((s) => <td key={s} style={{ padding: "6px 8px", fontFamily: MONO_FONT }}><b>{analysis.subjectMeans[s] == null ? "—" : Number(analysis.subjectMeans[s]).toFixed(2)}</b></td>)}<td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}><b>{Number(analysis.classMean).toFixed(2)}</b></td></tr>
            </tbody>
          </table>
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 4 }}>Top 3 overall</div>
              {analysis.top3.map((r, i) => <div key={r.student.id} style={{ fontSize: 12.5 }}>{i + 1}. {r.student.name} — {r.total}</div>)}
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 4 }}>Top 3 boys</div>
              {analysis.top3Boys.length ? analysis.top3Boys.map((r, i) => <div key={r.student.id} style={{ fontSize: 12.5 }}>{i + 1}. {r.student.name} — {r.total}</div>) : <span style={{ fontSize: 12, color: "#c4bda7" }}>—</span>}
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 4 }}>Top 3 girls</div>
              {analysis.top3Girls.length ? analysis.top3Girls.map((r, i) => <div key={r.student.id} style={{ fontSize: 12.5 }}>{i + 1}. {r.student.name} — {r.total}</div>) : <span style={{ fontSize: 12, color: "#c4bda7" }}>—</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Finds who to credit as "Instructor" for a subject in a class: prefers
// the class teacher (if that subject is in their list), otherwise the
// first staff member who lists that subject. The app doesn't track a
// strict per-class-per-subject teacher assignment, so this is a
// best-effort match rather than a guaranteed-correct lookup.
function findInstructor(subject, cls, staff) {
  const classTeacher = staff.find((s) => s.classTeacherOf === cls);
  if (classTeacher && classTeacher.subjects.includes(subject)) return classTeacher.name;
  const subjectTeacher = staff.find((s) => s.subjects.includes(subject));
  return subjectTeacher ? subjectTeacher.name : "";
}

function maxPointsForSystem(system, gradingLevels) {
  const levels = gradingLevels.filter((l) => l.system === system);
  return levels.length ? Math.max(...levels.map((l) => l.points)) : 0;
}

const REPORT_TEAL = "#12988A";

function ReportTab({ students, classes, exams, fetchClassMarksForExam, fetchStudentMarksHistory, fetchReportRemarks, saveReportRemarks, schoolSettings, staff, classGradingAssignment, gradingLevels, authedUser, isAdmin, showToast }) {
  const lockedClass = !isAdmin ? authedUser?.classTeacherOf : null;
  const [cls, setCls] = useState(lockedClass || classes[0] || "");
  const [studentId, setStudentId] = useState("");
  const [term, setTerm] = useState(TERMS[1]);
  const [year, setYear] = useState(EXAM_YEARS[1]);
  const [examName, setExamName] = useState(exams[0] || "");
  const [analysis, setAnalysis] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [classTeacherComment, setClassTeacherComment] = useState("");
  const [hoiComment, setHoiComment] = useState("");
  const [savingRemarks, setSavingRemarks] = useState(false);

  const roster = students.filter((s) => s.class === cls);
  const ready = cls && studentId && term && year && examName;

  const load = async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const [markRows, remarks, hist] = await Promise.all([
        fetchClassMarksForExam({ studentClass: cls, term, year, examName }),
        fetchReportRemarks({ studentId: Number(studentId), term, year, examName }),
        fetchStudentMarksHistory(Number(studentId)),
      ]);
      setAnalysis(computeAnalysis(markRows, roster));
      setClassTeacherComment(remarks.classTeacherComment);
      setHoiComment(remarks.hoiComment);
      setHistory(hist);
      setShowReport(true);
    } catch (err) {
      showToast(err.message || "Couldn't load report");
    } finally {
      setLoading(false);
    }
  };

  const saveComments = async () => {
    setSavingRemarks(true);
    try {
      await saveReportRemarks({ studentId: Number(studentId), studentClass: cls, term, year, examName, classTeacherComment, hoiComment });
      showToast("Comments saved");
    } catch (err) {
      showToast(err.message || "Couldn't save comments");
    } finally {
      setSavingRemarks(false);
    }
  };

  const record = analysis?.perStudent.find((r) => r.student.id === Number(studentId));
  const classTeacher = staff.find((s) => s.classTeacherOf === cls);
  const system = classGradingAssignment[cls] || GRADING_SYSTEMS[0];

  // Build the summary numbers the report header needs: raw marks
  // achieved/possible, points achieved/possible (via the class's grading
  // system), and the overall level for the student's average %.
  const summary = useMemo(() => {
    if (!record) return null;
    const subjects = Object.keys(record.bySubject);
    const sumScore = subjects.reduce((s, subj) => s + (record.bySubject[subj].score || 0), 0);
    const sumOutOf = subjects.reduce((s, subj) => s + (record.bySubject[subj].outOf || 0), 0);
    const maxPts = maxPointsForSystem(system, gradingLevels);
    let sumPoints = 0;
    subjects.forEach((subj) => {
      const level = gradeForPercent(record.bySubject[subj].pct, system, gradingLevels);
      record.bySubject[subj].points = level ? level.points : 0;
      record.bySubject[subj].level = level ? level.level : "—";
      sumPoints += level ? level.points : 0;
    });
    const overallLevel = gradeForPercent(record.total, system, gradingLevels);
    return { subjects, sumScore, sumOutOf, sumPoints, maxPoints: maxPts * subjects.length, overallLevel };
  }, [record, system, gradingLevels]);

  // Points-over-time trend, built from every exam sitting on record for
  // this student (grouped by term/year/exam, oldest first).
  const trend = useMemo(() => {
    const groups = {};
    history.forEach((m) => {
      if (m.score == null) return;
      const key = `${m.term}_${m.year}_${m.examName}`;
      groups[key] = groups[key] || { label: `${m.term} ${m.year} ${m.examName}`.replace(/\s+/g, "_"), points: 0, count: 0 };
      const pct = m.outOf ? (m.score / m.outOf) * 100 : 0;
      const level = gradeForPercent(Math.round(pct * 10) / 10, system, gradingLevels);
      groups[key].points += level ? level.points : 0;
      groups[key].count += 1;
    });
    return Object.values(groups);
  }, [history, system, gradingLevels]);

  const buildHtml = () => {
    if (!record || !summary) return "";
    const chartLabels = JSON.stringify(summary.subjects);
    const chartData = JSON.stringify(summary.subjects.map((s) => record.bySubject[s].pct));
    const trendLabels = JSON.stringify(trend.map((t) => t.label));
    const trendData = JSON.stringify(trend.map((t) => t.points));

    return `
      <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; border:1px solid #ddd; border-radius:10px; padding:14px 18px;">
        <div style="display:flex; align-items:center; gap:14px;">
          ${schoolSettings?.logoUrl ? `<img src="${schoolSettings.logoUrl}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;border:1px solid #ddd;" />` : ""}
          <div>
            <div style="font-size:19px; font-weight:800; letter-spacing:0.3px;">${(schoolSettings?.name || "Brightfuture Primary School").toUpperCase()}</div>
            <div style="display:inline-block; margin-top:6px; background:${REPORT_TEAL}; color:#fff; font-weight:700; font-size:12px; padding:5px 12px; border-radius:6px;">LEARNER ASSESSMENT REPORT</div>
          </div>
        </div>
        <div style="width:230px;height:110px;"><canvas id="subjChart"></canvas></div>
      </div>

      <div style="border:1px solid #ddd; border-radius:10px; padding:10px 16px; margin-top:12px; display:flex; gap:24px; font-size:13px;">
        <div><b>NAME:</b> ${record.student.name.toUpperCase()}</div>
        <div><b>CLASS:</b> ${cls}</div>
        <div><b>ADM No:</b> ${record.student.admissionNo}</div>
      </div>

      <div style="display:flex; gap:12px; margin-top:12px;">
        <div style="flex:1; border:1px solid #ddd; border-radius:10px; padding:12px 16px; font-size:13px;">
          <div style="font-weight:800; margin-bottom:6px;">EXAM DETAILS</div>
          <div>EXAM: <b>${examName}</b></div>
          <div>TERM: <b>${term.replace("Term ", "")}</b>, YEAR: <b>${year}</b></div>
        </div>
        <div style="flex:1.4; border:1px solid #ddd; border-radius:10px; padding:12px 16px; font-size:13px;">
          <div style="font-weight:800; margin-bottom:6px;">PERFORMANCE SUMMARY</div>
          <div style="display:flex; justify-content:space-between;">
            <span>MARKS: <b>${summary.sumScore}/${summary.sumOutOf}</b></span>
            <span>POSITION: <b>${record.position}/${analysis.perStudent.length}</b></span>
          </div>
          <div style="display:flex; justify-content:space-between; margin-top:4px;">
            <span>LEVEL: <b>${summary.overallLevel ? summary.overallLevel.level : "—"}</b></span>
            <span>POINTS: <b>${summary.sumPoints}/${summary.maxPoints}</b></span>
          </div>
        </div>
      </div>

      <table style="margin-top:14px;">
        <thead><tr style="background:${REPORT_TEAL}; color:#fff;">
          <th>Learning Area</th><th>Marks</th><th>% Score</th><th>Rank</th><th>Points</th><th>Comments</th><th>Instructor</th>
        </tr></thead>
        <tbody>
          ${summary.subjects.map((subj) => {
            const m = record.bySubject[subj];
            return `<tr><td>${subj}</td><td>${Math.round(Number(m.score))}/${Math.round(Number(m.outOf))}</td><td>${Math.round(Number(m.pct))} ${m.level}</td><td>${m.rank}/${m.outOfCount}</td><td>${Math.round(Number(m.points))}</td><td>${m.comment || ""}</td><td>${findInstructor(subj, cls, staff)}</td></tr>`;
          }).join("")}
        </tbody>
      </table>

      <div style="margin-top:14px; font-size:13px;">
        <div><b>Class Teacher's comments:</b> ${classTeacherComment || "—"}</div>
        <div style="margin-top:6px;"><b>HOI's comments:</b> ${hoiComment || "—"}</div>
      </div>

      ${trend.length ? `
      <div style="border:1px solid #ddd; border-radius:10px; padding:12px 16px; margin-top:16px;">
        <div style="text-align:center; font-size:12.5px; font-weight:700; margin-bottom:8px;">Learner's performance (Total Points) over time</div>
        <div style="height:180px;"><canvas id="trendChart"></canvas></div>
      </div>` : ""}

      <div style="display:flex; justify-content:space-between; margin-top:34px; font-size:12.5px;">
        <div style="text-align:center;">___________________________<br/>HOI's Signature</div>
        <div style="text-align:center;">___________________________<br/>Parent's Signature</div>
        <div style="text-align:center;">___________________________<br/><b>${classTeacher ? classTeacher.name : ""}</b><br/>Class Teacher's Signature</div>
      </div>

      <div style="display:flex; justify-content:space-between; margin-top:18px; font-size:11px; color:#555;">
        <span>Generated on: ${new Date().toLocaleString("en-GB")}</span>
        <span>Term Closing Date: ${schoolSettings?.termClosingDate ? new Date(schoolSettings.termClosingDate + "T00:00:00").toLocaleDateString("en-GB") : "—"}</span>
        <span>Next term Opening Date: ${schoolSettings?.nextTermOpeningDate ? new Date(schoolSettings.nextTermOpeningDate + "T00:00:00").toLocaleDateString("en-GB") : "—"}</span>
      </div>

      <script>
        window.onload = function () {
          new Chart(document.getElementById('subjChart'), {
            type: 'line',
            data: { labels: ${chartLabels}, datasets: [{ data: ${chartData}, borderColor: '${REPORT_TEAL}', backgroundColor: '${REPORT_TEAL}33', fill: true, tension: 0.35, pointRadius: 3 }] },
            options: { plugins: { legend: { display: false } }, scales: { y: { min: 0, max: 100 } }, responsive: true, maintainAspectRatio: false }
          });
          ${trend.length ? `new Chart(document.getElementById('trendChart'), {
            type: 'bar',
            data: { labels: ${trendLabels}, datasets: [{ data: ${trendData}, backgroundColor: '${REPORT_TEAL}' }] },
            options: { plugins: { legend: { display: false } }, responsive: true, maintainAspectRatio: false }
          });` : ""}
        };
      </script>
    `;
  };

  return (
    <div>
      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Class">{isAdmin ? (
            <select value={cls} onChange={(e) => { setCls(e.target.value); setStudentId(""); setShowReport(false); }} className="focus-ring" style={inputStyle}>{classes.map((c) => <option key={c}>{c}</option>)}</select>
          ) : (
            <input value={cls || "Not assigned"} readOnly className="focus-ring" style={{ ...inputStyle, background: "#f5f2e9" }} />
          )}</Field>
          <Field label="Student">
            <select value={studentId} onChange={(e) => { setStudentId(e.target.value); setShowReport(false); }} className="focus-ring" style={inputStyle}>
              <option value="">Select…</option>
              {roster.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Term"><select value={term} onChange={(e) => { setTerm(e.target.value); setShowReport(false); }} className="focus-ring" style={inputStyle}>{TERMS.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Year"><select value={year} onChange={(e) => { setYear(e.target.value); setShowReport(false); }} className="focus-ring" style={inputStyle}>{EXAM_YEARS.map((y) => <option key={y}>{y}</option>)}</select></Field>
          <Field label="Exam name">
            {exams.length === 0 ? <p style={{ fontSize: 12, color: "#a1442c" }}>Unlock an exam first, in Set Up.</p> : (
              <select value={examName} onChange={(e) => { setExamName(e.target.value); setShowReport(false); }} className="focus-ring" style={inputStyle}>{exams.map((e) => <option key={e}>{e}</option>)}</select>
            )}
          </Field>
        </div>
        <button onClick={load} disabled={!ready || loading} className="focus-ring" style={{ marginTop: 14, padding: "9px 18px", borderRadius: 8, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: !ready ? "not-allowed" : loading ? "wait" : "pointer", opacity: !ready ? 0.5 : 1 }}>
          {loading ? "Loading…" : "Generate Report"}
        </button>
      </div>

      {showReport && record && summary && (
        <>
          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: "#a39c86", textTransform: "uppercase", marginBottom: 10 }}>Comments</div>
            <Field label="Class Teacher's comment"><textarea value={classTeacherComment} onChange={(e) => setClassTeacherComment(e.target.value)} className="focus-ring" style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} /></Field>
            <div style={{ marginTop: 10 }}>
              <Field label="HOI's comment"><textarea value={hoiComment} onChange={(e) => setHoiComment(e.target.value)} className="focus-ring" style={{ ...inputStyle, minHeight: 56, resize: "vertical" }} /></Field>
            </div>
            <button onClick={saveComments} disabled={savingRemarks} className="focus-ring" style={{ marginTop: 10, padding: "8px 16px", borderRadius: 8, border: "none", background: ACCENT, color: "#fff", fontWeight: 700, fontSize: 12.5, cursor: savingRemarks ? "wait" : "pointer" }}>{savingRemarks ? "Saving…" : "Save Comments"}</button>
          </div>

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 20 }}>
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontFamily: DISPLAY_FONT, fontSize: 16, fontWeight: 600 }}>{record.student.name} — {examName}</h3>
              <div className="flex gap-2">
                <button className="focus-ring flex items-center gap-1.5" style={{ padding: "7px 12px", borderRadius: 8, border: `1px solid ${LINE}`, background: PANEL, fontSize: 12.5, fontWeight: 600, cursor: "default" }}><Eye size={13} /> Viewing Report</button>
                <button onClick={() => printDocument(`${record.student.name} Report`, buildHtml())} className="focus-ring flex items-center gap-1.5" style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: RAIL, color: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}><Download size={13} /> Download PDF</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <MiniStat label="Marks" value={`${Math.round(Number(summary.sumScore))}/${Math.round(Number(summary.sumOutOf))}`} />
              <MiniStat label="Position" value={`${record.position} of ${analysis.perStudent.length}`} />
              <MiniStat label="Level" value={summary.overallLevel ? summary.overallLevel.level : "—"} />
              <MiniStat label="Points" value={`${summary.sumPoints}/${summary.maxPoints}`} />
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", borderBottom: `1px solid ${LINE}`, fontSize: 11, color: "#8a8474", textTransform: "uppercase" }}>
                  <th style={{ padding: "6px 8px" }}>Subject</th><th style={{ padding: "6px 8px" }}>Marks</th><th style={{ padding: "6px 8px" }}>%</th><th style={{ padding: "6px 8px" }}>Rank</th><th style={{ padding: "6px 8px" }}>Points</th><th style={{ padding: "6px 8px" }}>Comment</th><th style={{ padding: "6px 8px" }}>Instructor</th>
                </tr>
              </thead>
              <tbody>
                {summary.subjects.map((subj) => {
                  const m = record.bySubject[subj];
                  return (
                    <tr key={subj} style={{ borderBottom: `1px solid ${LINE}` }}>
                      <td style={{ padding: "6px 8px", fontWeight: 600 }}>{subj}</td>
                      <td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{Math.round(Number(m.score))}/{Math.round(Number(m.outOf))}</td>
                      <td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{Math.round(Number(m.pct))}% {m.level}</td>
                      <td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{m.rank}/{m.outOfCount}</td>
                      <td style={{ padding: "6px 8px", fontFamily: MONO_FONT }}>{m.points}</td>
                      <td style={{ padding: "6px 8px", color: "#6b6656" }}>{m.comment || "—"}</td>
                      <td style={{ padding: "6px 8px", color: "#6b6656" }}>{findInstructor(subj, cls, staff) || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p style={{ marginTop: 6, fontSize: 12.5, color: "#6b6656" }}>Class Teacher: {classTeacher ? classTeacher.name : "—"}</p>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  HR — staff attendance today. Payroll is a placeholder for now, coming
 *  in a later update.
 * ---------------------------------------------------------------------- */
const ATTENDANCE_REASONS = ["System error", "Excused permission", "No valid reason"];

function fmtClockTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

/* ---------------------------------------------------------------------- *
 *  FRONT OFFICE — Receptionist logs visitors (name, reason, date, comments)
 * ---------------------------------------------------------------------- */
function FrontOfficeView({ visitors, addVisitor, showToast }) {
  const [form, setForm] = useState({ name: "", reason: "", date: new Date().toISOString().slice(0, 10), comments: "" });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.reason.trim()) { showToast("Visitor name and reason are required"); return; }
    setSaving(true);
    try {
      await addVisitor(form);
      showToast(`Logged visitor ${form.name}`);
      setForm({ name: "", reason: "", date: new Date().toISOString().slice(0, 10), comments: "" });
    } catch (err) {
      showToast(err.message || "Couldn't log visitor");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-7 py-6" style={{ maxWidth: 980 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Front Office</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>Record visitors as they arrive — name, reason for visiting, and any notes.</p>

      <form onSubmit={submit} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
        <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Log a visitor</h3>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Visitor name"><input value={form.name} onChange={set("name")} placeholder="Full name" className="focus-ring" style={{ ...inputStyle, width: 180 }} /></Field>
          <Field label="Reason for visiting"><input value={form.reason} onChange={set("reason")} placeholder="e.g. Meeting a teacher" className="focus-ring" style={{ ...inputStyle, width: 220 }} /></Field>
          <Field label="Date"><input type="date" value={form.date} onChange={set("date")} className="focus-ring" style={{ ...inputStyle, width: 150 }} /></Field>
          <Field label="Comments"><input value={form.comments} onChange={set("comments")} placeholder="Optional notes" className="focus-ring" style={{ ...inputStyle, width: 220 }} /></Field>
          <button type="submit" disabled={saving} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Log Visitor"}</button>
        </div>
      </form>

      <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1.6fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
          <span>Date</span><span>Visitor</span><span>Reason</span><span>Comments</span>
        </div>
        {visitors.map((v) => (
          <div key={v.id} style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr 1fr 1.6fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
            <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{v.date}</span>
            <span style={{ fontWeight: 600 }}>{v.name}</span>
            <span>{v.reason}</span>
            <span style={{ color: "#6b6656" }}>{v.comments || "—"}</span>
          </div>
        ))}
        {visitors.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No visitors logged yet.</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- *
 *  LIBRARY — Librarian adds books and tracks issue/return
 * ---------------------------------------------------------------------- */
function LibraryView({ libraryBooks, bookIssues, addLibraryBook, deleteLibraryBook, issueBook, returnBook, showToast }) {
  const [tab, setTab] = useState("books");
  const [bookForm, setBookForm] = useState({ title: "", author: "", isbn: "", category: "", totalCopies: 1 });
  const [issueForm, setIssueForm] = useState({ bookId: "", borrowerName: "", borrowerClass: "", issuedDate: new Date().toISOString().slice(0, 10), dueDate: "" });
  const [saving, setSaving] = useState(false);
  const setB = (k) => (e) => setBookForm((f) => ({ ...f, [k]: e.target.value }));
  const setI = (k) => (e) => setIssueForm((f) => ({ ...f, [k]: e.target.value }));

  const submitBook = async (e) => {
    e.preventDefault();
    if (!bookForm.title.trim()) { showToast("Book title is required"); return; }
    setSaving(true);
    try {
      await addLibraryBook({ ...bookForm, totalCopies: Number(bookForm.totalCopies) || 1 });
      showToast(`Added "${bookForm.title}" to the library`);
      setBookForm({ title: "", author: "", isbn: "", category: "", totalCopies: 1 });
    } catch (err) {
      showToast(err.message || "Couldn't add book");
    } finally {
      setSaving(false);
    }
  };

  const submitIssue = async (e) => {
    e.preventDefault();
    if (!issueForm.bookId || !issueForm.borrowerName.trim()) { showToast("Pick a book and borrower name"); return; }
    setSaving(true);
    try {
      await issueBook(issueForm);
      const book = libraryBooks.find((b) => b.id === issueForm.bookId);
      showToast(`Issued "${book?.title}" to ${issueForm.borrowerName}`);
      setIssueForm({ bookId: "", borrowerName: "", borrowerClass: "", issuedDate: new Date().toISOString().slice(0, 10), dueDate: "" });
    } catch (err) {
      showToast(err.message || "Couldn't issue book");
    } finally {
      setSaving(false);
    }
  };

  const bookTitle = (id) => libraryBooks.find((b) => b.id === id)?.title || "—";
  const outstanding = bookIssues.filter((i) => i.status !== "Returned");

  return (
    <div className="px-7 py-6" style={{ maxWidth: 1040 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>Library</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>Add books to the catalogue, issue them, and track returns.</p>

      <div className="flex gap-1 mb-5" style={{ borderBottom: `1px solid ${LINE}` }}>
        <button onClick={() => setTab("books")} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === "books" ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: tab === "books" ? INK : "#9a9484", cursor: "pointer" }}>Books</button>
        <button onClick={() => setTab("issues")} className="focus-ring" style={{ padding: "8px 14px", background: "none", border: "none", borderBottom: tab === "issues" ? `2px solid ${ACCENT}` : "2px solid transparent", fontSize: 13, fontWeight: 600, color: tab === "issues" ? INK : "#9a9484", cursor: "pointer" }}>Issue / Return</button>
      </div>

      {tab === "books" ? (
        <>
          <form onSubmit={submitBook} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Add a book</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <Field label="Title"><input value={bookForm.title} onChange={setB("title")} className="focus-ring" style={{ ...inputStyle, width: 200 }} /></Field>
              <Field label="Author"><input value={bookForm.author} onChange={setB("author")} className="focus-ring" style={{ ...inputStyle, width: 160 }} /></Field>
              <Field label="Category"><input value={bookForm.category} onChange={setB("category")} placeholder="e.g. Fiction" className="focus-ring" style={{ ...inputStyle, width: 140 }} /></Field>
              <Field label="ISBN"><input value={bookForm.isbn} onChange={setB("isbn")} className="focus-ring" style={{ ...inputStyle, width: 140 }} /></Field>
              <Field label="Copies"><input type="number" min={1} value={bookForm.totalCopies} onChange={setB("totalCopies")} className="focus-ring" style={{ ...inputStyle, width: 90 }} /></Field>
              <button type="submit" disabled={saving} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Add Book"}</button>
            </div>
          </form>

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 0.5fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
              <span>Title</span><span>Author</span><span>Category</span><span>Available</span><span></span>
            </div>
            {libraryBooks.map((b) => (
              <div key={b.id} style={{ display: "grid", gridTemplateColumns: "1.6fr 1.2fr 1fr 1fr 0.5fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{b.title}</span>
                <span style={{ color: "#6b6656" }}>{b.author || "—"}</span>
                <span>{b.category || "—"}</span>
                <span style={{ fontFamily: MONO_FONT }}>{b.availableCopies} / {b.totalCopies}</span>
                <button onClick={() => { if (window.confirm(`Remove "${b.title}" from the library?`)) deleteLibraryBook(b.id); }} className="focus-ring" style={{ background: "none", border: "none", color: "#a1442c", cursor: "pointer", justifySelf: "end" }}><Trash2 size={14} /></button>
              </div>
            ))}
            {libraryBooks.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No books in the catalogue yet.</div>}
          </div>
        </>
      ) : (
        <>
          <form onSubmit={submitIssue} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 18, marginBottom: 18 }}>
            <h3 style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 12 }}>Issue a book</h3>
            <div className="flex items-end gap-3 flex-wrap">
              <Field label="Book"><select value={issueForm.bookId} onChange={setI("bookId")} className="focus-ring" style={{ ...inputStyle, width: 200 }}><option value="">Select a book…</option>{libraryBooks.filter((b) => b.availableCopies > 0).map((b) => <option key={b.id} value={b.id}>{b.title} ({b.availableCopies} left)</option>)}</select></Field>
              <Field label="Borrower name"><input value={issueForm.borrowerName} onChange={setI("borrowerName")} className="focus-ring" style={{ ...inputStyle, width: 180 }} /></Field>
              <Field label="Class (optional)"><input value={issueForm.borrowerClass} onChange={setI("borrowerClass")} className="focus-ring" style={{ ...inputStyle, width: 120 }} /></Field>
              <Field label="Due date"><input type="date" value={issueForm.dueDate} onChange={setI("dueDate")} className="focus-ring" style={{ ...inputStyle, width: 150 }} /></Field>
              <button type="submit" disabled={saving} className="focus-ring" style={{ padding: "9px 16px", borderRadius: 9, border: "none", background: RAIL, color: "#fff", fontWeight: 700, fontSize: 13, cursor: saving ? "wait" : "pointer" }}>{saving ? "Saving…" : "Issue Book"}</button>
            </div>
          </form>

          <div style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 0.9fr 0.9fr 0.9fr 0.6fr", padding: "10px 16px", fontSize: 11, fontWeight: 700, color: "#8a8474", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `1px solid ${LINE}` }}>
              <span>Book</span><span>Borrower</span><span>Class</span><span>Issued</span><span>Due</span><span>Status</span><span></span>
            </div>
            {bookIssues.map((i) => (
              <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 0.8fr 0.9fr 0.9fr 0.9fr 0.6fr", padding: "9px 16px", fontSize: 13, borderBottom: `1px solid ${LINE}`, alignItems: "center" }}>
                <span style={{ fontWeight: 600 }}>{bookTitle(i.bookId)}</span>
                <span>{i.borrowerName}</span>
                <span style={{ color: "#6b6656" }}>{i.borrowerClass || "—"}</span>
                <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{i.issuedDate}</span>
                <span style={{ fontFamily: MONO_FONT, fontSize: 12 }}>{i.dueDate || "—"}</span>
                <span style={{ fontWeight: 700, color: i.status === "Returned" ? "#4a7c59" : "#a1442c" }}>{i.status}</span>
                {i.status !== "Returned" ? (
                  <button onClick={() => returnBook(i.id)} className="focus-ring" style={{ padding: "5px 10px", borderRadius: 7, border: `1px solid ${LINE}`, background: PANEL, fontSize: 11.5, fontWeight: 600, cursor: "pointer", justifySelf: "end" }}>Mark Returned</button>
                ) : <span />}
              </div>
            ))}
            {outstanding.length === 0 && bookIssues.length === 0 && <div className="text-center py-10" style={{ color: "#a39c86", fontSize: 13 }}>No books issued yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function HRView(ctx) {
  return (
    <div className="px-7 py-6" style={{ maxWidth: 1180 }}>
      <h2 style={{ fontFamily: DISPLAY_FONT, fontSize: 20, fontWeight: 600, marginBottom: 4 }}>HR</h2>
      <p style={{ fontSize: 12.5, color: "#7A7568", marginBottom: 16 }}>Staff payroll and compensation. (Teacher attendance confirmation is now under the Attendance tab.)</p>
      <PayrollView {...ctx} />
    </div>
  );
}

function StaffAttendanceTab({ staff, fetchStaffAttendanceForDate, saveAttendanceReason, sendNotification, showToast, arrivalCutoff, departureCutoff }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async (d) => {
    setLoading(true);
    try {
      const data = await fetchStaffAttendanceForDate(d);
      setRows(data);
    } catch (err) {
      showToast(err.message || "Couldn't load attendance");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(date); }, [date]);

  const rowFor = (staffId) => rows.find((r) => r.staffId === staffId);

  const fmtNoticeDate = (d) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const fmtNoticeTime = (iso) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true });

  const setReason = async (attendanceId, field, reason) => {
    try {
      await saveAttendanceReason(attendanceId, field, reason);
      setRows((prev) => prev.map((r) => (r.id === attendanceId ? { ...r, [field]: reason } : r)));
      showToast("Reason saved");

      // The warning only goes out when the Head Teacher records the
      // reason as "No valid reason" — not automatically at clock-in/out.
      if (reason === "No valid reason") {
        const rec = rows.find((r) => r.id === attendanceId);
        const member = staff.find((s) => s.id === rec?.staffId);
        if (rec && member) {
          const message = field === "late_reason"
            ? `Hallo teacher ${member.name}, On ${fmtNoticeDate(rec.date)} you arrived to school late at ${fmtNoticeTime(rec.arrivalTime)}. This is not the official arrival time for the school. Continuous late arrival to school will lead to disciplinary measures taken against you.`
            : `Hallo teacher ${member.name}, On ${fmtNoticeDate(rec.date)} you departed early from school at ${fmtNoticeTime(rec.departureTime)}. This is not the official departure time for the school. Continuous early departure from school will lead to disciplinary measures taken against you.`;
          await sendNotification({ title: "Warning", message, recipientId: member.id });
        }
      }
    } catch (err) {
      showToast(err.message || "Couldn't save reason");
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="focus-ring" style={{ ...inputStyle, width: 180 }} />
        <span style={{ fontSize: 11.5, color: "#9a9484" }}>Official arrival {arrivalCutoff || "07:20"} · Official departure {departureCutoff || "17:00"}</span>
      </div>

      {loading ? (
        <p style={{ fontSize: 13, color: "#9a9484" }}>Loading…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {staff.map((s) => {
            const rec = rowFor(s.id);
            return (
              <div key={s.id} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 12, padding: 14 }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    {s.photoUrl ? (
                      <img src={s.photoUrl} alt={s.name} style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#EADFC2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10.5, fontWeight: 700, color: RAIL }}>{initials(s.name)}</div>
                    )}
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.name}</div>
                      <div style={{ fontSize: 11, color: "#8a8474" }}>{s.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4" style={{ fontSize: 12.5 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#a39c86", textTransform: "uppercase", fontWeight: 700 }}>Arrival</div>
                      <div style={{ fontFamily: MONO_FONT, fontWeight: 600, color: rec?.lateArrival ? "#a1442c" : INK }}>{rec ? fmtClockTime(rec.arrivalTime) : "—"}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "#a39c86", textTransform: "uppercase", fontWeight: 700 }}>Departure</div>
                      <div style={{ fontFamily: MONO_FONT, fontWeight: 600, color: rec?.earlyDeparture ? "#a1442c" : INK }}>{rec ? fmtClockTime(rec.departureTime) : "—"}</div>
                    </div>
                  </div>
                </div>

                {rec?.lateArrival && (
                  <div className="flex items-center gap-2 mt-3" style={{ padding: "8px 10px", borderRadius: 8, background: "#FBEDE7" }}>
                    <AlertTriangle size={13} color="#a1442c" />
                    <span style={{ fontSize: 12, color: "#a1442c" }}>This teacher arrived late — provide a reason (selecting "No valid reason" sends them a warning):</span>
                    <select value={rec.lateReason || ""} onChange={(e) => setReason(rec.id, "late_reason", e.target.value)} className="focus-ring" style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 12 }}>
                      <option value="">Select…</option>
                      {ATTENDANCE_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                )}
                {rec?.earlyDeparture && (
                  <div className="flex items-center gap-2 mt-3" style={{ padding: "8px 10px", borderRadius: 8, background: "#FBEDE7" }}>
                    <AlertTriangle size={13} color="#a1442c" />
                    <span style={{ fontSize: 12, color: "#a1442c" }}>This teacher departed early — provide a reason (selecting "No valid reason" sends them a warning):</span>
                    <select value={rec.earlyReason || ""} onChange={(e) => setReason(rec.id, "early_reason", e.target.value)} className="focus-ring" style={{ marginLeft: "auto", padding: "4px 8px", borderRadius: 6, border: `1px solid ${LINE}`, fontSize: 12 }}>
                      <option value="">Select…</option>
                      {ATTENDANCE_REASONS.map((r) => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
