import { OCR3Config } from '../../../wrappers/libraries/ocr/MultiOCR3Base'

export function expectEqualsConfig(config1: OCR3Config, config2: OCR3Config) {
  // Compare configInfo
  const c1 = config1.configInfo
  const c2 = config2.configInfo

  expect(c1.configDigest).toEqual(c2.configDigest)
  expect(c1.bigF).toEqual(c2.bigF)
  expect(c1.n).toEqual(c2.n)
  expect(c1.isSignatureVerificationEnabled).toEqual(c2.isSignatureVerificationEnabled)

  const signers1 = config1.signers.sort()
  const signers2 = config2.signers.sort()
  // Compare signers (bigint arrays)
  expect(signers1.length).toEqual(signers2.length)
  for (let i = 0; i < config1.signers.length; i++) {
    expect(signers1[i]).toEqual(signers2[i])
  }

  const transmitters1 = config1.transmitters.map((a) => a.toString()).sort()
  const transmitters2 = config2.transmitters.map((a) => a.toString()).sort()

  // Compare transmitters (Address arrays)
  expect(config1.transmitters.length).toEqual(config2.transmitters.length)
  for (let i = 0; i < config1.transmitters.length; i++) {
    expect(transmitters2[i]).toEqual(transmitters2[i])
  }
}
