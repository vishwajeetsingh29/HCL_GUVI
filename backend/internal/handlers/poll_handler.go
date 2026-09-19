package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"polling-backend/internal/broker"
	"polling-backend/internal/database"
	"polling-backend/internal/models"
	"polling-backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type PollHandler struct {
	mongo *database.MongoDB
	redis *redis.Client
	hub   *websocket.Hub
}

func NewPollHandler(mongo *database.MongoDB, redis *redis.Client, hub *websocket.Hub) *PollHandler {
	return &PollHandler{
		mongo: mongo,
		redis: redis,
		hub:   hub,
	}
}

func (h *PollHandler) CreatePoll(c *gin.Context) {
	userIDStr, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required to create a poll"})
		return
	}

	userOID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID in token"})
		return
	}

	var req models.CreatePollRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid payload: " + err.Error()})
		return
	}

	// Server-side validation
	if err := req.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Get creator name
	var user models.User
	_ = h.mongo.Users.FindOne(ctx, bson.M{"_id": userOID}).Decode(&user)

	now := time.Now().UTC()
	optionsList := make([]models.Option, 0, len(req.Options))
	for _, optText := range req.Options {
		optionsList = append(optionsList, models.Option{
			ID:        uuid.New().String(),
			Text:      strings.TrimSpace(optText),
			VoteCount: 0,
		})
	}

	poll := models.Poll{
		ID:          primitive.NewObjectID(),
		CreatorID:   userOID,
		CreatorName: user.Name,
		Question:    strings.TrimSpace(req.Question),
		Options:     optionsList,
		TotalVotes:  0,
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	_, err = h.mongo.Polls.InsertOne(ctx, poll)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create poll in database"})
		return
	}

	c.JSON(http.StatusCreated, poll)
}

func (h *PollHandler) GetPoll(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollOID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID format"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	var poll models.Poll
	err = h.mongo.Polls.FindOne(ctx, bson.M{"_id": pollOID}).Decode(&poll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error retrieving poll"})
		return
	}

	c.JSON(http.StatusOK, poll)
}

func (h *PollHandler) ListUserPolls(c *gin.Context) {
	userIDStr, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	userOID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := h.mongo.Polls.Find(ctx, bson.M{"creator_id": userOID}, opts)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to query user polls"})
		return
	}
	defer cursor.Close(ctx)

	polls := make([]models.Poll, 0)
	if err := cursor.All(ctx, &polls); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to decode polls"})
		return
	}

	c.JSON(http.StatusOK, polls)
}

func (h *PollHandler) CastVote(c *gin.Context) {
	pollIDStr := c.Param("id")
	pollOID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID format"})
		return
	}

	var req models.VoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid vote payload: " + err.Error()})
		return
	}

	req.OptionID = strings.TrimSpace(req.OptionID)
	if req.OptionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Option ID is required"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 8*time.Second)
	defer cancel()

	// 1. Verify poll exists and is active
	var existingPoll models.Poll
	err = h.mongo.Polls.FindOne(ctx, bson.M{"_id": pollOID}).Decode(&existingPoll)
	if err != nil {
		if err == mongo.ErrNoDocuments {
			c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database lookup error"})
		return
	}

	if existingPoll.Status != "active" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "This poll is closed and no longer accepting votes"})
		return
	}

	// 2. Validate option exists in this poll
	optionFound := false
	for _, opt := range existingPoll.Options {
		if opt.ID == req.OptionID {
			optionFound = true
			break
		}
	}
	if !optionFound {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Selected option does not belong to this poll"})
		return
	}

	// 3. Voter identifier to prevent duplicate voting
	clientIP := c.ClientIP()
	userAgent := c.Request.UserAgent()
	customFingerprint := c.GetHeader("X-Voter-Fingerprint")
	voterRaw := fmt.Sprintf("%s-%s-%s", clientIP, userAgent, customFingerprint)
	hasher := sha256.New()
	hasher.Write([]byte(voterRaw))
	voterHash := hex.EncodeToString(hasher.Sum(nil))

	// Check if this voter already voted in this poll
	var existingVote models.Vote
	err = h.mongo.Votes.FindOne(ctx, bson.M{
		"poll_id":          pollOID,
		"voter_identifier": voterHash,
	}).Decode(&existingVote)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "You have already cast your vote in this poll"})
		return
	}

	// 4. Insert vote record
	voteRecord := models.Vote{
		ID:              primitive.NewObjectID(),
		PollID:          pollOID,
		OptionID:        req.OptionID,
		VoterIdentifier: voterHash,
		CreatedAt:       time.Now().UTC(),
	}
	_, err = h.mongo.Votes.InsertOne(ctx, voteRecord)
	if err != nil {
		// If duplicate key error (due to concurrent votes from same voter)
		if mongo.IsDuplicateKeyError(err) {
			c.JSON(http.StatusConflict, gin.H{"error": "You have already cast your vote in this poll"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record vote"})
		return
	}

	// 5. Atomically increment option vote count & total votes
	updateFilter := bson.M{
		"_id":        pollOID,
		"options.id": req.OptionID,
	}
	updateOp := bson.M{
		"$inc": bson.M{
			"options.$.vote_count": 1,
			"total_votes":          1,
		},
		"$set": bson.M{
			"updated_at": time.Now().UTC(),
		},
	}

	var updatedPoll models.Poll
	afterOpt := options.After
	err = h.mongo.Polls.FindOneAndUpdate(
		ctx,
		updateFilter,
		updateOp,
		&options.FindOneAndUpdateOptions{ReturnDocument: &afterOpt},
	).Decode(&updatedPoll)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update poll tally"})
		return
	}

	// 6. Redis Pub/Sub: Publish live update event
	liveMsg := &models.LiveUpdateMessage{
		Type:       "poll_update",
		PollID:     updatedPoll.ID.Hex(),
		Question:   updatedPoll.Question,
		Options:    updatedPoll.Options,
		TotalVotes: updatedPoll.TotalVotes,
		Timestamp:  time.Now().UTC(),
	}

	if err := broker.PublishVoteEvent(ctx, h.redis, liveMsg); err != nil {
		// Log warning, but client vote is already saved
		fmt.Printf("Warning: Failed to publish live update to Redis: %v\n", err)
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Vote successfully recorded",
		"poll":    updatedPoll,
	})
}

func (h *PollHandler) DeletePoll(c *gin.Context) {
	userIDStr, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Authentication required"})
		return
	}

	userOID, err := primitive.ObjectIDFromHex(userIDStr.(string))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	pollIDStr := c.Param("id")
	pollOID, err := primitive.ObjectIDFromHex(pollIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid poll ID format"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	// Verify the poll belongs to the requesting user
	res, err := h.mongo.Polls.DeleteOne(ctx, bson.M{
		"_id":        pollOID,
		"creator_id": userOID,
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete poll"})
		return
	}

	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "Poll not found or you do not have permission to delete it"})
		return
	}

	// Clean up associated votes
	_, _ = h.mongo.Votes.DeleteMany(ctx, bson.M{"poll_id": pollOID})

	c.JSON(http.StatusOK, gin.H{"message": "Poll deleted successfully"})
}
