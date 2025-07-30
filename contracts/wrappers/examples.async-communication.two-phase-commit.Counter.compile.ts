import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/test/examples/async-communication/two-phase-commit/counter.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
