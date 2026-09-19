package websocket

import (
	"log"
	"sync"
)

type Hub struct {
	// Rooms maps pollID to a set of active clients
	rooms      map[string]map[*Client]bool
	register   chan *Client
	unregister chan *Client
	broadcast  chan BroadcastPayload
	mutex      sync.RWMutex
}

type BroadcastPayload struct {
	PollID  string
	Message []byte
}

func NewHub() *Hub {
	return &Hub{
		rooms:      make(map[string]map[*Client]bool),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan BroadcastPayload, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			if _, ok := h.rooms[client.PollID]; !ok {
				h.rooms[client.PollID] = make(map[*Client]bool)
			}
			h.rooms[client.PollID][client] = true
			log.Printf("WS: Client connected to poll %s (total in room: %d)", client.PollID, len(h.rooms[client.PollID]))
			h.mutex.Unlock()

		case client := <-h.unregister:
			h.mutex.Lock()
			if clients, ok := h.rooms[client.PollID]; ok {
				if _, exists := clients[client]; exists {
					delete(clients, client)
					close(client.Send)
					log.Printf("WS: Client disconnected from poll %s (remaining: %d)", client.PollID, len(clients))
				}
				if len(clients) == 0 {
					delete(h.rooms, client.PollID)
				}
			}
			h.mutex.Unlock()

		case payload := <-h.broadcast:
			h.mutex.RLock()
			clients, ok := h.rooms[payload.PollID]
			if ok {
				for client := range clients {
					select {
					case client.Send <- payload.Message:
					default:
						close(client.Send)
						delete(clients, client)
					}
				}
			}
			h.mutex.RUnlock()
		}
	}
}

func (h *Hub) BroadcastToPoll(pollID string, message []byte) {
	h.broadcast <- BroadcastPayload{
		PollID:  pollID,
		Message: message,
	}
}

func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

func (h *Hub) UnregisterClient(client *Client) {
	h.unregister <- client
}
