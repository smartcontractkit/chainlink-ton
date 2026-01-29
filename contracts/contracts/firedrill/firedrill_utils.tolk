import "../ccip/common/types.tolk"

const EVM_ADDRESS_BYTES_SIZE: int = 20;
fun getEvmSenderReceiverAddress(): CrossChainAddress {
	val slize = beginCell()
		.storeUint(EVM_ADDRESS_BYTES_SIZE, 8)
		.storeSlice(stringHexToSlice("f173d7111c087359945706c09802b12B3f25ad41"))
		.endCell()
		.beginParse();
	return CrossChainAddress.fromSlice(slize);
}


