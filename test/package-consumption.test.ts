import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { spawnSync } from 'node:child_process';

const tempDirectories: string[] = [];

async function readTree(root: string, prefix = ''): Promise<Map<string, Buffer>> {
  const files = new Map<string, Buffer>();
  const entries = await readdir(join(root, prefix), { withFileTypes: true });

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = join(prefix, entry.name);
    if (entry.isDirectory()) {
      for (const [path, contents] of await readTree(root, relativePath)) {
        files.set(path, contents);
      }
    } else {
      files.set(relativePath, await readFile(join(root, relativePath)));
    }
  }
  return files;
}

after(async () => {
  await Promise.all(tempDirectories.map((directory) => rm(directory, { recursive: true })));
});

describe('installed package consumption', () => {
  it('commits build output matching the TypeScript sources', async () => {
    const buildRoot = await mkdtemp(join(tmpdir(), 'attson-plugin-sdk-build-'));
    tempDirectories.push(buildRoot);
    const outputDirectory = join(buildRoot, 'dist');

    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js'),
        '-p',
        'tsconfig.build.json',
        '--outDir',
        outputDirectory
      ],
      { encoding: 'utf8' }
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);

    const committed = await readTree('dist');
    const generated = await readTree(outputDirectory);
    assert.deepEqual([...committed.keys()], [...generated.keys()]);
    for (const [path, contents] of generated) {
      assert.deepEqual(committed.get(path), contents, `${path} is stale`);
    }
  });

  it('loads the public entry points in plain Node', async () => {
    const consumerRoot = await mkdtemp(join(tmpdir(), 'attson-plugin-sdk-consumer-'));
    tempDirectories.push(consumerRoot);
    const packageRoot = join(consumerRoot, 'node_modules', '@attson', 'plugin-sdk');

    await cp('dist', join(packageRoot, 'dist'), { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      await readFile('package.json', 'utf8')
    );
    await writeFile(
      join(consumerRoot, 'consumer.mjs'),
      [
        "import { parseManifest } from '@attson/plugin-sdk';",
        "import { createPluginClient } from '@attson/plugin-sdk/browser';",
        "import { signManifest } from '@attson/plugin-sdk/node';",
        "if (typeof parseManifest !== 'function' || typeof createPluginClient !== 'function' || typeof signManifest !== 'function') process.exit(1);"
      ].join('\n')
    );

    const result = spawnSync(process.execPath, ['consumer.mjs'], {
      cwd: consumerRoot,
      encoding: 'utf8'
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });

  it('resolves public types from an installed package', async () => {
    const consumerRoot = await mkdtemp(join(tmpdir(), 'attson-plugin-sdk-types-'));
    tempDirectories.push(consumerRoot);
    const packageRoot = join(consumerRoot, 'node_modules', '@attson', 'plugin-sdk');

    await cp('dist', join(packageRoot, 'dist'), { recursive: true });
    await writeFile(
      join(packageRoot, 'package.json'),
      await readFile('package.json', 'utf8')
    );
    await writeFile(
      join(consumerRoot, 'consumer.ts'),
      [
        "import { parseManifest, type PluginManifest } from '@attson/plugin-sdk';",
        "import { createPluginClient } from '@attson/plugin-sdk/browser';",
        "import { signManifest } from '@attson/plugin-sdk/node';",
        'const parser: (value: unknown) => PluginManifest = parseManifest;',
        'void parser;',
        'void createPluginClient;',
        'void signManifest;'
      ].join('\n')
    );

    const result = spawnSync(
      process.execPath,
      [
        join(process.cwd(), 'node_modules', 'typescript', 'lib', 'tsc.js'),
        '--noEmit',
        '--strict',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        '--typeRoots',
        join(process.cwd(), 'node_modules', '@types'),
        '--types',
        'node',
        'consumer.ts'
      ],
      { cwd: consumerRoot, encoding: 'utf8' }
    );

    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
});
