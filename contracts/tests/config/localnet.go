package config

import "github.com/xssnick/tonutils-go/ton/wallet"

// NOTE: This funder wallet is from MyLocalTon pre-funded wallet
// ref: https://github.com/neodix42/mylocalton-docker#features

var (
	NetworkConfigFile = "http://127.0.0.1:8000/localhost.global.config.json"
	LiteClient        = "127.0.0.1:40004"

	FunderWalletSeed  = "viable model canvas decade neck soap turtle asthma bench crouch bicycle grief history envelope valid intact invest like offer urban adjust popular draft coral"
	FunderWalletVer   = wallet.V3R2
	FunderSubWalletID = 42

	FaucetHighloadWalletAddress = "0:d07625ea432039dc94dc019025f971bbeba0f7a1d9aaf6abfa94df70e60bca8f"
	FaucetHighloadWalletSeed    = "cement frequent produce tattoo casino tired road seat emotion nominee gloom busy father poet jealous all mail return one planet frozen over earth move"
	FaucetHighloadWalletVer     = wallet.HighloadV2R2
)
