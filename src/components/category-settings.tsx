"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, Check, X } from "lucide-react";
import {
  Data,
  changeCategory,
  paymentCategories,
  protectedCategories,
} from "@/lib/finance";

export default function CategorySettings({
  data,
  update,
}: {
  data: Data;
  update: (data: Data) => void;
}) {
  const [name, setName] = useState(""),
    [editing, setEditing] = useState<string | null>(null),
    [draft, setDraft] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const categories = paymentCategories(data);
  function commit(action: () => Data, message: string) {
    try {
      update(action());
      setError("");
      setNotice(message);
      setEditing(null);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudo guardar la categoría.",
      );
    }
  }
  return (
    <section className="panel settings-panel section-space category-settings">
      <h3>Categorías</h3>
      <p>
        Organizá tus pagos con tus propias categorías. Al renombrar una, se
        actualiza su nombre en los pagos existentes.
      </p>
      <form
        className="category-create"
        onSubmit={(e) => {
          e.preventDefault();
          const value = name.trim();
          if (!value) {
            setError("Ingresá un nombre.");
            return;
          }
          if (
            value.toLocaleLowerCase("es") === "ingreso" ||
            categories.some(
              (c) =>
                c.toLocaleLowerCase("es") === value.toLocaleLowerCase("es"),
            )
          ) {
            setError("Ya existe una categoría con ese nombre.");
            return;
          }
          update({ ...data, categories: [...categories, value] });
          setName("");
          setError("");
          setNotice("Categoría creada.");
        }}
      >
        <input
          aria-label="Nombre de la nueva categoría"
          placeholder="Ej. Salud, Educación, Mascotas…"
          required
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button className="primary">
          <Plus size={16} />
          Agregar categoría
        </button>
      </form>
      {error && (
        <p role="alert" className="category-error">
          {error}
        </p>
      )}
      {notice && !error && <p role="status">{notice}</p>}
      <ul className="category-list">
        {categories.map((c) => (
          <li key={c}>
            {editing === c ? (
              <form
                className="category-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!draft.trim()) {
                    setError("Ingresá un nombre.");
                    return;
                  }
                  commit(
                    () => changeCategory(data, c, draft),
                    "Categoría actualizada.",
                  );
                }}
              >
                <input
                  aria-label="Nuevo nombre de categoría"
                  autoFocus
                  required
                  maxLength={40}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button className="icon-button" aria-label="Guardar categoría">
                  <Check size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Cancelar edición"
                  onClick={() => setEditing(null)}
                >
                  <X size={17} />
                </button>
              </form>
            ) : (
              <>
                <span>{c}</span>
                {protectedCategories.includes(c) ? (
                  <small>Categoría del sistema</small>
                ) : (
                  <div className="row-actions">
                    <button
                      className="icon-button"
                      aria-label={`Renombrar ${c}`}
                      onClick={() => {
                        setEditing(c);
                        setDraft(c);
                        setError("");
                        setNotice("");
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Eliminar ${c}`}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Eliminar “${c}”? Los pagos que la utilizan pasarán a “Otros”, conservando sus montos y estados.`,
                          )
                        )
                          commit(
                            () => changeCategory(data, c),
                            "Categoría eliminada. Sus pagos se conservaron en Otros.",
                          );
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </>
            )}
          </li>
        ))}
      </ul>
      <p className="category-help">
        Tarjetas, Préstamos y Otros se mantienen para organizar los subtotales
        de tu proyección.
      </p>
    </section>
  );
}
