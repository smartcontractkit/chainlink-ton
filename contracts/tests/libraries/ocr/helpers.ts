import { Address } from "@ton/core";
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import crypto from 'crypto';

async function generateRandomTonAddress() {
  const mnemonics = await mnemonicNew();
  const keyPair = await mnemonicToPrivateKey(mnemonics);
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
  const address = wallet.address;
  return address;
}


function generateMockTonAddress(): Address {
  const workchain = 0; // Commonly used workchain ID
  const hashPart = crypto.randomBytes(32).toString('hex'); // 32-byte hash in hex
  const rawAddress = `${workchain}:${hashPart}`;
  return Address.parse(rawAddress);
}

export async function generateRandomAddresses(count:number) {
  const addresses: Address[] = []
  for (let i = 0; i < count; i++) {
    addresses.push(await generateRandomTonAddress());
  }
  return addresses
}

export async function generateRandomMockAddresses(count:number) {
  const addresses: Address[] = []
  for (let i = 0; i < count; i++) {
    addresses.push(generateMockTonAddress());
  }
  return addresses
}

async function generatePublicKeyBigInt() {
  const mnemonics = await mnemonicNew();
  const keyPair = await mnemonicToPrivateKey(mnemonics);
  const publicKeyBigInt = BigInt('0x' + keyPair.publicKey.toString('hex'));
  return publicKeyBigInt;
}

function generateMockPublicKey(): Buffer {
  return crypto.randomBytes(32); // 32 bytes = 256 bits
}

export async function generateRandomSigners(count: number) {
  const signers: bigint[] = [];
  for (let i = 0; i < count; i++) {
    signers.push(await generatePublicKeyBigInt());
  }
  return signers;
}

export async function generateRandomMockSigners(count: number) {
  const signers: bigint[] = [];
  for (let i = 0; i < count; i++) {
    signers.push(uint8ArrayToBigInt(generateMockPublicKey()));
  }
  return signers;
}

function uint8ArrayToBigInt(bytes: Uint8Array): bigint {
  let result = 0n
  for (const byte of bytes) {
    result = (result << 8n) | BigInt(byte)
  }
  return result
}

