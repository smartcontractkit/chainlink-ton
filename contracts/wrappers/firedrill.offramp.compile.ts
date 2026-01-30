import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/firedrill/firedrill_offramp.tolk',
  withStackComments: true,
  withSrcLineComments: true,
  experimentalOptions: '',
}
