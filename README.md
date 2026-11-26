# `lueurfle-n8n-rag`

> Capa de automatización **RAG + Qdrant + Google Gemini Embeddings** para **Lueur**, el tutor conversacional especializado única y obligatoriamente en enseñar **francés (FLE)** en sus tres fases (`/basico`, `/intermedio`, `/avanzado`) con personalidad **OCEAN**.

---

## 🎯 Objetivo

Orquestar la ingesta de material didáctico en PDF (`docs.pdf` → embeddings `gemini-embedding-001` de 3072 dimensiones → Qdrant) y la atención conversacional fundamentada en RAG mediante **n8n** y **Docker Compose**.

---

## 🛠️ Tecnologías

- **n8n** (`n8nio/n8n:latest`) con LangChain AI Agent, Window Buffer Memory y Qdrant Vector Store
- **Qdrant** (`@qdrant/js-client-rest` + perfil local `qdrant/qdrant:latest` o Qdrant Cloud)
- **Google Gemini** (`gemini-embedding-001` y `models/gemini-2.5-flash`)
- **Node.js (v20+ ESM, OOP)** para aprovisionamiento idempotente de colecciones y pruebas automatizadas (`node:test`)
- **Docker Compose** (con perfiles opcionales `local-qdrant` y `tunnel` para `ngrok`)

---

## 📂 Árbol de Directorios

```text
lueurfle-n8n-rag/
├── qdrant/
│   └── collection-config.json                # Esquema 3072 dims Cosine + índices de payload
├── scripts/
│   └── create-collection.js                  # Clases OOP QdrantCollectionConfig & QdrantCollectionProvisioner
├── tests/
│   └── rag-suite.test.js                     # Pruebas unitarias de Qdrant y validación de workflows
├── workflows/
│   ├── 01-ingest-pdf-gemini-qdrant.json      # Flujo Form Trigger para ingesta manual de docs.pdf
│   ├── 02-strict-french-tutor-rag.json       # Flujo Webhook POST /chat-french (Lueur + OCEAN + RAG)
│   └── 03-ingest-pdf-webhook-qdrant.json     # Flujo Webhook POST /ingest-pdf para lueurfle-backend
├── .env.example
├── .gitignore
├── docker-compose.yml
├── LICENSE
├── package.json
└── README.md
```

---

## 🚀 Cómo Ejecutarlo

### 1. Configurar variables de entorno
```bash
cp .env.example .env
```

### 2. Levantar n8n (y opcionalmente Qdrant local / túnel ngrok)
```bash
# Solo n8n (usando Qdrant Cloud)
docker compose up -d

# n8n + Qdrant local
docker compose --profile local-qdrant up -d

# n8n + túnel ngrok
docker compose --profile tunnel up -d
```

### 3. Crear la colección vectorial e índices de payload (idempotente)
```bash
npm install
npm run setup:qdrant
```

### 4. Ejecutar pruebas automatizadas
```bash
npm test
```

---

## 👤 Autoría

- **Autor:** Henrik Anderson Oloroso García (`Anderson-Oloroso`)
- **Licencia:** [MIT](./LICENSE)
