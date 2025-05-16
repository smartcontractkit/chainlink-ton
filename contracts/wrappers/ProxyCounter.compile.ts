import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/proxy_upgrade/proxy_counter.tact',
  options: {
    debug: true,
  },
}
