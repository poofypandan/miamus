import { mockProvider } from "./mock-provider";
import { supabaseProvider } from "./supabase-provider";
import type { DataProvider } from "./types";

export const isMockMode =
  !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const dataProvider: DataProvider = isMockMode ? mockProvider : supabaseProvider;

export type {
  DataProvider,
  CreateEntityInput,
  CreateLogInput,
  CreateBatchLogInput,
  CreateScheduleInput,
  CreateMedicalRecordInput,
  CreateInventoryAlertInput,
  CreateRoutineProposalInput,
  CreateHouseholdTaskInput,
  HouseholdTaskStatusPatch,
  CreateInventoryAuditInput,
} from "./types";
