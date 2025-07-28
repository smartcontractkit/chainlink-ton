import { CompilerConfig } from '@ton/blueprint'

export const compile: CompilerConfig = {
  lang: 'tact',
  target:
    'contracts/test/examples/async/test-communication/two/test-phase-commit/test/db.tact/test',
  options: {
    debug: true,
    interfacesGetter: true,
  },
}
