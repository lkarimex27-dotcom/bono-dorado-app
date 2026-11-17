import "dotenv/config";
import xlsx from "xlsx";
import { pool } from "./db.js";
const file = process.argv[2] || "BONO DORADO_SUSAN VALDERRAMA.xlsx";
const wb = xlsx.readFile(file, {cellDates:true});
const sheet = wb.Sheets["ORDENADO"];
if (!sheet) throw new Error('No existe la hoja "ORDENADO".');
const rows = xlsx.utils.sheet_to_json(sheet, {defval:""});
const clean = v => String(v ?? "").trim();
const map = r => ({
 item: parseInt(clean(r.ITEM),10) || null,
 nombres: clean(r.NOMBRES), apellidos: clean(r.APELLIDOS),
 documento: clean(r["DOCUMENTO DE IDENTIDAD"]),
 pasaporte: clean(r.PASAPORTE),
 telefono: clean(r["Número de teléfono CON INDICATIVO"]),
 correo: clean(r["CORREO ELECTRONICO"]),
 telegram: clean(r["ALIAS DE TELEGRAM"]),
 comprobante_hash: clean(r["NUMERO DE COMPROBANTE O HASH"]),
 ciudad_residencia: clean(r["CIUDAD Y DEPTO. DE RESIDENCIA"]),
 aeropuerto_cercano: clean(r["NOMBRE DEL AEROPUERTO CERCANO PARA VIAJAR"]),
 pais_residencia: clean(r["PAIS DE RESIDENCIA"]),
 pasaporte_url: clean(r["SUBIR EL PASAPORTE. EN FOTO O JPG (EL QUE NO TENGA ESCRIBA N/A)"]),
 cuenta_bancaria: clean(r["NUMERO DE SU CUENTA BANCARIA"]),
 banco: clean(r["NOMBRE DEL BANCO (Donde tiene su cuenta bancaria)"]),
 tipo_cuenta: clean(r["TIPO DE CUENTA (Ahorros o Corriente)"]),
 cantidad_bonos: clean(r["CANT. BONOS"]),
 valor_consignado: clean(r["VALOR CONSIGNADO"]),
 lider: clean(r["LIDER"])
});
const valid = rows.map(map).filter(r => r.documento && (r.nombres || r.apellidos));
let inserted=0, updated=0;
for (const r of valid) {
 const exists = await pool.query("SELECT id FROM beneficiaries WHERE documento=$1",[r.documento]);
 await pool.query(`INSERT INTO beneficiaries
 (item,nombres,apellidos,documento,pasaporte,telefono,correo,telegram,comprobante_hash,
 ciudad_residencia,aeropuerto_cercano,pais_residencia,pasaporte_url,cuenta_bancaria,banco,
 tipo_cuenta,cantidad_bonos,valor_consignado,lider)
 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
 ON CONFLICT (documento) DO UPDATE SET
 item=EXCLUDED.item,nombres=EXCLUDED.nombres,apellidos=EXCLUDED.apellidos,
 pasaporte=EXCLUDED.pasaporte,telefono=EXCLUDED.telefono,correo=EXCLUDED.correo,
 telegram=EXCLUDED.telegram,comprobante_hash=EXCLUDED.comprobante_hash,
 ciudad_residencia=EXCLUDED.ciudad_residencia,aeropuerto_cercano=EXCLUDED.aeropuerto_cercano,
 pais_residencia=EXCLUDED.pais_residencia,pasaporte_url=EXCLUDED.pasaporte_url,
 cuenta_bancaria=EXCLUDED.cuenta_bancaria,banco=EXCLUDED.banco,tipo_cuenta=EXCLUDED.tipo_cuenta,
 cantidad_bonos=EXCLUDED.cantidad_bonos,valor_consignado=EXCLUDED.valor_consignado,lider=EXCLUDED.lider`,
 Object.values(r));
 if(exists.rowCount) updated++; else inserted++;
}
console.log(`Importación terminada. Nuevos: ${inserted}. Actualizados: ${updated}. Filas válidas: ${valid.length}.`);
await pool.end();
