struct TokenAmount {
    amount: coins;
    token: address;
}

struct WithdrawFeeTokens {}

struct Metadata {
    sender: address,
    // TODO: metadata { value, tokenAmounts }
}

struct MessageMetadata {
    header: uint256 = stringSha256("Any2TVMMessageHashV1");
    sourceChainSelector: uint64;
    destChainSelector: uint64;
    onRamp :Cell<CrossChainAddress>;
}
