export interface ShieldedNote {
  commitment: string;
  nullifier: string;
  amount: bigint;
  encryptedNote: string;
  spent: boolean;
  timestamp: number;
  recipientAddress: string;
  merkleRoot?: string;
}

export type Note = ShieldedNote;
export type NoteStatus = 'pending' | 'confirmed' | 'spent' | 'expired';
export type NoteType = 'transfer' | 'withdraw' | 'reshield';

export interface NoteMetadata {
  version: number;
  chainType: string;
  network: string;
  timestamp: number;
}

export interface EncryptedNote {
  ciphertext: string;
  ephemeralKey: string;
  nonce: string;
  metadata: NoteMetadata;
}

export interface NoteProof {
  commitment: string;
  nullifier: string;
  amount: bigint;
  recipientAddress: string;
  timestamp: number;
}

export interface NoteInput {
  note: ShieldedNote;
  proof: NoteProof;
  viewKey: string;
}

export interface NoteOutput {
  note: ShieldedNote;
  encryptedNote: EncryptedNote;
}
