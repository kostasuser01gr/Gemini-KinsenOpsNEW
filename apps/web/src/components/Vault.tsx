import React, { useState, createContext, useContext } from 'react';

interface VaultContextType {
  isLocked: boolean;
  unlock: (pin: string) => Promise<boolean>;
  encryptMessage: (text: string) => Promise<{ encrypted: string, iv: string }>;
  decryptMessage: (encrypted: string, iv: string) => Promise<string>;
}

const VaultContext = createContext<VaultContextType | null>(null);

export const VaultProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLocked, setLocked] = useState(true);
  const [masterKey, setMasterKey] = useState<CryptoKey | null>(null);

  const deriveKey = async (pin: string) => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: enc.encode('rental-ultra-salt'), iterations: 100000, hash: 'SHA-256' },
      keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
    );
  };

  const unlock = async (pin: string) => {
    if (pin.length === 4) {
      const key = await deriveKey(pin);
      setMasterKey(key);
      setLocked(false);
      return true;
    }
    return false;
  };

  const encryptMessage = async (text: string) => {
    if (!masterKey) throw new Error('Locked');
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(text);
    const encrypted = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, masterKey, encoded);
    return {
      encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv))
    };
  };

  const decryptMessage = async (encrypted: string, iv: string) => {
    if (!masterKey) throw new Error('Locked');
    const data = new Uint8Array(atob(encrypted).split('').map(c => c.charCodeAt(0)));
    const ivArr = new Uint8Array(atob(iv).split('').map(c => c.charCodeAt(0)));
    const decrypted = await window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivArr }, masterKey, data);
    return new TextDecoder().decode(decrypted);
  };

  return (
    <VaultContext.Provider value={{ isLocked, unlock, encryptMessage, decryptMessage }}>
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => useContext(VaultContext)!;

export const PINScreen: React.FC<{ onUnlock: () => void }> = ({ onUnlock }) => {
  const [pin, setPin] = useState('');
  const { unlock } = useVault();

  const handleUnlock = async () => {
    if (await unlock(pin)) onUnlock();
    else alert('Invalid PIN');
  };

  return (
    <div className="fixed inset-0 bg-[#08080f] flex items-center justify-center z-[100]">
      <div className="bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl shadow-2xl max-w-xs w-full text-center">
        <h2 className="text-xl font-black text-white mb-6 tracking-tighter">SECURE ACCESS</h2>
        <input 
          type="password" 
          maxLength={4} 
          autoFocus
          className="w-full text-center text-3xl tracking-[0.5em] bg-black/40 border border-white/10 rounded-2xl py-4 mb-8 text-primary-500 outline-none focus:border-primary-500/50 transition-all"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleUnlock()}
        />
        <button 
          onClick={handleUnlock}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg active:scale-95"
        >
          Decrypt & Initialize
        </button>
      </div>
    </div>
  );
};
