package models

import (
	"errors"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type Option struct {
	ID        string `bson:"id" json:"id"`
	Text      string `bson:"text" json:"text"`
	VoteCount int64  `bson:"vote_count" json:"vote_count"`
}

type Poll struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	CreatorID   primitive.ObjectID `bson:"creator_id" json:"creator_id"`
	CreatorName string             `bson:"creator_name,omitempty" json:"creator_name,omitempty"`
	Question    string             `bson:"question" json:"question"`
	Options     []Option           `bson:"options" json:"options"`
	TotalVotes  int64              `bson:"total_votes" json:"total_votes"`
	Status      string             `bson:"status" json:"status"` // "active" or "closed"
	CreatedAt   time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt   time.Time          `bson:"updated_at" json:"updated_at"`
}

type CreatePollRequest struct {
	Question string   `json:"question" binding:"required,min=5,max=300"`
	Options  []string `json:"options" binding:"required,min=2,max=10"`
}

func (r *CreatePollRequest) Validate() error {
	trimmedQ := strings.TrimSpace(r.Question)
	if len(trimmedQ) < 5 {
		return errors.New("question must be at least 5 characters long")
	}

	if len(r.Options) < 2 {
		return errors.New("a poll must have at least 2 options")
	}
	if len(r.Options) > 10 {
		return errors.New("a poll cannot have more than 10 options")
	}

	seen := make(map[string]bool)
	for _, opt := range r.Options {
		trimmedOpt := strings.TrimSpace(opt)
		if trimmedOpt == "" {
			return errors.New("poll options cannot be empty")
		}
		if len(trimmedOpt) > 200 {
			return errors.New("each option must not exceed 200 characters")
		}
		lower := strings.ToLower(trimmedOpt)
		if seen[lower] {
			return errors.New("poll options must be distinct")
		}
		seen[lower] = true
	}
	return nil
}

type VoteRequest struct {
	OptionID string `json:"option_id" binding:"required"`
}

type LiveUpdateMessage struct {
	Type       string    `json:"type"` // "poll_update"
	PollID     string    `json:"poll_id"`
	Question   string    `json:"question"`
	Options    []Option  `json:"options"`
	TotalVotes int64     `json:"total_votes"`
	Timestamp  time.Time `json:"timestamp"`
}
