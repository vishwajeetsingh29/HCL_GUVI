package database

import (
	"context"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

func ConnectRedis(addr, password string) (*redis.Client, error) {
	var rdb *redis.Client

	// Sanitize in case user accidentally copied quotes or REDIS_URL=
	addr = strings.TrimSpace(addr)
	addr = strings.TrimPrefix(addr, "REDIS_URL=")
	addr = strings.Trim(addr, "\"")
	addr = strings.Trim(addr, "'")

	if strings.HasPrefix(addr, "redis://") || strings.HasPrefix(addr, "rediss://") {
		opt, err := redis.ParseURL(addr)
		if err != nil {
			return nil, fmt.Errorf("invalid redis connection url: %w", err)
		}
		if password != "" && opt.Password == "" {
			opt.Password = password
		}
		rdb = redis.NewClient(opt)
	} else {
		rdb = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: password,
			DB:       0, // Default DB
		})
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	pong, err := rdb.Ping(ctx).Result()
	if err != nil {
		return nil, fmt.Errorf("redis ping failed: %w", err)
	}

	log.Printf("Connected to Redis at %s, ping response: %s", addr, pong)
	return rdb, nil
}
