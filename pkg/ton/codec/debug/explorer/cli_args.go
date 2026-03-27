package explorer

import (
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

type cliInput struct {
	txHash  string
	address string
	net     string
}

func parseCLIInput(cmd *cobra.Command, args []string) (cliInput, error) {
	urlOrTx := args[0]
	txHash, address, parsedNet, parseURLErr := ParseURL(urlOrTx)
	if parseURLErr == nil {
		if cmd.Flags().Changed("net") {
			return cliInput{}, errors.New("cannot specify network flag when using URL")
		}
		if len(args) == 2 {
			address = args[1]
		}
		return cliInput{txHash: txHash, address: address, net: parsedNet}, nil
	}

	if len(urlOrTx) != 64 && (len(urlOrTx) != 66 || !strings.HasPrefix(urlOrTx, "0x")) {
		return cliInput{}, fmt.Errorf("failed to parse URL: %w", parseURLErr)
	}

	if _, err := hex.DecodeString(strings.TrimPrefix(urlOrTx, "0x")); err != nil {
		return cliInput{}, fmt.Errorf("invalid transaction hash or url: %w", err)
	}

	if len(args) == 2 {
		address = args[1]
	}

	return cliInput{txHash: urlOrTx, address: address}, nil
}
