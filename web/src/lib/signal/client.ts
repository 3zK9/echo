import * as signal from 'libsignal-protocol-typescript';

const LS = {
  deviceId: 'signal_device_id_v1',
  regId: 'signal_reg_id_v1',
  idKey: 'signal_identity_key_v1',
  store: 'signal_store_v1',
};

type StoreMap = Record<string, string>;
const getStore = (): StoreMap => { try { return JSON.parse(localStorage.getItem(LS.store) || '{}') as StoreMap; } catch { return {}; } };
const setStore = (m: StoreMap) => localStorage.setItem(LS.store, JSON.stringify(m));
const put = (k: string, v: string) => { const m = getStore(); m[k] = v; setStore(m); };
const get = (k: string, d?: string) => { const m = getStore(); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : d; };
const remove = (k: string) => { const m = getStore(); delete m[k]; setStore(m); };

const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (b64: string) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out.buffer; };
const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())+Math.random().toString(36).slice(2));

function createStore() {
  return {
    // Identity keys for this device
    getIdentityKeyPair: async () => {
      const raw = localStorage.getItem(LS.idKey); if (!raw) throw new Error('no_identity'); const j = JSON.parse(raw);
      return { privKey: fromB64(j.privKey), pubKey: fromB64(j.pubKey) } as signal.KeyPairType;
    },
    getLocalRegistrationId: async () => { const raw = localStorage.getItem(LS.regId); if (!raw) throw new Error('no_registration'); return Number(raw); },

    // Session store API
    loadSession: async (address: string) => {
      const v = get(`session${address}`);
      return v ? fromB64(v) : undefined;
    },
    storeSession: async (address: string, record: ArrayBuffer) => {
      put(`session${address}`, toB64(record));
    },
    removeSession: async (address: string) => {
      remove(`session${address}`);
    },

    // PreKey store API
    loadPreKey: async (keyId: number) => {
      const v = get(`25519KeypreKey${keyId}`);
      if (!v) throw new Error('no_prekey');
      const j = JSON.parse(v);
      return { pubKey: fromB64(j.pubKey), privKey: fromB64(j.privKey) } as signal.KeyPairType;
    },
    storePreKey: async (keyId: number, keyPair: signal.KeyPairType) => {
      put(`25519KeypreKey${keyId}`, JSON.stringify({ pubKey: toB64(keyPair.pubKey), privKey: toB64(keyPair.privKey) }));
    },
    removePreKey: async (keyId: number) => {
      remove(`25519KeypreKey${keyId}`);
    },

    // Signed PreKey store API
    loadSignedPreKey: async (keyId: number) => {
      const v = get(`25519KeysignedKey${keyId}`);
      if (!v) throw new Error('no_signed_prekey');
      const j = JSON.parse(v);
      return { pubKey: fromB64(j.pubKey), privKey: fromB64(j.privKey) } as signal.KeyPairType;
    },
    storeSignedPreKey: async (keyId: number, keyPair: signal.KeyPairType) => {
      put(`25519KeysignedKey${keyId}`, JSON.stringify({ pubKey: toB64(keyPair.pubKey), privKey: toB64(keyPair.privKey) }));
    },

    // Identity (peer) trust and cache
    isTrustedIdentity: async (_id: any, _idKey: ArrayBuffer) => true,
    loadIdentity: async (id: any) => {
      const v = get('identityKey_'+id);
      return v ? fromB64(v) : undefined;
    },
    saveIdentity: async (id: any, key: ArrayBuffer) => { put('identityKey_'+id, toB64(key)); return true; },

    // Generic passthrough helpers (not required by lib, but handy)
    put: (key: string, value: any) => { put(key, typeof value==='string'?value:JSON.stringify(value)); },
    get: (key: string, defaultValue?: any) => { const v = get(key); if (v===undefined) return defaultValue; try { return JSON.parse(v); } catch { return v; } },
    remove: (key: string) => remove(key),
  } as any;
}

// Clear all stored Signal sessions and cached peer identities (but keep local identity + keys)
export function resetAllSessions() {
  try {
    const m = getStore();
    const keep: StoreMap = {};
    for (const [k, v] of Object.entries(m)) {
      // Remove sessions and cached peer identity keys; keep everything else
      if (k.startsWith('session')) continue;
      if (k.startsWith('identityKey_')) continue;
      keep[k] = v;
    }
    setStore(keep);
  } catch {}
}

