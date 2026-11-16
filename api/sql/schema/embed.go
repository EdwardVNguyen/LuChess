// Package schema embeds the Goose migrations so the API and the tests can apply
// them without depending on the working directory.
package schema

import "embed"

//go:embed *.sql
var FS embed.FS
