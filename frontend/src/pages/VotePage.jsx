import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { usePollWebSocket } from '../hooks/usePollWebSocket';
import { 
  Radio, 
  CheckCircle, 
  Share2, 
  Check, 
  AlertCircle, 
  Users, 
  ArrowLeft, 
  Award,
  Wifi,
  WifiOff,
  Sparkles
} from 'lucide-react';

export function VotePage({ pollId, navigateTo }) {
  const [poll, setPoll] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedOptionId, setSelectedOptionId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [votedOptionId, setVotedOptionId] = useState(() => {
    return localStorage.getItem(`voted_opt_${pollId}`) || null;
  });
  const [hasVoted, setHasVoted] = useState(() => {
    return !!localStorage.getItem(`voted_opt_${pollId}`);
  });
  const [copied, setCopied] = useState(false);
  const [lastVoteReceivedTime, setLastVoteReceivedTime] = useState(null);

  // 1. Initial REST fetch for poll metadata
  useEffect(() => {
    async function fetchPoll() {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getPoll(pollId);
        setPoll(data);
      } catch (err) {
        console.error('Error fetching poll:', err);
        setError(err.message || 'Poll not found or inactive');
      } finally {
        setLoading(false);
      }
    }

    if (pollId) {
      fetchPoll();
    }
  }, [pollId]);

  // 2. Real-Time WebSocket Handler (Zero page refresh)
  const handleLiveVoteUpdate = useCallback((liveUpdate) => {
    console.log('[VotePage] Applying live vote update from WebSocket:', liveUpdate);
    setPoll((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        options: liveUpdate.options,
        total_votes: liveUpdate.total_votes,
      };
    });
    setLastVoteReceivedTime(new Date());
  }, []);

  const { isConnected, connectionError } = usePollWebSocket(pollId, handleLiveVoteUpdate);

  // 3. Cast Vote
  const handleCastVote = async () => {
    if (!selectedOptionId) {
      setError('Please select an option to cast your vote');
      return;
    }
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await api.castVote(pollId, selectedOptionId);
      // Mark as voted locally
      localStorage.setItem(`voted_opt_${pollId}`, selectedOptionId);
      setVotedOptionId(selectedOptionId);
      setHasVoted(true);

      // Instantly update poll state with response
      if (res?.poll) {
        setPoll(res.poll);
      }
    } catch (err) {
      console.error('Error voting:', err);
      if (err.status === 409) {
        setError('You have already cast a vote on this poll');
        setHasVoted(true);
      } else {
        setError(err.message || 'Failed to submit vote. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Connecting to live poll...</p>
      </div>
    );
  }

  if (error && !poll) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto mb-5">
          <AlertCircle className="w-7 h-7" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Poll Unavailable</h2>
        <p className="text-slate-400 text-sm mb-6">{error}</p>
        <button
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to PulsePoll</span>
        </button>
      </div>
    );
  }

  const totalVotes = poll?.total_votes || 0;
  // Determine highest voted option
  const maxVotes = Math.max(...(poll?.options?.map((o) => o.vote_count) || [0]));

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Top Controls */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => navigateTo('/')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
        </button>

        {/* Live WebSocket Status Pill */}
        <div className="flex items-center gap-2">
          {isConnected ? (
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/70 border border-emerald-800/80 text-emerald-300 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span>Real-Time Live</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/70 border border-amber-800 text-amber-300 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Connecting stream...</span>
            </div>
          )}

          <button
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs font-medium transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Link Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share Poll</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Poll Card */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-10 shadow-2xl shadow-indigo-950/30">
        {/* Header Question */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-400 mb-2">
            <Radio className="w-4 h-4" />
            <span>Audience Live Vote</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-snug">
            {poll?.question}
          </h1>

          <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-500" />
              <strong className="text-slate-200 font-semibold">{totalVotes}</strong> total votes cast
            </span>
            {lastVoteReceivedTime && (
              <span className="text-emerald-400 font-medium animate-fadeIn">
                • Vote received just now
              </span>
            )}
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-start gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {/* State A: Voting choices (User hasn't voted yet) */}
        {!hasVoted ? (
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
              Select your choice:
            </p>

            <div className="space-y-3">
              {poll?.options?.map((option) => {
                const isSelected = selectedOptionId === option.id;
                return (
                  <div
                    key={option.id}
                    onClick={() => setSelectedOptionId(option.id)}
                    className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all duration-200 flex items-center justify-between select-none ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500 shadow-lg shadow-indigo-500/10 scale-[1.01]'
                        : 'bg-slate-950/60 border-slate-800 hover:border-slate-700 hover:bg-slate-950'
                    }`}
                  >
                    <span className={`text-base font-semibold ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                      {option.text}
                    </span>

                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected 
                        ? 'border-indigo-500 bg-indigo-500' 
                        : 'border-slate-600'
                    }`}>
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={handleCastVote}
              disabled={!selectedOptionId || isSubmitting}
              className="w-full mt-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base shadow-xl shadow-indigo-600/30 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Vote...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Submit My Vote</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* State B: Voted view with real-time live animated results */
          <div className="space-y-6">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-3 text-emerald-300">
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <div className="text-sm">
                <span className="font-bold">Your vote has been recorded!</span>
                <span className="block text-xs text-emerald-400/80 mt-0.5">
                  Watch below as real-time votes stream in without page refreshes.
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {poll?.options?.map((option) => {
                const isUserChoice = votedOptionId === option.id;
                const percentage = totalVotes > 0 
                  ? Math.round((option.vote_count / totalVotes) * 100) 
                  : 0;
                const isLeader = totalVotes > 0 && option.vote_count === maxVotes;

                return (
                  <div
                    key={option.id}
                    className={`relative p-5 rounded-2xl border overflow-hidden transition-all duration-300 ${
                      isUserChoice
                        ? 'border-indigo-500/80 bg-slate-950/70 shadow-md shadow-indigo-950/30'
                        : 'border-slate-800 bg-slate-950/40'
                    }`}
                  >
                    {/* Background Progress Fill with animation */}
                    <div
                      className={`absolute top-0 bottom-0 left-0 transition-width duration-700 ease-out opacity-25 rounded-2xl ${
                        isLeader ? 'bg-indigo-500' : 'bg-slate-700'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />

                    {/* Content */}
                    <div className="relative z-10 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-white">
                          {option.text}
                        </span>

                        {isUserChoice && (
                          <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                            Your Vote
                          </span>
                        )}

                        {isLeader && totalVotes > 0 && (
                          <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <Award className="w-3 h-3" />
                            Leading
                          </span>
                        )}
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-lg font-extrabold text-white">
                          {percentage}%
                        </span>
                        <span className="block text-xs text-slate-400">
                          {option.vote_count} {option.vote_count === 1 ? 'vote' : 'votes'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Share CTA */}
            <div className="pt-6 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-slate-400">
                Want more responses? Share this page's URL directly with your audience.
              </p>
              <button
                onClick={handleCopyLink}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-all hover:scale-105 active:scale-95 flex-shrink-0"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4" />
                    <span>Copy Share Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
