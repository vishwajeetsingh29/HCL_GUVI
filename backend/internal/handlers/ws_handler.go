package handlers

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"polling-backend/internal/database"
	"polling-backend/internal/models"
	"polling-backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
)

type WSHandler struct {
	hub   *websocket.Hub
	mongo *database.MongoDB
}

func NewWSHandler(hub *websocket.Hub, mongo *database.MongoDB) *WSHandler {
	return &WSHandler{
		hub:   hub,
		mongo: mongo,
	}
}

func (h *WSHandler) HandleWebSocket(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollOID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID format"})
		return
	}

	conn, err := websocket.Upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("Failed to upgrade websocket: %v", err)
		return
	}

	client := &websocket.Client{
		Hub:    h.hub,
		Conn:   conn,
		Send:   make(chan []byte, 256),
		PollID: pollIDStr,
	}

	h.hub.RegisterClient(client)

	// Send initial poll state immediately to the newly connected client
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		var poll models.Poll
		if err := h.mongo.Polls.FindOne(ctx, bson.M{"_id": pollOID}).Decode(&poll); err == nil {
			initMsg := models.LiveUpdateMessage{
				Type:       "poll_update",
				PollID:     poll.ID.Hex(),
				Question:   poll.Question,
				Options:    poll.Options,
				TotalVotes: poll.TotalVotes,
				Timestamp:  time.Now().UTC(),
			}
			if msgBytes, err := json.Marshal(initMsg); err == nil {
				client.Send <- msgBytes
			}
		}
	}()

	go client.WritePump()
	go client.ReadPump()
}