export async function initDevice() {
  let deviceId = localStorage.getItem(LS.deviceId); if (!deviceId) { deviceId = randomId(); localStorage.setItem(LS.deviceId, deviceId); }
  const idKeyRaw = localStorage.getItem(LS.idKey); const regIdRaw = localStorage.getItem(LS.regId);
  if (!idKeyRaw || !regIdRaw) {
    const idPair = await signal.KeyHelper.generateIdentityKeyPair();
    const regId = await signal.KeyHelper.generateRegistrationId();
    localStorage.setItem(LS.regId, String(regId));
    localStorage.setItem(LS.idKey, JSON.stringify({ pubKey: toB64(idPair.pubKey), privKey: toB64(idPair.privKey) }));
  }
  const store = createStore();
  const idPair = await (store as any).getIdentityKeyPair();
  const spkId = 1 + Math.floor(Math.random()*1e6);
  const spk = await signal.KeyHelper.generateSignedPreKey(idPair, spkId);
  const preKeys: Array<{keyId:number; pubKey:string}> = [];
  const start = 1000 + Math.floor(Math.random()*100000);
  for (let i=0;i<20;i++) {
    const pk = await signal.KeyHelper.generatePreKey(start+i);
    preKeys.push({ keyId: pk.keyId, pubKey: toB64(pk.keyPair.pubKey) });
    put(`25519KeypreKey${pk.keyId}`, JSON.stringify({ pubKey: toB64(pk.keyPair.pubKey), privKey: toB64(pk.keyPair.privKey) }));
  }
  put(`25519KeysignedKey${spkId}`, JSON.stringify({ pubKey: toB64(spk.keyPair.pubKey), privKey: toB64(spk.keyPair.privKey) }));
  put(`signedKeySignature${spkId}`, toB64(spk.signature));

  const bundle = {
    deviceId,
    registrationId: Number(localStorage.getItem(LS.regId)!),
    identityKeyPub: JSON.parse(localStorage.getItem(LS.idKey)!).pubKey,
    signedPreKey: { keyId: spkId, pubKey: toB64(spk.keyPair.pubKey), signature: toB64(spk.signature) },
    preKeys,
  };
  const res = await fetch('/api/dm/devices/register', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(bundle) });
  if (!res.ok) throw new Error('register_failed');
  return { deviceId };
}

export async function ensureSessionWithPeer(username: string) {
  const r = await fetch(`/api/dm/users/${encodeURIComponent(username)}/bundle`);
  if (!r.ok) throw new Error('no_bundle');
  const b = await r.json();
  const preKeyBundle = {
    registrationId: Number(b.registrationId),
    identityKey: fromB64(b.identityKeyPub),
    signedPreKey: { keyId: Number(b.signedPreKey.keyId), publicKey: fromB64(b.signedPreKey.pubKey), signature: fromB64(b.signedPreKey.signature) },
    preKey: { keyId: Number(b.preKey.keyId), publicKey: fromB64(b.preKey.pubKey) },
  } as any;
  const address = new signal.SignalProtocolAddress(String(b.userId), 1);
  const builder = new signal.SessionBuilder(createStore() as any, address);
  await builder.processPreKey(preKeyBundle);
}

export async function encryptForPeer(username: string, plaintext: string) {
  // Establish a session up front for reliability in MVP (single device)
  try {
    await ensureSessionWithPeer(username);
  } catch (e) {
    const msg = String((e as any)?.message || e || '');
    if (msg.includes('no_bundle') || msg.includes('no_prekeys') || msg.includes('no_device')) {
      throw new Error('peer_not_ready');
    }
    throw e;
  }
  const identRes = await fetch(`/api/dm/users/${encodeURIComponent(username)}/identity`);
  if (!identRes.ok) throw new Error('peer_not_ready');
  const ident = await identRes.json();
  const address = new signal.SignalProtocolAddress(String(ident.userId), 1);
  const cipher = new signal.SessionCipher(createStore() as any, address);
  const plainBuf = new TextEncoder().encode(plaintext).buffer as ArrayBuffer;
  const res: any = await cipher.encrypt(plainBuf);
  const type: number = typeof res?.type === 'number' ? res.type : 1;
  const buf: ArrayBuffer = typeof res?.serialize === 'function' ? res.serialize() : (res?.body as ArrayBuffer) || (res as ArrayBuffer);
  return `${type}:${toB64(buf)}`;
}

export async function decryptFromPeer(username: string, payload: string) {
  // Only fetch identity to get stable address; do NOT consume a new prekey here
  const info = await (await fetch(`/api/dm/users/${encodeURIComponent(username)}/identity`)).json();
  const address = new signal.SignalProtocolAddress(String(info.userId), 1);
  const cipher = new signal.SessionCipher(createStore() as any, address);
  const [typeStr, b64] = payload.split(':', 2);
  const type = Number(typeStr) || 1; const buf = fromB64(b64 || payload);
  let plain: ArrayBuffer;
  if (type === 3) plain = await cipher.decryptPreKeyWhisperMessage(buf, 'binary');
  else plain = await cipher.decryptWhisperMessage(buf, 'binary');
  return new TextDecoder().decode(plain);
}


export async function replenishIfNeeded(threshold = 5, batch = 20) {
  const deviceId = localStorage.getItem(LS.deviceId);
  if (!deviceId) return;
  try {
    const r = await fetch(`/api/dm/devices/prekeys/count?deviceId=${encodeURIComponent(deviceId)}`);
    if (!r.ok) return;
    const { count } = await r.json();
    if (typeof count === 'number' && count < threshold) {
      const preKeys: Array<{keyId:number; pubKey:string}> = [];
      const start = 200000 + Math.floor(Math.random()*100000);
      for (let i=0;i<batch;i++) {
        const pk = await signal.KeyHelper.generatePreKey(start+i);
        preKeys.push({ keyId: pk.keyId, pubKey: toB64(pk.keyPair.pubKey) });
        put(`25519KeypreKey${pk.keyId}`, JSON.stringify({ pubKey: toB64(pk.keyPair.pubKey), privKey: toB64(pk.keyPair.privKey) }));
      }
      await fetch('/api/dm/prekeys/replenish', { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ deviceId, preKeys }) });
    }
  } catch {}
}
