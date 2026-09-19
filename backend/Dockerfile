# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install git and ca-certificates
RUN apk add --no-cache git ca-certificates

# Copy go mod file
COPY go.mod ./

# Copy application source
COPY . .

# Download dependencies and generate complete go.sum checksums
RUN go mod tidy

# Build statically compiled binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/polling-backend ./cmd/server

# Final production runtime stage
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/polling-backend /app/polling-backend

EXPOSE 8080

ENV PORT=8080 \
    GIN_MODE=release

ENTRYPOINT ["/app/polling-backend"]
