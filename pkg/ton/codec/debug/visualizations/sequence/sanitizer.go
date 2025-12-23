package sequence

import (
	"strings"
	"unicode/utf8"
)

func sanitizeString(s string) string {
	var b strings.Builder
	for i, line := range strings.Split(s, "\n") {
		if i > 0 {
			b.WriteString("<br/>")
		}
		withoutPadding := strings.TrimLeft(line, " ")
		paddingLen := len(line) - len(withoutPadding)

		if paddingLen > 0 {
			b.WriteString(strings.Repeat("_", paddingLen))
		}
		b.WriteString(withoutPadding)
	}
	const wrapWidth = 80
	description := wrap(b.String(), wrapWidth)
	description = strings.ReplaceAll(description, "\"", "'")
	return description
}

// wrap wraps s to the given width. It preserves blank lines as paragraph breaks.
// Words longer than width are split. If width <= 0, s is returned unchanged.
func wrap(s string, width int) string {
	if width <= 0 {
		return s
	}

	var out []string
	paras := strings.Split(s, "<br/>")

	for i := range paras {
		p := paras[i]

		// Preserve consecutive blank lines
		if strings.TrimSpace(p) == "" {
			out = append(out, "")
			continue
		}

		words := strings.Fields(p)
		var line strings.Builder
		lineRunes := 0

		flush := func() {
			if line.Len() > 0 {
				out = append(out, line.String())
				line.Reset()
				lineRunes = 0
			}
		}

		for _, w := range words {
			wLen := utf8.RuneCountInString(w)

			// If the word itself is longer than width, hard split it.
			for wLen > width {
				// fill remaining space first if the current line isn't empty
				if lineRunes > 0 {
					flush()
				}
				// take 'width' runes of w
				part := takeRunes(w, width)
				out = append(out, part)
				w = dropRunes(w, width)
				wLen = utf8.RuneCountInString(w)
			}

			switch {
			case lineRunes == 0:
				// start a new line
				line.WriteString(w)
				lineRunes = wLen
			case lineRunes+1+wLen <= width:
				// add to current line with a space
				line.WriteByte(' ')
				line.WriteString(w)
				lineRunes += 1 + wLen
			default:
				// wrap
				flush()
				line.WriteString(w)
				lineRunes = wLen
			}
		}

		flush()
	}

	// Join lines, but keep single trailing newline behavior similar to input
	return strings.Join(out, "<br/>")
}

// takeRunes returns the first n runes of s.
func takeRunes(s string, n int) string {
	if n <= 0 {
		return ""
	}
	i := 0
	for pos := range s {
		if i == n {
			return s[:pos]
		}
		i++
	}
	return s // s has <= n runes
}

// dropRunes drops the first n runes of s and returns the rest.
func dropRunes(s string, n int) string {
	if n <= 0 {
		return s
	}
	i := 0
	for pos := range s {
		if i == n {
			return s[pos:]
		}
		i++
	}
	return ""
}
