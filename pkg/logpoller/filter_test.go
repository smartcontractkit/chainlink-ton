package logpoller

import (
	"context"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/xssnick/tonutils-go/address"
	"github.com/xssnick/tonutils-go/tlb"

	"github.com/smartcontractkit/chainlink-common/pkg/logger"

	"github.com/smartcontractkit/chainlink-ton/pkg/logpoller/models"
)

// mockFilterStore tracks call counts to verify cache behavior
type mockFilterStore struct {
	filters             map[string]*models.Filter
	registerFilterCalls atomic.Int32
	hasFilterCalls      atomic.Int32
	unregisterCalls     atomic.Int32
	getAllActiveCalls   atomic.Int32
	nextID              int64
}

func newMockFilterStore() *mockFilterStore {
	return &mockFilterStore{
		filters: make(map[string]*models.Filter),
		nextID:  1,
	}
}

func (m *mockFilterStore) RegisterFilter(_ context.Context, f models.Filter) (int64, error) {
	m.registerFilterCalls.Add(1)
	id := m.nextID
	m.nextID++
	f.ID = id
	m.filters[f.Name] = &f
	return id, nil
}

func (m *mockFilterStore) UnregisterFilter(_ context.Context, name string) error {
	m.unregisterCalls.Add(1)
	delete(m.filters, name)
	return nil
}

func (m *mockFilterStore) HasFilter(_ context.Context, name string) (bool, error) {
	m.hasFilterCalls.Add(1)
	_, exists := m.filters[name]
	return exists, nil
}

func (m *mockFilterStore) GetDistinctAddresses(_ context.Context) ([]*address.Address, error) {
	return nil, nil
}

func (m *mockFilterStore) GetFiltersByAddress(_ context.Context, _ *address.Address) ([]models.Filter, error) {
	return nil, nil
}

func (m *mockFilterStore) GetAllActiveFilters(_ context.Context) ([]models.Filter, error) {
	m.getAllActiveCalls.Add(1)
	filters := make([]models.Filter, 0, len(m.filters))
	for _, f := range m.filters {
		filters = append(filters, *f)
	}
	return filters, nil
}

func (m *mockFilterStore) DeleteEmptyFilters(_ context.Context) (int64, error) {
	return 0, nil
}

func testAddress(t *testing.T) *address.Address {
	addr, err := address.ParseAddr("EQDKbjIcfM6ezt8KjKJJLshZJJSqX7XOA4ff-W72r5gqPrHF")
	require.NoError(t, err)
	return addr
}

func testAddress2(t *testing.T) *address.Address {
	addr, err := address.ParseAddr("EQBynBO23ywHy_CgarY9NK9FTz0yDsG82PtcbSTQgGoXwiuA")
	require.NoError(t, err)
	return addr
}

func newTestService(t *testing.T, store *mockFilterStore) *service {
	lggr := logger.Test(t)
	svc := &service{
		lggr:          logger.Sugared(lggr),
		filterStore:   store,
		filtersByName: make(map[string]*models.Filter),
	}
	return svc
}

func TestRegisterFilter_CacheHit(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)

	filter := models.Filter{
		Name:     "test-filter",
		Address:  testAddress(t),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x12345678,
	}

	// First call - should hit DB
	id1, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int32(1), store.registerFilterCalls.Load(), "first call should hit DB")

	// Second call with same config - should return from cache
	id2, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, id1, id2, "should return same ID")
	assert.Equal(t, int32(1), store.registerFilterCalls.Load(), "second call should NOT hit DB")

	// Third call - still cached
	id3, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, id1, id3)
	assert.Equal(t, int32(1), store.registerFilterCalls.Load(), "third call should NOT hit DB")
}

func TestRegisterFilter_ConfigChange(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)

	filter := models.Filter{
		Name:     "test-filter",
		Address:  testAddress(t),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x12345678,
	}

	// First registration
	id1, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int32(1), store.registerFilterCalls.Load())

	// Change EventSig - should hit DB
	filter.EventSig = 0x87654321
	id2, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.NotEqual(t, id1, id2, "should get new ID for changed config")
	assert.Equal(t, int32(2), store.registerFilterCalls.Load(), "config change should hit DB")
}

