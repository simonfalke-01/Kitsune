import type { PasskeyBrowserCredential } from '@/lib/api/client';

type CreationOptionsJson = Omit<
  PublicKeyCredentialCreationOptions,
  'challenge' | 'excludeCredentials' | 'user'
> & {
  challenge: string;
  excludeCredentials?: CredentialDescriptorJson[];
  user: Omit<PublicKeyCredentialUserEntity, 'id'> & {
    id: string;
  };
};

type RequestOptionsJson = Omit<
  PublicKeyCredentialRequestOptions,
  'allowCredentials' | 'challenge'
> & {
  allowCredentials?: CredentialDescriptorJson[];
  challenge: string;
};

type CredentialDescriptorJson = Omit<PublicKeyCredentialDescriptor, 'id'> & {
  id: string;
};

type CreationEnvelope = {
  publicKey: CreationOptionsJson;
};

type RequestEnvelope = {
  mediation?: CredentialMediationRequirement;
  publicKey: RequestOptionsJson;
};

export async function createPasskey(options: unknown): Promise<PasskeyBrowserCredential> {
  requireWebAuthn();
  const publicKeyValue = isRecord(options) ? options.publicKey : undefined;

  if (
    !isRecord(publicKeyValue) ||
    typeof publicKeyValue.challenge !== 'string' ||
    !isRecord(publicKeyValue.user) ||
    typeof publicKeyValue.user.id !== 'string'
  ) {
    throw new Error('Kitsune returned invalid passkey registration options.');
  }

  const publicKey = publicKeyValue as unknown as CreationEnvelope['publicKey'];
  const credential = await navigator.credentials.create({
    publicKey: {
      ...publicKey,
      challenge: decodeBase64Url(publicKey.challenge),
      excludeCredentials: publicKey.excludeCredentials?.map(decodeDescriptor),
      user: {
        ...publicKey.user,
        id: decodeBase64Url(publicKey.user.id)
      }
    }
  });
  return serializeCredential(requirePublicKeyCredential(credential));
}

export async function authenticatePasskey(options: unknown): Promise<PasskeyBrowserCredential> {
  requireWebAuthn();
  const publicKeyValue = isRecord(options) ? options.publicKey : undefined;

  if (!isRecord(publicKeyValue) || typeof publicKeyValue.challenge !== 'string') {
    throw new Error('Kitsune returned invalid passkey authentication options.');
  }

  const envelope = options as RequestEnvelope;
  const publicKey = publicKeyValue as unknown as RequestEnvelope['publicKey'];
  const credential = await navigator.credentials.get({
    mediation: envelope.mediation,
    publicKey: {
      ...publicKey,
      allowCredentials: publicKey.allowCredentials?.map(decodeDescriptor),
      challenge: decodeBase64Url(publicKey.challenge)
    }
  });
  return serializeCredential(requirePublicKeyCredential(credential));
}

function serializeCredential(credential: PublicKeyCredential): PasskeyBrowserCredential {
  const response = credential.response;
  if (response instanceof AuthenticatorAttestationResponse) {
    return {
      clientExtensionResults:
        credential.getClientExtensionResults() as PasskeyBrowserCredential['clientExtensionResults'],
      id: credential.id,
      rawId: encodeBase64Url(credential.rawId),
      response: {
        attestationObject: encodeBase64Url(response.attestationObject),
        clientDataJSON: encodeBase64Url(response.clientDataJSON),
        transports: response.getTransports()
      },
      type: credential.type
    };
  }
  if (response instanceof AuthenticatorAssertionResponse) {
    return {
      clientExtensionResults:
        credential.getClientExtensionResults() as PasskeyBrowserCredential['clientExtensionResults'],
      id: credential.id,
      rawId: encodeBase64Url(credential.rawId),
      response: {
        authenticatorData: encodeBase64Url(response.authenticatorData),
        clientDataJSON: encodeBase64Url(response.clientDataJSON),
        signature: encodeBase64Url(response.signature),
        userHandle: response.userHandle ? encodeBase64Url(response.userHandle) : null
      },
      type: credential.type
    };
  }
  throw new Error('The authenticator returned an unsupported response.');
}

function decodeDescriptor(descriptor: CredentialDescriptorJson): PublicKeyCredentialDescriptor {
  return {
    ...descriptor,
    id: decodeBase64Url(descriptor.id)
  };
}

function requireWebAuthn(): void {
  if (!window.isSecureContext || !('PublicKeyCredential' in window)) {
    throw new Error('Passkeys require a secure browser context with WebAuthn support.');
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function requirePublicKeyCredential(credential: Credential | null): PublicKeyCredential {
  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error('The passkey ceremony was cancelled or returned no credential.');
  }
  return credential;
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = window.atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer;
}

function encodeBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}
