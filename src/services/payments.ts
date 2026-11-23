import { db } from "@/lib/db";
import { UserError } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { dateOnly, dhakaPeriod, dhakaToday } from "@/lib/dates";
import { num, round2 } from "@/lib/money";
import { requireNumber, requireText, optionalText } from "@/lib/validate";
import { assertStudentOfTeacher } from "./scope";
import type { PaymentMethod } from "@prisma/client";

export type PaymentState = "NO_CHARGES" | "PAID" | "PARTIAL" | "OVERDUE" | "UNPAID";

export interface Balance {
  charged: number;
  paid: number;
  adjusted: number;
  balance: number;
  state: PaymentState;
}

const METHODS: readonly PaymentMethod[] = ["CASH", "BKASH", "NAGAD", "BANK_TRANSFER", "OTHER"];

/**
 * Balances are derived from the ledger inside the database: charges + adjustments − payments.
 * Nothing stores a running balance, so there is no second source of truth to drift.
 */
export async function balancesFor(studentIds: string[]): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>();
  if (studentIds.length === 0) return out;

  const period = dhakaPeriod();
  const [charges, payments, adjustments, overdueCharges] = await Promise.all([
    db.feeCharge.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _sum: { amountDue: true }, _count: { _all: true } }),
    db.payment.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _sum: { amount: true } }),
    db.paymentAdjustment.groupBy({ by: ["studentId"], where: { studentId: { in: studentIds } }, _sum: { amount: true } }),
    db.feeCharge.findMany({
      where: { studentId: { in: studentIds }, period: { lt: period } },
      distinct: ["studentId"],
      select: { studentId: true },
    }),
  ]);

  const chargeMap = new Map(charges.map((c) => [c.studentId, { sum: num(c._sum.amountDue), count: c._count._all }]));
  const paymentMap = new Map(payments.map((p) => [p.studentId, num(p._sum.amount)]));
  const adjustMap = new Map(adjustments.map((a) => [a.studentId, num(a._sum.amount)]));
  const overdueSet = new Set(overdueCharges.map((o) => o.studentId));

  for (const id of studentIds) {
    const charged = chargeMap.get(id)?.sum ?? 0;
    const paid = paymentMap.get(id) ?? 0;
    const adjusted = adjustMap.get(id) ?? 0;
    const balance = round2(charged + adjusted - paid);
    let state: PaymentState;
    if (!chargeMap.has(id)) state = "NO_CHARGES";
    else if (balance <= 0) state = "PAID";
    else if (overdueSet.has(id)) state = "OVERDUE";
    else if (paid > 0) state = "PARTIAL";
    else state = "UNPAID";
    out.set(id, { charged, paid, adjusted, balance, state });
  }
  return out;
}

/** Current students of one teacher with their balances, for the finance table. */
export async function listFinance(teacherId: string) {
  const links = await db.teacherStudent.findMany({
    where: { teacherId, student: { archivedAt: null } },
    orderBy: { student: { user: { name: "asc" } } },
    select: {
      studentId: true,
      student: {
        select: {
          monthlyFee: true,
          className: true,
          user: { select: { name: true, username: true } },
          guardian: { select: { name: true, phoneE164: true } },
        },
      },
    },
  });
  const balances = await balancesFor(links.map((l) => l.studentId));
  return links.map((l) => ({
    studentId: l.studentId,
    name: l.student.user.name,
    username: l.student.user.username,
    className: l.student.className,
    monthlyFee: num(l.student.monthlyFee),
    guardianName: l.student.guardian.name,
    balance: balances.get(l.studentId) ?? null,
  }));
}

export async function generateCharges(teacherId: string, period: string): Promise<number> {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new UserError("Choose a valid month.");
  const links = await db.teacherStudent.findMany({
    where: { teacherId, student: { archivedAt: null } },
    select: { studentId: true, student: { select: { monthlyFee: true } } },
  });
  if (links.length === 0) throw new UserError("There are no active students to bill.");

  return db.$transaction(async (tx) => {
    const result = await tx.feeCharge.createMany({
      data: links.map((l) => ({ studentId: l.studentId, period, amountDue: l.student.monthlyFee })),
      skipDuplicates: true,
    });
    await audit(tx, { actorId: teacherId, action: "fees.generate", entityType: "period", entityId: period, changes: { created: result.count } });
    return result.count;
  });
}

export async function recordPayment(
  teacherId: string,
  studentId: string,
  raw: Record<string, string>,
): Promise<void> {
  await assertStudentOfTeacher(teacherId, studentId);
  const amount = requireNumber(raw.amount, "Amount", 1, 1_000_000);
  const method = raw.method as PaymentMethod;
  if (!METHODS.includes(method)) throw new UserError("Choose a payment method.");
  const paidOn = dateOnly(raw.paidOn && raw.paidOn.length ? raw.paidOn : dhakaToday());
  const forPeriod = optionalText(raw.forPeriod, 7);
  if (forPeriod && !/^\d{4}-(0[1-9]|1[0-2])$/.test(forPeriod)) throw new UserError("The month must be YYYY-MM.");

  await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        studentId,
        amount,
        method,
        reference: optionalText(raw.reference, 80),
        paidOn,
        forPeriod,
        recordedById: teacherId,
        note: optionalText(raw.note, 200),
      },
    });
    await audit(tx, { actorId: teacherId, action: "payment.record", entityType: "payment", entityId: p.id, changes: { studentId, amount, method } });
  });
}

export async function addAdjustment(teacherId: string, studentId: string, raw: Record<string, string>): Promise<void> {
  await assertStudentOfTeacher(teacherId, studentId);
  const amount = requireNumber(raw.amount, "Adjustment amount", -1_000_000, 1_000_000);
  if (amount === 0) throw new UserError("An adjustment cannot be zero.");
  const reason = requireText(raw.reason, "Reason", 200);
  await db.$transaction(async (tx) => {
    const a = await tx.paymentAdjustment.create({ data: { studentId, amount, reason, createdById: teacherId } });
    await audit(tx, { actorId: teacherId, action: "payment.adjust", entityType: "adjustment", entityId: a.id, changes: { studentId, amount } });
  });
}

/** Full ledger for one student. Used on the student's page and in their own dashboard. */
export async function studentLedger(studentId: string) {
  const [charges, payments, adjustments] = await Promise.all([
    db.feeCharge.findMany({ where: { studentId }, orderBy: { period: "desc" }, select: { id: true, period: true, amountDue: true } }),
    db.payment.findMany({
      where: { studentId },
      orderBy: { paidOn: "desc" },
      select: { id: true, amount: true, method: true, paidOn: true, reference: true, forPeriod: true, note: true },
    }),
    db.paymentAdjustment.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, select: { id: true, amount: true, reason: true, createdAt: true } }),
  ]);
  const balances = await balancesFor([studentId]);
  return { charges, payments, adjustments, balance: balances.get(studentId) ?? null };
}
