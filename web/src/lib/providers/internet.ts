import { createGenericPortalProvider } from "@/lib/providers/generic-portal";

/** ISPs comuns + portal customizado (fibra local, etc.). */
export const internetProvider = createGenericPortalProvider({
  key: "internet",
  kind: "INTERNET",
  name: "Provedor de internet",
  description:
    "Conecta ao portal/central do provedor para acompanhar chamados e protocolos de atendimento.",
  entities: [
    {
      id: "vivo",
      label: "Vivo",
      portalUrl: "https://login.vivo.com.br/",
    },
    {
      id: "claro",
      label: "Claro / NET",
      portalUrl: "https://minhaclaro.claro.com.br/",
    },
    {
      id: "oi",
      label: "Oi Fibra",
      portalUrl: "https://www.oi.com.br/minha-oi/",
    },
    {
      id: "custom",
      label: "Provedor local / outro (URL customizada)",
      portalUrl: "https://example.com/login",
    },
  ],
});
