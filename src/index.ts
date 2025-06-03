// Core exports
export { MerkleTreeClient, MerkleProof } from './core/MerkleTreeClient';
export { NoteManager, ShieldedNote, NoteEncryption } from './core/NoteManager';
export { ViewKeyManager, ViewKeyProof } from './core/ViewKeyManager';
export { WalletProvider, UserAccount, TxReceipt, ChainType } from './core/WalletProvider';

// Transaction exports
export { TransactionBuilder } from './tx/TransactionBuilder';
export { ReshieldBuilder } from './tx/ReshieldBuilder';

// ZK exports
export { ZKProver } from './zk/ZKProver';
export { 
    ZKProof, 
    ZKInput, 
    ProofInput, 
    TransferProofInput, 
    WithdrawProofInput, 
    ReshieldProofInput, 
    ProofOutput, 
    ProofVerificationResult, 
    CircuitConfig, 
    WitnessInput 
} from './types/ZKProof';

// Utility exports
export { 
    generateEncryptionKey, 
    encryptData, 
    decryptData, 
    encryptNote, 
    decryptNote 
} from './utils/encryption';

export { 
    toBigInt, 
    fromBigInt, 
    add, 
    subtract, 
    multiply, 
    divide, 
    modulo, 
    isInRange, 
    randomBigInt, 
    gcd, 
    lcm 
} from './utils/math';

export { Logger } from './utils/logger';