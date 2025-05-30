import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target: 'contracts/examples/async-communication/two-phase-commit/db.tact',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
