import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/upgrades/upgradeable_counter_v1.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
