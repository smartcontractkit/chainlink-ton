import "../ccip/common/types.tolk"

const TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE: int = 36;
const TON_CROSS_CHAIN_ADDRESS_BIT_SIZE: int = TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE * 8;
const TON_INTERNAL_ADDRESS_BIT_SIZE: int = 267;
fun tonAddressToCrossChainAddress(sender: address): CrossChainAddress {
	val slice = beginCell()
		.storeUint(TON_CROSS_CHAIN_ADDRESS_BYTES_SIZE, 8)
		.storeUint(0, TON_CROSS_CHAIN_ADDRESS_BIT_SIZE - TON_INTERNAL_ADDRESS_BIT_SIZE) //21 bit padding to get to 36 bytes
		.storeAddress(sender)
		.endCell()
		.beginParse();
	return CrossChainAddress.fromSlice(slice);
}


