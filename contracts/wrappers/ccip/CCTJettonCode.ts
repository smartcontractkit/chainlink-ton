import { Cell } from '@ton/core'
import { contractCode } from '../codeLoader'

export async function CCTJettonMinterCode(): Promise<Cell> {
  return contractCode.ccip.local('ccip.cct.JettonMinter')
}

export async function CCTJettonWalletCode(): Promise<Cell> {
  return contractCode.ccip.local('ccip.cct.JettonWallet')
}
