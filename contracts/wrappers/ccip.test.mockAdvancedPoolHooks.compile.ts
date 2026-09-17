import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tolk',
  entrypoint: 'contracts/ccip/test/mock_advanced_pool_hooks.tolk',
  withStackComments: true,
}
