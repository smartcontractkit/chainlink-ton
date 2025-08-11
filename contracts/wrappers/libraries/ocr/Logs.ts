import { Address } from '@ton/core'
import { hashSync } from '../../../utils'

export const OCR3BASE_CONFIG_SET_TOPIC = hashSync('OCR3Base_ConfigSet')
export const OCR3BASE_TRANSMITTED_TOPIC = hashSync('OCR3Base_Transmitted')

export const OCR3BaseLogTypes = {
  OCR3BaseConfigSet: OCR3BASE_CONFIG_SET_TOPIC,
  OCR3BaseTransmitted: OCR3BASE_TRANSMITTED_TOPIC,
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
