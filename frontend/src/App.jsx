
import React, { useEffect, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { createWorker } from "tesseract.js";
import { DEPARTAMENTOS, matchCity, isColombia } from "./colombia.js";

GlobalWorkerOptions.workerSrc = pdfWorker;

const API = (
  import.meta.env.VITE_API_URL || "http://localhost:4000/api"
).replace(/\/$/, "");

// Reglas de validación nativas del navegador (se aplican al enviar el formulario).
const NAME = { pattern: "[A-Za-zÁÉÍÓÚÜÑáéíóúüñ' .\\-]{2,60}", title: "Solo letras, mínimo 2 caracteres" };
const TEXT = { minLength: 2, maxLength: 120 };
const ACCOUNT = { pattern: "[0-9]{6,20}", inputMode: "numeric", title: "Solo números, entre 6 y 20 dígitos (sin espacios ni guiones)", digitsOnly: true };
const ACCOUNT_KEYS = ["cuenta_bancaria", "tercero_numero_cuenta"];

// Datos viejos: "317-822132-81" o "0000 3146 9470" pasan a solo dígitos; "NEQUI" o "N/A" quedan para que el usuario lo corrija.
const cleanAccount = (value) => {
  const digits = String(value ?? "").replace(/[\s.-]/g, "");
  return /^[0-9]{6,20}$/.test(digits) ? digits : value ?? "";
};

const DIAL_CODES = [
  ["57", "Colombia"], ["52", "México"], ["1", "EE. UU. / Canadá"], ["593", "Ecuador"],
  ["505", "Nicaragua"], ["599", "Curazao"], ["58", "Venezuela"], ["51", "Perú"],
  ["56", "Chile"], ["54", "Argentina"], ["507", "Panamá"], ["506", "Costa Rica"],
  ["502", "Guatemala"], ["503", "El Salvador"], ["504", "Honduras"], ["591", "Bolivia"],
  ["595", "Paraguay"], ["598", "Uruguay"], ["55", "Brasil"], ["34", "España"],
];

// "+57 311 340 34 57", "573207029796" o "3001234567" -> { code: "57", number: "3113403457" }
function splitPhone(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return { code: "57", number: "" };
  const code = DIAL_CODES.map(([c]) => c)
    .sort((a, b) => b.length - a.length)
    .find((c) => digits.startsWith(c) && digits.length - c.length >= 7);
  return code ? { code, number: digits.slice(code.length) } : { code: "57", number: digits };
}

function PhoneInput({ label, value, onChange }) {
  const { code, number } = splitPhone(value);
  const emit = (c, n) => onChange(n ? `+${c} ${n}` : "");

  return (
    <label>
      {label}
      <span className="phone">
        <select
          aria-label="Indicativo"
          value={code}
          onChange={(event) => emit(event.target.value, number)}
        >
          {DIAL_CODES.map(([c, country]) => (
            <option key={c} value={c}>+{c} {country}</option>
          ))}
        </select>
        <input
          type="tel"
          inputMode="numeric"
          required
          pattern="[0-9]{7,12}"
          title="Solo números, entre 7 y 12 dígitos, sin el indicativo"
          placeholder="3001234567"
          value={number}
          onChange={(event) => emit(code, event.target.value.replace(/\D/g, ""))}
        />
      </span>
    </label>
  );
}

const fields = [
  ["nombres", "Nombres", NAME],
  ["apellidos", "Apellidos", NAME],
  ["telefono", "Teléfono con indicativo"],
  ["correo", "Correo electrónico", { type: "email", maxLength: 120 }],
  ["telegram", "Alias de Telegram", { pattern: "@?[A-Za-z0-9_]{5,32}", placeholder: "@usuario", title: "5 a 32 letras, números o guion bajo" }],
  ["comprobante_hash", "Número de comprobante o hash", { pattern: "[A-Za-z0-9\\-]{4,100}", title: "Letras, números o guiones, mínimo 4" }],
  ["ciudad_residencia", "Ciudad y departamento de residencia"],
  ["aeropuerto_cercano", "Aeropuerto cercano para viajar", TEXT],
  ["pais_residencia", "País de residencia", NAME],
  ["cuenta_bancaria", "Número de cuenta bancaria", ACCOUNT],
  ["banco", "Nombre del banco", TEXT],
  ["tipo_cuenta", "Tipo de cuenta"],
  ["cantidad_bonos", "Cantidad de bonos", { type: "number", min: 1, max: 1000, step: 1 }],
  ["valor_consignado", "Valor consignado", { type: "number", min: 0, step: 1 }],
  ["lider", "Líder", TEXT],
];

const thirdPartyFields = [
  ["tercero_nombres", "Nombres", NAME],
  ["tercero_apellidos", "Apellidos", NAME],
  ["tercero_documento", "Número de documento", { pattern: "[0-9]{5,15}", inputMode: "numeric", title: "Solo números, entre 5 y 15 dígitos" }],
  ["tercero_numero_cuenta", "Número de cuenta", ACCOUNT],
  ["tercero_banco", "Nombre del banco", TEXT],
];

function CitySelect({ value, country, onChange }) {
  const [initial] = useState(() => ({ raw: value || "", ...matchCity(value) }));
  const [dep, setDep] = useState(initial.dep);
  const [city, setCity] = useState(initial.city);

  if (!isColombia(country)) {
    return (
      <label>
        Ciudad y estado / provincia de residencia
        <input
          required
          minLength={2}
          maxLength={120}
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  return (
    <>
      <label>
        Departamento de residencia
        <select
          required
          value={dep}
          onChange={(event) => {
            setDep(event.target.value);
            setCity("");
            onChange("");
          }}
        >
          <option value="">Selecciona un departamento</option>
          {Object.keys(DEPARTAMENTOS).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label>
        Ciudad de residencia
        <select
          required
          disabled={!dep}
          value={city}
          onChange={(event) => {
            setCity(event.target.value);
            onChange(event.target.value ? `${event.target.value}, ${dep}` : "");
          }}
        >
          <option value="">{dep ? "Selecciona una ciudad" : "Primero elige el departamento"}</option>
          {(DEPARTAMENTOS[dep] || []).map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
        {initial.raw && !initial.city && (
          <small>Registrado antes: “{initial.raw}”. Selecciónalo de la lista.</small>
        )}
      </label>
    </>
  );
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);

    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }

      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };

    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function getPassportImage(blob) {
  if (blob.type === "application/pdf") {
    const buffer = await blob.arrayBuffer();
    const pdf = await getDocument({ data: buffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: canvas.getContext("2d"),
      viewport,
    }).promise;

    return canvas;
  }

  return blob;
}

async function readPassportNumber(blob) {
  const worker = await createWorker("eng");

  try {
    const image = await getPassportImage(blob);
    const result = await worker.recognize(image);
    const text = result.data.text.toUpperCase();

    const lines = text
      .split("\n")
      .map((line) => line.replace(/\s/g, ""));

    const mrzLine = lines.find((line) => /^P<[A-Z]{3}/.test(line));

    if (mrzLine) {
      const nextLine = lines.find((line) =>
        /^[A-Z0-9<]{9}[0-9][A-Z]{3}/.test(line)
      );

      if (nextLine) {
        return nextLine.substring(0, 9).replace(/</g, "");
      }
    }

    const candidates = text.match(/\b[A-Z0-9]{6,9}\b/g) || [];
    return candidates[0] || "";
  } finally {
    await worker.terminate();
  }
}

function AdminPanel({ documento, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function call(path) {
    const response = await fetch(`${API}/admin/${path}`, {
      headers: { "x-admin-documento": documento },
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "No fue posible consultar el reporte.");
    }
    return response;
  }

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError("");
    setBusy(true);
    try {
      setReport(await (await call("updates")).json());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    setError("");
    setBusy(true);
    try {
      const blob = await (await call("updates.xlsx")).blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `actualizaciones-bono-dorado-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const rows = report?.rows || [];
  const fmt = (value) =>
    new Date(value).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" });
  const today = rows.filter(
    (row) => new Date(row.updated_at).toDateString() === new Date().toDateString()
  ).length;

  return (
    <section className="panel admin">
      <div className="admin-head">
        <h2>Movimientos de actualización</h2>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Volver a mi formulario
        </button>
      </div>

      {error && <div className="alert error">{error}</div>}

      {!report ? (
        <p>{busy ? "Cargando movimientos..." : ""}</p>
      ) : (
        <>
          <div className="stats">
            <div>
              <span>Actualizados</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Pendientes</span>
              <strong>{report.total - rows.length}</strong>
            </div>
            <div>
              <span>Hoy</span>
              <strong>{today}</strong>
            </div>
            <div>
              <span>Avance</span>
              <strong>{report.total ? Math.round((rows.length / report.total) * 100) : 0}%</strong>
            </div>
          </div>

          <div className="admin-actions">
            <button type="button" className="ghost-btn" onClick={() => load()} disabled={busy}>
              Actualizar lista
            </button>
            <button type="button" className="primary-btn" onClick={download} disabled={busy || !rows.length}>
              {busy ? "Preparando..." : "Descargar Excel"}
            </button>
          </div>

          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Beneficiario</th>
                    <th>Documento</th>
                    <th>Pasaporte</th>
                    <th>Ciudad</th>
                    <th>Pago a tercero</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td>{fmt(row.updated_at)}</td>
                      <td>{row.nombres} {row.apellidos}</td>
                      <td>{row.documento}</td>
                      <td>
                        {row.pasaporte_url ? (
                          <a href={row.pasaporte_url} target="_blank" rel="noreferrer">
                            {row.pasaporte || "Ver"}
                          </a>
                        ) : (
                          row.pasaporte || "—"
                        )}
                      </td>
                      <td>{row.ciudad_residencia || "—"}</td>
                      <td>{row.no_tiene_cuenta_o_no_puede_recibir ? "Sí" : "No"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Todavía nadie ha actualizado sus datos.</p>
          )}
        </>
      )}
    </section>
  );
}

export default function App() {
  const [term, setTerm] = useState("");
  const [person, setPerson] = useState(null);
  const [form, setForm] = useState({});
  const [yes, setYes] = useState(false);
  const [file, setFile] = useState(null);

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [updatePassport, setUpdatePassport] = useState(false);
  const [passportNumber, setPassportNumber] = useState("");
  const [passportUrl, setPassportUrl] = useState("");
  const [passportName, setPassportName] = useState("");
  const [passportStatus, setPassportStatus] = useState("");

  const [googleReady, setGoogleReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  useEffect(() => {
    let active = true;

    Promise.all([
      loadScript("https://apis.google.com/js/api.js"),
      loadScript("https://accounts.google.com/gsi/client"),
    ])
      .then(() => {
        window.gapi.load("picker", () => {
          if (active) setGoogleReady(true);
        });
      })
      .catch(() => {
        if (active) {
          setError("No se pudieron cargar los servicios de Google.");
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const update = (key, value) => {
    setForm((previous) => ({
      ...previous,
      [key]: value,
    }));
  };

  async function search(event) {
    event.preventDefault();

    setError("");
    setMessage("");
    setPerson(null);
    setBusy(true);
    setFile(null);

    try {
      if (!term.trim()) {
        throw new Error("Ingresa tu documento o pasaporte.");
      }

      const response = await fetch(
        `${API}/beneficiaries/lookup?term=${encodeURIComponent(term)}`
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "No fue posible consultar el registro."
        );
      }

      setPerson(data);
      setIsAdmin(!!data.is_admin);
      setShowAdmin(false);

      setForm(
        Object.fromEntries(
          [...fields, ...thirdPartyFields].map(([key]) => [
            key,
            ACCOUNT_KEYS.includes(key)
              ? cleanAccount(data[key])
              : key === "telefono" && data[key]
              ? (({ code, number }) => `+${code} ${number}`)(splitPhone(data[key]))
              : data[key] ?? "",
          ])
        )
      );

      setYes(!!data.no_tiene_cuenta_o_no_puede_recibir);

      setPassportNumber("");
      setPassportUrl("");
      setPassportName("");
      setUpdatePassport(false);
      setPassportStatus("");
    } catch (err) {
      setError(err.message || "Ocurrió un error al consultar.");
    } finally {
      setBusy(false);
    }
  }

  async function choosePassport() {
    setError("");
    setPassportStatus("");

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    const appId = import.meta.env.VITE_GOOGLE_APP_ID;

    if (!clientId || !apiKey || !appId) {
      setError("Faltan las credenciales de Google en el archivo .env.");
      return;
    }

    if (!googleReady) {
      setError("El selector de Google Drive todavía está cargando.");
      return;
    }

    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/drive.file",

        callback: async (tokenResponse) => {
          if (tokenResponse.error || !tokenResponse.access_token) {
            setError("No se pudo autorizar la selección del archivo.");
            return;
          }

          try {
            const picker = new window.google.picker.PickerBuilder()
              .setAppId(appId)
              .setDeveloperKey(apiKey)
              .setOAuthToken(tokenResponse.access_token)
              .setTitle("Selecciona tu nuevo pasaporte")
              .addView(
                new window.google.picker.DocsView()
                  .setIncludeFolders(false)
                  .setMimeTypes("application/pdf,image/jpeg,image/png")
              )
              .setSelectableMimeTypes(
                "application/pdf,image/jpeg,image/png"
              )
              .setCallback(async (data) => {
                if (
                  data.action !== window.google.picker.Action.PICKED
                ) {
                  return;
                }

                const selected = data.docs[0];

                setBusy(true);
                setPassportStatus("Leyendo el documento seleccionado...");

                try {
                  const metadataResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${selected.id}?fields=id,name,mimeType,webViewLink`,
                    {
                      headers: {
                        Authorization: `Bearer ${tokenResponse.access_token}`,
                      },
                    }
                  );

                  if (!metadataResponse.ok) {
                    throw new Error(
                      "No se pudo obtener la información del archivo."
                    );
                  }

                  const metadata = await metadataResponse.json();

                  const downloadResponse = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${selected.id}?alt=media`,
                    {
                      headers: {
                        Authorization: `Bearer ${tokenResponse.access_token}`,
                      },
                    }
                  );

                  if (!downloadResponse.ok) {
                    throw new Error(
                      "No se pudo leer el archivo seleccionado."
                    );
                  }

                  const blob = await downloadResponse.blob();

                  const extractedNumber = await readPassportNumber(blob);

                  setPassportName(metadata.name || selected.name || "");

                  const driveUrl =
                    metadata.webViewLink ||
                    `https://drive.google.com/file/d/${selected.id}/view`;

                  setPassportUrl(driveUrl);

                  if (extractedNumber) {
                    setPassportNumber(extractedNumber);
                    setPassportStatus(
                      "Número detectado. Verifícalo antes de guardar."
                    );
                  } else {
                    setPassportNumber("");
                    setPassportStatus(
                      "No se detectó el número. Escríbelo manualmente."
                    );
                  }
                } catch (err) {
                  setError(
                    err.message || "No se pudo procesar el pasaporte."
                  );
                  setPassportStatus("");
                } finally {
                  setBusy(false);
                }
              })
              .build();

            picker.setVisible(true);
          } catch {
            setError("No se pudo abrir el selector de Google Drive.");
          }
        },
      });

      tokenClient.requestAccessToken();
    } catch {
      setError("No fue posible iniciar la conexión con Google Drive.");
    }
  }

  async function save(event) {
    event.preventDefault();

    setError("");
    setMessage("");

    if (!person) return;

    if (
      updatePassport &&
      (!passportNumber.trim() || !passportUrl.trim())
    ) {
      setError("Selecciona el nuevo pasaporte y verifica su número.");
      return;
    }

    if (yes && !file && !person.autorizacion_nombre_archivo) {
      setError("Adjunta la autorización firmada.");
      return;
    }

    const formData = new FormData();

    Object.entries(form).forEach(([key, value]) => {
      formData.append(key, value ?? "");
    });

    formData.append(
      "no_tiene_cuenta_o_no_puede_recibir",
      String(yes)
    );

    formData.append(
      "pasaporte",
      updatePassport
        ? passportNumber.trim()
        : person.pasaporte || ""
    );

    formData.append(
      "pasaporte_url",
      updatePassport
        ? passportUrl
        : person.pasaporte_url || ""
    );

    if (file) {
      formData.append("autorizacion", file);
    }

    setBusy(true);

    try {
      const response = await fetch(
        `${API}/beneficiaries/${person.id}`,
        {
          method: "PUT",
          body: formData,
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "No se pudieron guardar los cambios."
        );
      }

      setMessage(
        data.message || "Actualización guardada correctamente."
      );

      setPerson((previous) => ({
        ...previous,
        ...form,
        pasaporte: updatePassport
          ? passportNumber.trim()
          : previous.pasaporte,
        pasaporte_url: updatePassport
          ? passportUrl
          : previous.pasaporte_url,
        autorizacion_nombre_archivo:
          file?.name || previous.autorizacion_nombre_archivo,
      }));

      setUpdatePassport(false);
      setPassportNumber("");
      setPassportUrl("");
      setPassportName("");
      setPassportStatus("");
      setFile(null);
    } catch (err) {
      setError(err.message || "Ocurrió un error al guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="wrap">
      <header>
        <div className="mark" aria-hidden="true">BD</div>
        <div>
          <p className="eyebrow">PORTAL DEL BENEFICIARIO</p>
          <h1>Bono Dorado</h1>
          <p className="sub">Consulta y actualización de datos del beneficiario</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            className="admin-btn"
            onClick={() => setShowAdmin((open) => !open)}
          >
            {showAdmin ? "Volver a mi formulario" : "Admin · Movimientos"}
          </button>
        )}
      </header>

      {isAdmin && showAdmin ? (
        <AdminPanel
          documento={person?.documento}
          onClose={() => setShowAdmin(false)}
        />
      ) : (
      <>
      <section className="panel">
        <h2>1. Consulta tu registro</h2>

        <form className="search" onSubmit={search}>
          <label>
            Número de documento o pasaporte
            <input
              type="text"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Escribe tu número de documento o pasaporte"
              required
            />
          </label>

          <button type="submit" disabled={busy}>
            {busy ? "Consultando..." : "Buscar beneficiario"}
          </button>
        </form>
      </section>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      {person && (
        <form className="panel" onSubmit={save}>
          <h2>2. Verifica y actualiza tus datos</h2>

          <div className="grid">
            <label>
              Documento de identidad (no editable)
              <input value={person.documento || ""} disabled />
            </label>

            {fields.map(([key, label, rules]) =>
              key === "ciudad_residencia" ? (
                <CitySelect
                  key={`${person.id}-city`}
                  value={form[key]}
                  country={form.pais_residencia}
                  onChange={(value) => update(key, value)}
                />
              ) : key === "telefono" ? (
                <PhoneInput
                  key={key}
                  label={label}
                  value={form[key]}
                  onChange={(value) => update(key, value)}
                />
              ) : key === "tipo_cuenta" ? (
                <label key={key}>
                  {label}
                  <select
                    required
                    value={form[key] ?? ""}
                    onChange={(event) => update(key, event.target.value)}
                  >
                    <option value="">Selecciona el tipo de cuenta</option>
                    {!["", "Ahorros", "Corriente"].includes(form[key] ?? "") && (
                      <option>{form[key]}</option>
                    )}
                    <option>Ahorros</option>
                    <option>Corriente</option>
                  </select>
                </label>
              ) : (
                <label key={key}>
                  {label}
                  <input
                    {...{ ...rules, digitsOnly: undefined }}
                    required
                    value={form[key] ?? ""}
                    onChange={(event) =>
                      update(key, rules?.digitsOnly ? event.target.value.replace(/\D/g, "") : event.target.value)
                    }
                  />
                </label>
              )
            )}

          </div>

          <div className="passport-row">
            <label className="passport-number">
              Pasaporte registrado actualmente
              <input
                value={person.pasaporte || ""}
                disabled
                placeholder="No hay pasaporte registrado"
              />
            </label>

            <div className="passport-question">
              <h3>¿Desea actualizar su pasaporte?</h3>

              <div className="radio-options">
                <label className="pill">
                  <input
                    type="radio"
                    name="updatePassport"
                    checked={updatePassport === true}
                    onChange={() => {
                      setUpdatePassport(true);
                      setPassportNumber("");
                      setPassportUrl("");
                      setPassportName("");
                      setPassportStatus("");
                    }}
                  />
                  Sí
                </label>

                <label className="pill">
                  <input
                    type="radio"
                    name="updatePassport"
                    checked={updatePassport === false}
                    onChange={() => {
                      setUpdatePassport(false);
                      setPassportNumber("");
                      setPassportUrl("");
                      setPassportName("");
                      setPassportStatus("");
                    }}
                  />
                  No
                </label>
              </div>
            </div>
          </div>

          {updatePassport && (
            <div className="third drive-box">
              <h3>Seleccionar nuevo pasaporte</h3>

              <p>
                Selecciona el documento PDF o imagen que tienes guardado
                en tu Google Drive.
              </p>

              <button
                type="button"
                className="drive-btn"
                onClick={choosePassport}
                disabled={busy || !googleReady}
              >
                <svg viewBox="0 0 87.3 78" width="20" height="20" aria-hidden="true">
                  <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                  <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                  <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                  <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                  <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                  <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
                </svg>
                {busy
                  ? "Procesando documento..."
                  : "Seleccionar desde Google Drive"}
              </button>

              {passportName && (
                <div className="file-chip">
                  <span>
                    Archivo seleccionado: <strong>{passportName}</strong>
                  </span>
                  <button
                    type="button"
                    className="remove-btn"
                    disabled={busy}
                    onClick={() => {
                      setPassportName("");
                      setPassportUrl("");
                      setPassportNumber("");
                      setPassportStatus("");
                    }}
                  >
                    Quitar y elegir otro
                  </button>
                </div>
              )}

              <label>
                Número del nuevo pasaporte
                <input
                  value={passportNumber}
                  onChange={(event) =>
                    setPassportNumber(event.target.value.toUpperCase())
                  }
                  required
                  pattern="[A-Z0-9]{5,12}"
                  title="Entre 5 y 12 letras o números, sin espacios"
                  placeholder="Verifica o escribe el número"
                />
              </label>

              {passportUrl && (
                <p>
                  <a
                    href={passportUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir pasaporte seleccionado en Google Drive
                  </a>
                </p>
              )}

              {passportStatus && <p className="status">{passportStatus}</p>}
            </div>
          )}

          <h2 className="section-title">3. Cuenta para recibir el dinero</h2>

          <div className="question">
            <h3>
              ¿No tiene una cuenta de ahorros o no puede recibir el
              dinero en su propia cuenta por motivos personales?
            </h3>

            <div className="radio-options">
              <label className="pill">
                <input
                  type="radio"
                  name="bankQuestion"
                  checked={yes === true}
                  onChange={() => setYes(true)}
                />
                Sí
              </label>

              <label className="pill">
                <input
                  type="radio"
                  name="bankQuestion"
                  checked={yes === false}
                  onChange={() => setYes(false)}
                />
                No
              </label>
            </div>
          </div>

          {yes && (
            <div className="third">
              <h3>Datos de la persona autorizada</h3>

              {thirdPartyFields.map(([key, label, rules]) => (
                <label key={key}>
                  {label}
                  <input
                    {...{ ...rules, digitsOnly: undefined }}
                    value={form[key] ?? ""}
                    onChange={(event) =>
                      update(key, rules?.digitsOnly ? event.target.value.replace(/\D/g, "") : event.target.value)
                    }
                    required
                  />
                </label>
              ))}

              <label>
                Adjuntar autorización firmada
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(event) =>
                    setFile(event.target.files?.[0] || null)
                  }
                />
              </label>

              {person.autorizacion_nombre_archivo && !file && (
                <p>
                  Autorización actual:{" "}
                  {person.autorizacion_nombre_archivo}
                </p>
              )}
            </div>
          )}

          <div className="actions">
            {(
              <button
                type="button"
                className="exit-btn"
                onClick={(event) => {
                  // Solo bloquea por campos vacíos; datos viejos con otro formato no impiden salir.
                  const empty = [...event.currentTarget.form.elements].find(
                    (el) => el.required && !el.disabled && !el.value.trim()
                  );
                  if (empty) {
                    setError("Hay campos obligatorios vacíos. Complétalos antes de salir.");
                    empty.reportValidity();
                    empty.focus();
                    return;
                  }
                  setPerson(null);
                  setIsAdmin(false);
                  setTerm("");
                  setMessage("");
                  setError("");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {message ? "Salir" : "Mis datos están correctos, salir"}
              </button>
            )}
            <button type="submit" disabled={busy}>
              {busy ? "Guardando..." : "Guardar actualización"}
            </button>
          </div>
        </form>
      )}
      </>
      )}
    </main>
  );
}
