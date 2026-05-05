import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { motion } from 'framer-motion'
import { useJobStore } from '../../stores/jobStore'

interface Props {
  onClose: () => void
}

export default function CreateJobModal({ onClose }: Props) {
  const [title, setTitle] = useState('')
  const [department, setDepartment] = useState('')
  const navigate = useNavigate()
  const { createJob } = useJobStore()

  const handleCreate = () => {
    if (!title.trim()) return
    const jobId = createJob(title.trim(), department.trim() || undefined)
    onClose()
    navigate(`/job/${jobId}`)
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-card p-8 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-white">New Job Opening</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
            <X size={18} className="text-white/40" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-white/70 block mb-2">Job Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Senior Product Designer"
              className="input-field"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-white/70 block mb-2">Department</label>
            <input
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Design, Engineering, Marketing"
              className="input-field"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-8">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="btn-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Create & Configure
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
