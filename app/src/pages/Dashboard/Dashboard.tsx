import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Briefcase, Users, UserCheck, TrendingUp, MoreVertical, Search, Trash2, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CreateJobModal from '../../components/job/CreateJobModal'
import { useJobStore } from '../../stores/jobStore'
import { useStatsStore } from '../../stores/statsStore'

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null)
  const navigate = useNavigate()
  const { jobs, deleteJob } = useJobStore()
  const lifetimeStats = useStatsStore()
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null)
      }
    }
    if (openMenuId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openMenuId])

  const filteredJobs = jobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Cumulative stats: current active jobs + archived (deleted) jobs
  const currentCandidates = jobs.reduce((acc, j) => acc + (j.candidateCount || 0), 0)
  const currentShortlisted = jobs.reduce((acc, j) => acc + (j.shortlistedCount || 0), 0)
  const currentHired = jobs.reduce((acc, j) => acc + (j.hiredCount || 0), 0)

  const stats = [
    {
      label: 'Active Openings',
      value: jobs.filter(j => j.status === 'active').length,
      sublabel: `${lifetimeStats.totalJobsCreated} created all-time`,
      icon: Briefcase,
      color: 'from-brand-500 to-brand-700',
    },
    {
      label: 'Total Candidates',
      value: currentCandidates + lifetimeStats.totalCandidatesProcessed,
      sublabel: lifetimeStats.totalCandidatesProcessed > 0 ? `${lifetimeStats.totalCandidatesProcessed} from past jobs` : 'across all openings',
      icon: Users,
      color: 'from-emerald-500 to-emerald-700',
    },
    {
      label: 'Shortlisted',
      value: currentShortlisted + lifetimeStats.totalShortlisted,
      sublabel: lifetimeStats.totalShortlisted > 0 ? `${lifetimeStats.totalShortlisted} from past jobs` : 'cumulative',
      icon: UserCheck,
      color: 'from-amber-500 to-amber-700',
    },
    {
      label: 'Hired',
      value: currentHired + lifetimeStats.totalHired,
      sublabel: lifetimeStats.totalHired > 0 ? `${lifetimeStats.totalHired} from past jobs` : 'cumulative',
      icon: TrendingUp,
      color: 'from-rose-500 to-rose-700',
    },
  ]

  const jobToDelete = confirmDeleteJobId ? jobs.find(j => j.id === confirmDeleteJobId) : null

  const handleConfirmDelete = () => {
    if (confirmDeleteJobId) {
      deleteJob(confirmDeleteJobId)
      setConfirmDeleteJobId(null)
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-white/40 mt-1">Manage your hiring pipelines</p>
        </div>
        <button onClick={() => setShowCreateModal(true)} className="btn-primary flex items-center gap-2">
          <Plus size={18} />
          New Job Opening
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                <stat.icon size={16} className="text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <p className="text-xs text-white/40 mt-1">{stat.label}</p>
            <p className="text-[10px] text-white/25 mt-1">{stat.sublabel}</p>
          </motion.div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          placeholder="Search job openings..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="input-field pl-11"
        />
      </div>

      {/* Job Cards */}
      <div className="grid grid-cols-1 gap-3">
        <AnimatePresence>
          {filteredJobs.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-12 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-4">
                <Briefcase size={24} className="text-white/20" />
              </div>
              <h3 className="text-lg font-medium text-white/60 mb-2">No job openings yet</h3>
              <p className="text-sm text-white/30 mb-6">Create your first job opening to start screening candidates</p>
              <button onClick={() => setShowCreateModal(true)} className="btn-primary">
                Create Job Opening
              </button>
            </motion.div>
          ) : (
            filteredJobs.map((job, i) => (
              <motion.div
                key={job.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/job/${job.id}`)}
                className="glass-card-hover p-5 cursor-pointer flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-500/20 to-brand-700/20 border border-brand-500/20 flex items-center justify-center">
                    <Briefcase size={18} className="text-brand-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{job.title}</h3>
                    <p className="text-xs text-white/40 mt-0.5">
                      {job.department && `${job.department} · `}
                      {job.candidateCount || 0} candidates · Created {new Date(job.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-badge ${
                    job.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' :
                    job.status === 'completed' ? 'bg-brand-500/10 text-brand-400' :
                    'bg-white/[0.06] text-white/40'
                  }`}>
                    {job.status}
                  </span>
                  <div className="relative" ref={openMenuId === job.id ? menuRef : undefined}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setOpenMenuId(openMenuId === job.id ? null : job.id)
                      }}
                      className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      <MoreVertical size={16} className="text-white/30" />
                    </button>

                    <AnimatePresence>
                      {openMenuId === job.id && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.96 }}
                          transition={{ duration: 0.1 }}
                          className="absolute right-0 top-full mt-1.5 min-w-[180px] rounded-lg bg-[#1a1a20] border border-white/[0.08] shadow-2xl z-50 overflow-hidden py-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenuId(null)
                              setConfirmDeleteJobId(job.id)
                            }}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors whitespace-nowrap"
                          >
                            <Trash2 size={14} className="shrink-0" />
                            <span>Delete Job</span>
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Create Job Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <CreateJobModal onClose={() => setShowCreateModal(false)} />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {jobToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setConfirmDeleteJobId(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-card p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} className="text-rose-400" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-white mb-2">Delete Job Opening?</h3>
                  <p className="text-sm text-white/60 mb-1">
                    This will permanently delete <span className="font-semibold text-white">{jobToDelete.title}</span> and all its data including:
                  </p>
                  <ul className="text-xs text-white/40 ml-4 list-disc space-y-0.5 mt-2 mb-3">
                    <li>{jobToDelete.candidateCount || 0} candidates and their responses</li>
                    <li>Screening scores (L1, L2)</li>
                    <li>Interview transcripts and feedback</li>
                    <li>All configuration (skills, weights, JD)</li>
                  </ul>
                  <p className="text-xs text-emerald-400/80 mb-2 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-400" />
                    Cumulative dashboard metrics ({jobToDelete.candidateCount || 0} candidates, {jobToDelete.shortlistedCount || 0} shortlisted, {jobToDelete.hiredCount || 0} hired) will be preserved.
                  </p>
                  <p className="text-xs text-rose-400/80 mb-5">This action cannot be undone.</p>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setConfirmDeleteJobId(null)}
                      className="px-4 py-2 rounded-lg text-sm text-white/70 hover:bg-white/[0.06] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmDelete}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-rose-500 hover:bg-rose-600 text-white transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={14} />
                      Delete Permanently
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
