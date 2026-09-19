package broker

import (
	"context"
	"encoding/json"
	"log"

	"polling-backend/internal/models"
	"polling-backend/internal/websocket"

	"github.com/redis/go-redis/v9"
)

const PollUpdatesChannel = "channel:poll_updates"

func PublishVoteEvent(ctx context.Context, rdb *redis.Client, update *models.LiveUpdateMessage) error {
	data, err := json.Marshal(update)
	if err != nil {
		return err
	}

	err = rdb.Publish(ctx, PollUpdatesChannel, data).Err()
	if err != nil {
		log.Printf("Error publishing vote event to Redis: %v", err)
		return err
	}

	log.Printf("Published vote event to Redis channel '%s' for poll %s", PollUpdatesChannel, update.PollID)
	return nil
}

func StartRedisSubscriber(ctx context.Context, rdb *redis.Client, hub *websocket.Hub) {
	pubsub := rdb.Subscribe(ctx, PollUpdatesChannel)

	go func() {
		defer pubsub.Close()
		ch := pubsub.Channel()
		log.Printf("Redis Pub/Sub: Subscribed to channel '%s'", PollUpdatesChannel)

		for {
			select {
			case <-ctx.Done():
				log.Println("Redis Pub/Sub subscriber exiting")
				return
			case msg, ok := <-ch:
				if !ok {
					log.Println("Redis Pub/Sub channel closed")
					return
				}

				var update models.LiveUpdateMessage
				if err := json.Unmarshal([]byte(msg.Payload), &update); err != nil {
					log.Printf("Error unmarshaling Redis pubsub message: %v", err)
					continue
				}

				// Broadcast message to all WebSocket clients in this poll's room
				hub.BroadcastToPoll(update.PollID, []byte(msg.Payload))
				log.Printf("Broadcasted Redis event to WS clients for poll %s", update.PollID)
			}
		}
	}()
}
