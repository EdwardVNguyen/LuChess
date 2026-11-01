// Package password hashes passwords with argon2id.
package password

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

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
	salt := make([]byte, h.SaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("generating salt: %w", err)
	}
	key := argon2.IDKey([]byte(plain), salt, h.Iterations, h.MemoryKiB, h.Parallelism, h.KeyLen)

	b64 := base64.RawStdEncoding
	return fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, h.MemoryKiB, h.Iterations, h.Parallelism, b64.EncodeToString(salt), b64.EncodeToString(key)), nil
}
