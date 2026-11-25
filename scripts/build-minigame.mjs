import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const isWatch = process.argv.includes('--watch');

function copyStaticAssets() {
  fs.mkdirSync(distDir, { recursive: true });
  fs.copyFileSync(path.join(rootDir, 'minigame', 'game.json'), path.join(distDir, 'game.json'));

  const rootProjConfig = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'project.config.json'), 'utf-8')
  );
  const { cloudfunctionRoot: _omitCloudFn, ...distBaseConfig } = rootProjConfig;
  const distProjConfig = {
    ...distBaseConfig,
    miniprogramRoot: './',
  };
  fs.writeFileSync(
    path.join(distDir, 'project.config.json'),
    JSON.stringify(distProjConfig, null, 2) + '\n',
    'utf-8'
  );
}

async function runBuild() {
  fs.rmSync(distDir, { recursive: true, force: true });
  copyStaticAssets();

  const buildOptions = {
    entryPoints: [path.join(rootDir, 'src', 'minigame', 'main.ts')],
    outfile: path.join(distDir, 'game.js'),
    bundle: true,
    format: 'cjs',
    platform: 'browser',
    target: ['es2018'],
    minify: !isWatch,
    sourcemap: false,
    define: {
      'process.env.NODE_ENV': JSON.stringify(isWatch ? 'development' : 'production'),
    },
    logLevel: 'info',
  };

  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('[minigame] Watching for changes -> dist/game.js & dist/game.json');
  } else {
    await esbuild.build(buildOptions);
    console.log('[minigame] Built dist/game.js, dist/game.json & dist/project.config.json');
  }
}

runBuild().catch((err) => {
  console.error('[minigame] Build failed:', err);
  process.exit(1);
});
