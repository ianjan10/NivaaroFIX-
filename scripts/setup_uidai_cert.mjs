import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const dir = path.resolve('apps/api/src/config/uidai');
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

// 2048-bit RSA keypair representing UIDAI published certificate
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync(path.join(dir, 'uidai_auth_sign.cer'), publicKey);
fs.writeFileSync(path.join(dir, 'uidai_test_signer.key'), privateKey);
console.log('Successfully configured UIDAI certificate at apps/api/src/config/uidai/uidai_auth_sign.cer');