func TestRegisterFilter_AddressChange(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)

	filter := models.Filter{
		Name:     "test-filter",
		Address:  testAddress(t),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x12345678,
	}

	// First registration
	_, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int32(1), store.registerFilterCalls.Load())

	// Change Address - should hit DB
	filter.Address = testAddress2(t)
	_, err = svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)
	assert.Equal(t, int32(2), store.registerFilterCalls.Load(), "address change should hit DB")
}

func TestHasFilter_UsesCache(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true // Skip loadFilters

	// Pre-populate cache
	svc.filtersByName["cached-filter"] = &models.Filter{
		ID:   1,
		Name: "cached-filter",
	}

	// HasFilter should use cache, not DB
	exists, err := svc.HasFilter(ctx, "cached-filter")
	require.NoError(t, err)
	assert.True(t, exists)
	assert.Equal(t, int32(0), store.hasFilterCalls.Load(), "HasFilter should NOT hit DB")

	// Non-existent filter
	exists, err = svc.HasFilter(ctx, "non-existent")
	require.NoError(t, err)
	assert.False(t, exists)
	assert.Equal(t, int32(0), store.hasFilterCalls.Load(), "HasFilter should NOT hit DB")
}

func TestUnregisterFilter_UpdatesCache(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true

	// Register a filter first
	filter := models.Filter{
		Name:     "test-filter",
		Address:  testAddress(t),
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x12345678,
	}
	_, err := svc.RegisterFilter(ctx, filter)
	require.NoError(t, err)

	// Verify it's in cache
	exists, _ := svc.HasFilter(ctx, "test-filter")
	assert.True(t, exists)

	// Unregister
	err = svc.UnregisterFilter(ctx, "test-filter")
	require.NoError(t, err)

	// Verify removed from cache
	exists, _ = svc.HasFilter(ctx, "test-filter")
	assert.False(t, exists, "filter should be removed from cache")
}

func TestBuildFilterIndex(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true

	addr1 := testAddress(t)
	addr2 := testAddress2(t)

	// Pre-populate cache with filters
	svc.filtersByName["filter1"] = &models.Filter{
		ID:       1,
		Name:     "filter1",
		Address:  addr1,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x11111111,
	}
	svc.filtersByName["filter2"] = &models.Filter{
		ID:       2,
		Name:     "filter2",
		Address:  addr1,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x22222222,
	}
	svc.filtersByName["filter3"] = &models.Filter{
		ID:       3,
		Name:     "filter3",
		Address:  addr2,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x33333333,
	}

	filterIndex, err := svc.buildFilterIndex(ctx)
	require.NoError(t, err)

	// Verify index has correct entries
	assert.Len(t, filterIndex, 3, "should have 3 distinct filter keys")

	// Verify filters are in index (FilterIndex now stores []*Filter)
	key1 := models.FilterKey{Address: addr1, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x11111111}
	assert.Len(t, filterIndex[key1.String()], 1)
	assert.Equal(t, int64(1), filterIndex[key1.String()][0].ID)

	key2 := models.FilterKey{Address: addr1, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x22222222}
	assert.Len(t, filterIndex[key2.String()], 1)
	assert.Equal(t, int64(2), filterIndex[key2.String()][0].ID)

	key3 := models.FilterKey{Address: addr2, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x33333333}
	assert.Len(t, filterIndex[key3.String()], 1)
	assert.Equal(t, int64(3), filterIndex[key3.String()][0].ID)
}

