import AuthScreen from "@/components/auth-screen";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Restablecer contraseña",
  robots: { index: false, follow: false },
};
export default function ResetPasswordPage() {
  return <AuthScreen reset />;
}
