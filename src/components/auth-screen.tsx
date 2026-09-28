"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Mail,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { authError } from "@/lib/auth-errors";

type Mode = "password" | "magic" | "recovery";
export default function AuthScreen({ reset = false }: { reset?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [ready, setReady] = useState(!supabase),
    [hasSession, setHasSession] = useState(false),
    [updated, setUpdated] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    let linkError = hash.has("error")
      ? authError({
          code: hash.get("error_code") ?? undefined,
          message: hash.get("error_description") ?? undefined,
        })
      : "";
    let recovering = hash.get("type") === "recovery";
    if (hash.has("error")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (linkError) {
        setError(linkError);
        linkError = "";
      }
      setReady(true);
      setHasSession(Boolean(session));
      if (event === "PASSWORD_RECOVERY") recovering = true;
      if (recovering && !reset) {
        router.replace("/auth/reset-password");
        return;
      }
      if (session && !reset) {
        sessionStorage.removeItem("finplan-demo");
        router.replace("/");
      }
    });
    return () => data.subscription.unsubscribe();
  }, [reset, router]);
  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
    setPassword("");
    setConfirm("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    setError("");
    setMessage("");
    if (reset && password !== confirm) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      if (reset) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        setConfirm("");
        setUpdated(true);
        setMessage("Tu contraseña se actualizó correctamente.");
      } else if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        setPassword("");
        sessionStorage.removeItem("finplan-demo");
        router.replace("/");
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
            shouldCreateUser: true,
          },
        });
        if (error) throw error;
        setMessage(
          "Revisá tu correo. Te enviamos un enlace para ingresar; si no lo encontrás, mirá en spam.",
        );
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/auth/reset-password` },
        );
        if (error) throw error;
        setMessage(
          "Si hay una cuenta asociada a ese correo, recibirás un enlace para crear una nueva contraseña.",
        );
      }
    } catch (e) {
      setError(authError(e as { message?: string; code?: string }));
    } finally {
      setBusy(false);
    }
  }
  const title = reset
    ? "Tu nueva contraseña"
    : mode === "recovery"
      ? "Recuperá tu acceso"
      : "Qué bueno verte por acá.";
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link className="brand" href="/login">
          <span className="brand-symbol">
            <TrendingUp size={24} />
          </span>
          finplan<span className="brand-dot">.</span>
        </Link>
        <div className="auth-story-copy">
          <span className="eyebrow">TU DINERO, CON CLARIDAD</span>
          <h1>
            Un plan para tu dinero.
            <br />
            <span>Más tranquilidad para vos.</span>
          </h1>
          <p>
            Tus ingresos, tus compromisos y lo que te queda. Todo en un mismo
            lugar.
          </p>
          <div className="auth-preview">
            <span>Después de pagar todo</span>
            <strong>Sabé con cuánto contás.</strong>
            <div className="auth-preview-line" />
            <small>
              <Check size={14} />
              Un mes organizado empieza acá.
            </small>
          </div>
        </div>
        <span className="auth-story-footer">
          Un poco de orden. Mucha más tranquilidad.
        </span>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-card">
          <span className="auth-symbol">
            {reset ? <KeyRound size={23} /> : <ShieldCheck size={23} />}
          </span>
          <h2>{title}</h2>
          <p className="auth-description">
            {reset
              ? "Elegí una contraseña segura para ingresar a tu cuenta."
              : mode === "recovery"
                ? "Te vamos a enviar un enlace para restablecer tu contraseña."
                : "Ingresá a tu espacio y seguí planificando."}
          </p>
          {!reset && mode !== "recovery" && (
            <div
              className="auth-tabs"
              role="group"
              aria-label="Método de acceso"
            >
              <button
                type="button"
                aria-pressed={mode === "password"}
                disabled={busy}
                onClick={() => switchMode("password")}
              >
                <KeyRound size={16} />
                Contraseña
              </button>
              <button
                type="button"
                aria-pressed={mode === "magic"}
                disabled={busy}
                onClick={() => switchMode("magic")}
              >
                <Mail size={16} />
                Enlace mágico
              </button>
            </div>
          )}
          {!supabase && (
            <div className="auth-feedback" role="status">
              El acceso a cuentas todavía no está configurado. Podés explorar la
              demo.
            </div>
          )}
          {error && (
            <div className="auth-feedback auth-error" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="auth-feedback" role="status">
              <Check size={17} />
              {message}
            </div>
          )}
          {reset && ready && !hasSession && !updated ? (
            <div className="auth-feedback">
              Abrí el enlace de recuperación que recibiste por correo para
              elegir tu nueva contraseña.
            </div>
          ) : updated ? (
            <Link className="primary auth-submit" href="/">
              Ir a mi planificación <ArrowRight size={17} />
            </Link>
          ) : (
            <form onSubmit={submit} className="auth-form">
              <fieldset
                disabled={busy || !supabase || !ready || (reset && !hasSession)}
              >
                {!reset && (
                  <label htmlFor="auth-email">
                    Correo electrónico
                    <input
                      id="auth-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="vos@ejemplo.com"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </label>
                )}
                {(reset || mode === "password") && (
                  <label htmlFor="auth-password">
                    {reset ? "Nueva contraseña" : "Contraseña"}
                    <span className="password-input">
                      <input
                        id="auth-password"
                        name="password"
                        type={visible ? "text" : "password"}
                        autoComplete={
                          reset ? "new-password" : "current-password"
                        }
                        minLength={reset ? 8 : undefined}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          reset ? "Al menos 8 caracteres" : "Tu contraseña"
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={
                          visible ? "Ocultar contraseña" : "Mostrar contraseña"
                        }
                        aria-pressed={visible}
                        onClick={() => setVisible((v) => !v)}
                      >
                        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </span>
                  </label>
                )}
                {reset && (
                  <label htmlFor="auth-confirm">
                    Repetí la nueva contraseña
                    <input
                      id="auth-confirm"
                      name="confirm"
                      type={visible ? "text" : "password"}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                    />
                  </label>
                )}
                {!reset && mode === "password" && (
                  <button
                    type="button"
                    className="auth-forgot text-button"
                    onClick={() => switchMode("recovery")}
                  >
                    Olvidé mi contraseña
                  </button>
                )}
                {!reset && mode === "magic" && (
                  <p className="auth-hint">
                    Recibí un enlace para ingresar sin contraseña. Si es tu
                    primera vez, crearemos tu cuenta.
                  </p>
                )}
                <button className="primary auth-submit" type="submit">
                  {busy
                    ? "Un momento…"
                    : reset
                      ? "Guardar nueva contraseña"
                      : mode === "password"
                        ? "Ingresar"
                        : mode === "magic"
                          ? "Enviar enlace mágico"
                          : "Enviar enlace de recuperación"}
                  {!busy && <ArrowRight size={17} />}
                </button>
              </fieldset>
            </form>
          )}
          {!reset && mode === "password" && (
            <p className="auth-hint auth-first-time">
              ¿Todavía no tenés contraseña?{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => switchMode("magic")}
              >
                Ingresá con un enlace mágico.
              </button>
            </p>
          )}
          {!reset && mode === "recovery" && (
            <button
              className="text-button auth-back"
              disabled={busy}
              onClick={() => switchMode("password")}
            >
              Volver al inicio de sesión
            </button>
          )}
          {reset && (
            <Link className="text-button auth-back" href="/login">
              Volver al inicio de sesión
            </Link>
          )}
          {!reset && (
            <div className="auth-demo">
              <span>¿Querés conocer Finplan?</span>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  sessionStorage.setItem("finplan-demo", "1");
                  router.replace("/");
                }}
              >
                Explorar la demo <ArrowRight size={14} />
              </button>
            </div>
          )}
        </div>
        <small className="auth-private">
          <ShieldCheck size={14} />
          Tu planificación, en tu espacio personal.
        </small>
      </section>
    </main>
  );
}
