package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"polling-backend/internal/broker"
	"polling-backend/internal/config"
	"polling-backend/internal/database"
	"polling-backend/internal/handlers"
	"polling-backend/internal/middleware"
	"polling-backend/internal/websocket"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("Starting Polling Backend Service on port %s...", cfg.Port)

	// 1. Connect to MongoDB
	mongoDB, err := database.ConnectMongo(cfg.MongoURI, cfg.MongoDBName)
	if err != nil {
		log.Fatalf("Failed to connect to MongoDB: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = mongoDB.Client.Disconnect(ctx)
	}()
	log.Println("Successfully connected to MongoDB")

	// 2. Connect to Redis
	redisClient, err := database.ConnectRedis(cfg.RedisAddr, cfg.RedisPassword)
	if err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	defer redisClient.Close()
	log.Println("Successfully connected to Redis")

	// 3. Initialize WebSocket Hub
	hub := websocket.NewHub()
	go hub.Run()
	log.Println("WebSocket Hub initialized")

	// 4. Start Redis Pub/Sub Subscriber
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	broker.StartRedisSubscriber(ctx, redisClient, hub)

	// 5. Initialize Handlers
	authHandler := handlers.NewAuthHandler(mongoDB, cfg.JWTSecret)
	pollHandler := handlers.NewPollHandler(mongoDB, redisClient, hub)
	wsHandler := handlers.NewWSHandler(hub, mongoDB)

	// 6. Setup Gin Router
	router := gin.Default()
	router.Use(middleware.CORSMiddleware(cfg.CORSOrigin))

	// Root welcome endpoint
	router.GET("/", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"service":   "PulsePoll Live Polling Backend API",
			"status":    "online",
			"health":    "/health",
			"websocket": "/ws/polls/:id",
			"timestamp": time.Now().UTC(),
		})
	})

	// Health check endpoint
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":    "ok",
			"timestamp": time.Now().UTC(),
			"services": gin.H{
				"mongodb": "healthy",
				"redis":   "healthy",
			},
		})
	})

	// API Route Group
	api := router.Group("/api")
	{
		// Authentication routes
		auth := api.Group("/auth")
		{
			auth.POST("/signup", authHandler.Signup)
			auth.POST("/login", authHandler.Login)
			auth.GET("/me", middleware.AuthMiddleware(cfg.JWTSecret), authHandler.Me)
		}

		// Polls routes
		polls := api.Group("/polls")
		{
			// Public routes
			polls.GET("/:id", pollHandler.GetPoll)
			polls.POST("/:id/vote", pollHandler.CastVote)

			// Protected routes (require valid JWT)
			protectedPolls := polls.Group("")
			protectedPolls.Use(middleware.AuthMiddleware(cfg.JWTSecret))
			{
				protectedPolls.POST("", pollHandler.CreatePoll)
				protectedPolls.GET("/user", pollHandler.ListUserPolls)
				protectedPolls.DELETE("/:id", pollHandler.DeletePoll)
			}
		}
	}

	// WebSocket route
	router.GET("/ws/polls/:id", wsHandler.HandleWebSocket)

	// Graceful shutdown server setup
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server ListenAndServe error: %v", err)
		}
	}()

	log.Printf("Server listening on http://0.0.0.0:%s", cfg.Port)

	// Wait for interrupt signal to gracefully shut down
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server gracefully...")

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server stopped")
}
