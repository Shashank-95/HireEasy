import { useState } from 'react'
import { Key, Brain, Mic, Shield, Mail, ExternalLink, Eye, EyeOff, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSettingsStore, LlmProvider, AiDetectionProvider } from '../../stores/settingsStore'

function ApiKeyInput({ label, value, onChange, placeholder, helpUrl, helpText }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
  helpUrl?: string
  helpText?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-white/70">{label}</label>
        {helpUrl && (
          <a href={helpUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors">
            How to get this key <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div className="relative">
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="input-field pr-20 font-mono text-sm"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {value && (
            <CheckCircle2 size={14} className="text-emerald-400" />
          )}
          <button
            onClick={() => setVisible(!visible)}
            className="p-1.5 rounded-md hover:bg-white/[0.06] transition-colors"
          >
            {visible ? <EyeOff size={14} className="text-white/40" /> : <Eye size={14} className="text-white/40" />}
          </button>
        </div>
      </div>
      {helpText && (
        <p className="text-xs text-white/30 flex items-start gap-1.5">
          <Info size={12} className="shrink-0 mt-0.5" />
          {helpText}
        </p>
      )}
    </div>
  )
}

export default function Settings() {
  const settings = useSettingsStore()

  const llmOptions: { value: LlmProvider; label: string; description: string }[] = [
    { value: 'openai', label: 'OpenAI', description: 'GPT-4o for screening and scoring' },
    { value: 'anthropic', label: 'Anthropic Claude', description: 'Claude for nuanced evaluation' },
    { value: 'gemini', label: 'Google Gemini', description: 'Gemini Pro for analysis' },
  ]

  const aiDetectionOptions: { value: AiDetectionProvider; label: string; description: string; free: boolean }[] = [
    { value: 'sapling', label: 'Sapling AI', description: 'Best free AI detection with high accuracy', free: true },
    { value: 'gptzero', label: 'GPTZero', description: 'Industry-leading AI detection (paid)', free: false },
    { value: 'originality', label: 'Originality.ai', description: 'Premium detection with detailed reports (paid)', free: false },
    { value: 'copyleaks', label: 'Copyleaks', description: 'Enterprise-grade AI content detection (paid)', free: false },
  ]

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-white/40 mt-1">Configure API keys and preferences. Keys are stored locally and never shared.</p>
      </div>

      <div className="space-y-6">
        {/* LLM Provider Selection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center">
              <Brain size={18} className="text-brand-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">AI Language Model</h2>
              <p className="text-xs text-white/40">Choose your preferred LLM for candidate screening</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {llmOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => settings.setPreferredLlm(opt.value)}
                className={`p-4 rounded-xl border transition-all duration-200 text-left ${
                  settings.preferredLlm === opt.value
                    ? 'border-brand-500/50 bg-brand-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <p className="text-sm font-medium text-white">{opt.label}</p>
                <p className="text-xs text-white/40 mt-1">{opt.description}</p>
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {settings.preferredLlm === 'openai' && (
              <ApiKeyInput
                label="OpenAI API Key"
                value={settings.openaiKey}
                onChange={(v) => settings.setKey('openaiKey', v)}
                placeholder="sk-..."
                helpUrl="https://platform.openai.com/api-keys"
                helpText="Go to platform.openai.com → API Keys → Create new secret key"
              />
            )}
            {settings.preferredLlm === 'anthropic' && (
              <ApiKeyInput
                label="Anthropic API Key"
                value={settings.anthropicKey}
                onChange={(v) => settings.setKey('anthropicKey', v)}
                placeholder="sk-ant-..."
                helpUrl="https://console.anthropic.com/settings/keys"
                helpText="Go to console.anthropic.com → Settings → API Keys → Create Key"
              />
            )}
            {settings.preferredLlm === 'gemini' && (
              <ApiKeyInput
                label="Google Gemini API Key"
                value={settings.geminiKey}
                onChange={(v) => settings.setKey('geminiKey', v)}
                placeholder="AI..."
                helpUrl="https://aistudio.google.com/apikey"
                helpText="Go to AI Studio → Get API Key → Create API Key in new project"
              />
            )}
          </div>
        </motion.div>

        {/* AI Detection */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Shield size={18} className="text-amber-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">AI Detection</h2>
              <p className="text-xs text-white/40">Detect AI-generated responses in candidate submissions</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-5">
            {aiDetectionOptions.map(opt => (
              <button
                key={opt.value}
                onClick={() => settings.setAiDetectionProvider(opt.value)}
                className={`p-4 rounded-xl border transition-all duration-200 text-left ${
                  settings.aiDetectionProvider === opt.value
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">{opt.label}</p>
                  {opt.free && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">FREE</span>}
                </div>
                <p className="text-xs text-white/40 mt-1">{opt.description}</p>
              </button>
            ))}
          </div>

          {settings.aiDetectionProvider !== 'sapling' && (
            <ApiKeyInput
              label={`${aiDetectionOptions.find(o => o.value === settings.aiDetectionProvider)?.label} API Key`}
              value={settings.aiDetectionKey}
              onChange={(v) => settings.setKey('aiDetectionKey', v)}
              placeholder="Enter API key..."
              helpText="Required for paid AI detection providers"
            />
          )}
          {settings.aiDetectionProvider === 'sapling' && (
            <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
              <p className="text-xs text-emerald-400/80 flex items-center gap-2">
                <CheckCircle2 size={12} />
                Sapling AI offers free AI detection — no API key required for basic usage
              </p>
            </div>
          )}
        </motion.div>

        {/* Deepgram */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-violet-500/10 flex items-center justify-center">
              <Mic size={18} className="text-violet-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Speech-to-Text (Interview App)</h2>
              <p className="text-xs text-white/40">Required for audio interview transcription</p>
            </div>
          </div>

          <ApiKeyInput
            label="Deepgram API Key"
            value={settings.deepgramKey}
            onChange={(v) => settings.setKey('deepgramKey', v)}
            placeholder="Enter Deepgram API key..."
            helpUrl="https://console.deepgram.com/"
            helpText="Sign up at deepgram.com → Dashboard → API Keys → Create a Key (free tier includes $200 credit)"
          />
        </motion.div>

        {/* Google OAuth */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Mail size={18} className="text-blue-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Google Integration</h2>
              <p className="text-xs text-white/40">For Google Sheets, Gmail, and Calendar access</p>
            </div>
          </div>

          <div className="space-y-4">
            <ApiKeyInput
              label="Google OAuth Client ID"
              value={settings.googleClientId}
              onChange={(v) => settings.setKey('googleClientId', v)}
              placeholder="xxxxx.apps.googleusercontent.com"
              helpUrl="https://console.cloud.google.com/apis/credentials"
              helpText="Google Cloud Console → APIs & Services → Credentials → Create OAuth 2.0 Client ID"
            />
            <ApiKeyInput
              label="Google OAuth Client Secret"
              value={settings.googleClientSecret}
              onChange={(v) => settings.setKey('googleClientSecret', v)}
              placeholder="GOCSPX-..."
              helpText="Found in the same OAuth credentials page as the Client ID"
            />

            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10">
              <h4 className="text-sm font-medium text-blue-400 mb-2 flex items-center gap-2">
                <Info size={14} />
                Setup Instructions
              </h4>
              <ol className="text-xs text-white/50 space-y-1.5 list-decimal list-inside">
                <li>Go to Google Cloud Console and create a new project</li>
                <li>Enable these APIs: Google Sheets, Gmail, Google Calendar</li>
                <li>Go to Credentials → Create Credentials → OAuth 2.0 Client ID</li>
                <li>Set application type to "Desktop app"</li>
                <li>Copy the Client ID and Client Secret above</li>
                <li>Add your email to Test Users under OAuth consent screen</li>
              </ol>
            </div>
          </div>

          {settings.authenticatedEmail && (
            <div className="mt-4 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
              <CheckCircle2 size={14} className="text-emerald-400" />
              <p className="text-xs text-emerald-400">Authenticated as {settings.authenticatedEmail}</p>
            </div>
          )}
        </motion.div>

        {/* Interview App URL */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
              <ExternalLink size={18} className="text-rose-400" />
            </div>
            <div>
              <h2 className="font-semibold text-white">Interview App URL</h2>
              <p className="text-xs text-white/40">The Vercel-deployed interview app URL for AI-conducted interviews</p>
            </div>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              value={settings.interviewAppUrl}
              onChange={(e) => settings.setKey('interviewAppUrl', e.target.value)}
              placeholder="https://your-interview-app.vercel.app"
              className="input-field text-sm"
            />
            <p className="text-xs text-white/30 flex items-start gap-1.5">
              <Info size={12} className="shrink-0 mt-0.5" />
              Deploy the interview-app folder to Vercel and paste the URL here
            </p>
          </div>
        </motion.div>

        {/* Configuration Status */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-6">
          <h3 className="font-semibold text-white mb-4">Configuration Status</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'LLM Provider', configured: settings.isConfigured() },
              { label: 'AI Detection', configured: settings.aiDetectionProvider === 'sapling' || !!settings.aiDetectionKey },
              { label: 'Deepgram (Speech)', configured: !!settings.deepgramKey },
              { label: 'Google Integration', configured: !!settings.googleClientId && !!settings.googleClientSecret },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2 p-3 rounded-lg bg-white/[0.02]">
                {item.configured ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={14} className="text-white/20" />
                )}
                <span className={`text-sm ${item.configured ? 'text-white/70' : 'text-white/30'}`}>{item.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
