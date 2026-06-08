import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/test/lib/remaining_bits_or_ref.tolk',
  withStackComments: true,
}
