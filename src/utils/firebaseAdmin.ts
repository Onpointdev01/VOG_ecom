import * as fs from 'fs';
import * as path from 'path';
import * as admin from 'firebase-admin';

function normalizeServiceAccount(parsed: Record<string, unknown>): Record<string, unknown> {
  if (parsed.private_key) {
    parsed.private_key = String(parsed.private_key).replace(/\\n/g, '\n');
  }
  return parsed;
}

function resolveCredential(): admin.credential.Credential {
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.join(process.cwd(), filePath);
    const raw = fs.readFileSync(resolved, 'utf8');
    const parsed = normalizeServiceAccount(JSON.parse(raw));
    return admin.credential.cert(parsed as admin.ServiceAccount);
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const parsed = normalizeServiceAccount(JSON.parse(serviceAccountJson));
    return admin.credential.cert(parsed as admin.ServiceAccount);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyRaw = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKeyRaw) {
    throw new Error(
      'Firebase Admin credentials are missing. Set FIREBASE_SERVICE_ACCOUNT_PATH, FIREBASE_SERVICE_ACCOUNT_JSON, or FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY.'
    );
  }

  return admin.credential.cert({
    projectId,
    clientEmail,
    privateKey: privateKeyRaw.replace(/\\n/g, '\n'),
  });
}

export function getFirebaseAdminAuth(): admin.auth.Auth {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: resolveCredential(),
    });
  }

  return admin.auth();
}

