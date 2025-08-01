package event

import (
	"testing"

	"github.com/xssnick/tonutils-go/address"
)

// TestExtractEventTopicFromAddress tests the logic for extracting a topic
// from the last 4 bytes of a TON address's data.
func TestExtractEventTopicFromAddress(t *testing.T) {
	// Define the test cases
	testCases := []struct {
		name          string
		buildAddr     func() *address.Address // Function to build the test address
		expectedTopic uint32
		expectError   bool
	}{
		{
			name: "Happy Path - Valid Topic",
			buildAddr: func() *address.Address {
				// This test case is based on the log data provided:
				// dst: "EXT:...e5f2827", topic: 241117223
				// 241117223 in hex is 0x0e5f2827
				data := make([]byte, 32)
				// Set the last 4 bytes to the topic
				data[28] = 0x0e
				data[29] = 0x5f
				data[30] = 0x28
				data[31] = 0x27
				return address.NewAddress(0, 0, data)
			},
			expectedTopic: 241117223,
			expectError:   false,
		},
		{
			name: "Error - Address Data Too Short",
			buildAddr: func() *address.Address {
				// Create an address with only 3 bytes of data
				data := []byte{0x01, 0x02, 0x03}
				return address.NewAddress(0, 0, data)
			},
			expectedTopic: 0, // Expect 0 on error
			expectError:   true,
		},
		{
			name: "Edge Case - Zero Topic",
			buildAddr: func() *address.Address {
				// Create an address with a topic of all zeros
				data := make([]byte, 32) // data is already all zeros
				return address.NewAddress(0, 0, data)
			},
			expectedTopic: 0,
			expectError:   false,
		},
		{
			name: "Edge Case - Max Value Topic",
			buildAddr: func() *address.Address {
				data := make([]byte, 32)
				// Set the last 4 bytes to the max uint32 value
				data[28] = 0xff
				data[29] = 0xff
				data[30] = 0xff
				data[31] = 0xff
				return address.NewAddress(0, 0, data)
			},
			expectedTopic: 4294967295, // 0xffffffff
			expectError:   false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			addr := tc.buildAddr()

			bucket := NewExtOutLogBucket(addr)
			topic, err := bucket.DecodeEventTopic()

			// Check for an unexpected error
			if !tc.expectError && err != nil {
				t.Fatalf("expected no error, but got: %v", err)
			}

			// Check for an expected error that did not occur
			if tc.expectError && err == nil {
				t.Fatalf("expected an error, but got none")
			}

			// If no error was expected, verify the topic
			if !tc.expectError && topic != tc.expectedTopic {
				t.Errorf("expected topic %d, but got %d", tc.expectedTopic, topic)
			}
		})
	}
}
