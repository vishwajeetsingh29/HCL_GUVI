package config

import (
	"os"
)

type Config struct {
	Port          string
	MongoURI      string
	MongoDBName   string
	RedisAddr     string
	RedisPassword string
	JWTSecret     string
	CORSOrigin    string
}

func LoadConfig() *Config {
	return &Config{
		Port:          getEnv("PORT", "8080"),
		MongoURI:      getEnv("MONGO_URI", "mongodb://localhost:27017"),
		MongoDBName:   getEnv("MONGO_DB", "polling_db"),
		RedisAddr:     getEnv("REDIS_ADDR", "localhost:6379"),
		RedisPassword: getEnv("REDIS_PASSWORD", ""),
		JWTSecret:     getEnv("JWT_SECRET", "super-secret-polling-key-change-in-prod"),
		CORSOrigin:    getEnv("CORS_ORIGIN", "*"),
	}
}

func getEnv(key, defaultVal string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return defaultVal
}
