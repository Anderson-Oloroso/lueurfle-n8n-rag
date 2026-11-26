import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';

/**
 * Carga y valida la configuración de colección Qdrant desde JSON y variables de entorno.
 */
export class QdrantCollectionConfig {
  /**
   * @param {object} [options]
   * @param {string} [options.configPath]
   * @param {NodeJS.ProcessEnv} [options.env]
   */
  constructor({ configPath, env = process.env } = {}) {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    this.configPath = configPath || path.resolve(currentDir, '../qdrant/collection-config.json');
    this.env = env;
  }

  /**
   * Lee el esquema base y aplica overrides opcionales de entorno.
   * @returns {Promise<object>}
   */
  async load() {
    const raw = await readFile(this.configPath, 'utf8');
    const parsed = JSON.parse(raw);
    const vectorSize = Number(this.env.QDRANT_VECTOR_SIZE || parsed.vectors?.size || 3072);

    if (!Number.isInteger(vectorSize) || vectorSize <= 0) {
      throw new Error(`Invalid QDRANT_VECTOR_SIZE: ${this.env.QDRANT_VECTOR_SIZE}`);
    }

    return {
      qdrantUrl: (this.env.QDRANT_URL || 'http://localhost:6333').trim(),
      qdrantApiKey: this.env.QDRANT_API_KEY?.trim() || undefined,
      collectionName: (this.env.QDRANT_COLLECTION || parsed.collectionName || 'lueurfle_french_3072').trim(),
      vectors: {
        size: vectorSize,
        distance: parsed.vectors?.distance || 'Cosine'
      },
      hnswConfig: parsed.hnsw_config || { m: 16, ef_construct: 100 },
      payloadIndexes: Array.isArray(parsed.payloadIndexes) ? parsed.payloadIndexes : []
    };
  }
}

/**
 * Provisionador idempotente para crear la colección vectorial y sus índices de payload en Qdrant.
 */
export class QdrantCollectionProvisioner {
  /**
   * @param {object} params
   * @param {import('@qdrant/js-client-rest').QdrantClient} params.client
   * @param {object} params.config
   * @param {{ log?: Function }} [params.logger]
   */
  constructor({ client, config, logger = console }) {
    if (!client) {
      throw new Error('QdrantCollectionProvisioner requires a Qdrant client instance.');
    }
    if (!config?.collectionName) {
      throw new Error('QdrantCollectionProvisioner requires a valid collection configuration.');
    }
    this.client = client;
    this.config = config;
    this.logger = logger;
  }

  /**
   * Verifica si la colección ya existe en Qdrant.
   * @param {string} [collectionName]
   * @returns {Promise<boolean>}
   */
  async collectionExists(collectionName = this.config.collectionName) {
    const response = await this.client.getCollections();
    const collections = Array.isArray(response?.collections) ? response.collections : [];
    return collections.some((col) => col.name === collectionName);
  }

  /**
   * Crea la colección solo si no existe previamente.
   * @returns {Promise<{ created: boolean, collectionName: string }>}
   */
  async ensureCollection() {
    const { collectionName, vectors, hnswConfig } = this.config;
    const exists = await this.collectionExists(collectionName);

    if (exists) {
      this.logger.log?.(`[Qdrant] Collection "${collectionName}" already exists.`);
      return { created: false, collectionName };
    }

    await this.client.createCollection(collectionName, {
      vectors,
      hnsw_config: hnswConfig
    });
    this.logger.log?.(
      `[Qdrant] Collection "${collectionName}" created (${vectors.size} dims, ${vectors.distance}).`
    );
    return { created: true, collectionName };
  }

  /**
   * Garantiza la creación de todos los índices de payload declarados.
   * @returns {Promise<string[]>}
   */
  async ensurePayloadIndexes() {
    const { collectionName, payloadIndexes } = this.config;
    const ensured = [];

    for (const indexDef of payloadIndexes) {
      await this.client.createPayloadIndex(collectionName, {
        field_name: indexDef.field_name,
        field_schema: indexDef.field_schema,
        wait: true
      });
      ensured.push(indexDef.field_name);
      this.logger.log?.(
        `[Qdrant] Payload index "${indexDef.field_name}" (${indexDef.field_schema}) ensured on "${collectionName}".`
      );
    }

    return ensured;
  }

  /**
   * Ejecuta el aprovisionamiento completo (colección + índices).
   * @returns {Promise<{ created: boolean, collectionName: string, indexes: string[] }>}
   */
  async run() {
    const collectionResult = await this.ensureCollection();
    const indexes = await this.ensurePayloadIndexes();
    return {
      ...collectionResult,
      indexes
    };
  }

  /**
   * Crea una instancia lista para usar desde entorno y archivo de configuración.
   * @param {object} [options]
   * @returns {Promise<QdrantCollectionProvisioner>}
   */
  static async fromEnvironment(options = {}) {
    const loader = new QdrantCollectionConfig(options);
    const config = await loader.load();
    const client = new QdrantClient({
      url: config.qdrantUrl,
      ...(config.qdrantApiKey ? { apiKey: config.qdrantApiKey } : {})
    });
    return new QdrantCollectionProvisioner({ client, config, logger: options.logger });
  }
}

const isExecutedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isExecutedDirectly) {
  try {
    const provisioner = await QdrantCollectionProvisioner.fromEnvironment();
    await provisioner.run();
  } catch (error) {
    console.error(`[Qdrant] Setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
