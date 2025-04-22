module github.com/smartcontractkit/chainlink-ton/experimentation

go 1.23.6

toolchain go1.23.8

replace github.com/smartcontractkit/chainlink-ton/utils => ../utils

require (
	github.com/joho/godotenv v1.5.1
	github.com/smartcontractkit/chainlink-ton/utils v0.0.0
	github.com/stretchr/testify v1.10.0
	github.com/xssnick/tonutils-go v1.12.0
)

require (
	github.com/davecgh/go-spew v1.1.1 // indirect
	github.com/oasisprotocol/curve25519-voi v0.0.0-20220328075252-7dd334e3daae // indirect
	github.com/pmezard/go-difflib v1.0.0 // indirect
	github.com/sigurn/crc16 v0.0.0-20211026045750-20ab5afb07e3 // indirect
	golang.org/x/crypto v0.32.0 // indirect
	golang.org/x/sys v0.29.0 // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)
