/**
 * Artifact names that scripts/pinArtifacts.ts writes into build/ from the reference
 * Jetton contracts. scripts/actonBuildAdapter.ts never writes an Acton artifact
 * under these names.
 */
export const PINNED_JETTON_ARTIFACT_NAMES = ['JettonMinter', 'JettonWallet']
