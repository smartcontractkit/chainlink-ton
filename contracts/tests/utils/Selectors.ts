// These are only provided for tests and should not be treated as a source of truth for chain selectors. Check [all_selectors.yml](https://github.com/smartcontractkit/chain-selectors/tree/main/all_selectors.yml) for up-to-date information.

export const ChainFamilySelectors = {
  evm: 0x2812d52cn,
  svm: 0x1e10bdc4n,
  aptos: 0xac77ffecn,
  sui: 0xc4e05953n,
}

export const ChainSelectors = {
  testnet: {
    ton: 1399300952838017768n, // ton-testnet
    solana: 16423721717087811551n, // solana-devnet
    evm: 16015286601757825753n, // ethereum-testnet-sepolia
    aptos: 743186221051783445n, // aptos-testnet
    sui: 9762610643973837292n, // sui-testnet
  },
  testselectors: {
    CHAINSEL_EVM_TEST_90000001: 909606746561742123n,
    CHAINSEL_EVM_TEST_90000002: 5548718428018410741n,
  },
}
