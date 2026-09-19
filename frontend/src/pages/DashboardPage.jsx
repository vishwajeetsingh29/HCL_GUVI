import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { 
  BarChart2, 
  Share2, 
  Trash2, 
  ExternalLink, 
  Check, 
  Users, 
  Layers, 
  PlusCircle, 
  Clock, 
  AlertCircle,
  Sparkles,
  Radio
} from 'lucide-react';

export function DashboardPage({ onOpenCreatePoll, onOpenAuth, navigateTo }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const fetchPolls = async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getUserPolls();
      setPolls(data);
    } catch (err) {
      console.error('Failed to load polls:', err);
      setError('Could not load your polls. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchPolls();
    }
  }, [isAuthenticated]);

  const handleCopyLink = (pollId) => {
    const url = `${window.location.origin}/vote/${pollId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopiedId(pollId);
      setTimeout(() => setCopiedId(null), 2500);
    });
  };

  const handleDelete = async (pollId) => {
    if (!window.confirm('Are you sure you want to delete this poll and all its cast votes?')) {
      return;
    }
    setDeletingId(pollId);
    try {
      await api.deletePoll(pollId);
      setPolls((prev) => prev.filter((p) => p.id !== pollId));
    } catch (err) {
      alert(err.message || 'Failed to delete poll');
    } finally {
      setDeletingId(null);
    }
  };

  // 1. Unauthenticated Landing View
  if (!isAuthenticated && !authLoading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
        {/* Hero badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-950/60 border border-indigo-800/60 text-indigo-300 text-xs font-semibold mb-8 animate-fadeIn">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span>Next-Gen Live Audience Interaction</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white max-w-3xl mx-auto leading-tight">
          Real-Time Polling for Modern Audiences
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Create interactive polls in seconds. Share a public link with your team, classroom, or live stream viewers, and watch votes arrive in real-time via WebSockets.
        </p>

        {/* Call to actions */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <button
            onClick={() => onOpenAuth('signup')}
            className="px-8 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base shadow-xl shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            <span>Create Your First Poll</span>
          </button>
          <button
            onClick={() => onOpenAuth('login')}
            className="px-7 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white font-semibold text-base border border-slate-800 transition-all"
          >
            Sign In to Dashboard
          </button>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-950 flex items-center justify-center text-indigo-400 mb-4 border border-indigo-800/40">
              <Radio className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Live WebSockets</h3>
            <p className="text-sm text-slate-400">
              Instantaneous tally updates streamed to connected clients with zero page reloads.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-violet-950 flex items-center justify-center text-violet-400 mb-4 border border-violet-800/40">
              <Share2 className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Zero-Friction Voting</h3>
            <p className="text-sm text-slate-400">
              Audience members can vote immediately via shareable link without needing to log in.
            </p>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 flex items-center justify-center text-emerald-400 mb-4 border border-emerald-800/40">
              <Layers className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">High-Performance Core</h3>
            <p className="text-sm text-slate-400">
              Powered by Go, Gin, Redis Pub/Sub, and MongoDB for sub-millisecond event throughput.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calculate statistics
  const totalVotesAcrossPolls = polls.reduce((acc, p) => acc + (p.total_votes || 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Dashboard Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-8 border-b border-slate-800">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">
            Creator Dashboard
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage your polls, copy shareable voting links, and view real-time vote statistics.
          </p>
        </div>

        <button
          onClick={onOpenCreatePoll}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Live Poll</span>
        </button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 my-8">
        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-indigo-950/70 text-indigo-400 border border-indigo-800/30">
            <Layers className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Created Polls</p>
            <p className="text-2xl font-bold text-white mt-0.5">{polls.length}</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-950/70 text-emerald-400 border border-emerald-800/30">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Votes Cast</p>
            <p className="text-2xl font-bold text-white mt-0.5">{totalVotesAcrossPolls}</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center gap-4 sm:col-span-2 lg:col-span-1">
          <div className="p-3 rounded-xl bg-violet-950/70 text-violet-400 border border-violet-800/30">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">WebSocket Streaming</p>
            <p className="text-sm font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <span>Redis Pub/Sub Active</span>
            </p>
          </div>
        </div>
      </div>

      {/* Polls Listing */}
      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center text-slate-500">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading your polls...</p>
        </div>
      ) : polls.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/30 border border-dashed border-slate-800 rounded-3xl p-8">
          <BarChart2 className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-200">No polls created yet</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
            Get started by launching your first live poll. You can share the link and watch audience votes stream in real time.
          </p>
          <button
            onClick={onOpenCreatePoll}
            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm transition-all shadow-md shadow-indigo-600/25"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Create a Poll Now</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-200 mb-4 flex items-center gap-2">
            <span>Your Live Polls</span>
            <span className="text-xs font-normal text-slate-400">({polls.length})</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {polls.map((poll) => {
              const formattedDate = new Date(poll.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              });

              return (
                <div
                  key={poll.id}
                  className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <h3 className="text-base font-bold text-white line-clamp-2">
                        {poll.question}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex-shrink-0">
                        Live
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center gap-4 text-xs text-slate-400 mb-4">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {formattedDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {poll.total_votes || 0} votes
                      </span>
                    </div>

                    {/* Options Preview */}
                    <div className="space-y-2 mb-6">
                      {poll.options.map((opt) => {
                        const pct = poll.total_votes > 0 
                          ? Math.round((opt.vote_count / poll.total_votes) * 100) 
                          : 0;
                        return (
                          <div key={opt.id} className="text-xs">
                            <div className="flex justify-between text-slate-300 mb-1">
                              <span className="truncate pr-2 font-medium">{opt.text}</span>
                              <span className="font-semibold text-slate-400">{opt.vote_count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-width duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-4 border-t border-slate-800 flex items-center justify-between gap-2">
                    <button
                      onClick={() => handleCopyLink(poll.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                      title="Copy public voting link"
                    >
                      {copiedId === poll.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied Link!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Share Link</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigateTo(`/vote/${poll.id}`)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-700/40 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Poll</span>
                      </button>

                      <button
                        onClick={() => handleDelete(poll.id)}
                        disabled={deletingId === poll.id}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Delete poll"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
