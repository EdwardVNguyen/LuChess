// Package password hashes passwords with argon2id.
package password

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/argon2"
)

type Hasher struct {
	MemoryKiB   uint32
	Iterations  uint32
	Parallelism uint8
	SaltLen     uint32
	KeyLen      uint32
}

// DefaultHasher uses the OWASP-recommended argon2id settings (19 MiB, 2 iterations, 1 lane).
var DefaultHasher = Hasher{MemoryKiB: 19 * 1024, Iterations: 2, Parallelism: 1, SaltLen: 16, KeyLen: 32}

// Hash returns the password as a self-describing PHC string:
// $argon2id$v=19$m=...,t=...,p=...$<salt>$<hash>
func (h Hasher) Hash(plain string) (string, error) {
	// argon2 panics on some bad settings and silently weakens on others
	if h.Iterations < 1 || h.Parallelism < 1 || h.MemoryKiB < 8*uint32(h.Parallelism) || h.SaltLen < 8 || h.KeyLen < 16 {
		return "", errors.New("password: invalid argon2 settings")
	}
	salt := make([]byte, h.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}
	key := argon2.IDKey([]byte(plain), salt, h.Iterations, h.MemoryKiB, h.Parallelism, h.KeyLen)

	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, h.MemoryKiB, h.Iterations, h.Parallelism, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}

// Verify reports whether plain matches a hash made by Hash. It reads the cost
// settings from the hash itself, so hashes made with older settings still verify.
func Verify(plain, encoded string) (bool, error) {
	parts := strings.Split(encoded, "$")
	// "", "argon2id", "v=19", "m=..,t=..,p=..", salt, key
	if len(parts) != 6 || parts[1] != "argon2id" {
		return false, errors.New("password: not an argon2id hash")
	}
	var version int
	if _, err := fmt.Sscanf(parts[2], "v=%d", &version); err != nil || version != argon2.Version {
		return false, errors.New("password: unsupported argon2 version")
	}
	var memory, iterations uint32
	var parallelism uint8
	if _, err := fmt.Sscanf(parts[3], "m=%d,t=%d,p=%d", &memory, &iterations, &parallelism); err != nil {
		return false, errors.New("password: malformed argon2 parameters")
	}
	b64 := base64.RawStdEncoding
	salt, err := b64.DecodeString(parts[4])
	if err != nil {
		return false, errors.New("password: malformed salt")
	}
	want, err := b64.DecodeString(parts[5])
	if err != nil || len(want) == 0 {
		return false, errors.New("password: malformed hash")
	}

	got := argon2.IDKey([]byte(plain), salt, iterations, memory, parallelism, uint32(len(want)))
	return subtle.ConstantTimeCompare(got, want) == 1, nil
}
