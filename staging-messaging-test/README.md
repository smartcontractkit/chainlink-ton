# Staging Messaging Test

This test suite validates end-to-end CCIP messaging from TON to EVM chains.

## Environment Variables

- `TON_ROUTER_ADDRESS`: TON router contract address
- `EVM_DEST_CHAIN_SELECTOR`: Destination chain selector for EVM
- `EVM_RECEIVER_ADDRESS`: Receiver contract address on EVM chain
- `CCIP_MESSAGE`: Message payload (optional, defaults to "hello-ton->evm")
- `TON_SENDER_WALLET_SEED_PHRASE`: Wallet seed phrase for TON transactions
- `SEPOLIA_RPC_URL`: RPC URL for Sepolia network (optional, has default)

## Run the Test

```bash
go test -v ./...
```
