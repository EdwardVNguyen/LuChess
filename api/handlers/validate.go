package handler

import (
	"errors"
	"net/mail"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxEmailLen    = 254
	minNameLen     = 2
	maxNameLen     = 32
	minPasswordLen = 10
	maxPasswordLen = 128
)

// normalizeEmail trims and lowercases, so Ada@x.com and ada@x.com are one account.
func normalizeEmail(raw string) string {
	return strings.ToLower(strings.TrimSpace(raw))
}

func validateEmail(email string) error {
	bad := errors.New("Enter a valid email address")
	if email == "" || len(email) > maxEmailLen {
		return bad
	}
	addr, err := mail.ParseAddress(email)
	if err != nil || addr.Address != email {
		return bad
	}
	at := strings.LastIndex(email, "@")
	if !strings.Contains(email[at+1:], ".") {
		return bad
	}
	return nil
}

func validateName(name string) error {
	n := utf8.RuneCountInString(name)
	if n < minNameLen || n > maxNameLen || strings.IndexFunc(name, unicode.IsControl) >= 0 {
		return errors.New("Display name must be 2 to 32 characters with no control characters")
	}
	return nil
}

func validatePassword(password string) error {
	n := utf8.RuneCountInString(password)
	if n < minPasswordLen || n > maxPasswordLen {
		return errors.New("Password must be 10 to 128 characters")
	}
	return nil
}
