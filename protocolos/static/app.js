const listaEl = document.getElementById("lista");
const toastEl = document.getElementById("toast");
const linksEl = document.getElementById("links");
const form = document.getElementById("form-create");
const busca = document.getElementById("busca");
const headedEl = document.getElementById("headed");

let selectedId = null;
let items = [];

function toast(message, type = "ok") {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 4200);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.message || `Erro HTTP ${res.status}`);
  }
  return data;
}

function protoLabel(p) {
  const dig = p.digito ? `-${p.digito}` : "";
  return `${p.numero}/${p.ano}${dig}`;
}

function renderList() {
  if (!items.length) {
    listaEl.innerHTML = `<div class="empty">Nenhum protocolo ainda. Cadastre um ou sincronize com a Betha.</div>`;
    return;
  }

  listaEl.innerHTML = items
    .map((p) => {
      const active = selectedId === p.id ? " style=\"border-color: var(--accent)\"" : "";
      const status = p.status || p.situacao || "sem status";
      const assunto = p.assunto || "Sem assunto";
      const sync = p.sincronizado_em
        ? ` · sync ${new Date(p.sincronizado_em + "Z").toLocaleString("pt-BR")}`
        : "";
      return `
        <article class="item" data-id="${p.id}"${active}>
          <div class="item-top">
            <div class="num">${protoLabel(p)}</div>
            <div class="badge">${p.origem || "manual"}</div>
          </div>
          <div class="meta"><strong>${escapeHtml(assunto)}</strong></div>
          <div class="meta">${escapeHtml(status)}${p.secretaria ? " · " + escapeHtml(p.secretaria) : ""}${sync}</div>
          ${p.notas ? `<div class="meta">${escapeHtml(p.notas)}</div>` : ""}
          <div class="item-actions">
            <button type="button" data-act="select">Selecionar</button>
            ${p.url_consulta ? `<a class="btn" href="${p.url_consulta}" target="_blank" rel="noopener">Abrir consulta</a>` : ""}
            <button type="button" data-act="delete">Excluir</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function loadList() {
  const q = busca.value.trim();
  items = await api(`/api/protocolos${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  renderList();
}

async function loadLinks() {
  const links = await api("/api/links");
  const entries = [
    ["Abrir protocolo (Betha)", links.abertura],
    ["Meus protocolos (Betha)", links.meus_protocolos],
    ["Consulta externa", links.consulta_externa],
    ["Site da prefeitura", links.prefeitura],
  ];
  linksEl.innerHTML = entries
    .map(
      ([label, href]) =>
        `<a class="btn" href="${href}" target="_blank" rel="noopener">${label}</a>`
    )
    .join("");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());
  body.ano = Number(body.ano);
  Object.keys(body).forEach((k) => {
    if (body[k] === "") body[k] = null;
  });
  try {
    await api("/api/protocolos", { method: "POST", body: JSON.stringify(body) });
    form.reset();
    document.querySelector('[name="ano"]').value = new Date().getFullYear();
    toast("Protocolo cadastrado");
    await loadList();
  } catch (err) {
    toast(err.message, "err");
  }
});

listaEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-act]");
  const card = e.target.closest(".item");
  if (!card) return;
  const id = Number(card.dataset.id);
  const act = btn?.dataset.act;
  if (act === "select" || !act) {
    selectedId = id;
    renderList();
    return;
  }
  if (act === "delete") {
    if (!confirm("Excluir este protocolo da lista local?")) return;
    try {
      await api(`/api/protocolos/${id}`, { method: "DELETE" });
      if (selectedId === id) selectedId = null;
      toast("Removido");
      await loadList();
    } catch (err) {
      toast(err.message, "err");
    }
  }
});

document.getElementById("btn-reload").addEventListener("click", () => loadList());
busca.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadList();
});

document.getElementById("btn-sync").addEventListener("click", async () => {
  const btn = document.getElementById("btn-sync");
  btn.disabled = true;
  toast("Sincronizando com a Betha… isso pode levar um minuto", "warn");
  try {
    const result = await api("/api/sync", {
      method: "POST",
      body: JSON.stringify({ headed: headedEl.checked, wait_login_seconds: 180 }),
    });
    toast(result.message, result.ok ? "ok" : result.needs_login ? "warn" : "err");
    if (result.ok) await loadList();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("btn-consulta").addEventListener("click", async () => {
  const item = items.find((p) => p.id === selectedId);
  if (!item) {
    toast("Selecione um protocolo na lista", "warn");
    return;
  }
  let cpf = item.requerente_cpf;
  if (!cpf) {
    cpf = prompt("CPF/CNPJ do requerente para consulta:");
    if (!cpf) return;
  }
  const btn = document.getElementById("btn-consulta");
  btn.disabled = true;
  toast("Consultando no portal…", "warn");
  try {
    const result = await api("/api/consultar", {
      method: "POST",
      body: JSON.stringify({
        numero: item.numero,
        ano: item.ano,
        digito: item.digito,
        cpf_cnpj: cpf,
        headed: headedEl.checked,
        salvar: true,
      }),
    });
    toast(result.message, result.ok ? "ok" : result.needs_manual ? "warn" : "err");
    if (result.url && result.needs_manual) {
      window.open(result.url, "_blank", "noopener");
    }
    await loadList();
  } catch (err) {
    toast(err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

document.querySelector('[name="ano"]').value = new Date().getFullYear();
loadLinks().catch((e) => toast(e.message, "err"));
loadList().catch((e) => toast(e.message, "err"));
