package model

import (
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"

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
	root, err := loadCell(dataHex)
	if err != nil {
		return err
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

// bigIntArrayToHexArray converts a []*big.Int to an array of hex string padded to exactly `size` bytes.
func bigIntArrayToHexArray(arr []*big.Int, size int) ([]string, error) {
	if arr == nil {
		return nil, nil
	}

	hexValues := make([]string, 0, len(arr))

	for _, v := range arr {
		h, err := bigIntToHex(v, size)
		if err != nil {
			return hexValues, err
		}
		hexValues = append(hexValues, h)
	}

	return hexValues, nil
}

// bigIntToHex converts a big.Int to a hex string padded to exactly `size` bytes.
func bigIntToHex(n *big.Int, size int) (string, error) {
	if n == nil {
		return "", errors.New("nil big.Int")
	}

	bytes := n.Bytes()

	// If integer does not fit in desired size
	if len(bytes) > size {
		return "", fmt.Errorf(
			"integer too large: needs %d bytes but size is %d",
			len(bytes), size,
		)
	}

	rootBytes := n.FillBytes(make([]byte, size))
	return hex.EncodeToString(rootBytes), nil
}

// hexToBigInt converts a hex string to a big int representation
func hexToBigInt(n string) (*big.Int, error) {
	rootBytes, err := hex.DecodeString(n)
	if err != nil {
		return nil, err
	}

	return new(big.Int).SetBytes(rootBytes), nil
}

func loadCell(dataHex string) (*cell.Cell, error) {
	data, err := hex.DecodeString(dataHex)
	if err != nil {
		return nil, fmt.Errorf("decode hex: %w", err)
	}

	root, err := cell.FromBOC(data)
	if err != nil {
		return nil, fmt.Errorf("decode BOC: %w", err)
	}

	if root == nil {
		return nil, errors.New("parse BOC: nil root cell")
	}

	return root, nil
}

type Ownable2Step struct {
	Owner        *address.Address `json:"owner"`
	PendingOwner *address.Address `json:"pendingOwner,omitempty"`
}
