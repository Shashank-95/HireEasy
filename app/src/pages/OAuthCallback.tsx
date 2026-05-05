export default function OAuthCallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white text-lg font-medium">Authenticating with Google...</p>
        <p className="text-gray-400 text-sm mt-2">This window will close automatically.</p>
      </div>
    </div>
  )
}
