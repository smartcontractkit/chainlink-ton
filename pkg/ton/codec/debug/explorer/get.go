package explorer

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"

	"github.com/spf13/cobra"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/ton"
	"go.uber.org/zap/zapcore"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"golang.org/x/term"

	"github.com/smartcontractkit/chainlink-ton/pkg/bindings"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/common"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/codec/debug"
	"github.com/smartcontractkit/chainlink-ton/pkg/ton/tvm"
)

func newGetCmd(lggr *logger.Logger, contracts map[string]debug.TypeAndVersion, apiClient *ton.APIClient) *cobra.Command {
	var (
		net          string
		verbose      bool
		contractType string
		namedArgs    []string
	)

	cmd := &cobra.Command{
		Use:   "get <address> [getter_name] [args...]",
		Short: "Execute a getter",
		ValidArgsFunction: func(cmd *cobra.Command, args []string, toComplete string) ([]string, cobra.ShellCompDirective) {
			if len(args) == 0 {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}
			if len(args) > 1 && args[1] != "" {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			targetAddr, err := address.ParseAddr(args[0])
			if err != nil {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			log, err := buildCmdLogger(lggr, false)
			if err != nil {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			if apiClient != nil && cmd.Flags().Changed("net") {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			ctx := context.Background()
			explorerClient, err := Connect(log, apiClient, net, false, 1, 1)
			if err != nil {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			effectiveContractType, err := resolveContractType(ctx, explorerClient, targetAddr, contractType, contracts)
			if err != nil {
				return nil, cobra.ShellCompDirectiveNoFileComp
			}

			candidates := listGetterNames(effectiveContractType)
			if toComplete == "" {
				return candidates, cobra.ShellCompDirectiveNoFileComp
			}

			filtered := make([]string, 0, len(candidates))
			for _, candidate := range candidates {
				if strings.HasPrefix(candidate, toComplete) {
					filtered = append(filtered, candidate)
				}
			}

			return filtered, cobra.ShellCompDirectiveNoFileComp
		},
		Args: func(cmd *cobra.Command, args []string) error {
			if len(args) < 1 {
				return errors.New("requires <address>")
			}
			return nil
		},
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) < 1 {
				return errors.New("requires <address>")
			}

			log, err := buildCmdLogger(lggr, verbose)
			if err != nil {
				return err
			}

			if apiClient != nil && cmd.Flags().Changed("net") {
				return errors.New("cannot specify network flag when using existing client")
			}

			targetAddr, err := address.ParseAddr(args[0])
			if err != nil {
				return fmt.Errorf("failed to parse contract address: %w", err)
			}

			ctx := context.Background()
			explorerClient, err := Connect(log, apiClient, net, verbose, 1, 1)
			if err != nil {
				return fmt.Errorf("failed to initialize explorer: %w", err)
			}

			effectiveContractType, err := resolveContractType(ctx, explorerClient, targetAddr, contractType, contracts)
			if err != nil {
				return err
			}

			availableGetters := listGetterNames(effectiveContractType)
			if len(availableGetters) == 0 {
				return fmt.Errorf("no getters registered for %q", effectiveContractType)
			}

			getterName := ""
			if len(args) >= 2 {
				getterName = args[1]
			} else {
				selected, selectErr := selectGetterInteractive(cmd, targetAddr.String(), effectiveContractType, availableGetters)
				if selectErr != nil {
					return selectErr
				}
				getterName = selected
			}

			desc, err := resolveGetterDescriptor(effectiveContractType, getterName)
			if err != nil {
				return err
			}

			named, err := parseNamedArgs(namedArgs)
			if err != nil {
				return err
			}

			positional := []string{}
			if len(args) > 2 {
				positional = args[2:]
			}

			interactive := term.IsTerminal(int(os.Stdin.Fd()))
			inputValue, err := buildGetterInput(desc, positional, named, interactive, promptForArgValue)
			if err != nil {
				return err
			}

			params, err := desc.Encode(inputValue)
			if err != nil {
				return fmt.Errorf("failed to encode getter %q args: %w", getterName, err)
			}

			api := explorerClient.resilientAPI()
			block, err := api.CurrentMasterchainInfo(ctx)
			if err != nil {
				return fmt.Errorf("failed to get current block: %w", err)
			}

			result, err := api.RunGetMethod(ctx, block, targetAddr, desc.MethodName, params...)
			if err != nil {
				return fmt.Errorf("failed to run getter %q: %w", desc.MethodName, err)
			}
			decoded, err := desc.Decode(result)
			if err != nil {
				return fmt.Errorf("failed to decode getter %q result: %w", desc.MethodName, err)
			}

			fmt.Fprintln(cmd.OutOrStdout(), formatGetterResult(decoded))
			return nil
		},
	}

	cmd.Flags().StringVarP(&net, "net", "n", "testnet", "TON network (mainnet, testnet, mylocalton, or http://domain/x.global.config.json)")
	cmd.Flags().StringVarP(&contractType, "contract-type", "t", "", "Contract type (e.g. link.chain.ton.ccip.Router)")
	cmd.Flags().StringArrayVar(&namedArgs, "arg", nil, "Getter argument in name=value form (repeatable)")
	if lggr == nil {
		cmd.Flags().BoolVarP(&verbose, "verbose", "v", false, "Enable debug logs")
	}

	return cmd
}

func buildCmdLogger(lggr *logger.Logger, verbose bool) (logger.Logger, error) {
	if lggr != nil {
		return *lggr, nil
	}

	config := logger.Config{}
	if verbose {
		config.Level = zapcore.DebugLevel
	}
	log, err := config.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create logger: %w", err)
	}
	return log, nil
}

func resolveContractType(ctx context.Context, c *client, targetAddr *address.Address, contractTypeFlag string, contracts map[string]debug.TypeAndVersion) (string, error) {
	if contractTypeFlag != "" {
		return contractTypeFlag, nil
	}

	if tv, ok := contracts[targetAddr.String()]; ok && tv.Type != "" {
		return tv.Type, nil
	}

	api := c.resilientAPI()
	block, err := api.CurrentMasterchainInfo(ctx)
	if err != nil {
		return "", fmt.Errorf("failed to get current block for contract type resolution: %w", err)
	}

	result, err := api.RunGetMethod(ctx, block, targetAddr, common.GetTypeAndVersion.Name)
	if err != nil {
		return "", errors.New("contract type is required; pass --contract-type (automatic resolution via typeAndVersion failed)")
	}
	decoded, err := common.GetTypeAndVersion.Decoder.Decode(result)
	if err != nil {
		return "", errors.New("contract type is required; pass --contract-type (failed to decode typeAndVersion)")
	}
	if decoded.Type == "" {
		return "", errors.New("contract type is required; pass --contract-type")
	}

	return decoded.Type, nil
}

func resolveRegisteredGetter(contractType string, getterName string) (any, bool) {
	mapsToSearch := []bindings.GetterMap{
		bindings.TypeToGetterMap[contractType],
		bindings.TypeToGetterMap["link.chain.ton.ccip.Common"],
		bindings.TypeToGetterMap[bindings.TypeOwnable],
	}
	for _, getterMap := range mapsToSearch {
		getter, ok := getterMap[getterName]
		if ok {
			return getter, true
		}
	}
	return nil, false
}

func formatGetterResult(decoded any) string {
	formatted, err := json.MarshalIndent(decoded, "", "  ")
	if err == nil {
		return string(formatted)
	}
	return fmt.Sprintf("%+v", decoded)
}

func isNoArgsInputType(t reflect.Type) bool {
	if t == reflect.TypeOf(tvm.NoArgs{}) {
		return true
	}

	// Some bindings model no-args getters as Getter[struct{}, R].
	return t.Kind() == reflect.Struct && t.NumField() == 0
}

func selectGetterInteractive(cmd *cobra.Command, addr string, contractType string, options []string) (string, error) {
	fd := int(os.Stdin.Fd())
	if !term.IsTerminal(fd) {
		return "", errors.New("getter_name is required in non-interactive mode")
	}

	out := cmd.OutOrStdout()
	reader := bufio.NewReader(os.Stdin)
	fmt.Fprintf(out, "Select getter for %s (%s):\n", addr, contractType)
	for i, opt := range options {
		fmt.Fprintf(out, "  %d) %s\n", i+1, opt)
	}
	fmt.Fprintln(out, "  0) cancel")

	for {
		fmt.Fprintf(out, "Enter number [0-%d]: ", len(options))
		line, err := reader.ReadString('\n')
		if err != nil {
			return "", fmt.Errorf("interactive selector failed: %w", err)
		}

		choice := strings.TrimSpace(line)
		index, convErr := strconv.Atoi(choice)
		if convErr != nil || index < 0 || index > len(options) {
			fmt.Fprintln(out, "Invalid selection, try again.")
			continue
		}
		if index == 0 {
			return "", errors.New("selection canceled")
		}

		return options[index-1], nil
	}
}
