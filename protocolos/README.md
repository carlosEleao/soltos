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

## Limitações

- O portal pode exigir captcha; nesses casos a consulta volta para o fluxo manual
- Layout/API da Betha mudam sem aviso — a automação pode quebrar
- Uso pessoal da sua própria conta; não é integração oficial parceira Betha
