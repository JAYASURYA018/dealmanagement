import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class TwPkceService {

    // Generate a random string (43-128 chars)
    generateCodeVerifier(): string {
        const array = new Uint8Array(32);
        window.crypto.getRandomValues(array);
        return this.base64UrlEncode(array);
    }

    // Hash the verifier using SHA-256
    async generateCodeChallenge(verifier: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(verifier);
        const hash = await window.crypto.subtle.digest('SHA-256', data);
        return this.base64UrlEncode(new Uint8Array(hash));
    }

    // Base64URL Encoding (RFC 4648) - specific for OAuth
    private base64UrlEncode(array: Uint8Array): string {
        let str = '';
        array.forEach(byte => str += String.fromCharCode(byte));
        return btoa(str)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    }
}
