package ccipton

import (
	"context"
	"errors"
)

func (m *CCIP16TON) GetEOAReceiverAddress(ctx context.Context, chainSelector uint64) ([]byte, error) {
	return nil, errors.New("GetEOAReceiverAddress not implemented for TON")
}
