import Link from "next/link";
import { TrendingUp, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <span className="brand-symbol">
        <TrendingUp size={26} />
      </span>
      <span className="eyebrow">FINPLAN · 404</span>
      <h1>Esta página no está en el plan.</h1>
      <p>
        El enlace puede haber cambiado. Volvé a tu espacio para seguir
        planificando.
      </p>
      <Link className="primary" href="/">
        <ArrowLeft size={16} />
        Volver a Finplan
      </Link>
    </main>
  );
}
