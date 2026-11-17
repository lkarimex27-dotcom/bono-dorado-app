// shortcut: principales municipios por departamento, no la lista DANE completa (~1.100); ampliar aquí si falta alguno.
export const DEPARTAMENTOS = {
  "Amazonas": ["Leticia", "Puerto Nariño"],
  "Antioquia": ["Medellín", "Bello", "Itagüí", "Envigado", "Sabaneta", "La Estrella", "Caldas", "Copacabana", "Girardota", "Barbosa", "Rionegro", "Marinilla", "La Ceja", "El Retiro", "Guarne", "Apartadó", "Turbo", "Caucasia", "Santa Fe de Antioquia", "Yarumal", "Andes", "Sonsón"],
  "Arauca": ["Arauca", "Saravena", "Tame", "Arauquita"],
  "Atlántico": ["Barranquilla", "Soledad", "Malambo", "Puerto Colombia", "Galapa", "Sabanalarga", "Baranoa"],
  "Bogotá D.C.": ["Bogotá"],
  "Bolívar": ["Cartagena", "Magangué", "Turbaco", "Arjona", "El Carmen de Bolívar", "Mompós"],
  "Boyacá": ["Tunja", "Duitama", "Sogamoso", "Chiquinquirá", "Paipa", "Villa de Leyva", "Puerto Boyacá"],
  "Caldas": ["Manizales", "Villamaría", "Chinchiná", "La Dorada", "Riosucio", "Anserma"],
  "Caquetá": ["Florencia", "San Vicente del Caguán", "Puerto Rico"],
  "Casanare": ["Yopal", "Aguazul", "Villanueva", "Paz de Ariporo", "Tauramena"],
  "Cauca": ["Popayán", "Santander de Quilichao", "Puerto Tejada", "Patía", "El Bordo", "Piendamó"],
  "Cesar": ["Valledupar", "Aguachica", "Agustín Codazzi", "Bosconia", "La Jagua de Ibirico"],
  "Chocó": ["Quibdó", "Istmina", "Tadó", "Bahía Solano", "Unguía"],
  "Córdoba": ["Montería", "Cereté", "Lorica", "Sahagún", "Montelíbano", "Planeta Rica"],
  "Cundinamarca": ["Soacha", "Chía", "Zipaquirá", "Facatativá", "Fusagasugá", "Girardot", "Mosquera", "Madrid", "Funza", "Cajicá", "Cota", "La Calera", "Tocancipá", "Sopó", "Villeta"],
  "Guainía": ["Inírida"],
  "Guaviare": ["San José del Guaviare"],
  "Huila": ["Neiva", "Pitalito", "Garzón", "La Plata"],
  "La Guajira": ["Riohacha", "Maicao", "Uribia", "San Juan del Cesar", "Fonseca"],
  "Magdalena": ["Santa Marta", "Ciénaga", "Fundación", "El Banco", "Plato"],
  "Meta": ["Villavicencio", "Acacías", "Granada", "Puerto López", "Puerto Gaitán"],
  "Nariño": ["Pasto", "Tumaco", "Ipiales", "Túquerres", "La Unión"],
  "Norte de Santander": ["Cúcuta", "Ocaña", "Villa del Rosario", "Los Patios", "Pamplona", "Tibú"],
  "Putumayo": ["Mocoa", "Puerto Asís", "Orito", "Valle del Guamuez"],
  "Quindío": ["Armenia", "Calarcá", "Montenegro", "La Tebaida", "Quimbaya", "Circasia"],
  "Risaralda": ["Pereira", "Dosquebradas", "Santa Rosa de Cabal", "La Virginia"],
  "San Andrés y Providencia": ["San Andrés", "Providencia"],
  "Santander": ["Bucaramanga", "Floridablanca", "Girón", "Piedecuesta", "Barrancabermeja", "San Gil", "Socorro", "Cimitarra", "Barbosa"],
  "Sucre": ["Sincelejo", "Corozal", "Sampués", "San Marcos", "Tolú"],
  "Tolima": ["Ibagué", "Espinal", "Melgar", "Honda", "Chaparral", "Líbano", "Mariquita"],
  "Valle del Cauca": ["Cali", "Palmira", "Buenaventura", "Tuluá", "Buga", "Cartago", "Jamundí", "Yumbo", "Candelaria", "Florida", "Zarzal", "El Cerrito"],
  "Vaupés": ["Mitú"],
  "Vichada": ["Puerto Carreño"],
};

const norm = (text) =>
  ` ${String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

const has = (haystack, needle) => haystack.includes(norm(needle));

// Reconoce texto libre de la BD ("CALI / VALLE DEL CAUCA", "BELLO. ANTIOQUIA", "Cúcuta") y devuelve { dep, city }.
export function matchCity(text) {
  const t = norm(text);
  let best = { dep: "", city: "", score: 0 };

  for (const [dep, cities] of Object.entries(DEPARTAMENTOS)) {
    for (const city of cities) {
      if (!has(t, city)) continue;
      // El departamento se busca sin el nombre de la ciudad ("Santander de Quilichao, Cauca").
      const depHit = has(t.replace(norm(city), " "), dep);
      const score = norm(city).length + (depHit ? 100 : 0);
      if (score > best.score) best = { dep, city, score };
    }
    const depOnly = has(t, dep) ? norm(dep).length : 0;
    if (depOnly && !best.city && depOnly > best.score) best = { dep, city: "", score: depOnly };
  }

  return { dep: best.dep, city: best.city };
}

export const isColombia = (country) =>
  !String(country || "").trim() || has(norm(country), "colombia") || !!matchCity(country).dep;
