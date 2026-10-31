// Busca secretos en el bundle de producción (dist/). Falla si encuentra:
//   - claves secretas nuevas de Supabase (sb_secret_...)
//   - JWT con rol service_role (claves antiguas)
//   - claves privadas PEM o tokens habituales de proveedores
// Las claves publicables (sb_publishable_...) y anon son públicas por diseño.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = join(process.cwd(), process.argv[2] ?? 'dist');
const TEXT_EXT = /\.(js|mjs|css|html|json|webmanifest|txt|map|svg)$/i;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (TEXT_EXT.test(name)) yield p;
  }
}

function decodeJwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const patterns = [
  { name: 'Clave secreta de Supabase', re: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  { name: 'Clave privada PEM', re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/g },
  { name: 'Token de GitHub', re: /gh[pousr]_[A-Za-z0-9]{30,}/g },
  { name: 'Clave de AWS', re: /AKIA[0-9A-Z]{16}/g },
  // El código de envío de notificaciones (src/server) no debe acabar en el bundle.
  { name: 'Código de servidor de notificaciones', re: /VAPID_PRIVATE_KEY|SUPABASE_SECRET_KEY/g },
];
const jwtRe = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

const findings = [];
let scanned = 0;
for (const file of walk(dist)) {
  // Los recursos del motor OCR son de terceros y binarios embebidos: no contienen claves.
  if (file.includes(`${join('dist', 'ocr')}`)) continue;
  scanned++;
  const content = readFileSync(file, 'utf8');
  for (const { name, re } of patterns) {
    for (const m of content.matchAll(re)) findings.push(`${name} en ${relative(dist, file)}: ${m[0].slice(0, 16)}…`);
  }
  for (const m of content.matchAll(jwtRe)) {
    const role = decodeJwtRole(m[0]);
    if (role && role !== 'anon') findings.push(`JWT con rol "${role}" en ${relative(dist, file)}`);
  }
  if (/service_role/.test(content) && /eyJ/.test(content)) {
    // Mención explícita junto a un JWT: revisar manualmente.
    const near = content.match(/.{0,40}service_role.{0,40}/);
    if (near && /eyJ/.test(near[0])) findings.push(`Posible clave service_role en ${relative(dist, file)}`);
  }
}

if (findings.length > 0) {
  console.error('[check-secrets] ¡Se han encontrado posibles secretos en el bundle!');
  for (const f of findings) console.error('  - ' + f);
  process.exit(1);
}
console.log(`[check-secrets] OK: ${scanned} archivos revisados, sin secretos.`);
