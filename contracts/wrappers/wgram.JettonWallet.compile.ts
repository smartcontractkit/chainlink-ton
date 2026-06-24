import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/wgram/JettonWallet.tolk',
  withStackComments: true,
}
