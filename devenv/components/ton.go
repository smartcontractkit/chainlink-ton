package components

import (
	"context"
	"fmt"
	"strconv"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/network"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/smartcontractkit/chainlink-testing-framework/framework"
)

const (
	FamilyTon                  = "ton"
	DefaultTonSimpleServerPort = "8000"
	liteServerPortOffset       = 100 // internal, arbitrary offset for lite server port
	// NOTE: Prefunded high-load wallet from MyLocalTon pre-funded wallet, that can send up to 254 messages per 1 external message
	// https://docs.ton.org/v3/documentation/smart-contracts/contracts-specs/highload-wallet#highload-wallet-v2
	DefaultTonHlWalletAddress  = "-1:5ee77ced0b7ae6ef88ab3f4350d8872c64667ffbe76073455215d3cdfab3294b"
	DefaultTonHlWalletMnemonic = "twenty unfair stay entry during please water april fabric morning length lumber style tomorrow melody similar forum width ride render void rather custom coin"
)

// Input is a blockchain network configuration params
type Input struct {
	Type               string                        `toml:"type" envconfig:"net_type"`
	Image              string                        `toml:"image"`
	PullImage          bool                          `toml:"pull_image"`
	Port               string                        `toml:"port"`
	WSPort             string                        `toml:"port_ws"`
	ChainID            string                        `toml:"chain_id"`
	ContainerResources *framework.ContainerResources `toml:"resources"`
	CustomEnv          map[string]string             `toml:"custom_env"`
	Out                *Output                       `toml:"out"`
}

// Output is a blockchain network output, ChainID and one or more nodes that forms the network
type Output struct {
	UseCache      bool                     `toml:"use_cache"`
	Type          string                   `toml:"type"`
	Family        string                   `toml:"family"`
	ContainerName string                   `toml:"container_name"`
	Container     testcontainers.Container `toml:"-"`
	ChainID       string                   `toml:"chain_id"`
	Nodes         []*Node                  `toml:"nodes"`
}

// Node represents blockchain node output, URLs required for connection locally and inside docker network
type Node struct {
	ExternalWSUrl   string `toml:"ws_url"`
	ExternalHTTPUrl string `toml:"http_url"`
	InternalWSUrl   string `toml:"internal_ws_url"`
	InternalHTTPUrl string `toml:"internal_http_url"`
}

type portMapping struct {
	SimpleServer string
	LiteServer   string
	DHTServer    string
	Console      string
	ValidatorUDP string
}

func defaultTon(in *Input) {
	if in.Image == "" {
		in.Image = "ghcr.io/neodix42/mylocalton-docker:latest"
	}
	if in.Port == "" {
		in.Port = DefaultTonSimpleServerPort
	}
}

func NewTONNetwork(in *Input) (*Output, error) {
	defaultTon(in)

	base, err := strconv.Atoi(in.Port)
	if err != nil {
		return nil, fmt.Errorf("invalid base port %s: %w", in.Port, err)
	}

	ports := &portMapping{
		SimpleServer: in.Port,
		LiteServer:   strconv.Itoa(base + liteServerPortOffset),
	}

	ctx := context.Background()

	network, err := network.New(ctx,
		network.WithAttachable(),
		network.WithLabels(framework.DefaultTCLabels()),
	)
	if err != nil {
		return nil, err
	}
	networkName := network.Name

	baseEnv := map[string]string{
		"GENESIS":                        "true",
		"NAME":                           "genesis",
		"LITE_PORT":                      ports.LiteServer,
		"CUSTOM_PARAMETERS":              "--state-ttl 315360000 --archive-ttl 315360000",
		"EMBEDDED_FILE_HTTP_SERVER":      "true",
		"EMBEDDED_FILE_HTTP_SERVER_PORT": in.Port,
	}

	// merge with additional environment variables from input
	finalEnv := baseEnv
	if in.CustomEnv != nil {
		for key, value := range in.CustomEnv {
			finalEnv[key] = value
		}
	}

	req := testcontainers.ContainerRequest{
		Image:           in.Image,
		AlwaysPullImage: in.PullImage,
		Name:            framework.DefaultTCName("ton-genesis"),
		ExposedPorts: []string{
			fmt.Sprintf("%s:%s/tcp", ports.SimpleServer, DefaultTonSimpleServerPort),
			fmt.Sprintf("%s:%s/tcp", ports.LiteServer, ports.LiteServer),
			"40003/udp",
			"40002/tcp",
			"40001/udp",
		},
		Networks:       []string{networkName},
		NetworkAliases: map[string][]string{networkName: {"genesis"}},
		Labels:         framework.DefaultTCLabels(),
		Env:            finalEnv,
		WaitingFor: wait.ForExec([]string{
			"/usr/local/bin/lite-client",
			"-a", fmt.Sprintf("127.0.0.1:%s", ports.LiteServer),
			"-b", "E7XwFSQzNkcRepUC23J2nRpASXpnsEKmyyHYV4u/FZY=",
			"-t", "3", "-c", "last",
		}).WithStartupTimeout(2 * time.Minute),
		Mounts: testcontainers.ContainerMounts{
			{
				Source: testcontainers.GenericVolumeMountSource{Name: fmt.Sprintf("shared-data-%s", networkName)},
				Target: "/usr/share/data",
			},
			{
				Source: testcontainers.GenericVolumeMountSource{Name: fmt.Sprintf("ton-db-%s", networkName)},
				Target: "/var/ton-work/db",
			},
		},
		HostConfigModifier: func(h *container.HostConfig) {
			framework.ResourceLimitsFunc(h, in.ContainerResources)
		},
	}

	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: req,
		Started:          true,
	})
	if err != nil {
		return nil, err
	}

	name, err := c.Name(ctx)
	if err != nil {
		return nil, err
	}

	return &Output{
		UseCache:      true,
		ChainID:       in.ChainID,
		Type:          in.Type,
		Family:        FamilyTon,
		ContainerName: name,
		Container:     c,
		Nodes: []*Node{{
			// Note: define if we need more access other than the global config(tonutils-go only uses liteclients defined in the config)
			ExternalHTTPUrl: fmt.Sprintf("%s:%s", "localhost", ports.SimpleServer),
			InternalHTTPUrl: fmt.Sprintf("%s:%s", name, DefaultTonSimpleServerPort),
		}},
	}, nil
}
