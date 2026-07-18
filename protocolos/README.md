# Protocolos · Estância Velha

UI local para **cadastrar e listar** seus protocolos, com **automação Playwright** no Portal Betha (Protocolo Cloud).

## O que faz

- Cadastro/listagem local (SQLite)
- Atalhos para abertura/consulta oficiais
- **Sincronizar meus protocolos**: abre `protocolo.betha.cloud`, captura respostas da API do cidadão e grava no banco
- **Consultar selecionado**: tenta consulta externa automática; se houver captcha, abre o portal para conclusão manual

## Requisitos

- Python 3.11+
- Chromium do Playwright

## Setup

```bash
cd protocolos
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
```

## Rodar

```bash
cd protocolos
source .venv/bin/activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8787
```

Abra http://127.0.0.1:8787

## Login Betha (primeira sync)

1. Marque **Janela visível (login)**
2. Clique em **Sincronizar meus protocolos**
3. Faça login na Central do Usuário Betha e vincule o CPF à entidade Estância Velha
4. A sessão é salva em `data/betha-storage.json` para as próximas syncs headless

> Em ambientes sem interface gráfica (CI/cloud), a sync autenticada precisa de uma sessão já salva (`betha-storage.json`).

## Servidor MCP (para o agente)

Expõe tools para o Cursor/agente cadastrar, listar, consultar e sincronizar protocolos.

### Tools

| Tool | Função |
|---|---|
| `listar_protocolos` | Lista/filtra a base local |
| `obter_protocolo` | Detalhe por id |
| `cadastrar_protocolo` | Cria protocolo |
| `atualizar_protocolo` | Atualiza campos |
| `excluir_protocolo` | Remove da base local |
| `sincronizar_protocolos` | Sync via automação Betha |
| `consultar_protocolo_portal` | Consulta automática no portal |
| `links_portal` | Links oficiais |

Resources: `protocolos://lista`, `protocolos://links`

### Rodar (stdio — Cursor Desktop)

```bash
cd protocolos
./run_mcp.sh
```

### Rodar (HTTP — agente remoto)

```bash
cd protocolos
./run_mcp.sh --http
# streamable-http em http://127.0.0.1:8790/mcp
```

### Configurar no Cursor

Copie `cursor-mcp.example.json` para a config MCP do Cursor (`~/.cursor/mcp.json` ou Settings → MCP) e ajuste os caminhos absolutos:

```json
{
  "mcpServers": {
    "protocolos-estancia-velha": {
      "command": "/ABS/protocolos/.venv/bin/python",
      "args": ["/ABS/protocolos/mcp_server.py", "--transport", "stdio"],
      "env": { "PYTHONPATH": "/ABS/protocolos" }
    }
  }
}
```

Depois disso o agente pode pedir, por exemplo: “lista meus protocolos” ou “cadastra o protocolo 1234/2026”.

## Limitações

- O portal pode exigir captcha; nesses casos a consulta volta para o fluxo manual
- Layout/API da Betha mudam sem aviso — a automação pode quebrar
- Uso pessoal da sua própria conta; não é integração oficial parceira Betha
- Sync MCP autenticada sem sessão salva precisa de `headed=true` com interface gráfica
