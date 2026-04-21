import { Cell } from '@ton/core'
import { contractCode } from '../codeLoader'

export async function JettonMinterCode(): Promise<Cell> {
  return contractCode.jetton('JettonMinter')
}

export async function JettonWalletCode(): Promise<Cell> {
  return contractCode.jetton('JettonWallet')
}
