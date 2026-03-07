const FALLBACK_ECUADOR_UNIVERSITIES = [
  "Escuela Politecnica Nacional",
  "Escuela Superior Politecnica del Litoral",
  "Escuela Superior Politecnica de Chimborazo",
  "Universidad Central del Ecuador",
  "Universidad de Cuenca",
  "Universidad de Guayaquil",
  "Universidad de las Fuerzas Armadas ESPE",
  "Universidad de las Americas",
  "Universidad de Especialidades Espiritu Santo",
  "Universidad de Investigacion de Tecnologia Experimental Yachay",
  "Universidad de las Artes",
  "Universidad del Azuay",
  "Universidad del Pacifico",
  "Universidad Estatal Amazonica",
  "Universidad Estatal de Bolivar",
  "Universidad Estatal de Milagro",
  "Universidad Estatal de Peninsula de Santa Elena",
  "Universidad Estatal del Sur de Manabi",
  "Universidad Internacional del Ecuador",
  "Universidad Laica Eloy Alfaro de Manabi",
  "Universidad Nacional de Chimborazo",
  "Universidad Nacional de Educacion",
  "Universidad Nacional de Loja",
  "Universidad Politecnica Salesiana",
  "Universidad San Francisco de Quito",
  "Universidad Tecnica de Ambato",
  "Universidad Tecnica de Babahoyo",
  "Universidad Tecnica de Cotopaxi",
  "Universidad Tecnica de Machala",
  "Universidad Tecnica de Manabi",
  "Universidad Tecnica del Norte",
  "Universidad Tecnologica Empresarial de Guayaquil",
] as const;

type HipolabsUniversity = {
  name: string;
  country: string;
};

function normalize(list: string[]) {
  return Array.from(new Set(list.map((item) => item.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

export async function getEcuadorUniversities() {
  try {
    const response = await fetch("http://universities.hipolabs.com/search?country=Ecuador", {
      // Refresh list every 24h in server cache.
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) {
      return normalize([...FALLBACK_ECUADOR_UNIVERSITIES]);
    }

    const data = (await response.json()) as HipolabsUniversity[];
    const names = data
      .filter((item) => item.country.toLowerCase() === "ecuador")
      .map((item) => item.name);

    return names.length > 0 ? normalize(names) : normalize([...FALLBACK_ECUADOR_UNIVERSITIES]);
  } catch {
    return normalize([...FALLBACK_ECUADOR_UNIVERSITIES]);
  }
}
