// generate-wallet.ts
import { mnemonicNew, mnemonicToWalletKey } from "@ton/crypto";
import { WalletContractV4, WalletContractV5R1, TonClient, Address } from "@ton/ton";
import { getHttpEndpoint } from "@orbs-network/ton-access";

async function main() {
  const mnemonic = await mnemonicNew();
  console.log("Mnemonic:", mnemonic.join(" "));

  const key = await mnemonicToWalletKey(mnemonic);
  const walletv4 = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  const walletv5 = WalletContractV5R1.create({ workchain: 0, publicKey: key.publicKey });

  console.log("Wallet Secret Key:", key.secretKey.toString("hex")); // Are we storing the hex in secrets manager?
  console.log("Public Key:", key.publicKey.toString("hex")); // Ask security to share this
  console.log("Wallet v4 Address:", walletv4.address.toString({ bounceable: true }));
  console.log("Wallet v5 Address:", walletv5.address.toString({ bounceable: true }));
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
