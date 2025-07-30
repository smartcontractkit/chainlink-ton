import { Address } from '@ton/core'
import {crc32} from 'zlib'

export const OCR3BASE_CONFIG_SET_TOPIC = crc32('OCR3Base_ConfigSet')
export const OCR3BASE_TRANSMITTED_TOPIC = crc32('OCR3Base_Transmitted')

export enum LogTypes  {
  OCR3BaseConfigSet = OCR3BASE_CONFIG_SET_TOPIC,
  OCR3BaseTransmitted = OCR3BASE_TRANSMITTED_TOPIC,
} 

export type OCR3BaseConfigSet = {
  ocrPluginType: number
  configDigest: bigint
  signers: bigint[]
  transmitters: Address[]
  bigF: number
}

export type OCR3BaseTransmitted = {
  ocrPluginType: number
  configDigest: bigint
  sequenceNumber: number
}
