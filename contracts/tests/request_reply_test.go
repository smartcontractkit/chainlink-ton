package experimentation

import (
	"fmt"
	"math/rand/v2"
	"sync"
	"testing"

	request_reply "github.com/smartcontractkit/chainlink-ton/contracts/wrappers/examples/request-reply"
	"github.com/smartcontractkit/chainlink-ton/pkg/utils"
	"github.com/stretchr/testify/assert"
	"github.com/xssnick/tonutils-go/address"
)

type Msg struct {
	Sender string
}

type LogMsg struct {
	Sender string
	Msg    Msg
}

type Logger struct {
	logs chan LogMsg
}

func NewLogger() *Logger {
	return &Logger{
		logs: make(chan LogMsg, 100),
	}
}

func (l *Logger) Start() {
	go func() {
		for log := range l.logs {
			Logf("%s -> %s\n", log.Msg.Sender, log.Sender)
		}
	}()
}

func (l *Logger) GetHandle(name string) *LoggerHandle {
	return &LoggerHandle{
		name: name,
		logs: l.logs,
	}
}

type LoggerHandle struct {
	name string
	logs chan LogMsg
}

func (l *LoggerHandle) Log(e LogMsg) {
	l.logs <- e
}

type Actor struct {
	Name string
	Addr *address.Address
}

type ActorRegistry struct {
	Lock         sync.RWMutex
	Actors       *map[string]Actor
	Logger       *Logger
	ApiClient    utils.ApiClient
	UnknownCount uint
}

func NewActorRegistry(apiClient utils.ApiClient) *ActorRegistry {
	logger := NewLogger()
	logger.Start()
	return &ActorRegistry{
		Actors:    &map[string]Actor{},
		Logger:    logger,
		ApiClient: apiClient,
	}
}

func (ar *ActorRegistry) GetActor(name string) (Actor, bool) {
	ar.Lock.RLock()
	defer ar.Lock.RUnlock()
	actor, ok := (*ar.Actors)[name]
	if !ok {
		return Actor{}, false
	}
	return actor, true
}

func (ar *ActorRegistry) addActor(address *address.Address, name string) string {
	ar.Lock.Lock()
	if name == "" {
		name = fmt.Sprintf("UnknownActor%d", ar.UnknownCount)
		ar.UnknownCount++
	}
	(*ar.Actors)[address.String()] = Actor{
		Name: name,
		Addr: address,
	}
	ar.Lock.Unlock()
	Logf("Actor added: %s -> %s\n", address.String(), name)
	return name
}

func (ar *ActorRegistry) AddActor(address *address.Address, lt uint64, name string) {
	name = ar.addActor(address, name)
	handle := ar.Logger.GetHandle(name)
	go func() {
		msgs := ar.ApiClient.SubscribeToMessages(*address, 0)
		for msg := range msgs {
			if msg == nil {
				continue
			}
			sender := "external"
			if msg.InternalMsg != nil {
				senderActor, ok := ar.GetActor(msg.InternalMsg.SenderAddr().String())
				if !ok {
					ar.addActor(msg.InternalMsg.SenderAddr(), "")
					senderActor, _ = ar.GetActor(msg.InternalMsg.SenderAddr().String())
				}
				sender = senderActor.Name
			}
			handle.Log(LogMsg{
				Sender: name,
				Msg: Msg{
					Sender: sender,
				},
			})
		}
	}()
}

func TestRequestReply(t *testing.T) {
	t.Run("TestRequestReply", func(t *testing.T) {
		const initialAmmount = 1_000_000_000_000
		seeders := setUpTest(t, initialAmmount, 1)
		alice := seeders[0]

		const transferAmount = 100
		actorRegistry := NewActorRegistry(alice)
		actorRegistry.AddActor(alice.Wallet.WalletAddress(), uint64(0), "Alice")

		Logf("\n\n\n\n\n\nTest Setup\n==========================\n")

		priceIndex := []string{
			"apple",
			"banana",
		}
		prices := map[string]uint64{
			"apple":  100,
			"banana": 200,
		}
		newVar := len(priceIndex)
		itemAddresses := make([]*address.Address, newVar)
		Logf("len(itemAddresses): %d\n", len(itemAddresses))

		Logf("Deploying ItemPrice contracts\n")
		for index, name := range priceIndex {
			Logf("Deploying ItemPrice %s", name)
			itemPrice, err := request_reply.NewItemPriceProvider(alice).Deploy(request_reply.ItemPriceIninData{ID: (rand.Uint32()), Price: prices[name]})
			assert.NoError(t, err, "Failed to deploy ItemPrice contract: %v", err)
			Logf("ItemPrice contract deployed at %s\n", itemPrice.Contract.Address.String())
			itemAddresses[index] = itemPrice.Contract.Address
			actorRegistry.AddActor(itemPrice.Contract.Address, uint64(0), fmt.Sprintf("ItemPrice%s", name))
		}

		Logf("Deploying PriceRegistry contract with addresses %+v: \n", itemAddresses)
		priceRegistry, err := request_reply.NewPriceRegistryProvider(alice).Deploy(request_reply.PriceRegistryIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy PriceRegistry contract: %v", err)
		Logf("PriceRegistry contract deployed at %s\n", priceRegistry.Contract.Address.String())
		actorRegistry.AddActor(priceRegistry.Contract.Address, uint64(0), "PriceRegistry")

		for index, name := range priceIndex {
			Logf("Sending AddPriceItem request for %s, key: %d, addr: %s\n", name, uint8(index), itemAddresses[index].String())
			_, _, err := priceRegistry.SendAddPriceItem(uint8(index), itemAddresses[index])
			assert.NoError(t, err, "Failed to send AddPriceItem request: %v", err)
			Logf("AddPriceItem request sent\n")
		}

		Logf("Deploying Storage contract\n")
		storage, err := request_reply.NewStorageProvider(alice).Deploy(request_reply.StorageIninData{ID: (rand.Uint32())})
		assert.NoError(t, err, "Failed to deploy Storage contract: %v", err)
		Logf("Storage contract deployed at %s\n", storage.Contract.Address.String())
		actorRegistry.AddActor(storage.Contract.Address, uint64(0), "Storage")

		Logf("\n\n\n\n\n\nTest Started\n==========================\n")

		for index, name := range priceIndex {
			Logf("Sending GetPrice request for %s\n", name)
			_, _, err = storage.SendGetPriceFrom(priceRegistry.Contract.Address, uint8(index))
			assert.NoError(t, err, "Failed to send GetPriceFrom request: %v", err)
			Logf("GetPriceFrom request sent\n")

			Logf("Checking result\n")
			result, err := storage.GetValue()
			assert.NoError(t, err, "Failed to get value: %v", err)
			expectedPrice := prices[name]
			assert.Equal(t, expectedPrice, result, "Expected price %d, got %d", expectedPrice, result)
			Logf("Result: %d\n", result)
		}

		Logf("Test completed successfully\n")
	})
}
