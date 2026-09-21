import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const optionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => uuidv4()
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    vote_count: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

const pollSchema = new mongoose.Schema(
  {
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    creator_name: {
      type: String,
      trim: true
    },
    question: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 300
    },
    options: {
      type: [optionSchema],
      validate: {
        validator: (opts) => Array.isArray(opts) && opts.length >= 2 && opts.length <= 10,
        message: 'A poll must have between 2 and 10 options'
      }
    },
    total_votes: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['active', 'closed'],
      default: 'active'
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    updated_at: {
      type: Date,
      default: Date.now
    }
  },
  {
    versionKey: false,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

// Indexes matching init-mongo.js
pollSchema.index({ creator_id: 1 }, { name: 'idx_polls_creator' });
pollSchema.index({ status: 1, created_at: -1 }, { name: 'idx_polls_status_created' });

export const Poll = mongoose.model('Poll', pollSchema, 'polls');
