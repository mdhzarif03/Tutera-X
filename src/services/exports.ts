import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { dateOnly } from "@/lib/dates";
import { num, round2 } from "@/lib/money";
import { balancesFor } from "./payments";

// Excel export for one teacher's batches. Every query is scoped to batches the teacher owns.

const MAX_RANGE_DAYS = 800;
const METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  BKASH: "bKash",
  NAGAD: "Nagad",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
};
const STATUS_LABEL: Record<string, string> = { PRESENT: "Present", ABSENT: "Absent", LATE: "Late", EXCUSED: "Excused" };

export interface ExportRequest {
  type: "payments" | "attendance";
  scope: "all" | "selected";
  batchIds: string[];
  from: Date;
  to: Date;
  fromLabel: string;
  toLabel: string;
}

interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  format?: string;
}
interface Sheet {
  name: string;
  columns: SheetColumn[];
  rows: Record<string, string | number | Date | null>[];
}

export function parseExportRequest(params: URLSearchParams): ExportRequest {
  const type = params.get("type") === "attendance" ? "attendance" : "payments";
  const scope = params.get("scope") === "selected" ? "selected" : "all";
  const batchIds = params.getAll("batch").map((s) => s.slice(0, 64)).filter(Boolean);
  if (scope === "selected" && batchIds.length === 0) throw new UserError("Choose at least one batch.");

  const fromLabel = params.get("from") ?? "";
  const toLabel = params.get("to") ?? "";
  const from = dateOnly(fromLabel);
  const to = dateOnly(toLabel);
  if (from > to) throw new UserError("The start date must be before the end date.");
  if ((to.getTime() - from.getTime()) / 86_400_000 > MAX_RANGE_DAYS) throw new UserError("Choose a date range of about two years or less.");

  return { type, scope, batchIds: scope === "selected" ? batchIds : [], from, to, fromLabel, toLabel };
}

