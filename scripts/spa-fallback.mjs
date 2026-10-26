// GitHub Pages no reescribe rutas: una URL profunda (/repo/clasificacion) devuelve
// 404.html. Copiamos index.html como 404.html para que la SPA arranque igualmente
// y React Router resuelva la ruta. En Netlify/Cloudflare se usa public/_redirects.
import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(process.cwd(), 'dist');
const index = join(dist, 'index.html');
if (!existsSync(index)) {
  console.error('[spa-fallback] dist/index.html no existe. Ejecuta vite build antes.');
  process.exit(1);
}
copyFileSync(index, join(dist, '404.html'));
// Evita que GitHub Pages procese el sitio con Jekyll (ignoraría archivos con "_").
writeFileSync(join(dist, '.nojekyll'), '');
console.log('[spa-fallback] dist/404.html y dist/.nojekyll creados');
