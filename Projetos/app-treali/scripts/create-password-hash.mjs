import { randomBytes, pbkdf2Sync } from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  throw new Error('Uso: npm run hash:password -- "uma-senha-com-12-ou-mais-caracteres"');
}

const iterations = 210_000;
const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, iterations, 32, 'sha256');
console.log(`pbkdf2$${iterations}$${salt.toString('base64url')}$${hash.toString('base64url')}`);