async function chosenBatches(teacherId: string, req: ExportRequest) {
  const batches = await db.batch.findMany({
    where: req.scope === "all" ? { teacherId, archivedAt: null } : { teacherId, id: { in: req.batchIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  if (batches.length === 0) throw new UserError("No batches found to export.");
  return batches;
}

async function paymentsSheets(teacherId: string, req: ExportRequest): Promise<Sheet[]> {
  const batches = await chosenBatches(teacherId, req);
  const batchName = new Map(batches.map((b) => [b.id, b.name]));

  const memberships = await db.batchStudent.findMany({
    where: {
      batchId: { in: batches.map((b) => b.id) },
      leftAt: null,
      student: { archivedAt: null, teachers: { some: { teacherId } } },
    },
    select: { studentId: true, batchId: true },
  });
  const studentBatches = new Map<string, string[]>();
  for (const m of memberships) {
    studentBatches.set(m.studentId, [...(studentBatches.get(m.studentId) ?? []), batchName.get(m.batchId) ?? ""]);
  }
  const studentIds = [...studentBatches.keys()];
  if (studentIds.length === 0) throw new UserError("There are no students in the chosen batches.");

  const [students, payments, balances] = await Promise.all([
    db.studentProfile.findMany({
      where: { userId: { in: studentIds } },
      select: { userId: true, className: true, monthlyFee: true, user: { select: { name: true } } },
    }),
    db.payment.findMany({
      where: { studentId: { in: studentIds }, paidOn: { gte: req.from, lte: req.to } },
      orderBy: [{ paidOn: "asc" }, { createdAt: "asc" }],
      select: {
        studentId: true,
        amount: true,
        method: true,
        reference: true,
        paidOn: true,
        forPeriod: true,
        note: true,
        recordedBy: { select: { user: { select: { name: true } } } },
      },
    }),
    balancesFor(studentIds),
  ]);

  const info = new Map(students.map((s) => [s.userId, { name: s.user.name, className: s.className, fee: num(s.monthlyFee) }]));
  const batchList = (id: string) => (studentBatches.get(id) ?? []).join(", ");

  const paidInRange = new Map<string, number>();
  for (const p of payments) paidInRange.set(p.studentId, (paidInRange.get(p.studentId) ?? 0) + num(p.amount));

  const paymentRows = payments.map((p) => ({
    date: p.paidOn,
    student: info.get(p.studentId)?.name ?? "",
    className: info.get(p.studentId)?.className ?? "",
    batches: batchList(p.studentId),
    amount: num(p.amount),
    method: METHOD_LABEL[p.method] ?? p.method,
    forMonth: p.forPeriod ?? "",
    reference: p.reference ?? "",
    note: p.note ?? "",
    recordedBy: p.recordedBy.user.name,
  }));

  const summaryRows = [...studentIds]
    .sort((a, b) => (info.get(a)?.name ?? "").localeCompare(info.get(b)?.name ?? ""))
    .map((id) => ({
      student: info.get(id)?.name ?? "",
      className: info.get(id)?.className ?? "",
      batches: batchList(id),
      monthlyFee: info.get(id)?.fee ?? 0,
      paidInRange: round2(paidInRange.get(id) ?? 0),
      owesNow: balances.get(id)?.balance ?? 0,
    }));

  return [
    {
      name: "Payments",
      columns: [
        { header: "Date", key: "date", width: 14, format: "dd mmm yyyy" },
        { header: "Student", key: "student", width: 26 },
        { header: "Class", key: "className", width: 12 },
        { header: "Batches", key: "batches", width: 24 },
        { header: "Amount (৳)", key: "amount", width: 14, format: "#,##0.00" },
        { header: "Method", key: "method", width: 14 },
        { header: "For month", key: "forMonth", width: 12 },
        { header: "Reference", key: "reference", width: 18 },
        { header: "Note", key: "note", width: 28 },
        { header: "Recorded by", key: "recordedBy", width: 20 },
      ],
      rows: paymentRows,
    },
    {
      name: "Summary",
      columns: [
        { header: "Student", key: "student", width: 26 },
        { header: "Class", key: "className", width: 12 },
        { header: "Batches", key: "batches", width: 24 },
        { header: "Monthly fee (৳)", key: "monthlyFee", width: 16, format: "#,##0.00" },
        { header: "Paid in range (৳)", key: "paidInRange", width: 18, format: "#,##0.00" },
        { header: "Owes now, all time (৳)", key: "owesNow", width: 22, format: "#,##0.00" },
      ],
      rows: summaryRows,
    },
  ];
}

async function attendanceSheets(teacherId: string, req: ExportRequest): Promise<Sheet[]> {
  const batches = await chosenBatches(teacherId, req);
  const batchName = new Map(batches.map((b) => [b.id, b.name]));

  const records = await db.attendance.findMany({
    where: {
      batchId: { in: batches.map((b) => b.id) },
      date: { gte: req.from, lte: req.to },
      batch: { teacherId },
    },
    orderBy: [{ date: "asc" }],
    select: {
      date: true,
      status: true,
      batchId: true,
      studentId: true,
      student: { select: { className: true, user: { select: { name: true } } } },
    },
  });

  const rows = records
    .map((r) => ({
      date: r.date,
      batch: batchName.get(r.batchId) ?? "",
      student: r.student.user.name,
      className: r.student.className,
      status: STATUS_LABEL[r.status] ?? r.status,
    }))
    .sort((a, b) => +a.date - +b.date || a.batch.localeCompare(b.batch) || a.student.localeCompare(b.student));

  // Per student across the chosen batches. Excused days do not count against attendance.
  const tally = new Map<string, { name: string; className: string; P: number; L: number; A: number; E: number }>();
  for (const r of records) {
    const t = tally.get(r.studentId) ?? { name: r.student.user.name, className: r.student.className, P: 0, L: 0, A: 0, E: 0 };
    if (r.status === "PRESENT") t.P++;
    else if (r.status === "LATE") t.L++;
    else if (r.status === "ABSENT") t.A++;
    else t.E++;
    tally.set(r.studentId, t);
  }
  const summaryRows = [...tally.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((t) => {
      const denom = t.P + t.L + t.A;
      return {
        student: t.name,
        className: t.className,
        present: t.P,
        late: t.L,
        absent: t.A,
        excused: t.E,
        attended: denom > 0 ? (t.P + t.L) / denom : null,
      };
    });

  return [
    {
      name: "Attendance",
      columns: [
        { header: "Date", key: "date", width: 14, format: "dd mmm yyyy" },
        { header: "Batch", key: "batch", width: 22 },
        { header: "Student", key: "student", width: 26 },
        { header: "Class", key: "className", width: 12 },
        { header: "Status", key: "status", width: 12 },
      ],
      rows,
    },
    {
      name: "Summary",
      columns: [
        { header: "Student", key: "student", width: 26 },
        { header: "Class", key: "className", width: 12 },
        { header: "Present", key: "present", width: 10 },
        { header: "Late", key: "late", width: 10 },
        { header: "Absent", key: "absent", width: 10 },
        { header: "Excused", key: "excused", width: 10 },
        { header: "Attended % (excl. excused)", key: "attended", width: 24, format: "0.0%" },
      ],
      rows: summaryRows,
    },
  ];
}

async function renderWorkbook(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Tutera-X";
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.format ? { numFmt: c.format } : {} }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F46E5" } };
    header.alignment = { vertical: "middle" };
    ws.addRows(s.rows);
    if (s.rows.length > 0) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Builds the workbook for the request and returns it with a file name. */
export async function buildExport(teacherId: string, params: URLSearchParams): Promise<{ buffer: Buffer; filename: string }> {
  const req = parseExportRequest(params);
  const sheets = req.type === "payments" ? await paymentsSheets(teacherId, req) : await attendanceSheets(teacherId, req);
  const buffer = await renderWorkbook(sheets);
  return { buffer, filename: `Tutera-X_${req.type}_${req.fromLabel}_to_${req.toLabel}.xlsx` };
}
