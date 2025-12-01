package model

import (
	"math/big"
	"testing"

	"github.com/xssnick/tonutils-go/address"

	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/bindings/offramp"
	"github.com/smartcontractkit/chainlink-ton/pkg/ccip/model"

	"github.com/stretchr/testify/require"
)

func TestDecodeOffRampData(t *testing.T) {
	// GIVEN: a offramp storage model
	ownerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAu8e")
	pendingOwnerAddress := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABZ_5")
	feeQuoter := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA_8_")
	rmnRouter := address.MustParseAddr("EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABI_Y")
	deployerCode := "b5ee9c72410102010061000114ff00f4a413f4bcf2c80b0100a4d3f891f240ed44d0fa403082009218f89258c705f2f4d72c25d233223c98d4d74c01fb04ed54e0d72c274af08ab48e1fd4d4fa00d74c03fb0401ed54f828c8cf8508ce01fa0271cf0b6accc971fb00e0f23fe2550eb4"
	merkleRootCode := "b5ee9c7241020e01000266000114ff00f4a413f4bcf2c80b0102016202030240d0f891f24020d72c201c76f48ce302d72c200cfa6694e30230840f01c700f2f40405020148060701f831ed44d0d3fffa40d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d4d31fd3ffd3000193fa003092306de203d020d3ff31d33f31d33f31d70b3f8200bb215318be955317bbc3009170e2f2f45307a18200bb2121c140f2f47321aa00ac27b001aa00ad8200bb1f21c003917f9521c000c300e2f2f4256eb30801fe31ed44d0d3fffa40d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d33fd70b0720c203f2458200bb215325be955324bbc3009170e2f2f45314a18200bb2121c140f2f47321aa00ac24b001aa00ad8200bb2001c302f2f48200bb215325be955324bbc3009170e2f2f45114a18200bb2121c140f2f47321aa00acb3090201200a0b000bb86858101df801fe8e17f8232aa15005bc8200bb1e01917f9524c003c300e2f2f49a348200bb1c24c000f2f4e28200bb215318be955317bbc3009170e2f2f427a18200bb2121c140f2f47321aa00acb316b005aa00ae15b104c8cec9c8cf931cf56a2acc29cf0bffcbff226e946c12cf8195cf8358fa02e2cb07c9c8cf858826cf1671cf0b6ecc0c018213b002aa005210ac12b101c0029306a406de5312a1a427ba8e9288c8cf858826cf1671cf0b6eccc98306fb00de05c8cbff14ce12cb3fcb3fcb3fcb7fcb0fc9ed540d005bb62bf1a10b1b7b69731b430b4b73634b735973a37b71731b1b4b81726b2b935b632a937b7ba4116a625c6c5c6110000fb5c51040176394100032c98040fb0005c8cbff14ce12cb3fcb3fcb3fcb7fcb0fc9ed540000f98aee45"
	receiveExecutorCode := "b5ee9c7241020f0100021c000114ff00f4a413f4bcf2c80b01020162020304f8d0f891f24020d72c2326697e948e6631ed44d0fa40d4fa40d3bfd30131d33f31d18200840bf89225c705f2f404d3000193fa003092306de2f823c8cf858825cf16821058cfcb02cf0b8e24cf1426cf0bbf226e946c12cf8195cf8358fa02e2c98040fb0003c8ce12ccce12cbbfcf8580cb3fc9ed54e089d727e30289040506070201480809000800e5dd9701fe31ed44d0fa40d4fa40d3bfd301d33fd18200840bf89227c705f2f406fa40308200840902c00112f2f423d0d3ffd33fd33fd33fd33fd431d431fa40fa0031f40431d1068200840a07c70516f2f4c8cf91679585c214cbff12cb3fcb3fcb3fcb3f21cf0bbf22cf16c9c8cf858825cf1671cf0b6eccc98306fb0003c8ce12ccce0a000805dee1bb0118d727e30230840f01c700f2f40b0201200c0d000bb868581015280014cbbfcf8780cb3fc9ed5401fe31ed44d0fa40d4fa40d3bfd301d33fd18200840bf89227c705f2f406fa40308200840902c00112f2f423d0d3ffd33fd33fd33fd33fd431d431fa40fa0031f40431d1068200840a07c70516f2f4c8cf905dfaf40e14cbff12cb3fcb3fcb3fcb3f21cf0bbf22cf16c9c8cf858825cf1671cf0b6eccc98040fb0003c8ce12ccce0e0065b62bf1a1331b7b69731b430b4b73634b735973a37b71731b1b4b8172932b1b2b4bb32a2bc32b1baba37b94116a625c6c5c6110000fb5c51040108114100014cbbfcf8680cb3fc9ed541fda8d59"
	commitSigners := []string{
		"031a8e6486f688260ac6c785158bf55a890b5c084286135910d0d2c00ed3ffc1",
		"28701bcf04074c4ac8d967eb917c70182a1456d0f4e6475424c7b78c9628a044",
		"7d2bb364019d6b1c6797764ff0cbc389348e1a06295f526f3f45be1b86f807ec",
		"9f47d53bebac3400c00e2ae0cefda055b9b233cc5177e6dd0daabc0fb3990dc5",
	}
	transmitters := []*address.Address{
		ownerAddress,
		feeQuoter,
		rmnRouter,
		pendingOwnerAddress,
	}
	configDigest := "000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c9"
	var chainSelector1 uint64 = 14767482510784806043
	var chainSelector2 uint64 = 16015286601757825753
	var tonChainSelector uint64 = 1399300952838017768
	onRamp1 := "f3a9c7d8124efb669a21be88d5c4a91737deaa01"
	onRamp2 := "9bd62cee17a40f59c81203bb48c15ef3a5fdc47e"

	storage, err := model.NewOffRampStorageBuilder().
		WithID(1000).
		WithOwnable(
			ownerAddress.Copy(),
			pendingOwnerAddress.Copy(),
		).
		WithRMNRouter(rmnRouter.Copy()).
		WithDeployerCode(deployerCode).
		WithMerkleRootCode(merkleRootCode).
		WithReceiveExecutorCode(receiveExecutorCode).
		WithFeeQuoter(feeQuoter.Copy()).
		WithOCR3BaseChainID(1).
		WithOCR3CommitConfig(&model.OCR3Config{
			Signers:      commitSigners,
			Transmitters: transmitters,
			ConfigDigest: configDigest,
			F:            1,
			N:            4,
		}).
		WithOCR3ExecuteConfig(&model.OCR3Config{
			Transmitters: transmitters,
			ConfigDigest: configDigest,
			F:            1,
			N:            0,
		}).
		WithCursedSubject(new(big.Int).SetUint64(chainSelector1)).
		WithCursedSubject(new(big.Int).SetUint64(chainSelector2)).
		WithChainSelector(tonChainSelector).
		WithPermissionlessExecutionThresholdSeconds(uint32(120)).
		WithLatestPriceSequenceNumber(uint64(1000)).
		WithSourceChainConfig(chainSelector1, model.SourceChainConfig{
			Router:                    rmnRouter,
			IsEnabled:                 true,
			MinSeqNr:                  1,
			IsRMNVerificationDisabled: false,
			OnRamp:                    onRamp1,
		}).
		WithSourceChainConfig(chainSelector2, model.SourceChainConfig{
			Router:                    rmnRouter,
			IsEnabled:                 false,
			MinSeqNr:                  2,
			IsRMNVerificationDisabled: true,
			OnRamp:                    onRamp2,
		}).
		Build()
	require.NoError(t, err)

	t.Run("TestModel", func(t *testing.T) {
		t.Parallel()

		// ID
		require.Equal(t, uint32(1000), storage.ID)

		// Ownable
		require.Equal(t, ownerAddress, storage.Ownable.Owner)
		require.Equal(t, pendingOwnerAddress, storage.Ownable.PendingOwner)

		// RMN Router
		require.Equal(t, rmnRouter, storage.Deployables.RMNRouter)

		// Code cells / code hashes
		require.Equal(t, deployerCode, storage.Deployables.Deployer)
		require.Equal(t, merkleRootCode, storage.Deployables.MerkleRootCode)
		require.Equal(t, receiveExecutorCode, storage.Deployables.ReceiveExecutorCode)

		// FeeQuoter
		require.Equal(t, feeQuoter, storage.FeeQuoter)

		// OCR3 base chain ID
		require.Equal(t, 1, storage.OCR3Base.ChainID)

		// OCR3 Commit config
		require.NotNil(t, storage.OCR3Base.Commit)
		require.Equal(t, configDigest, storage.OCR3Base.Commit.ConfigDigest)
		require.Equal(t, 1, storage.OCR3Base.Commit.F)
		require.Equal(t, 4, storage.OCR3Base.Commit.N)
		require.Len(t, storage.OCR3Base.Commit.Signers, len(commitSigners))
		require.Equal(t, commitSigners, storage.OCR3Base.Commit.Signers)
		require.Len(t, storage.OCR3Base.Commit.Transmitters, len(transmitters))
		require.Equal(t, transmitters, storage.OCR3Base.Commit.Transmitters)

		// OCR3 Execute config
		require.NotNil(t, storage.OCR3Base.Execute)
		require.Equal(t, configDigest, storage.OCR3Base.Execute.ConfigDigest)
		require.Equal(t, 1, storage.OCR3Base.Execute.F)
		require.Equal(t, 0, storage.OCR3Base.Execute.N)
		require.Empty(t, storage.OCR3Base.Execute.Signers)
		require.Len(t, storage.OCR3Base.Execute.Transmitters, len(transmitters))
		require.Equal(t, transmitters, storage.OCR3Base.Execute.Transmitters)

		// Cursed subjects (2 entries)
		require.Len(t, storage.CursedSubjects, 2)

		require.Equal(t, storage.CursedSubjects[0].Uint64(), chainSelector1)
		require.Equal(t, storage.CursedSubjects[1].Uint64(), chainSelector2)

		// Chain selector
		require.Equal(t, tonChainSelector, storage.ChainSelector)

		// Permissionless execution threshold
		require.Equal(t, uint32(120), storage.PermissionlessExecutionThresholdSeconds)

		// Latest price sequence number
		require.Equal(t, uint64(1000), storage.LatestPriceSequenceNumber)

		// Source chain configs map
		require.Len(t, storage.SourceChainConfigs, 2)

		cfg1, ok := storage.SourceChainConfigs[chainSelector1]
		require.True(t, ok)
		require.Equal(t, rmnRouter, cfg1.Router)
		require.True(t, cfg1.IsEnabled)
		require.Equal(t, uint64(1), cfg1.MinSeqNr)
		require.False(t, cfg1.IsRMNVerificationDisabled)
		require.Equal(t, onRamp1, cfg1.OnRamp)

		cfg2, ok := storage.SourceChainConfigs[chainSelector2]
		require.True(t, ok)
		require.Equal(t, rmnRouter, cfg2.Router)
		require.False(t, cfg2.IsEnabled)
		require.Equal(t, uint64(2), cfg2.MinSeqNr)
		require.True(t, cfg2.IsRMNVerificationDisabled)
		require.Equal(t, onRamp2, cfg2.OnRamp)
	})

	t.Run("TestMapper", func(t *testing.T) {
		t.Parallel()

		hexData := "b5ee9c724102350100076d0004f9000003e880000000000000000000000000000000000000000000000000000000000000000050000000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000001c4dad43360f1a4ba0000001e200000000000007d1001020304034380000000000000000000000000000000000000000000000000000000000000000090050607020301e00809021390c000000000000000340a0b0202760c0d0114ff00f4a413f4bcf2c80b0e0114ff00f4a413f4bcf2c80b0f0114ff00f4a413f4bcf2c80b100245000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c901047011120145000a8a867649d8f27ab8131eee7667e2526465dc44e734004d4759a63a4409c9010030120011bccf0a31a221f3c9b80011bce41ba4fc9d91ad98008fbccf0a31a221f3c9b800000000000000000000000000000000000000000000000000000000000000000900000000000000010a79d4e3ec09277db34d10df446ae2548b9bef5500c0008fbce41ba4fc9d91ad9800000000000000000000000000000000000000000000000000000000000000000800000000000000028a4deb16770bd207ace40901dda460af79d2fee23f4000a4d3f891f240ed44d0fa403082009218f89258c705f2f4d72c25d233223c98d4d74c01fb04ed54e0d72c274af08ab48e1fd4d4fa00d74c03fb0401ed54f828c8cf8508ce01fa0271cf0b6accc971fb00e0f23f0201621314020162151602012017180245a110000000000000000000000000000000000000000000000000000000000000000010191a0240d0f891f24020d72c201c76f48ce302d72c200cfa6694e30230840f01c700f2f41b1c0201481d1e04f8d0f891f24020d72c2326697e948e6631ed44d0fa40d4fa40d3bfd30131d33f31d18200840bf89225c705f2f404d3000193fa003092306de2f823c8cf858825cf16821058cfcb02cf0b8e24cf1426cf0bbf226e946c12cf8195cf8358fa02e2c98040fb0003c8ce12ccce12cbbfcf8580cb3fc9ed54e089d727e302891f202122020148232402012025260043bfcfa3ea9df5d61a0060071570677ed02adcd919e628bbf36e86d55e07d9cc86e2c00201582727020148272701f831ed44d0d3fffa40d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d4d31fd3ffd3000193fa003092306de203d020d3ff31d33f31d33f31d70b3f8200bb215318be955317bbc3009170e2f2f45307a18200bb2121c140f2f47321aa00ac27b001aa00ad8200bb1f21c003917f9521c000c300e2f2f4256eb32801fe31ed44d0d3fffa40d33fd33fd33fd37fd70b0f8200bb1df89227c705f2f407d33fd70b0720c203f2458200bb215325be955324bbc3009170e2f2f45314a18200bb2121c140f2f47321aa00ac24b001aa00ad8200bb2001c302f2f48200bb215325be955324bbc3009170e2f2f45114a18200bb2121c140f2f47321aa00acb3290201202a2b000bb86858101df8000800e5dd9701fe31ed44d0fa40d4fa40d3bfd301d33fd18200840bf89227c705f2f406fa40308200840902c00112f2f423d0d3ffd33fd33fd33fd33fd431d431fa40fa0031f40431d1068200840a07c70516f2f4c8cf91679585c214cbff12cb3fcb3fcb3fcb3f21cf0bbf22cf16c9c8cf858825cf1671cf0b6eccc98306fb0003c8ce12ccce2c000805dee1bb0118d727e30230840f01c700f2f42d0201202e2f000bb8685810152802012030310042bfbd2bb364019d6b1c6797764ff0cbc389348e1a06295f526f3f45be1b86f807ec00012001fe8e17f8232aa15005bc8200bb1e01917f9524c003c300e2f2f49a348200bb1c24c000f2f4e28200bb215318be955317bbc3009170e2f2f427a18200bb2121c140f2f47321aa00acb316b005aa00ae15b104c8cec9c8cf931cf56a2acc29cf0bffcbff226e946c12cf8195cf8358fa02e2cb07c9c8cf858826cf1671cf0b6ecc32018213b002aa005210ac12b101c0029306a406de5312a1a427ba8e9288c8cf858826cf1671cf0b6eccc98306fb00de05c8cbff14ce12cb3fcb3fcb3fcb7fcb0fc9ed5433005bb62bf1a10b1b7b69731b430b4b73634b735973a37b71731b1b4b81726b2b935b632a937b7ba4116a625c6c5c6110000fb5c51040176394100014cbbfcf8780cb3fc9ed5401fe31ed44d0fa40d4fa40d3bfd301d33fd18200840bf89227c705f2f406fa40308200840902c00112f2f423d0d3ffd33fd33fd33fd33fd431d431fa40fa0031f40431d1068200840a07c70516f2f4c8cf905dfaf40e14cbff12cb3fcb3fcb3fcb3f21cf0bbf22cf16c9c8cf858825cf1671cf0b6eccc98040fb0003c8ce12ccce340065b62bf1a1331b7b69731b430b4b73634b735973a37b71731b1b4b8172932b1b2b4bb32a2bc32b1baba37b94116a625c6c5c6110000fb5c51040108114100041bf46351cc90ded104c158d8f0a2b17eab51216b810850c26b221a1a5801da7ff830041bf50e0379e080e989591b2cfd722f8e0305428ada1e9cc8ea8498f6f192c5140890032c98040fb0005c8cbff14ce12cb3fcb3fcb3fcb7fcb0fc9ed5400000014cbbfcf8680cb3fc9ed54cb65490d"

		AssertHexMappingRoundTrip[offramp.Storage](
			t,
			hexData,
			storage, // original
			func() model.Mapper[offramp.Storage] {
				// empty instance to decode into
				return &model.OffRampStorage{}
			},
		)
	})
}
