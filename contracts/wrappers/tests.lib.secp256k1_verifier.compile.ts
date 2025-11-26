import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/test/lib/secp256k1_verifier.tolk',
  withStackComments: true,
}