func TestGetDistinctAddresses(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true

	addr1 := testAddress(t)
	addr2 := testAddress2(t)

	// Pre-populate cache - multiple filters on same address
	svc.filtersByName["filter1"] = &models.Filter{
		ID:      1,
		Name:    "filter1",
		Address: addr1,
	}
	svc.filtersByName["filter2"] = &models.Filter{
		ID:      2,
		Name:    "filter2",
		Address: addr1, // same address
	}
	svc.filtersByName["filter3"] = &models.Filter{
		ID:      3,
		Name:    "filter3",
		Address: addr2, // different address
	}

	addresses, err := svc.getDistinctAddresses(ctx)
	require.NoError(t, err)

	// Should return 2 unique addresses
	assert.Len(t, addresses, 2, "should return 2 distinct addresses")

	// Verify both addresses are present
	addrStrs := make(map[string]bool)
	for _, a := range addresses {
		addrStrs[a.String()] = true
	}
	assert.True(t, addrStrs[addr1.String()])
	assert.True(t, addrStrs[addr2.String()])
}

func TestLoadFilters_PopulatesCache(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)

	addr := testAddress(t)

	// Pre-populate store (simulates existing DB data)
	store.filters["existing"] = &models.Filter{
		ID:       99,
		Name:     "existing",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x99999999,
	}

	// loadFilters should populate cache
	err := svc.loadFilters(ctx)
	require.NoError(t, err)
	assert.Equal(t, int32(1), store.getAllActiveCalls.Load(), "should call GetAllActiveFilters")

	// Verify cache is populated
	assert.True(t, svc.filtersLoaded)
	cached, exists := svc.filtersByName["existing"]
	assert.True(t, exists)
	assert.Equal(t, int64(99), cached.ID)

	// Second call should not hit DB
	err = svc.loadFilters(ctx)
	require.NoError(t, err)
	assert.Equal(t, int32(1), store.getAllActiveCalls.Load(), "second call should NOT hit DB")
}

func TestFilterIndex_SameAddressDifferentEventSig(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true

	addr := testAddress(t)

	// Two filters on same address with different event signatures
	svc.filtersByName["filter1"] = &models.Filter{
		ID:       1,
		Name:     "filter1",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x11111111,
	}
	svc.filtersByName["filter2"] = &models.Filter{
		ID:       2,
		Name:     "filter2",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x22222222,
	}

	filterIndex, err := svc.buildFilterIndex(ctx)
	require.NoError(t, err)

	// Should have 2 separate keys (different EventSig)
	assert.Len(t, filterIndex, 2)

	key1 := models.FilterKey{Address: addr, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x11111111}
	key2 := models.FilterKey{Address: addr, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x22222222}

	assert.Len(t, filterIndex[key1.String()], 1)
	assert.Len(t, filterIndex[key2.String()], 1)
}

func TestFilterIndex_SameKey_MultipleFilters(t *testing.T) {
	ctx := context.Background()
	store := newMockFilterStore()
	svc := newTestService(t, store)
	svc.filtersLoaded = true

	addr := testAddress(t)

	// Two filters with exact same (Address, MsgType, EventSig)
	svc.filtersByName["filter1"] = &models.Filter{
		ID:       1,
		Name:     "filter1",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x11111111,
	}
	svc.filtersByName["filter2"] = &models.Filter{
		ID:       2,
		Name:     "filter2",
		Address:  addr,
		MsgType:  tlb.MsgTypeExternalOut,
		EventSig: 0x11111111, // same EventSig
	}

	filterIndex, err := svc.buildFilterIndex(ctx)
	require.NoError(t, err)

	// Should have 1 key with 2 filters
	assert.Len(t, filterIndex, 1)

	key := models.FilterKey{Address: addr, MsgType: tlb.MsgTypeExternalOut, EventSig: 0x11111111}
	filters := filterIndex[key.String()]
	assert.Len(t, filters, 2)

	// Collect IDs to verify both filters are present
	ids := make(map[int64]bool)
	for _, f := range filters {
		ids[f.ID] = true
	}
	assert.True(t, ids[1], "filter ID 1 should be in index")
	assert.True(t, ids[2], "filter ID 2 should be in index")
}
