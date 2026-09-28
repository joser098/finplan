import { supabase } from "./supabase";
import { Changes, Snapshot } from "./relational";

export function repositoryError(error: {
  message: string;
  code?: string;
}): Error {
  if (error.code === "40001" || error.message.includes("FINPLAN_CONFLICT"))
    return new Error(
      "Tu planificación cambió en otro dispositivo. Exportá tus cambios pendientes y cargá la versión de tu cuenta antes de continuar.",
    );
  return new Error(error.message);
}
export async function readPlan(): Promise<Snapshot> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc("finance_read");
  if (error) throw repositoryError(error);
  return data as Snapshot;
}
export async function writePlan(
  account: string,
  revision: number,
  changes: Changes,
): Promise<number> {
  if (!supabase) throw new Error("Supabase no está configurado.");
  const { data, error } = await supabase.rpc("finance_write", {
    p_expected_revision: revision,
    p_changes: changes,
    p_account: account,
  });
  if (error) throw repositoryError(error);
  return Number(data);
}
