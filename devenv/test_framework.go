package ccipton

import (
	"context"
	"errors"
	"math/big"
)

func (m *CCIP16TON) GetEOAReceiverAddress(ctx context.Context, chainSelector uint64) ([]byte, error) {
	return nil, errors.New("GetEOAReceiverAddress not implemented for TON")
}

func (m *CCIP16TON) GetTokenBalance(ctx context.Context, chainSelector uint64, address, tokenAddress []byte) (*big.Int, error) {
	return nil, errors.New("GetTokenBalance not implemented for TON")
}
