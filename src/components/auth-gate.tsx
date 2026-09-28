"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(!supabase);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setAllowed(false);
        router.replace("/auth/reset-password");
        return;
      }
      if (session) {
        sessionStorage.removeItem("finplan-demo");
        setAllowed(true);
        return;
      }
      if (
        event !== "SIGNED_OUT" &&
        sessionStorage.getItem("finplan-demo") === "1"
      ) {
        setAllowed(true);
        return;
      }
      setAllowed(false);
      router.replace("/login");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
  return allowed ? (
    children
  ) : (
    <div className="auth-loading" role="status">
      Cargando tu espacio…
    </div>
  );
}
