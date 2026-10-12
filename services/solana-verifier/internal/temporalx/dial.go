// Package temporalx dials Temporal from environment variables: a local dev server by default,
// or Temporal Cloud when TEMPORAL_API_KEY is set.
package temporalx

import (
	"crypto/tls"
	"os"

	"go.temporal.io/sdk/client"
)

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// Dial connects using TEMPORAL_ADDRESS (default 127.0.0.1:7233), TEMPORAL_NAMESPACE (default "default")
// and, for Temporal Cloud, TEMPORAL_API_KEY.
//
// The default is 127.0.0.1 rather than localhost: where localhost resolves to ::1 first, gRPC can
// hang against `temporal server start-dev`, which listens on IPv4 only.
func Dial() (client.Client, error) {
	opts := client.Options{
		HostPort:  env("TEMPORAL_ADDRESS", "127.0.0.1:7233"),
		Namespace: env("TEMPORAL_NAMESPACE", client.DefaultNamespace),
	}
	if key := os.Getenv("TEMPORAL_API_KEY"); key != "" {
		opts.Credentials = client.NewAPIKeyStaticCredentials(key)
		opts.ConnectionOptions = client.ConnectionOptions{TLS: &tls.Config{}}
	}
	return client.Dial(opts)
}
