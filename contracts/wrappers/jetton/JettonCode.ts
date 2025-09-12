import { Cell } from '@ton/core'
import { readFileSync } from 'fs'
import { env } from 'process'

const PATH_CONTRACTS_JETTON = env.PATH_CONTRACTS_JETTON

export async function JettonMinterCode(): Promise<Cell> {
  const compiledPath = `${PATH_CONTRACTS_JETTON}/JettonMinter.compiled.json`
  const compiled = JSON.parse(readFileSync(compiledPath, 'utf8'))
  const hex = compiled.hex
  if (!hex) {
    throw new Error('Compiled JettonMinter code hex not found in JSON')
  }
  // Remove 0x prefix if present
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  const boc = Buffer.from(hexStr, 'hex')
  return Cell.fromBoc(boc)[0]
}

export async function JettonWalletCode(): Promise<Cell> {
  const compiledPath = `${PATH_CONTRACTS_JETTON}/JettonWallet.compiled.json`
  const compiled = JSON.parse(readFileSync(compiledPath, 'utf8'))
  const hex = compiled.hex
  if (!hex) {
    throw new Error('Compiled JettonWallet code hex not found in JSON')
  }
  // Remove 0x prefix if present
  const hexStr = hex.startsWith('0x') ? hex.slice(2) : hex
  const boc = Buffer.from(hexStr, 'hex')
  return Cell.fromBoc(boc)[0]
}
