import { createGenericPortalProvider } from "@/lib/providers/generic-portal";

/** Concessionárias comuns no RS + portal customizado. */
export const energiaProvider = createGenericPortalProvider({
  key: "energia",
  kind: "ENERGIA",
  name: "Rede de energia",
  description:
    "Conecta ao portal da concessionária (login embutido) para monitorar protocolos/chamados.",
  entities: [
    {
      id: "rge-sul",
      label: "RGE Sul (CPFL) — RS",
      portalUrl: "https://www.cpfl.com.br/atendimento",
      listUrl: "https://www.cpfl.com.br/atendimento",
    },
    {
      id: "equatorial-rs",
      label: "Equatorial / CEEE — RS",
      portalUrl: "https://rs.equatorialenergia.com.br/",
      listUrl: "https://rs.equatorialenergia.com.br/",
    },
    {
      id: "custom",
      label: "Outra concessionária (URL customizada)",
      portalUrl: "https://example.com/login",
    },
  ],
});
