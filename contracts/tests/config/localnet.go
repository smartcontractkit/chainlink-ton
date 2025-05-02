package config

import (
	"github.com/xssnick/tonutils-go/ton/wallet"
)

// ref: https://github.com/neodix42/mylocalton-docker#features
var (
	NetworkConfigFile = "http://127.0.0.1:8000/localhost.global.config.json"
	LiteClient        = "127.0.0.1:40004"

	// NOTE: This funder high-load wallet is from MyLocalTon pre-funded wallet
	FaucetHlWalletAddress     = "-1:5ee77ced0b7ae6ef88ab3f4350d8872c64667ffbe76073455215d3cdfab3294b"
	FaucetHlWalletSeed        = "twenty unfair stay entry during please water april fabric morning length lumber style tomorrow melody similar forum width ride render void rather custom coin"
	FaucetHlWalletSubwalletID = uint32(42)
	FaucetHlWalletVer         = wallet.HighloadV2Verified
	FaucetBatchSize           = 100
)
