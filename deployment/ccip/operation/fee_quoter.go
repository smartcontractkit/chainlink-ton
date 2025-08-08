package operation

import (
	"fmt"
	"math/big"

	"github.com/Masterminds/semver/v3"
	"github.com/smartcontractkit/chainlink-deployments-framework/operations"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/config"
	"github.com/smartcontractkit/chainlink-ton/deployment/ccip/utils"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/feequoter"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tracetracking"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/wrappers"
)

type DeployFeeQuoterInput struct {
	Params   config.FeeQuoterParams
	LinkAddr *address.Address
}

type DeployFeeQuoterOutput struct {
	Address *address.Address
}

var DeployFeeQuoterOp = operations.NewOperation(
	"deploy-fee-quoter-op",
	semver.MustParse("0.1.0"),
	"Deploys the FeeQuoter contract",
	deployFeeQuoter,
)

func deployFeeQuoter(b operations.Bundle, deps TonDeps, in DeployFeeQuoterInput) (DeployFeeQuoterOutput, error) {
	output := DeployFeeQuoterOutput{}

	// TODO wrap the code cell creation somewhere
	CounterContractPath := utils.GetBuildDir("FeeQuoter.compiled.json")
	codeCell, err := wrappers.ParseCompiledContract(CounterContractPath)
	if err != nil {
		return output, fmt.Errorf("failed to compile contract: %w", err)
	}

	conn := tracetracking.NewSignedAPIClient(deps.TonChain.Client, *deps.TonChain.Wallet)

	storage := feequoter.Storage{
		Ownable: common.Ownable2Step{
			Owner:        deps.TonChain.WalletAddress,
			PendingOwner: nil,
		},
		MaxFeeJuelsPerMsg:            in.Params.MaxFeeJuelsPerMsg,
		LinkToken:                    in.LinkAddr,
		TokenPriceStalenessThreshold: in.Params.TokenPriceStalenessThreshold,
		UsdPerToken:                  nil,
		PremiumMultiplierWeiPerEth:   nil,
		DestChainConfigs:             nil,
		KeyLen:                       64,
	}
	initData, err := tlb.ToCell(storage)
	if err != nil {
		return output, fmt.Errorf("failed to pack initData: %w", err)
	}

	// TODO: handle setting FeeTokens and PremiumMultiplierWeiPerEthByFeeToken

	contract, err := wrappers.Deploy(&conn, codeCell, initData, tlb.MustFromTON("1"))
	if err != nil {
		return output, fmt.Errorf("failed to deploy fee quoter contract: %w", err)
	}
	b.Logger.Infow("Deployed FeeQuoter", "addr", contract.Address)

	output.Address = contract.Address
	return output, nil
}

type UpdateFeeQuoterDestChainConfigsInput []feequoter.UpdateDestChainConfig

type UpdateFeeQuoterDestChainConfigsOutput struct {
}

var UpdateFeeQuoterDestChainConfigsOp = operations.NewOperation(
	"update-fee-quoter-dest-chain-configs",
	semver.MustParse("0.1.0"),
	"Updates fee quoter's destination chain configs",
	updateFeeQuoterDestChainConfigs,
)

func updateFeeQuoterDestChainConfigs(b operations.Bundle, deps TonDeps, in UpdateFeeQuoterDestChainConfigsInput) ([][]byte, error) {
	address := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	input := feequoter.UpdateDestChainConfigs{
		Update: in[0], // TEMP: until contracts get updated
		// Updates: common.SnakeData[feequoter.UpdateDestChainConfig](in),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}

	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("1"),
			DstAddr: &address,
			Body:    payload,
		},
	}
	return utils.Serialize(messages)
}

// UpdateFeeQuoterPricesInput contains configuration for updating FeeQuoter price configs
type UpdateFeeQuoterPricesInput struct {
	TokenPrices map[string]*big.Int // token address (string) -> price
	GasPrices   map[uint64]*big.Int // dest chain -> gas price
}

// UpdateFeeQuoterPricesOp operation to update FeeQuoter prices
var UpdateFeeQuoterPricesOp = operations.NewOperation(
	"update-fee-quoter-prices-op",
	semver.MustParse("0.1.0"),
	"Updates FeeQuoter token and gas prices",
	updateFeeQuoterPrices,
)

func updateFeeQuoterPrices(b operations.Bundle, deps TonDeps, in UpdateFeeQuoterPricesInput) ([][]byte, error) {
	feeQuoterAddress := deps.CCIPOnChainState[deps.TonChain.Selector].FeeQuoter

	var tokenPrices []feequoter.TokenPriceUpdate
	var gasPrices []feequoter.GasPriceUpdate

	for token, value := range in.TokenPrices {
		tokenAddress, err := address.ParseAddr(token)
		if err != nil {
			return nil, fmt.Errorf("failed to parse token address: %w", err)
		}
		tokenPrices = append(tokenPrices, feequoter.TokenPriceUpdate{
			SourceToken: tokenAddress,
			UsdPerToken: value,
		})
	}
	// TODO: need to split the u224 into two values
	// for chainSelector, update := range in.GasPrices {
	// }

	input := feequoter.UpdatePrices{
		TokenPrices: common.SnakeData[feequoter.TokenPriceUpdate](tokenPrices),
		GasPrices:   common.SnakeData[feequoter.GasPriceUpdate](gasPrices),
	}

	payload, err := tlb.ToCell(input)
	if err != nil {
		return nil, err
	}
	messages := []*tlb.InternalMessage{
		{
			Bounce:  true,
			Amount:  tlb.MustFromTON("1"),
			DstAddr: &feeQuoterAddress,
			Body:    payload,
		},
	}
	return utils.Serialize(messages)
}
