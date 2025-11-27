package model

import (
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

type Mapper[B any] interface {
	FromBinding(*B) error
	ToBinding() (*B, error)
}

// FromBindingDataHex loads a TL-B binding from hex and then populates the model.
func FromBindingDataHex[B any, M Mapper[B]](m M, dataHex string) error {
	data, err := hex.DecodeString(dataHex)
	if err != nil {
		return fmt.Errorf("decode hex: %w", err)
	}

	root, err := cell.FromBOC(data)
	if err != nil {
		return fmt.Errorf("decode BOC: %w", err)
	}

	if root == nil {
		return errors.New("parse BOC: nil root cell")
	}

	var raw B
	if err := tlb.LoadFromCell(&raw, root.BeginParse()); err != nil {
		return fmt.Errorf("decode TL-B object: %w", err)
	}

	return m.FromBinding(&raw)
}

// ToBindingDataHex converts the model to its binding and encodes it as TL-B hex.
func ToBindingDataHex[B any, M Mapper[B]](m M) (string, error) {
	binding, err := m.ToBinding()
	if err != nil {
		return "", err
	}

	root, err := tlb.ToCell(binding)
	if err != nil {
		return "", fmt.Errorf("encode TL-B to cell: %w", err)
	}

	return hex.EncodeToString(root.ToBOC()), nil
}

type Ownable2Step struct {
	Owner        *address.Address `json:"owner"`
	PendingOwner *address.Address `json:"pendingOwner,omitempty"`
}
