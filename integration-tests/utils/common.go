package utils

import (
	"fmt"

	"github.com/xssnick/tonutils-go/tlb"
	"github.com/xssnick/tonutils-go/tvm/cell"
)

func LoadEventFromCell[T any](cell *cell.Cell) (T, error) {
	var event T
	if cell == nil {
		return event, fmt.Errorf("cell is nil")
	}
	err := tlb.LoadFromCell(&event, cell.BeginParse())
	if err != nil {
		return event, fmt.Errorf("failed to parse %T event: %w", event, err)
	}
	return event, nil
}

func LoadEventFromMsg[T any](msg *tlb.ExternalMessageOut) (T, error) {
	var event T
	if msg.Body == nil {
		return event, fmt.Errorf("message body is nil")
	}
	return LoadEventFromCell[T](msg.Body)
}
