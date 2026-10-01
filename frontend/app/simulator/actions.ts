"use server";

import { revalidatePath } from "next/cache";

import {
  createHospitalExpense,
  deleteHospitalExpense,
  evaluateSimulator,
  listExpenseCategories,
  listHospitalExpenses,
  updateHospitalExpense,
} from "@/lib/api";
import type { ExpenseCategory, HospitalExpense, SimulatorParams, SimulatorResult } from "@/lib/types";

export async function fetchExpenseDataAction(): Promise<{
  categories: ExpenseCategory[];
  expenses: HospitalExpense[];
}> {
  try {
    const [categories, expenses] = await Promise.all([
      listExpenseCategories(),
      listHospitalExpenses(),
    ]);
    return { categories, expenses };
  } catch (err) {
    console.error("fetchExpenseDataAction error:", err);
    return { categories: [], expenses: [] };
  }
}

export async function createHospitalExpenseAction(payload: {
  category_id: string;
  hospital_name?: string;
  title: string;
  amount_lkr: number;
  recurrence: string;
  is_active?: boolean;
  notes?: string | null;
}): Promise<HospitalExpense | null> {
  try {
    const created = await createHospitalExpense(payload);
    revalidatePath("/simulator");
    return created;
  } catch (err) {
    console.error("createHospitalExpenseAction error:", err);
    return null;
  }
}

export async function updateHospitalExpenseAction(
  id: string,
  payload: Partial<{
    category_id: string;
    hospital_name: string;
    title: string;
    amount_lkr: number;
    recurrence: string;
    is_active: boolean;
    notes: string;
  }>
): Promise<HospitalExpense | null> {
  try {
    const updated = await updateHospitalExpense(id, payload);
    revalidatePath("/simulator");
    return updated;
  } catch (err) {
    console.error("updateHospitalExpenseAction error:", err);
    return null;
  }
}

export async function deleteHospitalExpenseAction(id: string): Promise<boolean> {
  try {
    await deleteHospitalExpense(id);
    revalidatePath("/simulator");
    return true;
  } catch (err) {
    console.error("deleteHospitalExpenseAction error:", err);
    return false;
  }
}

export async function evaluateSimulatorAction(
  params: SimulatorParams
): Promise<SimulatorResult | null> {
  try {
    return await evaluateSimulator(params);
  } catch (err) {
    console.error("evaluateSimulatorAction error:", err);
    return null;
  }
}
