import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Briefcase, Users, UserCheck, TrendingUp, MoreVertical, Search } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import CreateJobModal from '../../components/job/CreateJobModal'
import { useJobStore } from '../../stores/jobStore'

export default function Dashboard() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const { jobs } = useJobStore()

  const filteredJobs = jobs.filter(job =>
    job.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const stats = [
    { label: 'Active Openings', value: jobs.filter(j => j.status === 'active').length, icon: Briefcase, color: 'from-brand-500 to-brand-700' },
    { label: 'Total Candidates', value: jobs.reduce((acc, j) => acc + (j.candidateCount || 0), 0), icon: Users, color: 'from-emerald-500 to-emerald-700' },
    { label: 'Shortlisted', value: jobs.reduce((acc, j) => acc + (j.shortlistedCount || 0), 0), icon: UserCheck, color: 'from-amber-500 to-amber-700' },
    { label: 'Hired', value: jobs.reduce((acc, j) => acc + (j.hiredCount || 0), 0), icon: TrendingUp, color: 'from-rose-500 to-rose-700' },
  ]

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
                  <button
                    onClick={(e) => { e.stopPropagation() }}
                    className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <MoreVertical size={16} className="text-white/30" />
                  </button>
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
    </div>
  )
}
