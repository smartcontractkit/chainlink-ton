import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/examples/upgrades/upgradeable_with_lock/v1/contract.tolk',
  withStackComments: true, // Fift output will contain comments, if you wish to debug its output
  withSrcLineComments: true, // Fift output will contain .tolk lines as comments
  experimentalOptions: '', // you can pass experimental compiler options here
}
