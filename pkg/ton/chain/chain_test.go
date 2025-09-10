package chain

import (
	"testing"
)

func TestParseLiteserverURL(t *testing.T) {
	tests := []struct {
		name          string
		liteserverURL string
		expectedKey   string
		expectedHost  string
		expectError   bool
	}{
		{
			name:          "valid liteserver URL",
			liteserverURL: "liteserver://Wh9d90TE4OuVG7JSicGUTJurymI79lQMIzSGg0vo2LA=@80.78.65.251:53539",
			expectedKey:   "Wh9d90TE4OuVG7JSicGUTJurymI79lQMIzSGg0vo2LA=",
			expectedHost:  "80.78.65.251:53539",
			expectError:   false,
		},
		{
			name:          "missing liteserver prefix",
			liteserverURL: "http://Wh9d90TE4OuVG7JSicGUTJurymI79lQMIzSGg0vo2LA=@80.78.65.251:53539",
			expectedKey:   "",
			expectedHost:  "",
			expectError:   true,
		},
		{
			name:          "missing @ separator",
			liteserverURL: "liteserver://Wh9d90TE4OuVG7JSicGUTJurymI79lQMIzSGg0vo2LA_80.78.65.251:53539",
			expectedKey:   "",
			expectedHost:  "",
			expectError:   true,
		},
		{
			name:          "multiple @ separators",
			liteserverURL: "liteserver://Wh9d90TE4OuVG7JSicGUTJurymI79lQMIzSGg0vo2LA=@80.78.65.251@53539",
			expectedKey:   "",
			expectedHost:  "",
			expectError:   true,
		},
		{
			name:          "empty URL",
			liteserverURL: "",
			expectedKey:   "",
			expectedHost:  "",
			expectError:   true,
		},
		{
			name:          "only prefix",
			liteserverURL: "liteserver://",
			expectedKey:   "",
			expectedHost:  "",
			expectError:   true,
		},
		{
			name:          "valid URL with different key format",
			liteserverURL: "liteserver://AbCdEfGhIjKlMnOpQrStUvWxYz1234567890+/=@192.168.1.1:8080",
			expectedKey:   "AbCdEfGhIjKlMnOpQrStUvWxYz1234567890+/=",
			expectedHost:  "192.168.1.1:8080",
			expectError:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			publicKey, hostPort, err := parseLiteserverURL(tt.liteserverURL)

			if tt.expectError {
				if err == nil {
					t.Errorf("expected error but got none")
				}
				return
			}

			if err != nil {
				t.Errorf("unexpected error: %v", err)
				return
			}

			if publicKey != tt.expectedKey {
				t.Errorf("expected public key %q, got %q", tt.expectedKey, publicKey)
			}

			if hostPort != tt.expectedHost {
				t.Errorf("expected host:port %q, got %q", tt.expectedHost, hostPort)
			}
		})
	}
}
