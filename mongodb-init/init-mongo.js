// MongoDB Database Initialization Script
// Sets up database, collections, validation rules, and performance indexes

const dbName = 'polling_db';
const dbInstance = db.getSiblingDB(dbName);

print('Initializing ' + dbName + ' schema and indexes...');

// 1. Users Collection
dbInstance.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'password_hash', 'name', 'created_at'],
      properties: {
        email: {
          bsonType: 'string',
          pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
          description: 'must be a valid email address string and is required'
        },
        password_hash: {
          bsonType: 'string',
          description: 'bcrypt hash of password is required'
        },
        name: {
          bsonType: 'string',
          minLength: 2,
          description: 'full name is required'
        },
        created_at: {
          bsonType: 'date',
          description: 'creation timestamp is required'
        }
      }
    }
  }
});

// Index for Users: Fast lookup and unique enforcement on email
dbInstance.users.createIndex({ email: 1 }, { unique: true, name: 'idx_users_email_unique' });

// 2. Polls Collection
dbInstance.createCollection('polls', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['creator_id', 'question', 'options', 'status', 'created_at'],
      properties: {
        creator_id: {
          bsonType: 'objectId',
          description: 'references User _id'
        },
        question: {
          bsonType: 'string',
          minLength: 5,
          description: 'poll title/question is required'
        },
        options: {
          bsonType: 'array',
          minItems: 2,
          maxItems: 10,
          items: {
            bsonType: 'object',
            required: ['id', 'text', 'vote_count'],
            properties: {
              id: { bsonType: 'string' },
              text: { bsonType: 'string' },
              vote_count: { bsonType: ['int', 'long'] }
            }
          }
        },
        total_votes: {
          bsonType: ['int', 'long']
        },
        status: {
          enum: ['active', 'closed'],
          description: 'status must be active or closed'
        },
        created_at: { bsonType: 'date' },
        updated_at: { bsonType: 'date' }
      }
    }
  }
});

// Indexes for Polls: Fast filtering by creator and status
dbInstance.polls.createIndex({ creator_id: 1 }, { name: 'idx_polls_creator' });
dbInstance.polls.createIndex({ status: 1, created_at: -1 }, { name: 'idx_polls_status_created' });

// 3. Votes Collection
dbInstance.createCollection('votes', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['poll_id', 'option_id', 'voter_identifier', 'created_at'],
      properties: {
        poll_id: { bsonType: 'objectId' },
        option_id: { bsonType: 'string' },
        voter_identifier: { bsonType: 'string' },
        created_at: { bsonType: 'date' }
      }
    }
  }
});

// Indexes for Votes: Fast tally aggregations and double-voting prevention
dbInstance.votes.createIndex({ poll_id: 1, option_id: 1 }, { name: 'idx_votes_poll_option' });
dbInstance.votes.createIndex({ poll_id: 1, voter_identifier: 1 }, { unique: true, name: 'idx_votes_poll_voter_unique' });

print('Database initialization script completed successfully.');
