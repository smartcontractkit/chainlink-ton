package relay

import (
	"context"
	"fmt"
	"math/big"

	tonaddress "github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/ton"
	"github.com/xssnick/tonutils-go/tvm/cell"

	commontypes "github.com/smartcontractkit/chainlink-common/pkg/types"
	tontypes "github.com/smartcontractkit/chainlink-common/pkg/types/chains/ton"

	"github.com/smartcontractkit/chainlink-ton/pkg/txm"
)

var _ commontypes.TONService = &Service{}

type Service struct {
	chain Chain
}

func NewService(chain Chain) Service {
	return Service{
		chain: chain,
	}
}

func (s *Service) GetMasterchainInfo(ctx context.Context) (*tontypes.BlockIDExt, error) {
	client, err := s.chain.GetClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON client for chain ID %s: %w", s.chain.ID(), err)
	}

	blockIDExt, err := client.GetMasterchainInfo(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to call GetMasterchainInfo for chain ID %s: %w", s.chain.ID(), err)
	}

	return &tontypes.BlockIDExt{
		Workchain: blockIDExt.Workchain,
		Shard:     blockIDExt.Shard,
		SeqNo:     blockIDExt.SeqNo,
	}, nil
}

func (s *Service) GetBlockData(ctx context.Context, block *tontypes.BlockIDExt) (*tontypes.Block, error) {
	client, err := s.chain.GetClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON client for chain ID %s: %w", s.chain.ID(), err)
	}

	blockIDExt := &ton.BlockIDExt{
		Workchain: block.Workchain,
		Shard:     block.Shard,
		SeqNo:     block.SeqNo,
	}

	blockData, err := client.GetBlockData(ctx, blockIDExt)
	if err != nil {
		return nil, fmt.Errorf("failed to get block data for chain ID %s: %w", s.chain.ID(), err)
	}

	return &tontypes.Block{GlobalID: blockData.GlobalID}, nil
}

func (s *Service) GetAccountBalance(ctx context.Context, address string, block *tontypes.BlockIDExt) (*tontypes.Balance, error) {
	client, err := s.chain.GetClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create TON client for chain ID %s: %w", s.chain.ID(), err)
	}

	blockIDExt := &ton.BlockIDExt{
		Workchain: block.Workchain,
		Shard:     block.Shard,
		SeqNo:     block.SeqNo,
	}

	addr, err := tonaddress.ParseAddr(address)
	if err != nil {
		return nil, fmt.Errorf("failed parsing address %s: %w", address, err)
	}

	acc, err := client.GetAccount(ctx, blockIDExt, addr)
	if err != nil {
		return nil, fmt.Errorf("failed to get account for address %s: %w", address, err)
	}

	var balance *big.Int
	if acc.State != nil {
		balance = acc.State.Balance.Nano()
	} else {
		balance = big.NewInt(0)
	}

	return &tontypes.Balance{
		Balance: balance,
	}, nil
}

func (s *Service) SendTx(ctx context.Context, msg tontypes.Message) error {
	toAddr, err := tonaddress.ParseAddr(msg.ToAddress)
	if err != nil {
		return fmt.Errorf("failed parsing msg.ToAddress %s: %w", msg.ToAddress, err)
	}

	body, err := cell.FromBOC(msg.Body)
	if err != nil {
		return fmt.Errorf("failed parsing msg.Body %s: %w", msg.Body, err)
	}

	stateInit, err := cell.FromBOC(msg.StateInit)
	if err != nil {
		return fmt.Errorf("failed parsing msg.StateInit %s: %w", msg.StateInit, err)
	}

	amount := tlb.MustFromTON(msg.Amount)

	txManager := s.chain.TxManager()
	signedClient := txManager.GetClient()
	fromWallet := signedClient.Wallet

	request := txm.Request{
		Mode:            msg.Mode,
		FromWallet:      fromWallet,
		ContractAddress: *toAddr,
		Amount:          amount,
		Body:            body,
		StateInit:       stateInit,
		Bounce:          msg.Bounce,
	}

	return txManager.Enqueue(request)
}

func (s *Service) GetTxStatus(ctx context.Context, lt uint64) (commontypes.TransactionStatus, tontypes.ExitCode, error) {
	status, exitCode, _, err := s.chain.TxManager().GetTransactionStatus(ctx, lt)
	return status, tontypes.ExitCode(exitCode), err
}

func (s *Service) GetTxExecutionFees(ctx context.Context, lt uint64) (*tontypes.TransactionFee, error) {
	status, _, totalActionFees, err := s.chain.TxManager().GetTransactionStatus(ctx, lt)
	if err != nil {
		return nil, fmt.Errorf("failed getting tx execution fees: %w", err)
	}

	if status != commontypes.Finalized && status != commontypes.Failed {
		return nil, fmt.Errorf("unexpected transaction status %q for lt %d: transaction not finalized", status, lt)
	}

	return &tontypes.TransactionFee{
		TransactionFee: totalActionFees.Nano(),
	}, nil
}

func (s *Service) HasFilter(ctx context.Context, name string) bool {
	// TODO(NONEVM-1460): implement
	return false
}

func (s *Service) RegisterFilter(ctx context.Context, filter tontypes.LPFilterQuery) error {
	// TODO(NONEVM-1460): implement
	return nil
}

func (s *Service) UnregisterFilter(ctx context.Context, name string) error {
	// TODO(NONEVM-1460): implement
	return nil
}
