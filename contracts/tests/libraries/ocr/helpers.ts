import { Address, Message } from "@ton/core";
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';
import crypto from 'crypto';
import { uint8ArrayToBigInt } from "../../../utils/Utils";
import { OCR3Config } from "../../../wrappers/libraries/ocr/MultiOCR3Base";
import { testLog, getExternals } from '../../Logs'
import {fromSnakeData } from '../../../utils/Utils'
import { BlockchainTransaction } from "@ton/sandbox";

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

 const signers1 = config1.signers.sort()
 const signers2 = config2.signers.sort()
  // Compare signers (bigint arrays)
  expect(signers1.length).toEqual(signers2.length)
  for (let i = 0; i < config1.signers.length; i++) {
    expect(signers1[i]).toEqual(signers2[i])
  }

  const transmitters1 = config1.transmitters.map(
    (a) => a.toString()
  ).sort()
  const transmitters2 = config2.transmitters.map(
    (a) => a.toString()
  ).sort()

  // Compare transmitters (Address arrays)
  expect(config1.transmitters.length).toEqual(config2.transmitters.length)
  for (let i = 0; i < config1.transmitters.length; i++) {
    expect(transmitters2[i]).toEqual(transmitters2[i])  
  }
}

export enum LogTypes {
  OCR3BaseConfigSet = 0xAA,
  OCR3BaseTransmitted = 0xAB,
}

type OCR3BaseConfigSet = {
  ocrPluginType: number;
  configDigest: bigint;
  signers: bigint[];
  transmitters: Address[];
  bigF: number
}

type OCR3BaseTransmitted = {
  ocrPluginType: number;
  configDigest: bigint;
  sequenceNumber: number
}

export const testConfigSetLogMessage  = (
  message: Message,
  from: Address,
  match: OCR3BaseConfigSet,
) => {
  return testLog(message, from, LogTypes.OCR3BaseConfigSet, (x) => {
    const cs = x.beginParse()
    const ocrPluginType = cs.loadUint(16)
    const configDigest = cs.loadUintBig(256)
    const signers = fromSnakeData(cs.loadRef(), (x) => x.loadUintBig(256))
    const transmitters = fromSnakeData(cs.loadRef(), (x) => x.loadAddress())
    const bigF = cs.loadUint(8)

    expect(ocrPluginType).toEqual(match.ocrPluginType)
    expect(configDigest).toEqual(match.configDigest)
    expect(signers.sort()).toEqual(match.signers.sort())
    for (let i = 0; i < transmitters.length; i++) {
      expect(transmitters[i].toString()).toEqual(match.transmitters![i].toString())
    }
    expect(bigF).toEqual(match.bigF)
    return true
  })
}

export const testTransmittedLogMessage = (
  message: Message,
  from: Address,
  match: Partial<OCR3BaseTransmitted>,
) => {
  return testLog(message, from, LogTypes.OCR3BaseTransmitted, (x) => {
    const cs = x.beginParse()
    const msg = {
      ocrPluginType: cs.loadUint(16),
      configDigest: cs.loadUintBig(256),
      sequenceNumber: cs.loadUint(64),
    }
    expect(msg).toMatchObject(match)
    return true
  })
}

type LogMatch<T extends LogTypes> =
  T extends LogTypes.OCR3BaseConfigSet ? Partial<OCR3BaseConfigSet> :
  T extends LogTypes.OCR3BaseTransmitted ? Partial<OCR3BaseTransmitted> :
  number;

export const assertLog = <T extends LogTypes>(
  transactions: BlockchainTransaction[],
  from: Address,
  type: T,
  match: LogMatch<T>,
) => {
  getExternals(transactions).some((x) => {
    switch(type) {
      case LogTypes.OCR3BaseConfigSet:
        return testConfigSetLogMessage(x, from, match as OCR3BaseConfigSet);
      case LogTypes.OCR3BaseTransmitted:
        return testTransmittedLogMessage(x, from, match as Partial<OCR3BaseTransmitted>);
      default:
        throw new Error(`Unknown log type: ${type}`);
    }
  })
}


