"use client";
import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Data, initialData } from "./finance";
import {
  diffTables,
  emptyData,
  fromTables,
  Snapshot,
  toTables,
} from "./relational";
import { readPlan, writePlan } from "./finance-repository";
import { supabase } from "./supabase";

type StoreStatus = "loading" | "local" | "saving" | "saved" | "error";
const localKey = "finplan-v1";
const draftKey = (user: string) => `finplan-pending:${user}`;
function localPlan(): Data {
  const value = localStorage.getItem(localKey);
  return value ? (JSON.parse(value) as Data) : initialData;
}
export function useFinanceStore() {
  const [data, setViewData] = useState<Data>(initialData);
  const [user, setUser] = useState<string | null>(null);
  const [status, setStatus] = useState<StoreStatus>("loading");
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  const current = useRef(data),
    identity = useRef<string | null>(null),
    baseline = useRef<Snapshot | null>(null);
  const locked = useRef(true),
    generation = useRef(0);
  const invalidate = useCallback(() => {
    generation.current++;
  }, []);
  const setCurrent = useCallback((value: Data) => {
    current.current = value;
    setViewData(value);
  }, []);

  const load = useCallback(
    async (account: string | null, token: number, discardPending = false) => {
      locked.current = true;
      setStatus("loading");
      setError("");
      baseline.current = null;
      if (!account) {
        try {
          setCurrent(localPlan());
          setHasRecovery(false);
          setInitialized(false);
          setStatus("local");
          locked.current = false;
        } catch {
          setError(
            "No se pudieron leer los datos locales. El respaldo original sigue guardado en este navegador.",
          );
          setStatus("error");
        }
        return;
      }
      // Never show the previous user's data while loading an account.
      setCurrent(emptyData());
      try {
        const snapshot = await readPlan();
        if (token !== generation.current) return;
        baseline.current = snapshot;
        setInitialized(snapshot.initialized);
        const saved = localStorage.getItem(draftKey(account));
        if (saved && !discardPending) {
          const pending = JSON.parse(saved) as {
            data: Data;
            baseline: Snapshot;
          };
          setCurrent(pending.data);
          baseline.current = pending.baseline;
          setHasRecovery(true);
          setError(
            snapshot.revision === pending.baseline.revision
              ? "Hay cambios pendientes de una sesión anterior. Reintentá guardarlos o descargalos antes de cargar la versión de tu cuenta."
              : "Tu cuenta tiene una versión más reciente y hay cambios pendientes en este dispositivo. Descargalos antes de cargar la versión de tu cuenta.",
          );
          setStatus("error");
          return;
        }
        setCurrent(
          snapshot.initialized ? fromTables(snapshot.tables) : emptyData(),
        );
        if (discardPending) localStorage.removeItem(draftKey(account));
        setHasRecovery(false);
        setStatus("saved");
        locked.current = false;
      } catch (e) {
        if (token !== generation.current) return;
        setError(
          e instanceof Error ? e.message : "No se pudo cargar tu cuenta.",
        );
        setStatus("error");
      }
    },
    [setCurrent],
  );

  useEffect(() => {
    let alive = true,
      first = true;
    const change = (account: string | null) => {
      if (!alive || (!first && identity.current === account)) return;
      first = false;
      identity.current = account;
      setUser(account);
      const token = ++generation.current;
      // Supabase auth callbacks must remain synchronous; load after their lock releases.
      queueMicrotask(() => {
        if (alive && token === generation.current) void load(account, token);
      });
    };
    if (!supabase) {
      change(null);
      return () => {
        alive = false;
        invalidate();
      };
    }
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => change(session?.user.id ?? null),
    );
    return () => {
      alive = false;
      invalidate();
      subscription.subscription.unsubscribe();
    };
  }, [load, invalidate]);

  const persist = useCallback(
    async (next: Data) => {
      const account = identity.current,
        token = generation.current;
      if (!account) {
        try {
          localStorage.setItem(localKey, JSON.stringify(next));
          setCurrent(next);
          setStatus("local");
        } catch {
          setError(
            "No se pudo guardar en este dispositivo. Exportá tu planificación para conservarla.",
          );
          setCurrent(next);
          setStatus("error");
          locked.current = true;
        }
        return;
      }
      if (!baseline.current)
        throw new Error("Primero cargá los datos de tu cuenta.");
      locked.current = true;
      setStatus("saving");
      setError("");
      try {
        const tables = toTables(next);
        // Durable recovery copy, separate from the guest workspace and other accounts.
        localStorage.setItem(
          draftKey(account),
          JSON.stringify({ data: next, baseline: baseline.current }),
        );
        setCurrent(next);
        setHasRecovery(true);
        const revision = await writePlan(
          account,
          baseline.current.revision,
          diffTables(baseline.current.tables, tables),
        );
        if (token !== generation.current) return;
        baseline.current = { revision, initialized: true, tables };
        setInitialized(true);
        localStorage.removeItem(draftKey(account));
        setHasRecovery(false);
        setStatus("saved");
        locked.current = false;
      } catch (e) {
        if (token !== generation.current) return;
        setError(e instanceof Error ? e.message : "No se pudo guardar.");
        setStatus("error");
      }
    },
    [setCurrent],
  );
  const setData: Dispatch<SetStateAction<Data>> = useCallback(
    (update) => {
      if (locked.current) return;
      const next =
        typeof update === "function" ? update(current.current) : update;
      void persist(next);
    },
    [persist],
  );
  const reload = (discardPending = false) =>
    load(identity.current, ++generation.current, discardPending);
  const retry = () => {
    if (!identity.current) return persist(current.current);
    if (!baseline.current) return reload();
    return persist(current.current);
  };
  const importLocal = async () => {
    if (locked.current || !identity.current || initialized) return;
    try {
      await persist(localPlan());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo importar.");
    }
  };
  const downloadRecovery = () => {
    if (!identity.current) return;
    const saved = localStorage.getItem(draftKey(identity.current));
    if (!saved) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(JSON.parse(saved).data, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "finplan-cambios-pendientes.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return {
    data,
    setData,
    user,
    status,
    error,
    initialized,
    hasRecovery,
    reload,
    retry,
    importLocal,
    downloadRecovery,
    canEdit: status === "local" || status === "saved",
  };
}
