import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { importProjectTsModule, loadLocalEnvFiles } from './lib/load-env-and-ts.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isGdriveCliReady() {
  try {
    const isWin = process.platform === 'win32';
    const bin = isWin ? 'cmd.exe' : 'gdrive';
    const args = isWin ? ['/d', '/s', '/c', 'gdrive', '--version'] : ['--version'];
    await execFileAsync(bin, args, { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await loadLocalEnvFiles(projectRoot);

  const [{ galleryConfig }, { isPlaceholderValue, parseDriveFolderInput }] = await Promise.all([
    importProjectTsModule(path.join(projectRoot, 'src', 'config', 'gallery.ts'), projectRoot),
    importProjectTsModule(path.join(projectRoot, 'src', 'domain', 'driveLinks.ts'), projectRoot),
  ]);

  const manifestRaw = await fs.readFile(
    path.join(projectRoot, 'src', 'generated', 'gallery-manifest.json'),
    'utf-8',
  );
  const manifest = JSON.parse(manifestRaw);

  console.log('==============================================================');
  console.log(`Diagnóstico de Configuração · ${galleryConfig.eventName}`);
  console.log('==============================================================');

  // 1) Logos obrigatórias
  const logoChecks = [
    { label: 'Moove Connect', rel: galleryConfig.logos.moove },
    { label: 'ACIVA', rel: galleryConfig.logos.aciva },
    { label: 'FAN 2026', rel: galleryConfig.logos.fan },
  ];

  console.log('\n1. Ativos de marca (public/logos):');
  for (const item of logoChecks) {
    const diskPath = path.join(projectRoot, 'public', item.rel.replace(/^\/+/, ''));
    const ok = await exists(diskPath);
    console.log(
      `   [${ok ? 'OK' : 'PENDENTE'}] ${item.label.padEnd(15)} -> public${item.rel}`,
    );
  }

  // 2) Origem das fotos
  console.log(`\n2. Origem configurada (sourceMode = "${galleryConfig.sourceMode}"):`);
  if (galleryConfig.sourceMode === 'folder') {
    const parsedFolder = parseDriveFolderInput(galleryConfig.driveFolderUrl);
    if (parsedFolder.kind === 'ok') {
      console.log(`   [OK] Pasta do Drive     -> ID ${parsedFolder.folderId}`);
    } else if (parsedFolder.kind === 'unconfigured') {
      console.log('   [PENDENTE] Pasta Drive  -> Preencha driveFolderUrl em src/config/gallery.ts');
    } else {
      console.log(`   [ERRO] Pasta do Drive   -> ${parsedFolder.reason}`);
    }

    const hasKey = !isPlaceholderValue(process.env.GOOGLE_DRIVE_API_KEY);
    const hasGdriveCli = await isGdriveCliReady();
    const syncAuthReady = hasKey || hasGdriveCli;
    const authDetail = hasKey
      ? 'GOOGLE_DRIVE_API_KEY definida no ambiente local'
      : hasGdriveCli
        ? 'gdrive CLI autenticado localmente para sincronização de build'
        : 'defina GOOGLE_DRIVE_API_KEY em .env para sincronizar';
    console.log(
      `   [${syncAuthReady ? 'OK' : 'PENDENTE'}] Credencial Sync -> ${authDetail}`,
    );
  } else {
    console.log(`   [INFO] Itens manuais    -> ${galleryConfig.photos.length} cadastrado(s) em src/config/gallery.ts`);
  }

  // 3) Manifesto local
  console.log('\n3. Manifesto publicado (src/generated/gallery-manifest.json):');
  console.log(`   Status: ${manifest.status} | Total de fotos: ${manifest.totalPhotos}`);
  console.log('==============================================================');
}

main().catch((err) => {
  console.error('[ERRO NO DIAGNÓSTICO]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
