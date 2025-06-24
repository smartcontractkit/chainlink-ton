package config

import (
	"context"
	"time"

	"github.com/xssnick/tonutils-go/ton/wallet"
)

var WalletVersion = wallet.ConfigHighloadV3{
	MessageTTL: 120, // 2 minutes TTL
	MessageBuilder: func(ctx context.Context, subWalletId uint32) (id uint32, createdAt int64, err error) {
		tm := time.Now().Unix() - 30
		return uint32(10000 + tm%(1<<23)), tm, nil
	},
}
