import { ethers } from 'ethers';

/**
 * AES-GCM Encryption utility
 * For production, we derive the key from a user signature to ensure 
 * only authorized users can decrypt.
 */
export const encryptFile = async (fileBuffer, keySeed) => {
    const enc = new TextEncoder();

    // Use SHA-256 to hash the seed (e.g., a signature) into a 32-byte key
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(keySeed));

    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['encrypt']
    );

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        fileBuffer
    );

    // Combine IV and Encrypted data for storage
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return { encrypted: combined, cid: null };
};

/**
 * Utility to generate the standard security message for signatures.
 * Must be identical for both encryption and decryption.
 */
export const getSessionSignatureMessage = (roomId) => {
    return `Authorize SyNox09 Secure Access for Session: ${roomId}\n\nThis cryptographic signature will be used to derive your private AES-GCM-256 session key.`;
};

/**
 * AES-GCM Decryption utility
 */
export const decryptFile = async (combinedBuffer, keySeed) => {
    const enc = new TextEncoder();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', enc.encode(keySeed));

    const cryptoKey = await window.crypto.subtle.importKey(
        'raw',
        hashBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    const iv = combinedBuffer.slice(0, 12);
    const data = combinedBuffer.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        data
    );

    return decrypted; // Returns ArrayBuffer
};

/**
 * IPFS Upload (Production Structure)
 * To use Pinata/Infura, add VITE_PINATA_JWT to .env
 */
export const uploadToIPFS = async (data) => {
    const pinataJwt = import.meta.env.VITE_PINATA_JWT;

    if (pinataJwt) {
        try {
            const formData = new FormData();
            const blob = new Blob([data], { type: 'application/octet-stream' });
            formData.append('file', blob);

            const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${pinataJwt}`
                },
                body: formData
            });
            const json = await res.json();
            return json.IpfsHash;
        } catch (e) {
            console.error("IPFS Upload Failed, falling back to mock:", e);
        }
    }

    // Fallback for development/demo: Store in sessionStorage to allow local testing
    const mockCid = "QmDemo" + Math.random().toString(36).substring(2, 10).toUpperCase();
    try {
        // We store it as a base64 string in sessionStorage to simulate the "fetch" later
        const reader = new FileReader();
        reader.onloadend = () => {
            sessionStorage.setItem(mockCid, reader.result);
        };
        reader.readAsDataURL(new Blob([data]));
    } catch (e) {
        console.warn("Demo storage failed:", e);
    }

    return mockCid;
};

