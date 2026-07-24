import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Package,
  Truck,
  Users,
  FileText,
  Calculator,
  Layers,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Trash2,
  Plus,
  Boxes,
  Loader2,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Home,
  Pencil,
  Check,
  X,
  Printer,
  RefreshCw,
} from "lucide-react";

const STORAGE_KEY = "almacen-db";

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
.spin { animation: girar 0.8s linear infinite; }
@keyframes girar { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

const DB_VACIA = { articulos: [], proveedores: [], clientes: [], facturas: [], presupuestos: [], varios: [], config: { iva: 21 } };

function hoy() {
  return new Date().toISOString().slice(0, 10);
}
function formatFecha(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatearTextoPresupuesto(p) {
  const col = (t, n) => String(t).padEnd(n).slice(0, n);
  const lineas = [];
  lineas.push(`PRESUPUESTO ${p.numero || ""}`);
  lineas.push(`Fecha: ${formatFecha(p.fecha)}`);
  if (p.validoHasta) lineas.push(`Valido hasta: ${formatFecha(p.validoHasta)}`);
  lineas.push(`Estado: ${(p.estado || "").toUpperCase()}`);
  if (p.cliente) lineas.push(`Cliente: ${p.cliente}`);
  lineas.push("");
  lineas.push(col("Articulo", 30) + col("Cant.", 8) + col("Precio", 10) + "Subtotal");
  lineas.push("-".repeat(60));
  let total = 0;
  for (const it of p.items) {
    const subtotal = it.cantidad * (it.precio || 0);
    total += subtotal;
    lineas.push(col(it.articulo, 30) + col(it.cantidad, 8) + col(`$${(it.precio || 0).toFixed(2)}`, 10) + `$${subtotal.toFixed(2)}`);
  }
  lineas.push("-".repeat(60));
  lineas.push(`TOTAL: $${total.toFixed(2)}`);
  if (p.notas) {
    lineas.push("");
    lineas.push(`Notas: ${p.notas}`);
  }
  return lineas.join("\n");
}

async function copiarAlPortapapeles(texto, textareaEl) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (e) {
    // seguimos con el respaldo
  }
  try {
    if (textareaEl) {
      textareaEl.select();
      document.execCommand("copy");
      return true;
    }
  } catch (e) {
    // sin soporte
  }
  return false;
}
function aLatin1(str) {
  const mapa = { "–": "-", "—": "-", "’": "'", "‘": "'", "“": '"', "”": '"', "…": "..." };
  return String(str ?? "")
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 256) return ch;
      return mapa[ch] || "?";
    })
    .join("");
}

