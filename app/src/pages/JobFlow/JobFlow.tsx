import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useJobStore } from '../../stores/jobStore'
import StepGoogleSheet from './steps/StepGoogleSheet'
import StepJobDescription from './steps/StepJobDescription'
import StepSkills from './steps/StepSkills'
import StepL1Screening from './steps/StepL1Screening'
import StepL1Results from './steps/StepL1Results'
import StepL2Screening from './steps/StepL2Screening'
import StepFinalShortlist from './steps/StepFinalShortlist'
import StepInterview from './steps/StepInterview'

const STEPS = [
  { id: 0, label: 'Google Sheet' },
  { id: 1, label: 'Job Description' },
  { id: 2, label: 'Skills & Weights' },
  { id: 3, label: 'L1 Screening' },
  { id: 4, label: 'L1 Results' },
  { id: 5, label: 'L2 Screening' },
  { id: 6, label: 'Final Shortlist' },
  { id: 7, label: 'Interview Setup' },
]

export default function JobFlow() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()
  const { getJob, updateJob } = useJobStore()

  const job = getJob(jobId!)
  if (!job) {
    return (
      <div className="p-8 text-center">
        <p className="text-white/40">Job not found</p>
        <button onClick={() => navigate('/')} className="btn-secondary mt-4">Back to Dashboard</button>
      </div>
    )
  }

  const currentStep = job.currentStep

  const goToStep = (step: number) => {
    if (step <= currentStep) {
      updateJob(job.id, { currentStep: step })
    }
  }

  const nextStep = () => {
    updateJob(job.id, { currentStep: Math.min(currentStep + 1, STEPS.length - 1) })
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0: return <StepGoogleSheet job={job} onNext={nextStep} />
      case 1: return <StepJobDescription job={job} onNext={nextStep} />
      case 2: return <StepSkills job={job} onNext={nextStep} />
      case 3: return <StepL1Screening job={job} onNext={nextStep} />
      case 4: return <StepL1Results job={job} onNext={nextStep} />
      case 5: return <StepL2Screening job={job} onNext={nextStep} />
      case 6: return <StepFinalShortlist job={job} onNext={nextStep} />
      case 7: return <StepInterview job={job} onNext={nextStep} />
      default: return null
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-4 mb-4">
          <button onClick={() => navigate('/')} className="p-2 rounded-lg hover:bg-white/[0.06] transition-colors">
            <ArrowLeft size={18} className="text-white/50" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">{job.title}</h1>
            {job.department && <p className="text-xs text-white/40">{job.department}</p>}
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((step, i) => (
            <button
              key={step.id}
              onClick={() => goToStep(step.id)}
              disabled={step.id > currentStep}
              className="flex items-center gap-2 shrink-0"
            >
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                step.id === currentStep
                  ? 'bg-brand-500/15 text-brand-400 border border-brand-500/30'
                  : step.id < currentStep
                  ? 'bg-emerald-500/10 text-emerald-400/70 cursor-pointer hover:bg-emerald-500/15'
                  : 'text-white/20 cursor-not-allowed'
              }`}>
                {step.id < currentStep ? (
                  <Check size={12} />
                ) : (
                  <span className="w-4 text-center">{step.id + 1}</span>
                )}
                {step.label}
              </div>
              {i < STEPS.length - 1 && (
                <div className={`w-4 h-px ${step.id < currentStep ? 'bg-emerald-500/30' : 'bg-white/[0.06]'}`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="p-8 max-w-4xl mx-auto"
        >
          {renderStep()}
        </motion.div>
      </div>
    </div>
  )
}
