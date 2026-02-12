import "../ccip/common/types.tolk"

const TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE: int = 36;
fun tonAddressToCrossChainAddress(addr: address): CrossChainAddress {
	val (_, hash) = addr.getWorkchainAndHash();
	val slice = beginCell()
		.storeUint(TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE, 8)
		.storeUint(0, 32)
		.storeUint(hash, 256)
		.endCell()
		.beginParse();
	return CrossChainAddress.fromSlice(slice);
}


