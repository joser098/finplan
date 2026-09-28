export function authError(error: { message?: string; code?: string }) {
  const code = error.code,
    message = error.message?.toLowerCase() ?? "";
  if (code === "invalid_credentials" || message.includes("invalid login"))
    return "El correo o la contraseña no son correctos.";
  if (code === "email_not_confirmed")
    return "Confirmá tu correo antes de ingresar. Revisá tu bandeja de entrada.";
  if (
    code === "over_email_send_rate_limit" ||
    code === "over_request_rate_limit" ||
    message.includes("rate limit") ||
    message.includes("seconds")
  )
    return "Esperá un momento antes de volver a intentarlo.";
  if (
    code === "otp_expired" ||
    message.includes("expired") ||
    message.includes("invalid token")
  )
    return "El enlace venció o ya fue utilizado. Solicitá uno nuevo.";
  if (
    code === "weak_password" ||
    code === "same_password" ||
    message.includes("password")
  )
    return code === "same_password"
      ? "Elegí una contraseña diferente a la anterior."
      : "La contraseña no cumple los requisitos de seguridad de tu cuenta. Usá al menos 8 caracteres, con letras, números y símbolos.";
  if (message.includes("fetch") || message.includes("network"))
    return "No pudimos conectarnos. Revisá tu conexión e intentá nuevamente.";
  return "No pudimos completar la solicitud. Intentá nuevamente en unos minutos.";
}
