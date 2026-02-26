package explorer

import (
	"errors"
	"fmt"
)

type Format int

const (
	FormatTree Format = iota
	FormatSequenceURL
	FormatSequenceRaw
)

func parseFormat(visualization string, format string) (Format, error) {
	switch visualization {
	case "tree":
		if format != "" {
			return Format(0), errors.New("format option is not applicable for tree visualization")
		}
		return FormatTree, nil
	case "sequence":
		switch format {
		case "", "url":
			return FormatSequenceURL, nil
		case "raw":
			return FormatSequenceRaw, nil
		}
		return Format(0), fmt.Errorf("invalid sequence format: %s", format)
	}
	return Format(0), fmt.Errorf("invalid visualization format: %s", visualization)
}
