package sequence

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSanitizeString(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "simple string without quotes or padding",
			input:    "hello world",
			expected: "hello world",
		},
		{
			name:     "string with double quotes",
			input:    `this is a "quoted" string`,
			expected: "this is a 'quoted' string",
		},
		{
			name:     "string with multiple quotes",
			input:    `"hello" and "world" with "quotes"`,
			expected: "'hello' and 'world' with 'quotes'",
		},
		{
			name:     "string with padding spaces",
			input:    "  hello world",
			expected: "__hello world",
		},
		{
			name:     "string with varying padding",
			input:    "    indented line\n  less indented\nno indent",
			expected: "____indented line<br/>__less indented<br/>no indent",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := sanitizeString(tt.input)
			assert.Equalf(t, tt.expected, result, "Failed test: %s", tt.name)
		})
	}
}

func TestWrap(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		width    int
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			width:    10,
			expected: "",
		},
		{
			name:     "width zero or negative",
			input:    "hello world",
			width:    0,
			expected: "hello world",
		},
		{
			name:     "short text within width",
			input:    "hello",
			width:    10,
			expected: "hello",
		},
		{
			name:     "text exactly at width",
			input:    "hello world",
			width:    11,
			expected: "hello world",
		},
		{
			name:     "simple wrapping",
			input:    "hello world test",
			width:    10,
			expected: "hello<br/>world test",
		},
		{
			name:     "word longer than width",
			input:    strings.Repeat("a", 25),
			width:    10,
			expected: strings.Repeat("a", 10) + "<br/>" + strings.Repeat("a", 10) + "<br/>" + strings.Repeat("a", 5),
		},
		{
			name:     "mixed short and long words",
			input:    "hello " + strings.Repeat("b", 14) + " world",
			width:    10,
			expected: "hello<br/>" + strings.Repeat("b", 10) + "<br/>" + strings.Repeat("b", 4) + " world",
		},
		{
			name:     "preserve blank lines",
			input:    "line one<br/>line three",
			width:    20,
			expected: "line one<br/>line three",
		},
		{
			name:     "multiple consecutive blank lines",
			input:    "line one<br/>line four",
			width:    20,
			expected: "line one<br/>line four",
		},
		{
			name:     "blank lines with wrapping",
			input:    "this is a long line that needs wrapping<br/>this is another long line that also needs wrapping",
			width:    20,
			expected: "this is a long line<br/>that needs wrapping<br/>this is another long<br/>line that also needs<br/>wrapping",
		},
		{
			name:     "single character width",
			input:    "hello",
			width:    1,
			expected: "h<br/>e<br/>l<br/>l<br/>o",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := wrap(tt.input, tt.width)
			assert.Equalf(t, tt.expected, result, "Failed test: %s", tt.name)
		})
	}
}
