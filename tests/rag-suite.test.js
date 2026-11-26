import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  QdrantCollectionConfig,
  QdrantCollectionProvisioner
} from '../scripts/create-collection.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

class FakeQdrantClient {
  constructor(initialCollections = []) {
    this.collections = [...initialCollections];
    this.createdCalls = [];
    this.indexCalls = [];
  }

  async getCollections() {
    return {
      collections: this.collections.map((name) => ({ name }))
    };
  }

  async createCollection(name, payload) {
    this.collections.push(name);
    this.createdCalls.push({ name, payload });
    return true;
  }

  async createPayloadIndex(collectionName, spec) {
    this.indexCalls.push({ collectionName, spec });
    return { status: 'completed' };
  }
}

test('QdrantCollectionConfig loads 3072-dim Cosine schema and payload indexes', async () => {
  const loader = new QdrantCollectionConfig({ env: {} });
  const config = await loader.load();

  assert.equal(config.collectionName, 'lueurfle_french_3072');
  assert.equal(config.vectors.size, 3072);
  assert.equal(config.vectors.distance, 'Cosine');
  assert.deepEqual(
    config.payloadIndexes.map((idx) => idx.field_name),
    ['level', 'topic', 'source', 'keywords']
  );
});

test('QdrantCollectionProvisioner creates collection and indexes when missing', async () => {
  const loader = new QdrantCollectionConfig({ env: {} });
  const config = await loader.load();
  const fakeClient = new FakeQdrantClient([]);
  const logs = [];
  const provisioner = new QdrantCollectionProvisioner({
    client: fakeClient,
    config,
    logger: { log: (msg) => logs.push(msg) }
  });

  const result = await provisioner.run();

  assert.equal(result.created, true);
  assert.equal(result.collectionName, 'lueurfle_french_3072');
  assert.equal(fakeClient.createdCalls.length, 1);
  assert.equal(fakeClient.createdCalls[0].payload.vectors.size, 3072);
  assert.equal(fakeClient.indexCalls.length, 4);
  assert.equal(logs.length, 5);
});

test('QdrantCollectionProvisioner skips collection creation when already present but ensures indexes', async () => {
  const loader = new QdrantCollectionConfig({ env: {} });
  const config = await loader.load();
  const fakeClient = new FakeQdrantClient(['lueurfle_french_3072']);
  const provisioner = new QdrantCollectionProvisioner({
    client: fakeClient,
    config,
    logger: { log: () => {} }
  });

  const result = await provisioner.run();

  assert.equal(result.created, false);
  assert.equal(fakeClient.createdCalls.length, 0);
  assert.equal(fakeClient.indexCalls.length, 4);
});

test('All n8n workflows are valid JSON, have connected nodes, and contain no leaked secrets', async () => {
  const workflowFiles = [
    'workflows/01-ingest-pdf-gemini-qdrant.json',
    'workflows/02-strict-french-tutor-rag.json',
    'workflows/03-ingest-pdf-webhook-qdrant.json'
  ];

  for (const relPath of workflowFiles) {
    const raw = await readFile(path.join(rootDir, relPath), 'utf8');
    assert.doesNotMatch(raw, /AIza[0-9A-Za-z_-]{20,}/, `Secret found in ${relPath}`);
    assert.doesNotMatch(raw, /eyJhbGciOiJIUzI1NiIs/, `JWT token found in ${relPath}`);

    const wf = JSON.parse(raw);
    assert.ok(Array.isArray(wf.nodes) && wf.nodes.length >= 4, `Nodes missing in ${relPath}`);
    assert.ok(wf.connections && typeof wf.connections === 'object');

    const nodeNames = new Set(wf.nodes.map((n) => n.name));
    for (const [sourceName, outputs] of Object.entries(wf.connections)) {
      assert.ok(nodeNames.has(sourceName), `Unknown source node "${sourceName}" in ${relPath}`);
      for (const branches of Object.values(outputs)) {
        for (const list of branches) {
          for (const edge of list) {
            assert.ok(nodeNames.has(edge.node), `Unknown target node "${edge.node}" in ${relPath}`);
          }
        }
      }
    }
  }
});

test('Strict French tutor workflow enforces Lueur identity, OCEAN traits, and 3 phase commands', async () => {
  const raw = await readFile(
    path.join(rootDir, 'workflows/02-strict-french-tutor-rag.json'),
    'utf8'
  );
  const wf = JSON.parse(raw);
  const agent = wf.nodes.find((n) => n.name === 'AI Agent');
  const codeNode = wf.nodes.find((n) => n.name === 'Prepare Lueur Context');

  assert.ok(agent, 'AI Agent node must exist');
  assert.ok(codeNode, 'Prepare Lueur Context node must exist');

  const systemMessage = agent.parameters?.options?.systemMessage || '';
  assert.match(systemMessage, /Lueur/);
  assert.match(systemMessage, /OCEAN/);
  assert.match(systemMessage, /\/basico/);
  assert.match(systemMessage, /\/intermedio/);
  assert.match(systemMessage, /\/avanzado/);
  assert.match(systemMessage, /EXCLUSIVAMENTE francés/);
  assert.match(codeNode.parameters.jsCode, /basico\|intermedio\|avanzado/);
});
