
/**
 * SecureStorage provides an encrypted wrapper around localStorage using the Web Crypto API.
 * It features AES-GCM encryption, tamper detection, and TTL support.
 */

interface StorageOptions {
  ttl?: number; // Time to live in milliseconds
}

interface EncryptedPayload {
  iv: string;
  data: string;
  expiry: number | null;
}

class SecureStorage {
  private isCryptoAvailable: boolean;
  private memoryStorage: Map<string, any> = new Map();
  private key: CryptoKey | null = null;
  private readonly prefix = 'tipz_';
  private readonly ENTROPY_KEY = '_st_entropy';

  constructor() {
    this.isCryptoAvailable = 
      typeof window !== 'undefined' && 
      typeof window.crypto !== 'undefined' && 
      typeof window.crypto.subtle !== 'undefined';
    
    if (!this.isCryptoAvailable) {
      console.warn('Web Crypto API not available. Falling back to in-memory storage.');
    } else {
      // Background cleanup of expired entries
      setTimeout(() => this.pruneExpiredEntries(), 1000);
    }
  }

  private async pruneExpiredEntries(): Promise<void> {
    if (typeof window === 'undefined') return;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        try {
          const raw = localStorage.getItem(key);
          if (raw) {
            const payload: EncryptedPayload = JSON.parse(raw);
            if (payload.expiry && payload.expiry < Date.now()) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // Skip non-JSON or tampered entries
        }
      }
    }
  }

  private async getEncryptionKey(): Promise<CryptoKey> {
    if (this.key) return this.key;

    if (!this.isCryptoAvailable) {
      throw new Error('Crypto not available');
    }

    // 1. Generate fingerprint
    const fingerprint = [
      navigator.userAgent,
      navigator.language,
      (window.screen.colorDepth || 0).toString(),
      (window.screen.width || 0).toString(),
    ].join('|');

    // 2. Get or create user entropy (stored in plain text but helps make key unique to browser instance)
    let entropy = localStorage.getItem(this.ENTROPY_KEY);
    if (!entropy) {
      entropy = window.crypto.getRandomValues(new Uint8Array(32)).join('');
      localStorage.setItem(this.ENTROPY_KEY, entropy);
    }

    const masterKeyString = fingerprint + entropy;
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(masterKeyString),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    this.key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: encoder.encode('stellar-tipz-salt'),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );

    return this.key;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Encrypts and stores data in localStorage.
   */
  async set(key: string, value: any, options: StorageOptions = {}): Promise<void> {
    const fullKey = this.prefix + key;
    const expiry = options.ttl ? Date.now() + options.ttl : null;

    if (!this.isCryptoAvailable) {
      this.memoryStorage.set(fullKey, { value, expiry });
      return;
    }

    try {
      const cryptoKey = await this.getEncryptionKey();
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encoder = new TextEncoder();
      const encodedData = encoder.encode(JSON.stringify(value));

      const encryptedData = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encodedData
      );

      const payload: EncryptedPayload = {
        iv: this.arrayBufferToBase64(iv),
        data: this.arrayBufferToBase64(encryptedData),
        expiry,
      };

      localStorage.setItem(fullKey, JSON.stringify(payload));
    } catch (error) {
      console.error('Encryption failed:', error);
      // Fallback to memory on error
      this.memoryStorage.set(fullKey, { value, expiry });
    }
  }

  /**
   * Retrieves and decrypts data from localStorage.
   */
  async get<T = any>(key: string): Promise<T | null> {
    const fullKey = this.prefix + key;

    // Check memory storage first (fallback)
    if (this.memoryStorage.has(fullKey)) {
      const entry = this.memoryStorage.get(fullKey);
      if (entry.expiry && entry.expiry < Date.now()) {
        this.memoryStorage.delete(fullKey);
        return null;
      }
      return entry.value;
    }

    if (!this.isCryptoAvailable) return null;

    const raw = localStorage.getItem(fullKey);
    if (!raw) return null;

    try {
      const payload: EncryptedPayload = JSON.parse(raw);

      // Check TTL
      if (payload.expiry && payload.expiry < Date.now()) {
        this.remove(key);
        return null;
      }

      const cryptoKey = await this.getEncryptionKey();
      const iv = this.base64ToArrayBuffer(payload.iv);
      const encryptedData = this.base64ToArrayBuffer(payload.data);

      const decryptedData = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        cryptoKey,
        encryptedData
      );

      const decoder = new TextDecoder();
      return JSON.parse(decoder.decode(decryptedData));
    } catch (error) {
      console.error('Decryption failed or data tampered:', error);
      return null;
    }
  }

  /**
   * Removes an item from storage.
   */
  remove(key: string): void {
    const fullKey = this.prefix + key;
    localStorage.removeItem(fullKey);
    this.memoryStorage.delete(fullKey);
  }

  /**
   * Clears all items managed by SecureStorage.
   */
  clear(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(this.prefix)) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    this.memoryStorage.clear();
  }
}

export const secureStorage = new SecureStorage();
