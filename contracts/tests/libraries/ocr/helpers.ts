import { Address } from "@ton/core";
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import crypto from 'crypto';
import { uint8ArrayToBigInt } from "../../../utils/Utils";
import { OCR3Config } from "../../../wrappers/libraries/ocr/MultiOCR3Base";

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

export function generateRandomMockAddresses(count:number) {
  const addresses: Address[] = []
  for (let i = 0; i < count; i++) {
    addresses.push(generateMockTonAddress());
  }
  return addresses
}

export async function generateEd25519KeyPair() {
  const mnemonics = await mnemonicNew();
  return await mnemonicToPrivateKey(mnemonics);
}

function generateMockPublicKey(): Buffer {
  return crypto.randomBytes(32); // 32 bytes = 256 bits
}

export function generateRandomMockSigners(count: number) {
  const signers: bigint[] = [];
  for (let i = 0; i < count; i++) {
    signers.push(uint8ArrayToBigInt(generateMockPublicKey()));
  }
  return signers;
}


export function expectEqualsConfig(config1: OCR3Config, config2: OCR3Config) {
  // Compare configInfo
  const c1 = config1.configInfo;
  const c2 = config2.configInfo;

 expect(c1.configDigest).toEqual(c2.configDigest) 
 expect(c1.bigF).toEqual(c2.bigF) 
 expect(c1.n).toEqual(c2.n) 
 expect(c1.isSignatureVerificationEnabled).toEqual(c2.isSignatureVerificationEnabled)

  // Compare signers (bigint arrays)
  expect(config1.signers.length).toEqual(config2.signers.length)
  for (let i = 0; i < config1.signers.length; i++) {
    expect(config1.signers[i]).toEqual(config2.signers[i])
  }

  // Compare transmitters (Address arrays)
  expect(config1.transmitters.length).toEqual(config2.transmitters.length)
  for (let i = 0; i < config1.transmitters.length; i++) {
    expect(config1.transmitters[i].toString()).toEqual(config2.transmitters[i].toString())  
  }
}
