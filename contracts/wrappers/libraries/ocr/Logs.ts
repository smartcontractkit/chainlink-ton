import { Address } from '@ton/core'
import { crc32 } from 'zlib'

export const LOG_TOPIC: Record<string, number> = {
  OCR3Base_ConfigSet: crc32('OCR3Base_ConfigSet'),
  OCR3Base_Transmitted: crc32('OCR3Base_Transmitted'),
}

export const LogTypes = {
  OCR3BaseConfigSet: 'OCR3Base_ConfigSet',
  OCR3BaseTransmitted: 'OCR3Base_Transmitted',
} as const

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
