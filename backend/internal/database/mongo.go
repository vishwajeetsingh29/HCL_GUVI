package database

import (
	"context"
	"log"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoDB struct {
	Client *mongo.Client
	DB     *mongo.Database
	Users  *mongo.Collection
	Polls  *mongo.Collection
	Votes  *mongo.Collection
}

func ConnectMongo(uri, dbName string) (*MongoDB, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	clientOptions := options.Client().ApplyURI(uri)
	client, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		return nil, err
	}

	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	db := client.Database(dbName)
	usersCol := db.Collection("users")
	pollsCol := db.Collection("polls")
	votesCol := db.Collection("votes")

	mongoInstance := &MongoDB{
		Client: client,
		DB:     db,
		Users:  usersCol,
		Polls:  pollsCol,
		Votes:  votesCol,
	}

	if err := mongoInstance.ensureIndexes(); err != nil {
		log.Printf("Warning: failed to build some indexes: %v", err)
	}

	return mongoInstance, nil
}

func (m *MongoDB) ensureIndexes() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// 1. Users collection: Unique index on email
	_, err := m.Users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true).SetName("idx_users_email_unique"),
	})
	if err != nil {
		return err
	}

	// 2. Polls collection: Index on creator_id and status
	_, err = m.Polls.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "creator_id", Value: 1}},
			Options: options.Index().SetName("idx_polls_creator_id"),
		},
		{
			Keys:    bson.D{{Key: "status", Value: 1}, {Key: "created_at", Value: -1}},
			Options: options.Index().SetName("idx_polls_status_created"),
		},
	})
	if err != nil {
		return err
	}

	// 3. Votes collection: Index on poll_id and option_id for efficient aggregation
	// Compound index on (poll_id, voter_identifier) to prevent double voting from the same voter
	_, err = m.Votes.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{
			Keys:    bson.D{{Key: "poll_id", Value: 1}, {Key: "option_id", Value: 1}},
			Options: options.Index().SetName("idx_votes_poll_option"),
		},
		{
			Keys:    bson.D{{Key: "poll_id", Value: 1}, {Key: "voter_identifier", Value: 1}},
			Options: options.Index().SetUnique(true).SetName("idx_votes_poll_voter_unique"),
		},
	})
	if err != nil {
		return err
	}

	log.Println("MongoDB indexes successfully created/verified")
	return nil
}
