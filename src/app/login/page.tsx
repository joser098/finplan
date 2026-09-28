import AuthScreen from "@/components/auth-screen";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Iniciar sesión",
  description:
    "Ingresá a Finplan con tu correo y contraseña o con un enlace mágico.",
};
export default function LoginPage() {
  return <AuthScreen />;
}
