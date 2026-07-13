package wallet

import (
	"fmt"
	"math/big"

	"github.com/xssnick/tonutils-go/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

// GetWalletData reads the jetton balance held by this wallet.
//
// On-chain: get fun get_wallet_data(): JettonWalletDataReply { jettonBalance, ownerAddress, minterAddress, jettonWalletCode }
var GetWalletData = tvm.NewNoArgsGetter(tvm.NoArgsOpts[*big.Int]{
	Name: "get_wallet_data",
	Decoder: tvm.NewResultDecoder(func(r *ton.ExecutionResult) (*big.Int, error) {
		balance, err := r.Int(0)
		if err != nil {
			return nil, fmt.Errorf("error getting Int(0) - get_wallet_data balance: %w", err)
		}
		return balance, nil
	}),
})
