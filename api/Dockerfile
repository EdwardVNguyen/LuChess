# The API's image: one static binary on distroless, configured by environment
# variables alone. It applies pending migrations, then serves on PORT (8080).
# Build it from this directory, for one platform or both:
#
#   docker build -t luchess-api .
#   docker buildx build --platform linux/amd64,linux/arm64 -t luchess-api .

# Build on the machine's own platform and cross-compile for the target, so an
# arm64 image for the Pi never runs the Go toolchain under emulation.
FROM --platform=$BUILDPLATFORM golang:1.27-alpine AS build
WORKDIR /src

# Modules first, so this layer is reused until go.mod or go.sum changes.
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .

# CGO off gives a static binary that needs no libc, which distroless static
# does not have. -trimpath and -s -w keep local paths and symbols out of it.
ARG TARGETOS TARGETARCH
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/api .


# No shell or package manager, only CA certificates (for SMTP over TLS) and
# time zone data. The nonroot tag runs as uid 65532.
FROM gcr.io/distroless/static-debian13:nonroot

COPY --from=build /out/api /api

USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/api"]
