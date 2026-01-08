package ccipton

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"math/big"
	"strings"

	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/rs/zerolog"
	ccipocr3common "github.com/smartcontractkit/chainlink-common/pkg/types/ccipocr3"
	"github.com/smartcontractkit/chainlink-deployments-framework/deployment"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/clclient"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/blockchain"
	"github.com/smartcontractkit/chainlink-testing-framework/framework/components/simple_node_set"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton/wallet"

	testutils "github.com/smartcontractkit/chainlink-ton/deployment/utils"
	tonconfig "github.com/smartcontractkit/chainlink-ton/pkg/ton/config"
)

type CCIP16TON struct {
	e                   *deployment.Environment
	ExpectedSeqNumRange map[SourceDestPair]ccipocr3common.SeqNumRange
	ExpectedSeqNumExec  map[SourceDestPair][]uint64
	MsgSentEvents       []*AnyMsgSentEvent
}

func NewEmptyCCIP16TON() *CCIP16TON {
	return &CCIP16TON{
		ExpectedSeqNumRange: make(map[SourceDestPair]ccipocr3common.SeqNumRange),
		ExpectedSeqNumExec:  make(map[SourceDestPair][]uint64),
		MsgSentEvents:       make([]*AnyMsgSentEvent, 0),
	}
}

// NewCCIP16TON creates new smart-contracts wrappers with utility functions for CCIP16TON implementation.
func NewCCIP16TON(ctx context.Context, e *deployment.Environment) (*CCIP16TON, error) {
	_ = zerolog.Ctx(ctx)
	out := NewEmptyCCIP16TON()
	out.e = e
	return out, nil
}

func (m *CCIP16TON) SetCLDF(e *deployment.Environment) {
	m.e = e
}

func (m *CCIP16TON) ExposeMetrics(
	ctx context.Context,
	source, dest uint64,
	chainIDs []string,
	wsURLs []string,
) ([]string, *prometheus.Registry, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Exposing on-chain metrics")
	return []string{}, nil, nil
}

func (m *CCIP16TON) DeployLocalNetwork(ctx context.Context, bc *blockchain.Input) (*blockchain.Output, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Deploying TON networks")
	out, err := blockchain.NewBlockchainNetwork(bc)
	if err != nil {
		return nil, fmt.Errorf("failed to create blockchain network: %w", err)
	}
	return out, nil
}

func (m *CCIP16TON) ConfigureNodes(ctx context.Context, bc *blockchain.Input) (string, error) {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Configuring CL nodes for TON")
	name := "node-ton-" + uuid.New().String()[0:5]
	return fmt.Sprintf(`
	[[TON]]
	ChainID = '%s'
	Enabled = true
	NetworkName = 'ton-localnet'

	[[TON.Nodes]]
	Name = '%s'
	URL = '%s'`,
		bc.ChainID,
		name,
		strings.ReplaceAll(bc.Out.Nodes[0].InternalHTTPUrl, "@/", "@"),
	), nil
}

func (m *CCIP16TON) FundNodes(ctx context.Context, cls []*simple_node_set.Input, nodeKeyBundles map[string]clclient.NodeKeysBundle, bc *blockchain.Input, linkAmount, nativeAmount *big.Int) error {
	l := zerolog.Ctx(ctx)
	l.Info().Msg("Funding CL nodes with native and LINK")
	keys := make([]*address.Address, 0)
	amounts := make([]tlb.Coins, 0)
	for _, nk := range nodeKeyBundles {
		addr, err := GetNodeAddressFromBundle(&nk)
		if err != nil {
			return err
		}
		keys = append(keys, address.MustParseAddr(addr))
		amounts = append(amounts, tlb.MustFromTON(nativeAmount.String()))
	}
	client, err := testutils.CreateClient(ctx, bc.Out.Nodes[0].ExternalHTTPUrl)
	if err != nil {
		return fmt.Errorf("failed to create TON client: %w", err)
	}
	return testutils.FundWalletsNoT(client, keys, amounts)
}

func GetNodeAddressFromBundle(bundle *clclient.NodeKeysBundle) (string, error) {
	k, err := hex.DecodeString(bundle.TXKey.Data.Attributes.PublicKey)
	if err != nil {
		return "", fmt.Errorf("failed to decode public key: %w", err)
	}
	walletAddr, err := wallet.AddressFromPubKey(
		ed25519.PublicKey(k),
		tonconfig.WalletVersion,
		wallet.DefaultSubwallet,
		0,
	)
	if err != nil {
		return "", fmt.Errorf("failed to get wallet address from public key: %w", err)
	}
	return walletAddr.String(), nil
}