function escaparTextoPDF(str) {
  return aLatin1(str).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function envolverTexto(texto, maxChars) {
  const palabras = String(texto ?? "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = "";
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (prueba.length > maxChars && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = prueba;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Construye un PDF válido a mano (sin librerías externas) a partir de páginas de comandos de texto/línea.
function construirPDF(paginas) {
  const idCatalog = 1;
  const idPages = 2;
  const idFontNormal = 3;
  const idFontBold = 4;
  let nextId = 5;
  const paginaIds = [];
  const contenidoIds = [];
  for (let i = 0; i < paginas.length; i++) {
    paginaIds.push(nextId++);
    contenidoIds.push(nextId++);
  }

  let pdf = "%PDF-1.4\n";
  const offsets = {};
  function agregar(id, contenido) {
    offsets[id] = pdf.length;
    pdf += `${id} 0 obj\n${contenido}\nendobj\n`;
  }

  agregar(idCatalog, `<< /Type /Catalog /Pages ${idPages} 0 R >>`);
  agregar(idPages, `<< /Type /Pages /Kids [${paginaIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${paginas.length} >>`);
  agregar(idFontNormal, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);
  agregar(idFontBold, `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

  paginas.forEach((comandos, i) => {
    let cmds = "";
    for (const c of comandos) {
      if (c.tipo === "linea") {
        cmds += `0.8 w\n${c.x1.toFixed(2)} ${c.y.toFixed(2)} m\n${c.x2.toFixed(2)} ${c.y.toFixed(2)} l\nS\n`;
      } else {
        const fuente = c.negrita ? "F2" : "F1";
        const tam = c.tamano || 11;
        cmds += `BT\n/${fuente} ${tam} Tf\n1 0 0 1 ${c.x.toFixed(2)} ${c.y.toFixed(2)} Tm\n(${escaparTextoPDF(c.texto)}) Tj\nET\n`;
      }
    }
    agregar(contenidoIds[i], `<< /Length ${cmds.length} >>\nstream\n${cmds}endstream`);
    agregar(
      paginaIds[i],
      `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${idFontNormal} 0 R /F2 ${idFontBold} 0 R >> >> /Contents ${contenidoIds[i]} 0 R >>`
    );
  });

  const totalObjs = nextId;
  const xrefStart = pdf.length;
  let xref = `xref\n0 ${totalObjs}\n0000000000 65535 f \n`;
  for (let id = 1; id < totalObjs; id++) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += xref;
  pdf += `trailer\n<< /Size ${totalObjs} /Root ${idCatalog} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

function descargarPDFBytes(bytes, nombreArchivo) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const COLORES = {
  articulos: "#22252A",
  proveedores: "#3E6D9C",
  clientes: "#6B4C9A",
  facturas: "#B0451F",
  presupuestos: "#B08900",
  varios: "#6B6858",
  backup: "#2E6B6B",
};

// ---------- estilos compartidos ----------
const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  padding: "9px 10px",
  border: "1px solid #C9C6BA",
  fontFamily: "'Inter', sans-serif",
  fontSize: 14,
  background: "#FDFCF9",
  color: "#22252A",
  outline: "none",
};
const sectionTitleStyle = {
  fontFamily: "'Archivo Black', sans-serif",
  fontSize: 15,
  letterSpacing: "0.5px",
  marginBottom: 12,
  color: "#22252A",
};

function Campo({ label, children }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 11, letterSpacing: "0.5px", color: "#6B6858", marginBottom: 4, fontWeight: 600 }}>
        {label.toUpperCase()}
      </span>
      {children}
    </label>
  );
}

function EmptyState({ texto }) {
  return (
    <div style={{ background: "#FFFFFF", border: "1px dashed #C9C6BA", padding: "28px 16px", textAlign: "center", color: "#6B6858", fontSize: 14 }}>
      {texto}
    </div>
  );
}

function SelectorBuscable({ value, onChange, opciones, placeholder }) {
  const [query, setQuery] = useState(value || "");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQuery(value || "");
  }, [value]);

  const filtradas = opciones.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  return (
    <div style={{ position: "relative" }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#6B6858" }} />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          style={{ ...inputStyle, paddingLeft: 28 }}
        />
      </div>
      {open && filtradas.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 2px)",
            left: 0,
            right: 0,
            background: "#FFFFFF",
            border: "1px solid #C9C6BA",
            zIndex: 30,
            maxHeight: 180,
            overflowY: "auto",
            boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
          }}
        >
          {filtradas.map((o) => (
            <div
              key={o}
              onMouseDown={() => {
                onChange(o);
                setQuery(o);
                setOpen(false);
              }}
              style={{ padding: "9px 10px", fontSize: 13, cursor: "pointer" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#F2F0E8")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              {o}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BotonPrimario({ children, color = "#F5B700", textColor = "#22252A", disabled, ...props }) {
  return (
    <button
      disabled={disabled}
      {...props}
      style={{
        padding: "11px 16px",
        background: color,
        border: "none",
        color: textColor,
        fontFamily: "'Inter', sans-serif",
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: "0.3px",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.7 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        ...(props.style || {}),
      }}
    >
      {children}
    </button>
  );
}

function EncabezadoModulo({ titulo, subtitulo, color, icon: Icon, onVolver }) {
  return (
    <header style={{ background: "#22252A", color: "#E7E4DA", padding: "22px 24px", borderBottom: `6px solid ${color}` }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        <button
          onClick={onVolver}
          style={{
            background: "none",
            border: "none",
            color: "#B9B6A9",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontFamily: "'Inter', sans-serif",
            fontWeight: 600,
            padding: 0,
            marginBottom: 14,
          }}
        >
          <ArrowLeft size={14} /> INICIO
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 44, height: 44, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Icon size={22} color="#FFFFFF" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 22, margin: 0, lineHeight: 1.1 }}>{titulo}</h1>
            {subtitulo && (
              <p style={{ margin: "4px 0 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, color: "#B9B6A9" }}>{subtitulo}</p>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

// ---------- contenido reutilizable de listas simples (sin encabezado propio) ----------
function ContenidoListaSimple({ color, campos, items, onAdd, onDelete, onUpdate, renderExtra }) {
  const vacio = Object.fromEntries(campos.map((c) => [c.key, ""]));
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [editForm, setEditForm] = useState(vacio);
  const [errorEdit, setErrorEdit] = useState("");

  function handleSubmit(e) {
    e.preventDefault();
    const req = campos.filter((c) => c.requerido);
    for (const c of req) {
      if (!form[c.key] || !form[c.key].toString().trim()) {
        setError(`El campo "${c.label}" es obligatorio.`);
        return;
      }
    }
    setError("");
    onAdd({ id: uid(), ...form });
    setForm(vacio);
  }

  function iniciarEdicion(it) {
    setEditandoId(it.id);
    setEditForm(Object.fromEntries(campos.map((c) => [c.key, it[c.key] || ""])));
    setErrorEdit("");
  }

  function cancelarEdicion() {
    setEditandoId(null);
    setErrorEdit("");
  }

  function guardarEdicion(id) {
    const req = campos.filter((c) => c.requerido);
    for (const c of req) {
      if (!editForm[c.key] || !editForm[c.key].toString().trim()) {
        setErrorEdit(`El campo "${c.label}" es obligatorio.`);
        return;
      }
    }
    onUpdate(id, editForm);
    setEditandoId(null);
    setErrorEdit("");
  }

  const filtrados = useMemo(() => {
    if (!busqueda) return items;
    const q = busqueda.toLowerCase();
    return items.filter((it) => campos.some((c) => (it[c.key] || "").toString().toLowerCase().includes(q)));
  }, [items, busqueda, campos]);

  return (
    <>
      <form onSubmit={handleSubmit} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${color}`, padding: 20, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(campos.length, 3)}, 1fr)`, gap: 12, marginBottom: error ? 12 : 0 }}>
          {campos.map((c) => (
            <Campo label={c.label} key={c.key}>
              <input
                value={form[c.key]}
                onChange={(e) => setForm((f) => ({ ...f, [c.key]: e.target.value }))}
                placeholder={c.placeholder || ""}
                style={inputStyle}
              />
            </Campo>
          ))}
        </div>
        {error && <p style={{ color: "#C1440E", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
        <BotonPrimario type="submit" style={{ marginTop: 16, width: "100%" }}>
          <Plus size={16} /> AGREGAR
        </BotonPrimario>
      </form>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>REGISTROS ({items.length})</h2>
        <div style={{ position: "relative" }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#6B6858" }} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" style={{ ...inputStyle, paddingLeft: 28, width: 180 }} />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState texto="No hay registros todavía." />
      ) : (
        <div style={{ background: "#FFFFFF", border: "1px solid #C9C6BA" }}>
          {filtrados.map((it, i) => {
            const enEdicion = editandoId === it.id;
            return (
              <div key={it.id} style={{ padding: "12px 16px", borderTop: i === 0 ? "none" : "1px solid #EDEBE3" }}>
                {enEdicion ? (
                  <div>
                    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(campos.length, 3)}, 1fr)`, gap: 10, marginBottom: errorEdit ? 8 : 10 }}>
                      {campos.map((c) => (
                        <Campo label={c.label} key={c.key}>
                          <input
                            value={editForm[c.key]}
                            onChange={(e) => setEditForm((f) => ({ ...f, [c.key]: e.target.value }))}
                            placeholder={c.placeholder || ""}
                            style={inputStyle}
                          />
                        </Campo>
                      ))}
                    </div>
                    {errorEdit && <p style={{ color: "#C1440E", fontSize: 13, margin: "0 0 8px" }}>{errorEdit}</p>}
                    <div style={{ display: "flex", gap: 8 }}>
                      <BotonPrimario onClick={() => guardarEdicion(it.id)} color="#2F6F4E" textColor="#FFFFFF" style={{ padding: "8px 14px" }}>
                        <Check size={15} /> GUARDAR
                      </BotonPrimario>
                      <button
                        onClick={cancelarEdicion}
                        style={{ padding: "8px 14px", background: "none", border: "1px solid #C9C6BA", color: "#6B6858", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                      >
                        <X size={15} /> CANCELAR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 13 }}>
                      {campos.map((c, idx) => (
                        <span key={c.key} style={{ fontWeight: idx === 0 ? 700 : 400 }}>
                          {idx === 0 ? it[c.key] : it[c.key] ? `${c.label}: ${it[c.key]}` : null}
                        </span>
                      ))}
                      {renderExtra && renderExtra(it)}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {onUpdate && (
                        <button
                          onClick={() => iniciarEdicion(it)}
                          title="Editar"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4 }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "#22252A")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}
                        >
                          <Pencil size={16} />
                        </button>
                      )}
                      <button
                        onClick={() => onDelete(it.id)}
                        title="Eliminar"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4 }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = "#C1440E")}
                        onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---------- módulo genérico: listas simples con su propio encabezado (Varios) ----------
function ModuloListaSimple({ titulo, subtitulo, color, icon, campos, items, onAdd, onDelete, onUpdate, onVolver, renderExtra }) {
  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo={titulo} subtitulo={subtitulo} color={color} icon={icon} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <ContenidoListaSimple color={color} campos={campos} items={items} onAdd={onAdd} onDelete={onDelete} onUpdate={onUpdate} renderExtra={renderExtra} />
      </main>
    </div>
  );
}

function tabBtnStyle(activo, color) {
  return {
    flex: 1,
    padding: "10px 14px",
    border: `1px solid ${color}`,
    background: activo ? color : "transparent",
    color: activo ? "#FFFFFF" : color,
    fontFamily: "'Inter', sans-serif",
    fontWeight: 700,
    fontSize: 13,
    letterSpacing: "0.3px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  };
}

// ---------- módulo combinado: Proveedores y Clientes ----------
function ModuloContactos({ proveedores, clientes, onAddProveedor, onDeleteProveedor, onUpdateProveedor, onAddCliente, onDeleteCliente, onUpdateCliente, onVolver }) {
  const [tab, setTab] = useState("proveedores");
  const esProveedores = tab === "proveedores";
  const color = esProveedores ? COLORES.proveedores : COLORES.clientes;

  const campos = [
    { key: "nombre", label: "Nombre", requerido: true, placeholder: esProveedores ? "Ej. Ferretería Central" : "Ej. Constructora ABC" },
    { key: "contacto", label: "Contacto", placeholder: "Persona de contacto" },
    { key: "telefono", label: "Teléfono", placeholder: "Ej. 555-1234" },
    { key: "email", label: "Email", placeholder: "correo@ejemplo.com" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="PROVEEDORES Y CLIENTES" subtitulo="DIRECTORIO DE CONTACTOS" color={color} icon={esProveedores ? Truck : Users} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setTab("proveedores")} style={tabBtnStyle(esProveedores, COLORES.proveedores)}>
            <Truck size={15} /> PROVEEDORES ({proveedores.length})
          </button>
          <button onClick={() => setTab("clientes")} style={tabBtnStyle(!esProveedores, COLORES.clientes)}>
            <Users size={15} /> CLIENTES ({clientes.length})
          </button>
        </div>

        {esProveedores ? (
          <ContenidoListaSimple
            key="proveedores"
            color={color}
            campos={campos}
            items={proveedores}
            onAdd={onAddProveedor}
            onDelete={onDeleteProveedor}
            onUpdate={onUpdateProveedor}
          />
        ) : (
          <ContenidoListaSimple
            key="clientes"
            color={color}
            campos={campos}
            items={clientes}
            onAdd={onAddCliente}
            onDelete={onDeleteCliente}
            onUpdate={onUpdateCliente}
          />
        )}
      </main>
    </div>
  );
}

// ---------- módulo Obra (antes Varios) con control de IVA ----------
function ModuloObra({ items, config, onAdd, onDelete, onUpdate, onUpdateIva, onVolver }) {
  const campos = [
    { key: "obra", label: "Obra", requerido: true, placeholder: "Ej. Mantenimiento montacargas" },
    { key: "contenido", label: "Detalle", placeholder: "Descripción" },
    { key: "fecha", label: "Fecha", placeholder: hoy() },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="OBRA" subtitulo="REGISTROS DE OBRA" color={COLORES.varios} icon={Layers} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6858", fontWeight: 600 }}>
            IVA %
            <input
              type="number"
              min="0"
              step="0.1"
              value={config?.iva ?? 21}
              onChange={(e) => onUpdateIva(Number(e.target.value))}
              style={{ ...inputStyle, width: 64, padding: "6px 8px" }}
            />
          </label>
        </div>
        <ContenidoListaSimple color={COLORES.varios} campos={campos} items={items} onAdd={onAdd} onDelete={onDelete} onUpdate={onUpdate} />
        <p style={{ fontSize: 11, color: "#6B6858", marginTop: 10 }}>
          El porcentaje de IVA definido aquí se usa para calcular la columna "Con IVA" en Artículos.
        </p>
      </main>
    </div>
  );
}
function ModuloArticulos({ articulos, facturas, config, onAdd, onDelete, onVolver }) {
  const [form, setForm] = useState({ referencia: "", descripcion: "" });
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const iva = Number(config?.iva ?? 21);

  // datos de compra por artículo: stock, última compra (por fecha) y precio medio ponderado por cantidad
  const datosCompra = useMemo(() => {
    const map = {};
    for (const fac of facturas) {
      for (const it of fac.items) {
        const ref = it.articulo;
        if (!map[ref]) map[ref] = { stock: 0, sumaImporte: 0, sumaCantidadCompra: 0, ultima: null };
        const d = map[ref];
        d.stock += fac.tipo === "compra" ? Number(it.cantidad) : -Number(it.cantidad);
        if (fac.tipo === "compra") {
          d.sumaImporte += Number(it.cantidad) * Number(it.precio || 0);
          d.sumaCantidadCompra += Number(it.cantidad);
          const clave = `${fac.fecha}-${fac.timestamp || 0}`;
          if (!d.ultima || clave > d.ultima.clave) d.ultima = { clave, precio: Number(it.precio || 0) };
        }
      }
    }
    return map;
  }, [facturas]);

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.referencia.trim()) return setError("Indica la referencia del artículo.");
    if (!form.descripcion.trim()) return setError("Indica la descripción del artículo.");
    const duplicada = articulos.some((a) => a.referencia.toLowerCase() === form.referencia.trim().toLowerCase());
    if (duplicada) return setError("Ya existe un artículo con esa referencia.");
    setError("");
    onAdd({ id: uid(), referencia: form.referencia.trim(), descripcion: form.descripcion.trim() });
    setForm({ referencia: "", descripcion: "" });
  }

  const filtrados = useMemo(() => {
    if (!busqueda) return articulos;
    const q = busqueda.toLowerCase();
    return articulos.filter((a) => a.referencia.toLowerCase().includes(q) || a.descripcion.toLowerCase().includes(q));
  }, [articulos, busqueda]);

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="ARTÍCULOS" subtitulo="MAESTRO DE PRODUCTOS DEL ALMACÉN" color={COLORES.articulos} icon={Package} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <form onSubmit={handleSubmit} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${COLORES.articulos}`, padding: 20, marginBottom: 24 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: error ? 12 : 0 }}>
            <Campo label="Referencia">
              <input value={form.referencia} onChange={(e) => setForm((f) => ({ ...f, referencia: e.target.value }))} placeholder="Ej. TOR-M8" style={inputStyle} />
            </Campo>
            <Campo label="Descripción">
              <input value={form.descripcion} onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))} placeholder="Ej. Tornillos M8 x 40mm" style={inputStyle} />
            </Campo>
          </div>
          {error && <p style={{ color: "#C1440E", fontSize: 13, margin: "12px 0 0" }}>{error}</p>}
          <BotonPrimario type="submit" style={{ marginTop: 16, width: "100%" }}>
            <Plus size={16} /> AGREGAR ARTÍCULO
          </BotonPrimario>
        </form>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>ARTÍCULOS ({articulos.length})</h2>
          <div style={{ position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#6B6858" }} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar" style={{ ...inputStyle, paddingLeft: 28, width: 160 }} />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <EmptyState texto="No hay artículos todavía." />
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", overflowX: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 0.8fr 1fr 1fr 1fr 0.4fr", gap: 8, padding: "10px 14px", background: "#F2F0E8", fontSize: 11, fontWeight: 700, letterSpacing: "0.4px", color: "#6B6858" }}>
              <span>REFERENCIA</span>
              <span>DESCRIPCIÓN</span>
              <span>STOCK</span>
              <span>ÚLT. COMPRA</span>
              <span>PRECIO MEDIO</span>
              <span>CON IVA</span>
              <span></span>
            </div>
            {filtrados.map((a, i) => {
              const d = datosCompra[a.referencia];
              const stock = d?.stock ?? 0;
              const ultimaCompra = d?.ultima ? d.ultima.precio : null;
              const precioMedio = d && d.sumaCantidadCompra > 0 ? d.sumaImporte / d.sumaCantidadCompra : null;
              const conIva = ultimaCompra != null ? ultimaCompra * (1 + iva / 100) : null;
              return (
                <div
                  key={a.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 2fr 0.8fr 1fr 1fr 1fr 0.4fr",
                    gap: 8,
                    alignItems: "center",
                    padding: "10px 14px",
                    borderTop: i === 0 ? "none" : "1px solid #EDEBE3",
                    fontSize: 13,
                  }}
                >
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{a.referencia}</span>
                  <span>{a.descripcion}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: stock < 0 ? "#C1440E" : "#22252A" }}>{stock} u.</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{ultimaCompra != null ? `$${ultimaCompra.toFixed(2)}` : "—"}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{precioMedio != null ? `$${precioMedio.toFixed(2)}` : "—"}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600 }}>{conIva != null ? `$${conIva.toFixed(2)}` : "—"}</span>
                  <button
                    onClick={() => onDelete(a.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4, justifySelf: "end" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#C1440E")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <p style={{ fontSize: 11, color: "#6B6858", marginTop: 10 }}>
          Los precios se calculan a partir de los artículos registrados en facturas de compra. "Con IVA" aplica el {iva}% sobre el precio de última compra.
        </p>
      </main>
    </div>
  );
}

// ---------- módulo Facturas (compras y ventas) ----------
function ModuloFacturas({ facturas, articulos, proveedores, clientes, obras, onAdd, onDelete, onVolver }) {
  const itemVacio = () => ({ id: uid(), articulo: "", cantidad: "", precio: "", obra: "" });
  const initial = { numero: "", tipo: "compra", entidad: "", fecha: hoy(), notas: "", items: [itemVacio()] };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todas");
  const [busqueda, setBusqueda] = useState("");
  const [expandidas, setExpandidas] = useState({});

  const entidades = form.tipo === "compra" ? proveedores : clientes;

  function actualizarItem(id, campo, valor) {
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)) }));
  }
  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, itemVacio()] }));
  }
  function quitarItem(id) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((it) => it.id !== id) : f.items }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.numero.trim()) return setError("Indica el número de factura.");
    const duplicada = facturas.some((f) => f.numero.toLowerCase() === form.numero.trim().toLowerCase() && f.tipo === form.tipo);
    if (duplicada) return setError(`Ya existe una factura de ${form.tipo} con ese número.`);
    const itemsValidos = form.items
      .map((it) => ({ articulo: it.articulo.trim(), cantidad: Number(it.cantidad), precio: Number(it.precio) || 0, obra: it.obra.trim() }))
      .filter((it) => it.articulo && it.cantidad > 0);
    if (itemsValidos.length === 0) return setError("Agrega al menos un artículo con cantidad válida.");
    setError("");
    onAdd({
      id: uid(),
      numero: form.numero.trim(),
      tipo: form.tipo,
      entidad: form.entidad.trim(),
      fecha: form.fecha || hoy(),
      notas: form.notas.trim(),
      items: itemsValidos,
      timestamp: Date.now(),
    });
    setForm({ ...initial, fecha: hoy(), items: [itemVacio()] });
  }

  const listaFiltrada = useMemo(() => {
    return facturas.filter((f) => {
      if (filtroTipo !== "todas" && f.tipo !== filtroTipo) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const m1 = f.numero.toLowerCase().includes(q);
        const m2 = f.entidad.toLowerCase().includes(q);
        const m3 = f.items.some((it) => it.articulo.toLowerCase().includes(q));
        if (!m1 && !m2 && !m3) return false;
      }
      return true;
    });
  }, [facturas, filtroTipo, busqueda]);

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="FACTURAS" subtitulo="COMPRAS (ENTRADA) Y VENTAS (SALIDA)" color={COLORES.facturas} icon={FileText} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <form onSubmit={handleSubmit} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${form.tipo === "compra" ? "#2F6F4E" : "#C1440E"}`, padding: 20, marginBottom: 28 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button type="button" onClick={() => setForm((f) => ({ ...f, tipo: "compra", entidad: "" }))} style={tipoBtnStyle(form.tipo === "compra", "#2F6F4E")}>
              <ArrowDownCircle size={16} /> COMPRA (ENTRADA)
            </button>
            <button type="button" onClick={() => setForm((f) => ({ ...f, tipo: "venta", entidad: "" }))} style={tipoBtnStyle(form.tipo === "venta", "#C1440E")}>
              <ArrowUpCircle size={16} /> VENTA (SALIDA)
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Campo label="N.º de factura">
              <input value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} placeholder="Ej. F-2026-0143" style={inputStyle} />
            </Campo>
            <Campo label="Fecha">
              <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} style={inputStyle} />
            </Campo>
          </div>

          <div style={{ marginBottom: 16 }}>
            <Campo label={form.tipo === "compra" ? "Proveedor" : "Cliente"}>
              <SelectorBuscable
                value={form.entidad}
                onChange={(v) => setForm((f) => ({ ...f, entidad: v }))}
                opciones={entidades.map((en) => en.nombre)}
                placeholder={form.tipo === "compra" ? "Buscar proveedor..." : "Buscar cliente..."}
              />
            </Campo>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 11, letterSpacing: "0.5px", color: "#6B6858", marginBottom: 8, fontWeight: 600 }}>ARTÍCULOS</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.items.map((it, idx) => (
                <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {articulos.length > 0 ? (
                    <select value={it.articulo} onChange={(e) => actualizarItem(it.id, "articulo", e.target.value)} style={{ ...inputStyle, flex: "2 1 160px", cursor: "pointer" }}>
                      <option value="">Artículo...</option>
                      {articulos.map((a) => (
                        <option key={a.id} value={a.referencia}>{a.referencia} — {a.descripcion}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={it.articulo} onChange={(e) => actualizarItem(it.id, "articulo", e.target.value)} placeholder={`Referencia ${idx + 1}`} style={{ ...inputStyle, flex: "2 1 160px" }} />
                  )}
                  <input type="number" min="1" value={it.cantidad} onChange={(e) => actualizarItem(it.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...inputStyle, flex: "1 1 70px" }} />
                  <input type="number" min="0" step="0.01" value={it.precio} onChange={(e) => actualizarItem(it.id, "precio", e.target.value)} placeholder="Precio" style={{ ...inputStyle, flex: "1 1 80px" }} />
                  <select
                    value={it.obra}
                    onChange={(e) => actualizarItem(it.id, "obra", e.target.value)}
                    disabled={!obras || obras.length === 0}
                    style={{ ...inputStyle, flex: "1 1 120px", cursor: obras && obras.length > 0 ? "pointer" : "default", opacity: obras && obras.length > 0 ? 1 : 0.6 }}
                  >
                    <option value="">{obras && obras.length > 0 ? "Obra..." : "Sin obras creadas"}</option>
                    {(obras || []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => quitarItem(it.id)} disabled={form.items.length === 1} style={{ background: "none", border: "none", cursor: form.items.length === 1 ? "default" : "pointer", color: form.items.length === 1 ? "#D9D6CA" : "#B9B6A9", flexShrink: 0 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={agregarItem} style={{ marginTop: 10, background: "none", border: "1px dashed #C9C6BA", color: "#22252A", padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> AGREGAR ARTÍCULO
            </button>
            {(!obras || obras.length === 0) && (
              <p style={{ fontSize: 11, color: "#6B6858", marginTop: 8, marginBottom: 0 }}>
                Todavía no hay obras creadas. Ve a la página "Obra" para crear al menos una y poder asignarla aquí.
              </p>
            )}
          </div>

          <Campo label="Notas">
            <input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Observaciones opcionales" style={inputStyle} />
          </Campo>

          {error && <p style={{ color: "#C1440E", fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <BotonPrimario type="submit" style={{ marginTop: 16, width: "100%" }}>
            <FileText size={16} /> REGISTRAR FACTURA
          </BotonPrimario>
        </form>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>HISTORIAL ({facturas.length})</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "#6B6858" }} />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="N.º, entidad o artículo" style={{ ...inputStyle, paddingLeft: 28, width: 190 }} />
            </div>
            <select value={filtroTipo} onChange={(e) => setFiltroTipo(e.target.value)} style={{ ...inputStyle, width: 120, cursor: "pointer" }}>
              <option value="todas">Todas</option>
              <option value="compra">Compras</option>
              <option value="venta">Ventas</option>
            </select>
          </div>
        </div>

        {listaFiltrada.length === 0 ? (
          <EmptyState texto="No hay facturas que coincidan." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {listaFiltrada.map((fac) => {
              const abierta = !!expandidas[fac.id];
              const totalUnidades = fac.items.reduce((acc, it) => acc + it.cantidad, 0);
              const totalMonto = fac.items.reduce((acc, it) => acc + it.cantidad * (it.precio || 0), 0);
              return (
                <div key={fac.id} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `5px solid ${fac.tipo === "compra" ? "#2F6F4E" : "#C1440E"}` }}>
                  <div onClick={() => setExpandidas((e) => ({ ...e, [fac.id]: !e[fac.id] }))} style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, cursor: "pointer" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                        {fac.tipo === "compra" ? <ArrowDownCircle size={15} color="#2F6F4E" /> : <ArrowUpCircle size={15} color="#C1440E" />}
                        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>{fac.numero}</span>
                        <span style={{ fontSize: 12, color: "#6B6858" }}>
                          · {fac.items.length} art. · {totalUnidades} u. {totalMonto > 0 && `· $${totalMonto.toFixed(2)}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#6B6858", display: "flex", flexWrap: "wrap", gap: 10 }}>
                        <span>{formatFecha(fac.fecha)}</span>
                        {fac.entidad && <span>· {fac.entidad}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                      <button onClick={(e) => { e.stopPropagation(); onDelete(fac.id); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#C1440E")} onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}>
                        <Trash2 size={16} />
                      </button>
                      {abierta ? <ChevronUp size={18} color="#6B6858" /> : <ChevronDown size={18} color="#6B6858" />}
                    </div>
                  </div>
                  {abierta && (
                    <div style={{ borderTop: "1px solid #EDEBE3", padding: "10px 14px 14px" }}>
                      {fac.items.map((it, idx) => (
                        <div key={idx} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                          <span>{it.articulo}{it.obra && <span style={{ color: "#6B6858" }}> · {it.obra}</span>}</span>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                            {it.cantidad} u. {it.precio > 0 && `× $${it.precio}`}
                          </span>
                        </div>
                      ))}
                      {fac.notas && <div style={{ marginTop: 8, fontSize: 12, color: "#6B6858", fontStyle: "italic" }}>{fac.notas}</div>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- módulo Presupuestos ----------
function ModuloPresupuestos({ presupuestos, articulos, clientes, onAdd, onDelete, onVolver }) {
  const itemVacio = () => ({ id: uid(), articulo: "", cantidad: "", precio: "" });
  const initial = { numero: "", cliente: "", fecha: hoy(), validoHasta: "", estado: "pendiente", notas: "", items: [itemVacio()] };
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [generandoId, setGenerandoId] = useState(null);
  const [errorPdf, setErrorPdf] = useState("");
  const [previsualizacion, setPrevisualizacion] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const textareaRef = useRef(null);

  function manejarExportar(p) {
    setPrevisualizacion(p);
    setCopiado(false);
    // intento adicional de descarga directa del PDF; si el entorno lo bloquea, igual queda el texto para copiar abajo
    try {
      generarPDF(p);
    } catch (e) {
      // sin problema, el panel de texto sigue disponible
    }
  }

  async function handleCopiar() {
    const ok = await copiarAlPortapapeles(formatearTextoPresupuesto(previsualizacion), textareaRef.current);
    setCopiado(ok);
  }

  function generarPDF(p) {
    setErrorPdf("");
    setGenerandoId(p.id);
    try {
      const paginas = [];
      let cmds = [];
      let y = 792;

      const texto = (t, x, yy, opts = {}) => cmds.push({ tipo: "texto", texto: t, x, y: yy, tamano: opts.tamano || 11, negrita: !!opts.negrita });
      const linea = (x1, x2, yy) => cmds.push({ tipo: "linea", x1, x2, y: yy });
      const saltoPagina = () => {
        paginas.push(cmds);
        cmds = [];
        y = 792;
      };

      texto("PRESUPUESTO", 40, y, { tamano: 18, negrita: true });
      texto(p.numero || "", 40, y - 18, { tamano: 11 });
      texto(`Fecha: ${formatFecha(p.fecha)}`, 380, y, { tamano: 10 });
      if (p.validoHasta) texto(`Valido hasta: ${formatFecha(p.validoHasta)}`, 380, y - 12, { tamano: 10 });
      texto((p.estado || "").toUpperCase(), 380, y - 26, { tamano: 10, negrita: true });

      y -= 42;
      linea(40, 555, y);
      y -= 22;

      if (p.cliente) {
        texto("Cliente:", 40, y, { negrita: true });
        texto(p.cliente, 95, y);
        y -= 22;
      }

      texto("Articulo", 40, y, { negrita: true });
      texto("Cant.", 300, y, { negrita: true });
      texto("Precio", 370, y, { negrita: true });
      texto("Subtotal", 460, y, { negrita: true });
      y -= 6;
      linea(40, 555, y);
      y -= 18;

      let total = 0;
      for (const it of p.items) {
        const subtotal = it.cantidad * (it.precio || 0);
        total += subtotal;
        if (y < 60) saltoPagina();
        texto(String(it.articulo), 40, y);
        texto(String(it.cantidad), 300, y);
        texto(`$${(it.precio || 0).toFixed(2)}`, 370, y);
        texto(`$${subtotal.toFixed(2)}`, 460, y);
        y -= 18;
      }

      y -= 8;
      linea(370, 555, y);
      y -= 20;
      texto(`TOTAL: $${total.toFixed(2)}`, 370, y, { tamano: 13, negrita: true });

      if (p.notas) {
        y -= 34;
        if (y < 80) saltoPagina();
        texto("Notas:", 40, y, { negrita: true });
        y -= 16;
        for (const l of envolverTexto(p.notas, 95)) {
          if (y < 60) saltoPagina();
          texto(l, 40, y, { tamano: 10 });
          y -= 14;
        }
      }

      paginas.push(cmds);

      const bytes = construirPDF(paginas);
      descargarPDFBytes(bytes, `presupuesto-${(p.numero || "sin-numero").replace(/[^a-z0-9-]/gi, "_")}.pdf`);
    } catch (e) {
      setErrorPdf("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerandoId(null);
    }
  }

  function actualizarItem(id, campo, valor) {
    setForm((f) => ({ ...f, items: f.items.map((it) => (it.id === id ? { ...it, [campo]: valor } : it)) }));
  }
  function agregarItem() {
    setForm((f) => ({ ...f, items: [...f.items, itemVacio()] }));
  }
  function quitarItem(id) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((it) => it.id !== id) : f.items }));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!form.numero.trim()) return setError("Indica el número de presupuesto.");
    const itemsValidos = form.items
      .map((it) => ({ articulo: it.articulo.trim(), cantidad: Number(it.cantidad), precio: Number(it.precio) || 0 }))
      .filter((it) => it.articulo && it.cantidad > 0);
    if (itemsValidos.length === 0) return setError("Agrega al menos un artículo con cantidad válida.");
    setError("");
    onAdd({ id: uid(), ...form, items: itemsValidos, timestamp: Date.now() });
    setForm({ ...initial, fecha: hoy(), items: [itemVacio()] });
  }

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="PRESUPUESTOS" subtitulo="COTIZACIONES PARA CLIENTES" color={COLORES.presupuestos} icon={Calculator} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        {errorPdf && (
          <p style={{ color: "#C1440E", fontSize: 13, background: "#FFFFFF", border: "1px solid #C1440E", padding: "8px 12px", marginBottom: 16 }}>{errorPdf}</p>
        )}

        {previsualizacion && (
          <div style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${COLORES.presupuestos}`, padding: 20, marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h2 style={{ ...sectionTitleStyle, marginBottom: 0 }}>PRESUPUESTO {previsualizacion.numero}</h2>
              <button onClick={() => setPrevisualizacion(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6B6858" }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: 12, color: "#6B6858", marginBottom: 10 }}>
              Se intentó descargar el PDF automáticamente; si no ocurrió nada, selecciona el texto de abajo (o usa el botón) y pégalo donde lo necesites — por ejemplo en Word, y desde ahí guárdalo como PDF.
            </p>
            <textarea
              ref={textareaRef}
              readOnly
              value={formatearTextoPresupuesto(previsualizacion)}
              style={{ ...inputStyle, width: "100%", height: 260, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, resize: "vertical" }}
              onFocus={(e) => e.target.select()}
            />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <BotonPrimario type="button" onClick={handleCopiar} style={{ padding: "8px 14px" }}>
                <Check size={15} /> {copiado ? "¡COPIADO!" : "COPIAR TEXTO"}
              </BotonPrimario>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${COLORES.presupuestos}`, padding: 20, marginBottom: 28 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Campo label="N.º de presupuesto">
              <input value={form.numero} onChange={(e) => setForm((f) => ({ ...f, numero: e.target.value }))} placeholder="Ej. P-0021" style={inputStyle} />
            </Campo>
            <Campo label="Fecha">
              <input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} style={inputStyle} />
            </Campo>
            <Campo label="Válido hasta">
              <input type="date" value={form.validoHasta} onChange={(e) => setForm((f) => ({ ...f, validoHasta: e.target.value }))} style={inputStyle} />
            </Campo>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
            <Campo label="Cliente">
              <SelectorBuscable
                value={form.cliente}
                onChange={(v) => setForm((f) => ({ ...f, cliente: v }))}
                opciones={clientes.map((c) => c.nombre)}
                placeholder="Buscar cliente..."
              />
            </Campo>
            <Campo label="Estado">
              <select value={form.estado} onChange={(e) => setForm((f) => ({ ...f, estado: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                <option value="pendiente">Pendiente</option>
                <option value="aprobado">Aprobado</option>
                <option value="rechazado">Rechazado</option>
              </select>
            </Campo>
          </div>

          <div style={{ marginBottom: 12 }}>
            <span style={{ display: "block", fontSize: 11, letterSpacing: "0.5px", color: "#6B6858", marginBottom: 8, fontWeight: 600 }}>ARTÍCULOS COTIZADOS</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.items.map((it, idx) => (
                <div key={it.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {articulos.length > 0 ? (
                    <select value={it.articulo} onChange={(e) => actualizarItem(it.id, "articulo", e.target.value)} style={{ ...inputStyle, flex: 3, cursor: "pointer" }}>
                      <option value="">Artículo...</option>
                      {articulos.map((a) => (
                        <option key={a.id} value={a.referencia}>{a.referencia} — {a.descripcion}</option>
                      ))}
                    </select>
                  ) : (
                    <input value={it.articulo} onChange={(e) => actualizarItem(it.id, "articulo", e.target.value)} placeholder={`Referencia ${idx + 1}`} style={{ ...inputStyle, flex: 3 }} />
                  )}
                  <input type="number" min="1" value={it.cantidad} onChange={(e) => actualizarItem(it.id, "cantidad", e.target.value)} placeholder="Cant." style={{ ...inputStyle, flex: 1 }} />
                  <input type="number" min="0" step="0.01" value={it.precio} onChange={(e) => actualizarItem(it.id, "precio", e.target.value)} placeholder="Precio" style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => quitarItem(it.id)} disabled={form.items.length === 1} style={{ background: "none", border: "none", cursor: form.items.length === 1 ? "default" : "pointer", color: form.items.length === 1 ? "#D9D6CA" : "#B9B6A9", flexShrink: 0 }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <button type="button" onClick={agregarItem} style={{ marginTop: 10, background: "none", border: "1px dashed #C9C6BA", color: "#22252A", padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
              <Plus size={14} /> AGREGAR ARTÍCULO
            </button>
          </div>

          <Campo label="Notas">
            <input value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Condiciones u observaciones" style={inputStyle} />
          </Campo>

          {error && <p style={{ color: "#C1440E", fontSize: 13, marginTop: 12, marginBottom: 0 }}>{error}</p>}

          <BotonPrimario type="submit" style={{ marginTop: 16, width: "100%" }}>
            <Calculator size={16} /> GUARDAR PRESUPUESTO
          </BotonPrimario>
        </form>

        <h2 style={sectionTitleStyle}>PRESUPUESTOS ({presupuestos.length})</h2>
        {presupuestos.length === 0 ? (
          <EmptyState texto="No hay presupuestos todavía." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {presupuestos.map((p) => {
              const total = p.items.reduce((acc, it) => acc + it.cantidad * (it.precio || 0), 0);
              const colorEstado = p.estado === "aprobado" ? "#2F6F4E" : p.estado === "rechazado" ? "#C1440E" : "#B08900";
              return (
                <div key={p.id} style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `5px solid ${colorEstado}`, padding: "12px 14px", display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontWeight: 700, fontSize: 14 }}>{p.numero}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: colorEstado, textTransform: "uppercase" }}>{p.estado}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#6B6858", display: "flex", flexWrap: "wrap", gap: 10 }}>
                      <span>{formatFecha(p.fecha)}</span>
                      {p.cliente && <span>· {p.cliente}</span>}
                      {p.validoHasta && <span>· Válido hasta {formatFecha(p.validoHasta)}</span>}
                      <span>· Total ${total.toFixed(2)}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => manejarExportar(p)}
                      title="Ver / copiar / exportar"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4 }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#22252A")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}
                    >
                      <Printer size={16} />
                    </button>
                    <button onClick={() => onDelete(p.id)} title="Eliminar" style={{ background: "none", border: "none", cursor: "pointer", color: "#B9B6A9", padding: 4 }} onMouseEnter={(e) => (e.currentTarget.style.color = "#C1440E")} onMouseLeave={(e) => (e.currentTarget.style.color = "#B9B6A9")}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- pantalla de inicio ----------
// ---------- módulo Copia de seguridad (exportar/importar manual, sin la nube) ----------
function ModuloBackup({ db, onImportar, onVolver }) {
  const [pestana, setPestana] = useState("exportar");
  const [copiado, setCopiado] = useState(false);
  const [textoImportar, setTextoImportar] = useState("");
  const [error, setError] = useState("");
  const [pidiendoConfirmacion, setPidiendoConfirmacion] = useState(false);
  const textareaExportRef = useRef(null);

  const textoExportado = useMemo(() => JSON.stringify(db, null, 2), [db]);

  async function handleCopiar() {
    const ok = await copiarAlPortapapeles(textoExportado, textareaExportRef.current);
    setCopiado(ok);
  }

  function handlePedirImportar() {
    setError("");
    if (!textoImportar.trim()) {
      setError("Pega primero el texto de una copia de seguridad exportada antes.");
      return;
    }
    try {
      const parsed = JSON.parse(textoImportar);
      if (typeof parsed !== "object" || parsed === null) throw new Error("formato inválido");
      setPidiendoConfirmacion(true);
    } catch (e) {
      setError("Ese texto no es una copia de seguridad válida. Pega exactamente lo que copiaste con 'Exportar'.");
    }
  }

  function confirmarImportar() {
    try {
      const parsed = JSON.parse(textoImportar);
      onImportar(parsed);
      setPidiendoConfirmacion(false);
      setTextoImportar("");
      setPestana("exportar");
    } catch (e) {
      setError("No se pudo importar. Verifica el texto pegado.");
      setPidiendoConfirmacion(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <EncabezadoModulo titulo="COPIA DE SEGURIDAD" subtitulo="EXPORTAR E IMPORTAR TUS DATOS ENTRE DISPOSITIVOS" color={COLORES.backup} icon={RefreshCw} onVolver={onVolver} />
      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 64px" }}>
        <p style={{ fontSize: 13, color: "#6B6858", marginBottom: 20 }}>
          Esto reemplaza el guardado automático entre dispositivos: en el dispositivo con los datos más recientes, toca <strong>Exportar</strong> y copia el
          texto (por ejemplo, guárdalo en Notas o Archivos). Luego, en el otro dispositivo, ve a <strong>Importar</strong>, pega ese texto y confirma.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <button onClick={() => setPestana("exportar")} style={tabBtnStyle(pestana === "exportar", COLORES.backup)}>
            EXPORTAR
          </button>
          <button onClick={() => setPestana("importar")} style={tabBtnStyle(pestana === "importar", COLORES.backup)}>
            IMPORTAR
          </button>
        </div>

        {pestana === "exportar" ? (
          <div style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${COLORES.backup}`, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#6B6858", marginBottom: 10 }}>
              Selecciona todo el texto de abajo (o usa el botón) y guárdalo donde puedas volver a pegarlo en el otro dispositivo.
            </p>
            <textarea
              ref={textareaExportRef}
              readOnly
              value={textoExportado}
              style={{ ...inputStyle, width: "100%", height: 260, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, resize: "vertical" }}
              onFocus={(e) => e.target.select()}
            />
            <BotonPrimario type="button" onClick={handleCopiar} style={{ marginTop: 12 }}>
              <Check size={15} /> {copiado ? "¡COPIADO!" : "COPIAR TEXTO"}
            </BotonPrimario>
          </div>
        ) : (
          <div style={{ background: "#FFFFFF", border: "1px solid #C9C6BA", borderLeft: `6px solid ${COLORES.backup}`, padding: 20 }}>
            <p style={{ fontSize: 12, color: "#6B6858", marginBottom: 10 }}>
              Pega aquí el texto que copiaste con "Exportar" en el otro dispositivo. <strong>Esto reemplazará todos los datos actuales.</strong>
            </p>
            <textarea
              value={textoImportar}
              onChange={(e) => {
                setTextoImportar(e.target.value);
                setPidiendoConfirmacion(false);
              }}
              placeholder="Pega aquí el texto exportado..."
              style={{ ...inputStyle, width: "100%", height: 220, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, resize: "vertical" }}
            />
            {error && <p style={{ color: "#C1440E", fontSize: 13, marginTop: 10 }}>{error}</p>}

            {!pidiendoConfirmacion ? (
              <BotonPrimario type="button" onClick={handlePedirImportar} style={{ marginTop: 12 }}>
                CARGAR COPIA DE SEGURIDAD
              </BotonPrimario>
            ) : (
              <div style={{ marginTop: 12, background: "#FFF7E0", border: "1px solid #B08900", padding: 14 }}>
                <p style={{ fontSize: 13, marginBottom: 10 }}>
                  ¿Confirmas que quieres reemplazar todos los datos actuales por los del texto pegado? Esta acción no se puede deshacer.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <BotonPrimario type="button" onClick={confirmarImportar} color="#C1440E" textColor="#FFFFFF" style={{ padding: "8px 14px" }}>
                    SÍ, REEMPLAZAR
                  </BotonPrimario>
                  <button
                    onClick={() => setPidiendoConfirmacion(false)}
                    style={{ padding: "8px 14px", background: "none", border: "1px solid #C9C6BA", color: "#6B6858", fontFamily: "'Inter', sans-serif", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
                  >
                    CANCELAR
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Inicio({ db, onNavegar }) {
  const tarjetas = [
    { id: "articulos", titulo: "ARTÍCULOS", desc: "Maestro de productos", icon: Package, color: COLORES.articulos, count: db.articulos.length },
    { id: "contactos", titulo: "PROVEEDORES Y CLIENTES", desc: "Directorio de contactos", icon: Truck, color: COLORES.proveedores, count: db.proveedores.length + db.clientes.length },
    { id: "facturas", titulo: "FACTURAS", desc: "Compras y ventas", icon: FileText, color: COLORES.facturas, count: db.facturas.length },
    { id: "presupuestos", titulo: "PRESUPUESTOS", desc: "Cotizaciones a clientes", icon: Calculator, color: COLORES.presupuestos, count: db.presupuestos.length },
    { id: "varios", titulo: "OBRA", desc: "Registros de obra y configuración", icon: Layers, color: COLORES.varios, count: db.varios.length },
    { id: "backup", titulo: "COPIA DE SEGURIDAD", desc: "Exportar o importar tus datos", icon: RefreshCw, color: COLORES.backup, count: null },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#E7E4DA", fontFamily: "'Inter', sans-serif", color: "#22252A" }}>
      <style>{FONT_IMPORT}</style>
      <header style={{ background: "#22252A", color: "#E7E4DA", padding: "32px 24px", borderBottom: "6px solid #F5B700" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 56, height: 56, background: "#F5B700", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <Boxes size={30} color="#22252A" />
          </div>
          <div>
            <h1 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 28, letterSpacing: "0.5px", margin: 0, lineHeight: 1.1 }}>CONTROL DE ALMACÉN</h1>
            <p style={{ margin: "4px 0 0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13, color: "#B9B6A9" }}>PANEL PRINCIPAL</p>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 16px 64px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {tarjetas.map((t) => (
            <button
              key={t.id}
              onClick={() => onNavegar(t.id)}
              style={{
                background: "#FFFFFF",
                border: "1px solid #C9C6BA",
                borderTop: `5px solid ${t.color}`,
                padding: "22px 18px",
                textAlign: "left",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 14,
                transition: "transform 0.12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-2px)")}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "translateY(0)")}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ width: 40, height: 40, background: t.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <t.icon size={20} color="#FFFFFF" />
                </div>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 600, color: t.color }}>{t.count != null ? t.count : ""}</span>
              </div>
              <div>
                <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: 15, letterSpacing: "0.3px" }}>{t.titulo}</div>
                <div style={{ fontSize: 12, color: "#6B6858", marginTop: 2 }}>{t.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}

function tipoBtnStyle(activo, color) {
  return {
    flex: 1,
    padding: "10px 12px",
    border: `1px solid ${color}`,
    background: activo ? color : "transparent",
    color: activo ? "#FFFFFF" : color,
    fontFamily: "'Inter', sans-serif",
    fontWeight: 600,
    fontSize: 13,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  };
}

// ---------- app principal ----------
export default function App() {
  const [db, setDb] = useState(DB_VACIA);
  const [loading, setLoading] = useState(true);
  const [vista, setVista] = useState("inicio");

  useEffect(() => {
    try {
      const guardado = localStorage.getItem(STORAGE_KEY);
      if (guardado) setDb({ ...DB_VACIA, ...JSON.parse(guardado) });
    } catch (e) {
      // sin datos todavía
    } finally {
      setLoading(false);
    }
  }, []);

  function persist(next) {
    setDb(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      // si falla, el estado local sigue reflejando el cambio
    }
  }

  const addTo = (coleccion) => (item) => persist({ ...db, [coleccion]: [item, ...db[coleccion]] });
  const deleteFrom = (coleccion) => (id) => persist({ ...db, [coleccion]: db[coleccion].filter((it) => it.id !== id) });
  const updateIn = (coleccion) => (id, cambios) =>
    persist({ ...db, [coleccion]: db[coleccion].map((it) => (it.id === id ? { ...it, ...cambios } : it)) });

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#E7E4DA", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif" }}>
        <style>{FONT_IMPORT}</style>
        <Loader2 size={22} color="#22252A" />
      </div>
    );
  }

  if (vista === "articulos") {
    return (
      <ModuloArticulos
        articulos={db.articulos}
        facturas={db.facturas}
        config={db.config}
        onAdd={addTo("articulos")}
        onDelete={deleteFrom("articulos")}
        onVolver={() => setVista("inicio")}
      />
    );
  }
  if (vista === "contactos") {
    return (
      <ModuloContactos
        proveedores={db.proveedores}
        clientes={db.clientes}
        onAddProveedor={addTo("proveedores")}
        onDeleteProveedor={deleteFrom("proveedores")}
        onUpdateProveedor={updateIn("proveedores")}
        onAddCliente={addTo("clientes")}
        onDeleteCliente={deleteFrom("clientes")}
        onUpdateCliente={updateIn("clientes")}
        onVolver={() => setVista("inicio")}
      />
    );
  }
  if (vista === "facturas") {
    const obras = Array.from(new Set(db.varios.map((v) => v.obra).filter(Boolean)));
    return (
      <ModuloFacturas
        facturas={db.facturas}
        articulos={db.articulos}
        proveedores={db.proveedores}
        clientes={db.clientes}
        obras={obras}
        onAdd={addTo("facturas")}
        onDelete={deleteFrom("facturas")}
        onVolver={() => setVista("inicio")}
      />
    );
  }
  if (vista === "presupuestos") {
    return (
      <ModuloPresupuestos
        presupuestos={db.presupuestos}
        articulos={db.articulos}
        clientes={db.clientes}
        onAdd={addTo("presupuestos")}
        onDelete={deleteFrom("presupuestos")}
        onVolver={() => setVista("inicio")}
      />
    );
  }
  if (vista === "varios") {
    return (
      <ModuloObra
        items={db.varios}
        config={db.config}
        onAdd={addTo("varios")}
        onDelete={deleteFrom("varios")}
        onUpdate={updateIn("varios")}
        onUpdateIva={(iva) => persist({ ...db, config: { ...db.config, iva } })}
        onVolver={() => setVista("inicio")}
      />
    );
  }

  if (vista === "backup") {
    return (
      <ModuloBackup
        db={db}
        onImportar={(datos) => persist({ ...DB_VACIA, ...datos })}
        onVolver={() => setVista("inicio")}
      />
    );
  }

  return <Inicio db={db} onNavegar={setVista} />;
}
